-- pgTAP: RPC sync_upsert_caso — fatia 1 do sync do Google Calendar (seção
-- 7 e item 5 da seção 13 do CLAUDE.md). Chamada como service_role (a
-- Edge Function), nunca como authenticated — o próprio teste de segurança
-- (H1) prova que essa fronteira está fechada.

begin;
select plan(24);

create function pg_temp.levanta_erro(p_sql text) returns boolean
language plpgsql
as $$
begin
  execute p_sql;
  return false;
exception when others then
  return true;
end;
$$;


-- =============================================================================
-- Fixtures
-- =============================================================================

insert into auth.users (id, email, aud, role, created_at, updated_at)
values (gen_random_uuid(), 'operador.teste.sync@clickbaby.test', 'authenticated', 'authenticated', now(), now());

insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'Operador Teste Sync', u.id, 'operador', true
from auth.users u where u.email = 'operador.teste.sync@clickbaby.test';

insert into public.maternidades (nome, sigla)
values ('Maternidade Sync Test', 'SYNCTEST');


-- =============================================================================
-- A. Caso novo completo (pacote_id e maternidade_id preenchidos)
-- =============================================================================

set local role service_role;

select is(
  public.sync_upsert_caso(
    'evt-completo-001',
    'Mãe Sync Completo',
    'Bebê Completo',
    (select id from public.pacotes where slug = 'basic'),
    (select id from public.maternidades where sigla = 'SYNCTEST'),
    now(),
    '5',
    false
  ),
  'caso_criado',
  'A0: retorna caso_criado'
);

reset role;

select ok(
  (
    select c.pacote_id is not null and c.maternidade_id is not null
       and c.mae_nome = 'Mãe Sync Completo' and c.bebe_nome = 'Bebê Completo'
    from public.casos c where c.google_calendar_event_id = 'evt-completo-001'
  ),
  'A1: caso novo completo criado com mae/bebe/pacote/maternidade corretos'
);

select is(
  (
    select count(*)::int from public.caso_etapas ce
    join public.casos c on c.id = ce.caso_id
    where c.google_calendar_event_id = 'evt-completo-001'
  ),
  4,
  'A2: trigger gera as 4 etapas do BASIC (entrada, nascimento, edicao_foto, reels) na hora'
);

select is(
  (
    select count(*)::int from public.eventos e
    join public.casos c on c.id = e.caso_id
    where c.google_calendar_event_id = 'evt-completo-001'
      and e.tipo = 'caso_criado_via_sync' and e.pessoa_id is null
  ),
  1,
  'A3: evento caso_criado_via_sync registrado, sem ator humano (pessoa_id null)'
);


-- =============================================================================
-- B. Caso novo rascunho pendente (pacote_id null)
-- =============================================================================

set local role service_role;

select is(
  public.sync_upsert_caso(
    'evt-rascunho-002',
    'Mãe Sync Rascunho',
    'Bebê Rascunho',
    null,
    (select id from public.maternidades where sigla = 'SYNCTEST'),
    now(),
    '7',
    false
  ),
  'rascunho_criado',
  'B0: retorna rascunho_criado'
);

reset role;

select ok(
  (select pacote_id is null from public.casos where google_calendar_event_id = 'evt-rascunho-002'),
  'B1: caso nasce rascunho pendente (pacote_id null)'
);

select is(
  (
    select count(*)::int from public.caso_etapas ce
    join public.casos c on c.id = ce.caso_id
    where c.google_calendar_event_id = 'evt-rascunho-002'
  ),
  0,
  'B2: sem pacote, nenhuma caso_etapa é gerada'
);

select is(
  (
    select count(*)::int from public.eventos e
    join public.casos c on c.id = e.caso_id
    where c.google_calendar_event_id = 'evt-rascunho-002'
      and e.tipo = 'rascunho_pendente_criado' and (e.payload->>'rascunho_pendente')::boolean = true
  ),
  1,
  'B3: evento rascunho_pendente_criado registrado com o payload certo'
);


-- =============================================================================
-- C. Rascunho resolvido (segunda chamada do mesmo evento, agora com pacote)
-- =============================================================================

set local role service_role;

-- previsao_em não precisa ser idêntico ao da primeira chamada aqui (só
-- importa em D, a idempotência) -- now() serve; service_role não tem (e
-- não deveria ter) SELECT em casos, só a função via SECURITY DEFINER.
select is(
  public.sync_upsert_caso(
    'evt-rascunho-002',
    'Mãe Sync Rascunho',
    'Bebê Rascunho',
    (select id from public.pacotes where slug = 'basic'),
    (select id from public.maternidades where sigla = 'SYNCTEST'),
    now(),
    '7',
    false
  ),
  'caso_atualizado',
  'C0: rascunho resolvido retorna caso_atualizado'
);

reset role;

select ok(
  (select pacote_id is not null from public.casos where google_calendar_event_id = 'evt-rascunho-002'),
  'C1: rascunho resolvido -- pacote_id agora preenchido'
);

select is(
  (
    select count(*)::int from public.caso_etapas ce
    join public.casos c on c.id = ce.caso_id
    where c.google_calendar_event_id = 'evt-rascunho-002'
  ),
  4,
  'C2: trigger de UPDATE gera as 4 etapas agora que o rascunho foi resolvido'
);

select is(
  (
    select count(*)::int from public.eventos e
    join public.casos c on c.id = e.caso_id
    where c.google_calendar_event_id = 'evt-rascunho-002'
      and e.tipo = 'caso_atualizado_via_sync' and (e.payload->>'rascunho_resolvido')::boolean = true
  ),
  1,
  'C3: evento caso_atualizado_via_sync registrado com rascunho_resolvido=true'
);


-- =============================================================================
-- D. Idempotência: mesmo evento, dados idênticos -- sem duplicar
-- =============================================================================

-- Captura o que precisa se repetir IDÊNTICO (senão a checagem de "algo
-- mudou" da função dispararia de propósito) enquanto ainda dá pra ler
-- casos -- feito no papel privilegiado da conexão, antes de virar
-- service_role, que não tem SELECT em casos.
select set_config('sync_test.qtd_eventos_antes', (
  select count(*)::text from public.eventos e
  join public.casos c on c.id = e.caso_id
  where c.google_calendar_event_id = 'evt-completo-001'
), true);

select set_config('sync_test.previsao_completo', (
  select previsao_em::text from public.casos where google_calendar_event_id = 'evt-completo-001'
), true);

set local role service_role;

select is(
  public.sync_upsert_caso(
    'evt-completo-001',
    'Mãe Sync Completo',
    'Bebê Completo',
    (select id from public.pacotes where slug = 'basic'),
    (select id from public.maternidades where sigla = 'SYNCTEST'),
    current_setting('sync_test.previsao_completo')::timestamptz,
    '5',
    false
  ),
  'sem_efeito',
  'D0: reprocessar sem mudança retorna sem_efeito'
);

reset role;

select is(
  (
    select count(*)::int from public.eventos e
    join public.casos c on c.id = e.caso_id
    where c.google_calendar_event_id = 'evt-completo-001'
  ),
  current_setting('sync_test.qtd_eventos_antes')::int,
  'D1: re-processar o mesmo evento sem mudança nenhuma não grava evento novo'
);


-- =============================================================================
-- E. Cancelamento de caso existente, não terminal
-- =============================================================================

set local role service_role;

select is(
  public.sync_upsert_caso('evt-completo-001', null, null, null, null, null, null, true),
  'caso_cancelado',
  'E0: cancelamento efetivo retorna caso_cancelado'
);

reset role;

select is(
  (select status_operacional::text from public.casos where google_calendar_event_id = 'evt-completo-001'),
  'cancelado',
  'E1: caso não terminal é cancelado quando o evento vem com card cinza'
);

select is(
  (select motivo_cancelamento from public.casos where google_calendar_event_id = 'evt-completo-001'),
  'Cancelado via Google Calendar (card cinza)',
  'E2: motivo_cancelamento padrão gravado'
);

select is(
  (
    select count(*)::int from public.eventos e
    join public.casos c on c.id = e.caso_id
    where c.google_calendar_event_id = 'evt-completo-001' and e.tipo = 'caso_cancelado_via_sync'
  ),
  1,
  'E3: evento caso_cancelado_via_sync registrado'
);


-- =============================================================================
-- F. Cancelamento de evento que nunca virou caso -- no-op, sem erro
-- =============================================================================

set local role service_role;

select is(
  public.sync_upsert_caso('evt-nunca-existiu-999', null, null, null, null, null, null, true),
  'sem_efeito',
  'F0: cancelar evento inexistente retorna sem_efeito'
);

reset role;

select is(
  (select count(*)::int from public.casos where google_calendar_event_id = 'evt-nunca-existiu-999'),
  0,
  'F1: cancelar um evento sem caso correspondente não cria nada (no-op)'
);


-- =============================================================================
-- G. Re-sync não reseta o estado operacional de um caso já em andamento
-- =============================================================================

insert into public.casos (mae_nome, pacote_id, maternidade_id, google_calendar_event_id, previsao_em, cor_calendar)
select 'Mãe Sync Em Andamento',
       (select id from public.pacotes where slug = 'basic'),
       (select id from public.maternidades where sigla = 'SYNCTEST'),
       'evt-em-andamento-003',
       now(),
       '3';

-- Avança o estado manualmente (fora da RPC, só pra montar o cenário de
-- teste -- não existe outro jeito hoje de chegar em em_edicao).
update public.casos set status_operacional = 'em_edicao' where google_calendar_event_id = 'evt-em-andamento-003';

set local role service_role;

-- Re-sync manda um dado de calendário atualizado (mae_nome corrigido), mas
-- não sabe nem deveria saber que o caso já avançou operacionalmente.
select is(
  public.sync_upsert_caso(
    'evt-em-andamento-003',
    'Mãe Sync Em Andamento (nome corrigido)',
    null,
    (select id from public.pacotes where slug = 'basic'),
    (select id from public.maternidades where sigla = 'SYNCTEST'),
    now(),
    '3',
    false
  ),
  'caso_atualizado',
  'G0: atualização de dado retorna caso_atualizado'
);

reset role;

select is(
  (select status_operacional::text from public.casos where google_calendar_event_id = 'evt-em-andamento-003'),
  'em_edicao',
  'G1: re-sync atualiza dado (mae_nome) mas não reseta status_operacional de um caso em andamento'
);


-- =============================================================================
-- H. Segurança: operador autenticado NÃO consegue executar a função
-- =============================================================================

select set_config('request.jwt.claim.sub', (select auth_user_id::text from public.pessoas where nome = 'Operador Teste Sync'), true);
set local role authenticated;

select ok(
  pg_temp.levanta_erro(
    $$ select public.sync_upsert_caso('evt-hack-004', 'Hacker', 'Tentativa', null, null, now(), null, false) $$
  ),
  'H1: operador autenticado NÃO consegue executar sync_upsert_caso (falta de EXECUTE, revogado de PUBLIC)'
);

-- H2: anon também não. Achado real ao verificar o remoto (migration
-- 20260821100857): este schema tem ALTER DEFAULT PRIVILEGES concedendo
-- EXECUTE em toda função nova para anon/authenticated/service_role no
-- instante da criação -- REVOKE ALL FROM PUBLIC sozinho não desfaz um
-- grant nomeado que já foi feito pra anon. sync_upsert_caso não tem
-- checagem interna de auth.uid(), então sem este REVOKE explícito
-- qualquer chamada anônima teria sucesso completo.
reset role;
set local role anon;

select ok(
  pg_temp.levanta_erro(
    $$ select public.sync_upsert_caso('evt-hack-005', 'Hacker Anonimo', 'Tentativa', null, null, now(), null, false) $$
  ),
  'H2: usuário anônimo (anon) também NÃO consegue executar sync_upsert_caso'
);

select * from finish();
rollback;
