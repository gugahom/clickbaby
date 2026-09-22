-- =============================================================================
-- O TERMO DE USO DE IMAGEM (22/09/2026, pedido do gestor)
--
-- A planilha de atendimento tem a coluna TERMO, e ela responde uma pergunta da
-- MÍDIA da empresa: dá para usar as fotos deste parto num post? O contrato de
-- cada família traz a escolha, e quem fecha isso na planilha é a Morgana —
-- então a pergunta passa a morar no diálogo de "Confirmar entrega e encerrar o
-- caso", que é o último gesto dela sobre o caso.
--
-- SÃO TRÊS RESPOSTAS, e elas já existem no enum desde o schema inicial:
-- `assinado`, `pendente` ("ASS PENDENTE" na planilha) e `sem_contrato`.
--
-- O QUARTO VALOR, `nao_aplicavel`, FICA NO ENUM E NÃO É ACEITO AQUI. Valor de
-- enum não se apaga, e a operação tem três respostas — uma quarta, que ninguém
-- sabe ler, acabaria num filtro da mídia como "talvez". Quem não tem contrato é
-- `sem_contrato`, que é o caso dos BIRTH: vendidos depois do parto, não têm
-- contrato assinado. A tela já abre marcada assim neles.
--
-- NULO É "NINGUÉM PERGUNTOU AINDA", e é por isso que a coluna deixa de ser NOT
-- NULL. Ela nascia `pendente` por padrão, e nenhuma tela jamais a escreveu: os
-- ~190 casos do remoto estão todos no padrão de fábrica. Mantido o NOT NULL, a
-- primeira consulta da mídia leria "ASS PENDENTE" em toda a história da empresa
-- — uma afirmação sobre contratos que ninguém conferiu. O backfill zera SÓ o
-- valor padrão; qualquer linha que alguém tenha mudado à mão continua como
-- está.
--
-- QUEM RESPONDEU E QUANDO FICA EM `eventos`, e não em duas colunas novas. O
-- evento `termo_registrado` guarda o anterior e o novo, e é append-only
-- (invariante 3.3) — uma correção seis meses depois não apaga a resposta de
-- hoje. Colunas só fariam sentido se o cartão mostrasse o carimbo, e ele mostra
-- o selo.
--
-- E O CAMPO SAI DO UPDATE DIRETO. `termo_status` era uma das duas colunas que
-- `authenticated` ainda escrevia por UPDATE de coluna (dívida #4 da seção 13,
-- que manda revogar o privilégio quando a RPC nascer). Fica só
-- `situacao_clinica`.
-- =============================================================================

alter table public.casos
  alter column termo_status drop not null,
  alter column termo_status drop default;

comment on column public.casos.termo_status is
  'Termo de uso de imagem do contrato, a coluna TERMO da planilha de atendimento: assinado, pendente ou sem_contrato. NULO é "ninguém respondeu ainda" — a pergunta é feita no diálogo de confirmar a entrega, e casos antigos nunca a receberam. Escreve-se só por registrar_termo. O valor nao_aplicavel sobrou do schema inicial e não é aceito pela RPC.';

-- Só o padrão de fábrica. Quem estiver em assinado/sem_contrato/nao_aplicavel
-- foi mexido à mão por alguém e continua onde está.
update public.casos
   set termo_status = null
 where termo_status = 'pendente';


-- -----------------------------------------------------------------------------
-- registrar_termo
--
-- ATENDIMENTO OU ADM, o mesmo par que confirma a entrega e cancela o caso (a
-- Morgana é atendimento). O termo é a leitura de um contrato comercial, não o
-- registro de um trabalho de campo.
--
-- ACEITA O CASO EM QUALQUER ESTADO, inclusive encerrado e cancelado, e é essa
-- folga que faz a correção existir: o caso encerra no mesmo minuto em que a
-- resposta é dada, e um engano ficaria trancado para sempre. Casos antigos, que
-- encerraram antes desta migration, se preenchem pelo mesmo caminho.
--
-- É RPC, e não um UPDATE com policy, pelo motivo de sempre: `authenticated` não
-- tem mais UPDATE nesta coluna, e a resposta precisa virar evento.
-- -----------------------------------------------------------------------------

create or replace function public.registrar_termo(
  p_caso_id uuid,
  p_termo   public.termo_status
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pessoa_id uuid;
  v_anterior  public.termo_status;
begin
  select p.id into v_pessoa_id
  from public.pessoas p
  where p.auth_user_id = auth.uid()
    and p.ativo;

  if v_pessoa_id is null then
    raise exception 'Usuário autenticado não corresponde a nenhuma pessoa ativa.';
  end if;

  if not (public.eh_atendimento() or public.eh_adm()) then
    raise exception 'Só atendimento ou adm podem registrar o termo de uso de imagem.';
  end if;

  if p_termo is null then
    raise exception 'Escolha uma resposta para o termo: assinado, pendente ou sem contrato.';
  end if;

  if p_termo = 'nao_aplicavel' then
    raise exception 'O termo tem três respostas: assinado, pendente ou sem contrato. Quem não tem contrato é "sem contrato".';
  end if;

  select c.termo_status into v_anterior
  from public.casos c
  where c.id = p_caso_id
  for update;

  if not found then
    raise exception 'Caso % não encontrado.', p_caso_id;
  end if;

  if v_anterior is not distinct from p_termo then
    return;  -- nada mudou, nada a registrar
  end if;

  update public.casos
     set termo_status = p_termo
   where id = p_caso_id;

  insert into public.eventos (caso_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    p_caso_id,
    v_pessoa_id,
    'termo_registrado',
    jsonb_build_object(
      'caso_id', p_caso_id,
      'termo', p_termo,
      -- O anterior fica: é o que responde "desde quando este caso é assinado"
      -- depois de uma correção. Nulo quando ninguém tinha respondido.
      'termo_anterior', v_anterior
    ),
    now()
  );
end;
$$;

comment on function public.registrar_termo(uuid, public.termo_status) is
  'Registra o termo de uso de imagem do caso (a coluna TERMO da planilha): assinado, pendente ou sem_contrato. Atendimento ou adm, em caso de qualquer estado — a resposta é dada ao confirmar a entrega e pode ser corrigida depois, inclusive em caso encerrado. Recusa nao_aplicavel, valor do schema inicial que a operação não usa. Valor igual ao gravado não gera evento.';

revoke all on function public.registrar_termo(uuid, public.termo_status) from public, anon;
grant execute on function public.registrar_termo(uuid, public.termo_status) to authenticated;


-- -----------------------------------------------------------------------------
-- E o UPDATE direto da coluna sai.
--
-- `grant update (colunas)` é aditivo: não existe "substituir a lista". O revoke
-- desta coluna é que a tira, e as outras oito continuam de pé — conferido pelo
-- teste de privilégios e pelo auditor do remoto (`npm run seguranca`).
-- -----------------------------------------------------------------------------

revoke update (termo_status) on public.casos from authenticated;
