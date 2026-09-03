-- O vídeo horizontal do MASTER deixa de segurar o encerramento do caso.
--
-- O PROBLEMA, nas palavras do gestor: "o vídeo fica muito tempo para ser
-- editado, então deve continuar as ações pela seção do master, mas o card pode
-- sumir". O MASTER tem prazo de DEZ DIAS ÚTEIS justamente porque o horizontal
-- demora; com a trava de 20260827181322, o caso inteiro ficava no Quadro esse
-- tempo todo — com tudo entregue, a família já com os links, e um cartão
-- ocupando a tela por duas semanas por causa de uma etapa que não segura mais
-- ninguém.
--
-- POR QUE SÓ O `edicao_video`, e não "qualquer etapa longa":
--
--   * ele é o ÚNICO trabalho do sistema que sobrevive à entrega. Foto e reels
--     precisam estar prontos para os links existirem; o horizontal é entregue
--     depois, por outro caminho, e a família já recebeu o resto.
--   * ele tem fluxo próprio e casa própria — as quatro fases da seção MASTER
--     (migration 20260901051232). O trabalho não fica órfão quando o cartão sai
--     da lista do dia: ele continua sendo operado exatamente onde já era.
--
-- Abrir a trava para "qualquer etapa" desfaria a razão de ela existir: antes de
-- 20260827181322 dava para encerrar com a edição de fotos pendente, e isso
-- acontecia por engano — o reels tinha saído da fita do card e ninguém via que
-- faltava.
--
-- O QUE NÃO MUDA
-- A invariante 3.5 continua inteira: encerrar exige `status_entrega =
-- confirmado` e ao menos um entregável registrado. O caso encerrado com vídeo
-- aberto é terminal de verdade — o que sobra não é o caso, é uma etapa dele.
-- E `eventos` registra o encerramento igual, então o histórico continua dizendo
-- quando a família recebeu.
--
-- A CONTRAPARTIDA fica na tela: em Concluídos o caso aparece marcado enquanto o
-- vídeo não fecha, e a seção MASTER passa a mostrar vídeo aberto mesmo de caso
-- encerrado (senão o trabalho sumiria de todo lugar no instante em que o card
-- saísse da lista, que é o oposto do pedido).

create or replace function public.confirmar_entrega(p_caso_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pessoa_id          uuid;
  v_status_operacional public.status_operacional;
  v_status_entrega     public.status_entrega;
  v_tem_entregavel     boolean;
  v_pendentes          text;
begin
  select p.id into v_pessoa_id
  from public.pessoas p
  where p.auth_user_id = auth.uid()
    and p.ativo;

  if v_pessoa_id is null then
    raise exception 'Usuário autenticado não corresponde a nenhuma pessoa ativa.';
  end if;

  select c.status_operacional, c.status_entrega
    into v_status_operacional, v_status_entrega
  from public.casos c
  where c.id = p_caso_id
  for update;

  if not found then
    raise exception 'Caso % não encontrado.', p_caso_id;
  end if;

  if v_status_operacional in ('encerrado', 'cancelado') then
    raise exception
      'Caso % já está em status terminal ("%") — não pode confirmar entrega.',
      p_caso_id, v_status_operacional;
  end if;

  if v_status_entrega = 'confirmado' then
    raise exception 'Caso % já tem entrega confirmada.', p_caso_id;
  end if;

  -- O trabalho tem que estar feito — EXCETO o vídeo horizontal do MASTER, que
  -- segue sendo operado pela seção depois do encerramento. Ver o cabeçalho.
  select string_agg(ce.tipo::text, ', ' order by ce.rodada, ce.ordem)
    into v_pendentes
  from public.caso_etapas ce
  where ce.caso_id = p_caso_id
    and ce.tipo <> 'edicao_video'
    and ce.status not in ('concluida', 'dispensada');

  if v_pendentes is not null then
    raise exception
      'Caso % tem etapa em aberto (%) — conclua ou dispense antes de encerrar.',
      p_caso_id, v_pendentes;
  end if;

  -- A trava antiga, e a que continua importando: não se encerra caso sem link.
  select exists(
    select 1 from public.entregaveis e where e.caso_id = p_caso_id
  ) into v_tem_entregavel;

  if not v_tem_entregavel then
    raise exception
      'Caso % não tem nenhum entregável registrado — registre ao menos um link antes de confirmar.',
      p_caso_id;
  end if;

  update public.entregaveis
     set confirmado_por = v_pessoa_id,
         confirmado_em  = now()
   where caso_id = p_caso_id
     and confirmado_por is null;

  update public.casos
     set status_entrega     = 'confirmado',
         status_operacional = 'encerrado'
   where id = p_caso_id;

  insert into public.eventos (caso_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    p_caso_id,
    v_pessoa_id,
    'entrega_confirmada',
    jsonb_build_object(
      'caso_id', p_caso_id,
      -- Fica no evento porque é a diferença entre "acabou" e "acabou menos o
      -- vídeo". Sem isto, daqui a um ano ninguém sabe reconstruir por que um
      -- caso encerrado tinha etapa aberta.
      'video_master_pendente', exists(
        select 1 from public.caso_etapas ce
        where ce.caso_id = p_caso_id
          and ce.tipo = 'edicao_video'
          and ce.status not in ('concluida', 'dispensada')
      )
    ),
    now()
  );
end;
$$;

comment on function public.confirmar_entrega(uuid) is
  'Encerra o caso: confirma os entregáveis pendentes e leva status_operacional a '
  'encerrado. Exige DUAS coisas — nenhuma etapa em aberto ALÉM do vídeo horizontal '
  'do MASTER (dispensada conta como resolvida) e ao menos um entregável registrado. '
  'A trava de etapas entrou em 20260827181322; a exceção do edicao_video entrou em '
  '20260903153101, porque ele leva dez dias úteis, tem fluxo próprio na seção MASTER '
  'e é o único trabalho que sobrevive à entrega. Sem checagem de papel desde '
  '20260825014102 — quem gera os links são as fotógrafas.';

-- `create or replace` preserva os privilégios, mas repetir é barato e a
-- migration 20260821102004 já provou o que custa presumir isso.
revoke all on function public.confirmar_entrega(uuid) from public;
grant execute on function public.confirmar_entrega(uuid) to authenticated;


-- =============================================================================
-- O vídeo do MASTER continua editável depois que o caso encerra.
--
-- É a segunda metade da migration 20260903153101, e sem ela a primeira faria
-- estrago: `confirmar_entrega` passou a aceitar encerrar com o horizontal
-- aberto, mas `mover_video_master` recusava qualquer caso terminal — então o
-- vídeo apareceria na seção MASTER e nenhuma das quatro fases responderia.
-- Encerrar o caso teria congelado o trabalho.
--
-- O pgTAP existente (`rpc_mover_video_master.test.sql`, teste E3) foi quem
-- apontou: ele encerrava o caso num passo anterior e a chamada seguinte
-- explodiu. É o tipo de acoplamento que só aparece quando as duas regras se
-- encontram em execução.
--
-- CANCELADO CONTINUA FECHADO. Não é simetria por gosto: num caso cancelado não
-- existe trabalho a terminar — o contrato caiu —, e quem tenta mover a fase ali
-- quase certamente está no cartão errado.

create or replace function public.mover_video_master(
  p_caso_etapa_id uuid,
  p_fase          public.status_etapa
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pessoa_id uuid;
  v_caso_id   uuid;
  v_tipo      public.etapa_tipo;
  v_status    public.status_etapa;
  v_terminal  public.status_operacional;
  v_pausado   timestamptz;
begin
  select p.id into v_pessoa_id
  from public.pessoas p
  where p.auth_user_id = auth.uid()
    and p.ativo;

  if v_pessoa_id is null then
    raise exception 'Usuário autenticado não corresponde a nenhuma pessoa ativa.';
  end if;

  -- As cinco fases, na ordem do fluxo. Qualquer outro valor do enum
  -- (atribuida, pausada, dispensada) não é destino aqui: ou é estado que
  -- nasce de outra RPC, ou é fase que o fluxo da equipe não tem.
  if p_fase not in ('pendente', 'em_andamento', 'em_alteracao', 'pronto_para_entrega', 'concluida') then
    raise exception
      'Fase "%" não faz parte do fluxo do vídeo do MASTER.', p_fase;
  end if;

  select ce.caso_id, ce.tipo, ce.status, ce.pausado_em, c.status_operacional
    into v_caso_id, v_tipo, v_status, v_pausado, v_terminal
  from public.caso_etapas ce
  join public.casos c on c.id = ce.caso_id
  where ce.id = p_caso_etapa_id
  for update of ce;

  if not found then
    raise exception 'caso_etapa % não encontrada.', p_caso_etapa_id;
  end if;

  if v_tipo <> 'edicao_video' then
    raise exception
      'O fluxo de fases é do vídeo horizontal do MASTER — etapa "%" não passa por ele.',
      v_tipo;
  end if;

  -- CANCELADO trava; ENCERRADO não, e essa é a mudança de 20260903153101.
  --
  -- Encerrar passou a ser possível com o vídeo horizontal ainda aberto, porque
  -- ele leva dez dias úteis e não segura a entrega da família. Se esta guarda
  -- continuasse recusando os dois estados terminais, o trabalho sumiria no
  -- instante exato em que o cartão sai da lista do dia: a seção MASTER
  -- mostraria o vídeo e nenhum botão dela funcionaria. Era a metade que
  -- faltava — e foi o pgTAP de `mover_video_master` que a apontou.
  --
  -- Cancelado continua fechado, e por razão diferente: ali não há trabalho a
  -- terminar. O contrato caiu, e mexer no vídeo de um caso cancelado é sempre
  -- engano — provavelmente o cartão errado.
  if v_terminal = 'cancelado' then
    raise exception
      'Caso está cancelado — não se mexe no vídeo de um caso que caiu.';
  end if;

  -- Idempotente: reafirmar a fase em que o vídeo já está não é erro, e não
  -- vira linha no histórico. Numa tela de seleção isso acontece o tempo todo.
  if v_status = p_fase then
    return;
  end if;

  update public.caso_etapas
     set status = p_fase,
         -- CARIMBA NA PRIMEIRA VEZ e nunca mais. Vale para qualquer fase
         -- que não seja o backlog: se o vídeo saiu de "há para editar", o
         -- trabalho começou — inclusive quando alguém pula direto para
         -- PRONTO por ter editado antes de o sistema saber. Sem isto, a
         -- constraint caso_etapas_conclusao_exige_inicio recusaria a
         -- conclusão, e o tempo de ciclo nasceria vazio.
         iniciado_em = case
           when p_fase = 'pendente' then iniciado_em
           else coalesce(iniciado_em, now())
         end,
         -- SÓ a última fase tem data de conclusão. Sair dela limpa —
         -- um vídeo que voltou para ALTERAÇÕES não está concluído.
         concluido_em = case when p_fase = 'concluida' then now() else null end,
         -- A janela de pausa fecha no caminho, soma no acumulado. O fluxo
         -- não tem fase de pausa, então mover é sempre "voltar a ter um
         -- estado definido".
         pausa_acumulada = pausa_acumulada
           + case when v_pausado is not null then now() - v_pausado
                  else interval '0' end,
         pausado_em = null,
         -- Quem move assume, se ainda não havia dono. Não SOBRESCREVE um
         -- responsável existente: trocar de mão é handoff, e handoff tem
         -- RPC própria (invariante 3.2).
         responsavel_id = coalesce(responsavel_id, v_pessoa_id)
   where id = p_caso_etapa_id;

  insert into public.eventos (caso_id, caso_etapa_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    v_caso_id,
    p_caso_etapa_id,
    v_pessoa_id,
    'video_master_movido',
    jsonb_build_object(
      'caso_etapa_id', p_caso_etapa_id,
      'caso_id', v_caso_id,
      'de', v_status,
      'para', p_fase
    ),
    now()
  );
end;
$$;

comment on function public.mover_video_master(uuid, public.status_etapa) is
  'Move o vídeo horizontal do MASTER entre as quatro fases da seção. Aceita caso '
  'ENCERRADO desde 20260903153101 — a entrega não espera o horizontal, e o trabalho '
  'segue pela seção depois do encerramento. Cancelado continua recusado.';

revoke all on function public.mover_video_master(uuid, public.status_etapa) from public;
grant execute on function public.mover_video_master(uuid, public.status_etapa) to authenticated;
