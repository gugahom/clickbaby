-- =============================================================================
-- atribuir_etapa: designa responsável a uma etapa que ainda não começou.
--
-- Última das RPCs previstas na seção 4 do CLAUDE.md que faltava, e virou
-- bloqueio real: transferir_etapa exige responsável ATUAL, então o handoff só
-- ligava depois que alguém já tinha iniciado. A Sarah não conseguia distribuir
-- a fila de edição — não havia como pôr nome numa etapa parada.
--
-- AS COLUNAS JÁ ESTAVAM LÁ
-- caso_etapas.atribuido_por e atribuido_em existem desde a migration inicial
-- (20260819192042), com a constraint caso_etapas_atribuicao_completa
-- garantindo que as duas andam juntas. Nada nunca escreveu nelas. Esta função é
-- a razão pela qual foram criadas.
--
-- ONDE FICA A LINHA ENTRE ATRIBUIR E TRANSFERIR
-- Não é o status: é se o TRABALHO JÁ COMEÇOU.
--
--   atribuir_etapa  = planejamento. Ninguém trabalhou ainda. Não existe
--                     passagem a registrar, porque nada foi passado — e gravar
--                     uma linha em `handoffs` aqui seria mentir, afirmando uma
--                     entrega de trabalho que nunca aconteceu.
--
--   transferir_etapa = handoff. O trabalho está em curso (ou pausado) e muda de
--                     mão. Isso é fato histórico e vale a linha em `handoffs`:
--                     o histórico de quem fez o quê é o produto (invariante 3.2).
--
-- Daí os status aceitos: 'pendente' (primeira atribuição) e 'atribuida'
-- (reatribuir antes de começar — a Sarah remaneja a fila e ninguém tocou no
-- trabalho). De em_andamento em diante o caminho é transferir_etapa.
--
-- SOBREPOSIÇÃO CONHECIDA, DEIXADA DE PROPÓSITO
-- transferir_etapa recusa apenas concluida/dispensada, então ela TAMBÉM aceita
-- 'atribuida'. Chamá-la ali grava um handoff de um trabalho que não começou —
-- menos preciso, não incorreto (reatribuir é passar de mão, no sentido de
-- planejamento). Não apertei transferir_etapa nesta migration para não mexer
-- em RPC que já está em uso; quem desenha a linha é a tela, oferecendo
-- "Atribuir" enquanto não começou e "Handoff" depois. Se a imprecisão
-- incomodar, é uma migration de uma linha.
--
-- QUEM PODE ATRIBUIR: QUALQUER PESSOA ATIVA
-- Mesma decisão de transferir_etapa, pelo mesmo motivo. A alternativa seria
-- restringir a adm, já que "a Sarah distribui a fila" — mas quem está na
-- maternidade às 3h é quem sabe quem pode pegar o banho, e esperar a
-- coordenação é a fricção que a seção 6 do CLAUDE.md manda evitar. A seção 3.1
-- é explícita: papel_sistema existe para permissão administrativa, não para
-- dizer quem executa trabalho.
--
-- A prestação de contas não some: a função grava atribuido_por e emite evento
-- com quem atribuiu e para quem. É auditável em vez de ser barrado — mesma
-- lógica da visibilidade compartilhada da seção 9.
--
-- Se a distribuição da fila precisar virar exclusiva da coordenação, o lugar é
-- a TELA da Fila de Edição (tela C do plano), não esta função: lá o gate é de
-- fluxo, e mudar de ideia não custa migration.
--
-- ATRIBUIR A SI MESMO É VÁLIDO
-- É "assumir", e a fila de edição depende disso: a seção 7 do plano descreve a
-- "visão da operadora para assumir e concluir". p_para_pessoa_id pode ser o
-- próprio chamador.
-- =============================================================================

create or replace function public.atribuir_etapa(
  p_caso_etapa_id uuid,
  p_para_pessoa_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_executor_id  uuid;
  v_status       public.status_etapa;
  v_caso_id      uuid;
  v_tipo         public.etapa_tipo;
  v_de_pessoa_id uuid;
  v_para_ativo   boolean;
begin
  select p.id into v_executor_id
  from public.pessoas p
  where p.auth_user_id = auth.uid()
    and p.ativo;

  if v_executor_id is null then
    raise exception 'Usuário autenticado não corresponde a nenhuma pessoa ativa.';
  end if;

  select ce.status, ce.caso_id, ce.tipo, ce.responsavel_id
    into v_status, v_caso_id, v_tipo, v_de_pessoa_id
  from public.caso_etapas ce
  where ce.id = p_caso_etapa_id
  for update;

  if not found then
    raise exception 'caso_etapa % não encontrada.', p_caso_etapa_id;
  end if;

  -- A linha do topo, em código: só antes do trabalho começar.
  if v_status not in ('pendente', 'atribuida') then
    raise exception
      'Etapa % está em status "%" — atribuir só vale antes do trabalho começar. Use transferir_etapa.',
      p_caso_etapa_id, v_status;
  end if;

  select p.ativo into v_para_ativo
  from public.pessoas p
  where p.id = p_para_pessoa_id;

  if not coalesce(v_para_ativo, false) then
    raise exception 'Pessoa % não existe ou está inativa.', p_para_pessoa_id;
  end if;

  -- Reatribuir para quem já é responsável não muda nada. Recusar em vez de
  -- fazer no-op silencioso: um evento gravado aqui contaria uma
  -- redistribuição que não houve, e o histórico é o produto.
  if p_para_pessoa_id = v_de_pessoa_id then
    raise exception
      'Pessoa % já é a responsável pela etapa % — não há atribuição a fazer.',
      p_para_pessoa_id, p_caso_etapa_id;
  end if;

  update public.caso_etapas
     set responsavel_id = p_para_pessoa_id,
         atribuido_por  = v_executor_id,
         atribuido_em   = now(),
         status         = 'atribuida'
   where id = p_caso_etapa_id;

  -- NÃO grava em handoffs, de propósito: não houve passagem de trabalho. Ver a
  -- nota sobre a linha entre atribuir e transferir, no topo.
  insert into public.eventos (caso_id, caso_etapa_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    v_caso_id,
    p_caso_etapa_id,
    v_executor_id,
    'etapa_atribuida',
    jsonb_build_object(
      'caso_etapa_id', p_caso_etapa_id,
      'tipo', v_tipo,
      'caso_id', v_caso_id,
      'de_pessoa_id', v_de_pessoa_id,
      'para_pessoa_id', p_para_pessoa_id
    ),
    now()
  );
end;
$$;

comment on function public.atribuir_etapa(uuid, uuid) is
  'Designa responsável a uma etapa que ainda não começou (pendente ou atribuida -> atribuida). Preenche atribuido_por/atribuido_em, colunas criadas na migration inicial e até aqui nunca usadas. NÃO grava handoff: nada foi passado, o trabalho não começou — essa é a linha entre atribuir e transferir_etapa, que existe para trabalho em curso e aí sim registra a passagem. Qualquer pessoa ativa pode chamar, inclusive para si mesma (assumir): quem está na maternidade é quem sabe quem pega o quê, e a prestação de contas vem do evento etapa_atribuida, não de um gate de papel.';

revoke execute on function public.atribuir_etapa(uuid, uuid) from public, anon;
grant  execute on function public.atribuir_etapa(uuid, uuid) to authenticated;
