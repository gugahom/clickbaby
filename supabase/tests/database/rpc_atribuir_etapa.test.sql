-- pgTAP: atribuir_etapa (migration 20260825034214).
--
-- O que precisa ser provado:
--   - designa responsável a etapa parada, que era o bloqueio da Sarah;
--   - preenche atribuido_por/atribuido_em, colunas que existiam desde a
--     migration inicial e nunca tinham sido escritas;
--   - NÃO grava handoff — é a linha entre atribuir e transferir, e se ela
--     escorregar o histórico passa a afirmar passagens de trabalho que não
--     aconteceram;
--   - reatribui antes de começar, mas recusa depois (aí é transferir_etapa);
--   - qualquer pessoa ativa atribui, inclusive para si mesma (assumir).

begin;
select plan(16);


-- =============================================================================
-- Fixtures
-- =============================================================================

insert into auth.users (id, email, aud, role, created_at, updated_at)
values
  (gen_random_uuid(), 'coord.atrib@clickbaby.test', 'authenticated', 'authenticated', now(), now()),
  (gen_random_uuid(), 'ana.atrib@clickbaby.test',   'authenticated', 'authenticated', now(), now()),
  (gen_random_uuid(), 'beto.atrib@clickbaby.test',  'authenticated', 'authenticated', now(), now()),
  (gen_random_uuid(), 'saiu.atrib@clickbaby.test',  'authenticated', 'authenticated', now(), now());

insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'Coord Atrib', u.id, 'coordenacao', true
from auth.users u where u.email = 'coord.atrib@clickbaby.test';

insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'Ana Atrib', u.id, 'operador', true
from auth.users u where u.email = 'ana.atrib@clickbaby.test';

insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'Beto Atrib', u.id, 'operador', true
from auth.users u where u.email = 'beto.atrib@clickbaby.test';

-- Inativa: o alvo precisa ser gente que ainda trabalha aqui.
insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'Saiu Atrib', u.id, 'operador', false
from auth.users u where u.email = 'saiu.atrib@clickbaby.test';

insert into public.casos (id, mae_nome, pacote_id, maternidade_id, previsao_em)
values (
  'eeeeeeee-0000-0000-0000-000000000001',
  'MAE ATRIBUICAO',
  (select id from public.pacotes where slug = 'baby-reels'),
  (select id from public.maternidades where sigla = 'HSC'),
  '2026-09-22 10:00:00+00'
);

create function pg_temp.etapa(p_tipo public.etapa_tipo) returns uuid
language sql stable as $$
  select id from public.caso_etapas
  where caso_id = 'eeeeeeee-0000-0000-0000-000000000001' and tipo = p_tipo;
$$;

create function pg_temp.pessoa(p_nome text) returns uuid
language sql stable as $$
  select id from public.pessoas where nome = p_nome;
$$;

create function pg_temp.vira(p_email text) returns void
language sql as $$
  select set_config('request.jwt.claim.sub',
    (select id::text from auth.users where email = p_email), true);
$$;

create function pg_temp.levanta(p_sql text) returns boolean
language plpgsql as $$
begin
  execute p_sql;
  return false;
exception when others then
  return true;
end;
$$;


-- =============================================================================
-- 1. Estado inicial — o bloqueio que esta RPC resolve
-- =============================================================================

select is(
  (select responsavel_id from public.caso_etapas where id = pg_temp.etapa('banho')),
  null::uuid,
  'etapa pendente nasce sem responsável — era daqui que não se saía'
);

select pg_temp.vira('coord.atrib@clickbaby.test');
set local role authenticated;

select ok(
  pg_temp.levanta(format(
    'select public.transferir_etapa(%L, %L)',
    pg_temp.etapa('banho'), pg_temp.pessoa('Ana Atrib'))),
  'transferir_etapa recusa etapa sem responsável — o bloqueio da Sarah, em código'
);


-- =============================================================================
-- 2. Atribuir resolve
-- =============================================================================

select lives_ok(
  format('select public.atribuir_etapa(%L, %L)',
    pg_temp.etapa('banho'), pg_temp.pessoa('Ana Atrib')),
  'atribuir_etapa designa responsável a uma etapa parada'
);

select is(
  (select p.nome from public.caso_etapas ce
     join public.pessoas p on p.id = ce.responsavel_id
    where ce.id = pg_temp.etapa('banho')),
  'Ana Atrib',
  'a etapa passou a ter responsável'
);

select is(
  (select status from public.caso_etapas where id = pg_temp.etapa('banho')),
  'atribuida'::public.status_etapa,
  'e o status virou atribuida'
);

-- As colunas existiam desde 20260819192042 e nunca tinham sido escritas.
select is(
  (select p.nome from public.caso_etapas ce
     join public.pessoas p on p.id = ce.atribuido_por
    where ce.id = pg_temp.etapa('banho')),
  'Coord Atrib',
  'atribuido_por registra QUEM distribuiu, não quem recebeu'
);

select ok(
  (select atribuido_em is not null from public.caso_etapas where id = pg_temp.etapa('banho')),
  'atribuido_em é carimbado (now() do servidor, invariante 3.4)'
);

-- A linha entre atribuir e transferir, verificada: nada foi passado porque nada
-- começou. Um handoff aqui afirmaria uma entrega de trabalho que não houve.
select is(
  (select count(*)::int from public.handoffs where caso_etapa_id = pg_temp.etapa('banho')),
  0,
  'atribuir NÃO grava handoff — nada foi passado, o trabalho não começou'
);

select is(
  (select ev.payload->>'para_pessoa_id' from public.eventos ev
    where ev.caso_etapa_id = pg_temp.etapa('banho') and ev.tipo = 'etapa_atribuida'),
  pg_temp.pessoa('Ana Atrib')::text,
  'o evento etapa_atribuida registra para quem foi'
);


-- =============================================================================
-- 3. Reatribuir antes de começar
-- =============================================================================

select lives_ok(
  format('select public.atribuir_etapa(%L, %L)',
    pg_temp.etapa('banho'), pg_temp.pessoa('Beto Atrib')),
  'reatribuir uma etapa ainda não iniciada funciona — a fila é remanejada'
);

-- Casa o PAR (de, para) em vez de pegar "o último": todos os eventos desta
-- transação de teste compartilham o mesmo now(), então ordenar por ocorrido_em
-- não define ordem nenhuma e o "último" seria arbitrário.
select ok(
  exists (
    select 1 from public.eventos ev
    where ev.caso_etapa_id = pg_temp.etapa('banho')
      and ev.tipo = 'etapa_atribuida'
      and ev.payload->>'de_pessoa_id' = pg_temp.pessoa('Ana Atrib')::text
      and ev.payload->>'para_pessoa_id' = pg_temp.pessoa('Beto Atrib')::text
  ),
  'a reatribuição guarda de quem saiu e para quem foi, mesmo sem handoff'
);

select ok(
  pg_temp.levanta(format(
    'select public.atribuir_etapa(%L, %L)',
    pg_temp.etapa('banho'), pg_temp.pessoa('Beto Atrib'))),
  'atribuir para quem já é responsável é recusado — evento de redistribuição que não houve'
);

select ok(
  pg_temp.levanta(format(
    'select public.atribuir_etapa(%L, %L)',
    pg_temp.etapa('banho'), pg_temp.pessoa('Saiu Atrib'))),
  'não dá para atribuir a pessoa inativa'
);


-- =============================================================================
-- 4. Depois que o trabalho começa, o caminho é transferir_etapa
-- =============================================================================

select public.iniciar_etapa(pg_temp.etapa('banho'));

select ok(
  pg_temp.levanta(format(
    'select public.atribuir_etapa(%L, %L)',
    pg_temp.etapa('banho'), pg_temp.pessoa('Ana Atrib'))),
  'etapa em andamento RECUSA atribuir — daí em diante é transferir_etapa'
);

-- E transferir passa a funcionar, porque agora existe responsável: as duas
-- funções cobrem lados opostos da mesma linha.
select lives_ok(
  format('select public.transferir_etapa(%L, %L)',
    pg_temp.etapa('banho'), pg_temp.pessoa('Ana Atrib')),
  'e transferir_etapa passa a funcionar — as duas cobrem lados opostos da linha'
);


-- =============================================================================
-- 5. Qualquer pessoa ativa atribui, inclusive a si mesma (assumir)
-- =============================================================================

reset role;
select pg_temp.vira('ana.atrib@clickbaby.test');
set local role authenticated;

select lives_ok(
  format('select public.atribuir_etapa(%L, %L)',
    pg_temp.etapa('fechamento'), pg_temp.pessoa('Ana Atrib')),
  'operadora atribui para SI MESMA — é "assumir", e a fila de edição depende disso'
);

reset role;


select * from finish();
rollback;
