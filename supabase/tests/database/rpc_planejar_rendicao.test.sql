-- pgTAP: planejar_rendicao (migration 20260827141600).
--
-- A rendição planejada é "quem assume depois", não um segundo responsável. A
-- diferença some com facilidade: basta alguém tratar as duas colunas como
-- iguais e a etapa passa a ter dois donos, o handoff deixa de descrever uma
-- passagem entre duas pessoas, e o tempo de ciclo da seção 9 soma duas
-- jornadas numa etapa só.
--
-- Por isso o teste central é o de que planejar NÃO troca o responsável, e o de
-- que transferir CONSOME o plano.

begin;
select plan(15);


-- =============================================================================
-- Fixtures — três pessoas: quem está, quem assume, e uma inativa
-- =============================================================================

insert into auth.users (id, email, aud, role, created_at, updated_at)
values
  (gen_random_uuid(), 'turno.a@clickbaby.test', 'authenticated', 'authenticated', now(), now()),
  (gen_random_uuid(), 'turno.b@clickbaby.test', 'authenticated', 'authenticated', now(), now()),
  (gen_random_uuid(), 'turno.inativa@clickbaby.test', 'authenticated', 'authenticated', now(), now());

insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'Turno A', u.id, 'operador', true from auth.users u where u.email = 'turno.a@clickbaby.test';
insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'Turno B', u.id, 'operador', true from auth.users u where u.email = 'turno.b@clickbaby.test';
insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'Turno Inativa', u.id, 'operador', false from auth.users u where u.email = 'turno.inativa@clickbaby.test';

insert into public.casos (id, mae_nome, pacote_id, maternidade_id, previsao_em)
values (
  'bbbb2222-0000-0000-0000-000000000001',
  'MAE RENDICAO',
  (select id from public.pacotes where slug = 'standard'),
  (select id from public.maternidades where sigla = 'HSC'),
  '2026-09-22 08:00:00+00'
);

create function pg_temp.etapa(p_caso uuid, p_tipo public.etapa_tipo) returns uuid
language sql stable as $$
  select id from public.caso_etapas where caso_id = p_caso and tipo = p_tipo;
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
-- 1. Sem responsável atual não há rendição
-- =============================================================================

select pg_temp.vira('turno.a@clickbaby.test');
set local role authenticated;

select ok(
  pg_temp.levanta(format(
    'select public.planejar_rendicao(%L, %L)',
    pg_temp.etapa('bbbb2222-0000-0000-0000-000000000001', 'entrada'),
    pg_temp.pessoa('Turno B'))),
  'planejar sem responsável atual é RECUSADO — para isso existe atribuir_etapa'
);

-- Agora sim: Turno A assume a entrada.
select public.atribuir_etapa(
  pg_temp.etapa('bbbb2222-0000-0000-0000-000000000001', 'entrada'),
  pg_temp.pessoa('Turno A')
);

reset role;

select is(
  (select responsavel_id from public.caso_etapas
    where id = pg_temp.etapa('bbbb2222-0000-0000-0000-000000000001', 'entrada')),
  pg_temp.pessoa('Turno A'),
  'Turno A é a responsável'
);


-- =============================================================================
-- 2. Planejar NÃO troca o responsável — é o ponto do arquivo
-- =============================================================================

select pg_temp.vira('turno.a@clickbaby.test');
set local role authenticated;

select lives_ok(
  format('select public.planejar_rendicao(%L, %L)',
    pg_temp.etapa('bbbb2222-0000-0000-0000-000000000001', 'entrada'),
    pg_temp.pessoa('Turno B')),
  'Turno A anuncia que Turno B assume'
);

reset role;

select is(
  (select responsavel_id from public.caso_etapas
    where id = pg_temp.etapa('bbbb2222-0000-0000-0000-000000000001', 'entrada')),
  pg_temp.pessoa('Turno A'),
  'o responsável CONTINUA sendo Turno A — planejar não é transferir'
);

select is(
  (select proximo_responsavel_id from public.caso_etapas
    where id = pg_temp.etapa('bbbb2222-0000-0000-0000-000000000001', 'entrada')),
  pg_temp.pessoa('Turno B'),
  'e Turno B fica registrada como quem assume'
);

select is(
  (select count(*)::int from public.eventos
    where caso_id = 'bbbb2222-0000-0000-0000-000000000001' and tipo = 'rendicao_planejada'),
  1,
  'o plano virou evento — quem registrou e quando ficam em eventos, não em colunas novas'
);

select is(
  (select count(*)::int from public.handoffs
    where caso_etapa_id = pg_temp.etapa('bbbb2222-0000-0000-0000-000000000001', 'entrada')),
  0,
  'e NENHUM handoff foi gravado: nada passou de mão ainda'
);


-- =============================================================================
-- 3. Os negativos
-- =============================================================================

select pg_temp.vira('turno.a@clickbaby.test');
set local role authenticated;

select ok(
  pg_temp.levanta(format(
    'select public.planejar_rendicao(%L, %L)',
    pg_temp.etapa('bbbb2222-0000-0000-0000-000000000001', 'entrada'),
    pg_temp.pessoa('Turno A'))),
  'render para si mesma é RECUSADO'
);

select ok(
  pg_temp.levanta(format(
    'select public.planejar_rendicao(%L, %L)',
    pg_temp.etapa('bbbb2222-0000-0000-0000-000000000001', 'entrada'),
    pg_temp.pessoa('Turno Inativa'))),
  'pessoa inativa não pode ser anunciada'
);

reset role;


-- =============================================================================
-- 4. Cancelar o plano
-- =============================================================================

select pg_temp.vira('turno.a@clickbaby.test');
set local role authenticated;

select lives_ok(
  format('select public.planejar_rendicao(%L, null)',
    pg_temp.etapa('bbbb2222-0000-0000-0000-000000000001', 'entrada')),
  'NULL cancela o plano — a pessoa que ia assumir não vem mais'
);

reset role;

select is(
  (select proximo_responsavel_id from public.caso_etapas
    where id = pg_temp.etapa('bbbb2222-0000-0000-0000-000000000001', 'entrada')),
  null,
  'o plano saiu'
);

select is(
  (select count(*)::int from public.eventos
    where caso_id = 'bbbb2222-0000-0000-0000-000000000001' and tipo = 'rendicao_cancelada'),
  1,
  'e o cancelamento também é evento — a trilha não tem buraco'
);


-- =============================================================================
-- 5. Transferir CONSOME o plano
--
-- Depois da troca, o plano cumpriu-se ou caducou. Nos dois casos, deixá-lo
-- preenchido faria a tela anunciar uma rendição que não vem.
-- =============================================================================

select pg_temp.vira('turno.a@clickbaby.test');
set local role authenticated;

select public.planejar_rendicao(
  pg_temp.etapa('bbbb2222-0000-0000-0000-000000000001', 'entrada'),
  pg_temp.pessoa('Turno B')
);

select public.transferir_etapa(
  pg_temp.etapa('bbbb2222-0000-0000-0000-000000000001', 'entrada'),
  pg_temp.pessoa('Turno B'),
  'fim de turno'
);

reset role;

select is(
  (select responsavel_id from public.caso_etapas
    where id = pg_temp.etapa('bbbb2222-0000-0000-0000-000000000001', 'entrada')),
  pg_temp.pessoa('Turno B'),
  'a troca aconteceu'
);

select is(
  (select proximo_responsavel_id from public.caso_etapas
    where id = pg_temp.etapa('bbbb2222-0000-0000-0000-000000000001', 'entrada')),
  null,
  'e o plano foi CONSUMIDO — não sobra "Turno B assume" com Turno B já dentro'
);

select is(
  (select payload ->> 'cumpriu_rendicao_planejada' from public.eventos
    where caso_etapa_id = pg_temp.etapa('bbbb2222-0000-0000-0000-000000000001', 'entrada')
      and tipo = 'etapa_transferida'),
  'true',
  'o evento registra que a troca cumpriu o que estava combinado'
);


select * from finish();
rollback;
