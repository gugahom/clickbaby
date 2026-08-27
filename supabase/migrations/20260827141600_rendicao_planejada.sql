-- =============================================================================
-- Rendição planejada: quem assume a etapa na virada de turno.
--
-- O PEDIDO, E O QUE ELE NÃO É
-- O gestor pediu "atribuir até 2 pessoas". O caso de uso que ele descreveu:
-- uma funcionária começa o atendimento da mãe mas tem que sair em 15 minutos
-- por causa do horário, e a outra já sabe que vai assumir aquela etapa.
--
-- Isso NÃO é dois responsáveis. Dois responsáveis seriam duas pessoas
-- trabalhando ao mesmo tempo — e aí `transferir_etapa` ficaria sem resposta
-- para "transferir qual dos dois?", `handoffs` deixaria de descrever uma
-- passagem entre duas pessoas, e a medição de tempo de ciclo da seção 9
-- passaria a somar duas jornadas numa etapa só.
--
-- O que ele descreveu é UMA pessoa ativa e a PRÓXIMA já anunciada. Por isso a
-- coluna se chama `proximo_responsavel_id` e não `responsavel_2_id`: o nome
-- carrega a semântica, e um nome errado aqui viraria dois responsáveis de
-- fato no primeiro código que lesse a coluna sem ler este comentário.
--
-- POR QUE UMA COLUNA E NÃO TABELA DE JUNÇÃO
-- Uma tabela permitiria N próximos, o que ninguém pediu e a operação não usa —
-- a rendição é a próxima pessoa, singular. E obrigaria toda RPC que hoje lê
-- `responsavel_id` a virar join. O custo não compra nada.
--
-- POR QUE NÃO GUARDA QUEM PLANEJOU
-- `atribuido_por`/`atribuido_em` existem porque a atribuição é uma decisão de
-- coordenação que precisa de dono. O plano de rendição é combinado entre as
-- duas fotógrafas no corredor; quem registrou fica em `eventos`, que é
-- append-only (invariante 3.3) e já responde "quem e quando" sem duas colunas
-- novas em `caso_etapas`.
-- =============================================================================

alter table public.caso_etapas
  add column proximo_responsavel_id uuid references public.pessoas (id);

-- Planejar entregar para si mesmo não é rendição, é ruído — e apareceria na
-- tela como "Sarah ▸ Sarah".
alter table public.caso_etapas
  add constraint caso_etapas_proximo_diferente_do_atual
    check (proximo_responsavel_id is null or proximo_responsavel_id is distinct from responsavel_id);

comment on column public.caso_etapas.proximo_responsavel_id is
  'Quem já sabe que vai ASSUMIR esta etapa na virada de turno. Não é um segundo responsável: só uma pessoa trabalha por vez, e esta é a próxima. É consumido por transferir_etapa, que ao efetivar a troca limpa o plano. Quem registrou o plano fica em eventos.';

create index idx_caso_etapas_proximo_responsavel
  on public.caso_etapas (proximo_responsavel_id)
  where proximo_responsavel_id is not null;

-- A coluna é preenchida SÓ pela RPC. Sem este privilégio de coluna, um UPDATE
-- direto do cliente esbarra no GRANT antes de esbarrar na policy — é a segunda
-- camada que a seção 5 descreve.
--
-- (Não há grant a conceder: `authenticated` tem UPDATE por coluna em
-- caso_etapas para NENHUMA coluna desde a 20260822072158. A ausência aqui é
-- deliberada e está afirmada em teste.)


-- -----------------------------------------------------------------------------
-- planejar_rendicao
-- -----------------------------------------------------------------------------

create or replace function public.planejar_rendicao(
  p_caso_etapa_id uuid,
  p_proxima_pessoa_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_executor_id uuid;
  v_status      public.status_etapa;
  v_caso_id     uuid;
  v_atual_id    uuid;
  v_ativo       boolean;
begin
  select p.id into v_executor_id
  from public.pessoas p
  where p.auth_user_id = auth.uid()
    and p.ativo;

  if v_executor_id is null then
    raise exception 'Usuário autenticado não corresponde a nenhuma pessoa ativa.';
  end if;

  select ce.status, ce.caso_id, ce.responsavel_id
    into v_status, v_caso_id, v_atual_id
  from public.caso_etapas ce
  where ce.id = p_caso_etapa_id
  for update;

  if not found then
    raise exception 'caso_etapa % não encontrada.', p_caso_etapa_id;
  end if;

  if v_status in ('concluida', 'dispensada') then
    raise exception
      'Etapa % está em status "%" — não há rendição a planejar para trabalho terminado.',
      p_caso_etapa_id, v_status;
  end if;

  -- NULL limpa o plano: a pessoa que ia assumir não vem mais, ou a rendição
  -- já foi combinada de outro jeito. Sair aqui evita exigir responsável atual
  -- para simplesmente apagar um plano.
  if p_proxima_pessoa_id is null then
    update public.caso_etapas
       set proximo_responsavel_id = null
     where id = p_caso_etapa_id;

    insert into public.eventos (caso_id, caso_etapa_id, pessoa_id, tipo, payload, ocorrido_em)
    values (
      v_caso_id, p_caso_etapa_id, v_executor_id, 'rendicao_cancelada',
      jsonb_build_object('caso_etapa_id', p_caso_etapa_id, 'caso_id', v_caso_id),
      now()
    );
    return;
  end if;

  -- A rendição é relativa a alguém: sem responsável atual, o que se quer é
  -- atribuir, não planejar a troca.
  if v_atual_id is null then
    raise exception
      'Etapa % não tem responsável atual — use atribuir_etapa primeiro; a rendição é quem assume DEPOIS de alguém.',
      p_caso_etapa_id;
  end if;

  if p_proxima_pessoa_id = v_atual_id then
    raise exception
      'Pessoa % já é a responsável atual da etapa % — render para si mesma não significa nada.',
      p_proxima_pessoa_id, p_caso_etapa_id;
  end if;

  select p.ativo into v_ativo
  from public.pessoas p
  where p.id = p_proxima_pessoa_id;

  if v_ativo is null or not v_ativo then
    raise exception 'Pessoa % não existe ou está inativa.', p_proxima_pessoa_id;
  end if;

  update public.caso_etapas
     set proximo_responsavel_id = p_proxima_pessoa_id
   where id = p_caso_etapa_id;

  insert into public.eventos (caso_id, caso_etapa_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    v_caso_id,
    p_caso_etapa_id,
    v_executor_id,
    'rendicao_planejada',
    jsonb_build_object(
      'caso_etapa_id', p_caso_etapa_id,
      'caso_id', v_caso_id,
      'responsavel_atual_id', v_atual_id,
      'proxima_pessoa_id', p_proxima_pessoa_id
    ),
    now()
  );
end;
$$;

comment on function public.planejar_rendicao(uuid, uuid) is
  'Anuncia quem assume a etapa na virada de turno, sem trocar o responsável ainda. NULL na segunda posição cancela o plano. Exige responsável atual: rendição é quem vem DEPOIS de alguém — para a primeira atribuição existe atribuir_etapa. A troca de fato continua sendo transferir_etapa, que grava o handoff (invariante 3.2) e consome o plano.';

revoke all on function public.planejar_rendicao(uuid, uuid) from public;
grant execute on function public.planejar_rendicao(uuid, uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- transferir_etapa consome o plano
--
-- Depois da troca, o plano é passado — seja porque foi ele que se cumpriu,
-- seja porque a etapa foi para outra pessoa e o combinado caducou. Nos dois
-- casos deixar `proximo_responsavel_id` preenchido faria a tela anunciar uma
-- rendição que não vai acontecer.
--
-- Recriada por inteiro em vez de um UPDATE avulso: a função é a transação que
-- garante handoff-e-troca juntos (invariante 3.2), e dividir isso em dois
-- lugares é como a invariante se perde.
-- -----------------------------------------------------------------------------

create or replace function public.transferir_etapa(
  p_caso_etapa_id uuid,
  p_para_pessoa_id uuid,
  p_motivo text default null
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
  v_de_pessoa_id uuid;
  v_planejado_id uuid;
  v_para_existe  boolean;
  v_para_ativo   boolean;
begin
  select p.id into v_executor_id
  from public.pessoas p
  where p.auth_user_id = auth.uid()
    and p.ativo;

  if v_executor_id is null then
    raise exception 'Usuário autenticado não corresponde a nenhuma pessoa ativa.';
  end if;

  select ce.status, ce.caso_id, ce.responsavel_id, ce.proximo_responsavel_id
    into v_status, v_caso_id, v_de_pessoa_id, v_planejado_id
  from public.caso_etapas ce
  where ce.id = p_caso_etapa_id
  for update;

  if not found then
    raise exception 'caso_etapa % não encontrada.', p_caso_etapa_id;
  end if;

  if v_status in ('concluida', 'dispensada') then
    raise exception
      'Etapa % está em status "%" — trabalho terminado não pode ser transferido.',
      p_caso_etapa_id, v_status;
  end if;

  if v_de_pessoa_id is null then
    raise exception
      'Etapa % não tem responsável atual — use atribuir_etapa para a primeira atribuição, transferir_etapa pressupõe handoff entre dois responsáveis.',
      p_caso_etapa_id;
  end if;

  if p_para_pessoa_id = v_de_pessoa_id then
    raise exception
      'Pessoa % já é o responsável atual da etapa % — não há transferência a fazer.',
      p_para_pessoa_id, p_caso_etapa_id;
  end if;

  select true, p.ativo into v_para_existe, v_para_ativo
  from public.pessoas p
  where p.id = p_para_pessoa_id;

  if not coalesce(v_para_existe, false) or not v_para_ativo then
    raise exception 'Pessoa % não existe ou está inativa.', p_para_pessoa_id;
  end if;

  insert into public.handoffs (caso_etapa_id, de_pessoa_id, para_pessoa_id, motivo, ocorrido_em)
  values (p_caso_etapa_id, v_de_pessoa_id, p_para_pessoa_id, p_motivo, now());

  update public.caso_etapas
     set responsavel_id = p_para_pessoa_id,
         proximo_responsavel_id = null
   where id = p_caso_etapa_id;

  insert into public.eventos (caso_id, caso_etapa_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    v_caso_id,
    p_caso_etapa_id,
    v_executor_id,
    'etapa_transferida',
    jsonb_build_object(
      'caso_etapa_id', p_caso_etapa_id,
      'caso_id', v_caso_id,
      'de_pessoa_id', v_de_pessoa_id,
      'para_pessoa_id', p_para_pessoa_id,
      -- Registra se a troca cumpriu o que estava combinado. É o que permite
      -- perguntar depois quantas rendições planejadas de fato aconteceram.
      'cumpriu_rendicao_planejada', v_planejado_id is not distinct from p_para_pessoa_id
    ),
    now()
  );
end;
$$;

comment on function public.transferir_etapa(uuid, uuid, text) is
  'Handoff de responsável (invariante 3.2): grava handoffs ANTES/JUNTO com a troca de caso_etapas.responsavel_id, nunca um update solto. de_pessoa_id é o responsavel_id atual da etapa, não quem chama a função — quem chama vira eventos.pessoa_id. Exige responsável atual (senão é atribuição, não transferência) e etapa não terminal. Consome proximo_responsavel_id: depois da troca o plano de rendição está cumprido ou caducou, e nos dois casos deixá-lo preenchido faria a tela anunciar uma passagem que não vem.';

revoke all on function public.transferir_etapa(uuid, uuid, text) from public;
grant execute on function public.transferir_etapa(uuid, uuid, text) to authenticated;
