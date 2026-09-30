-- pgTAP: criar caso pelo calendário, com cópia no Google
-- (migration 20260930092734).
--
--   C1 — só o adm cria (gestão, coordenação, comercial, financeiro).
--   C2 — o caso nasce inteiro: nomes em maiúsculas, etapas do pacote, New Born,
--        evento no histórico com a pessoa, e PENDENTE de ir ao Google.
--   C3 — a cor segue a regra do cadastro: o pacote ganha da maternidade.
--   C4 — o que a RPC recusa.
--   G1 — o lado do sync: lista os pendentes, liga o evento uma vez só, e é
--        exclusivo do service_role.
--   G2 — o cinza (card cinza = cancelamento) não pode virar cor de cadastro.

begin;
select plan(20);

insert into auth.users (id, email, aud, role, created_at, updated_at)
values
  (gen_random_uuid(), 'gestao.cc@clickbaby.test',      'authenticated', 'authenticated', now(), now()),
  (gen_random_uuid(), 'atendimento.cc@clickbaby.test', 'authenticated', 'authenticated', now(), now()),
  (gen_random_uuid(), 'fotografa.cc@clickbaby.test',   'authenticated', 'authenticated', now(), now());

insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select v.nome, u.id, v.papel::public.papel_sistema, true
from (values
  ('Gestao CC',      'gestao.cc@clickbaby.test',      'gestao'),
  ('Atendimento CC', 'atendimento.cc@clickbaby.test', 'atendimento'),
  ('Fotografa CC',   'fotografa.cc@clickbaby.test',   'operador')
) as v(nome, email, papel)
join auth.users u on u.email = v.email;

create function pg_temp.como(p_email text) returns void language plpgsql as $$
declare v_id uuid;
begin
  select id into v_id from auth.users where email = p_email;
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L',
    json_build_object('sub', v_id, 'role', 'authenticated')::text);
end;
$$;

create function pg_temp.pac(p_slug text) returns uuid language sql as $$
  select id from public.pacotes where slug = p_slug;
$$;
create function pg_temp.mat(p_sigla text) returns uuid language sql as $$
  select id from public.maternidades where sigla = p_sigla;
$$;


-- =============================================================================
-- C1. Quem cria
-- =============================================================================

select pg_temp.como('atendimento.cc@clickbaby.test');
select throws_ok(
  $$ select public.criar_caso('Ana', null, pg_temp.pac('basic'), pg_temp.mat('HSC'), '2029-06-10 10:00-03') $$,
  'P0001', 'Só a gestão, a coordenação, o comercial e o financeiro criam caso.',
  'C1: o atendimento vê o calendário e não cria caso'
);
reset role;

select pg_temp.como('fotografa.cc@clickbaby.test');
select throws_ok(
  $$ select public.criar_caso('Ana', null, pg_temp.pac('basic'), pg_temp.mat('HSC'), '2029-06-10 10:00-03') $$,
  'P0001', 'Só a gestão, a coordenação, o comercial e o financeiro criam caso.',
  'C1: a fotógrafa também não'
);
reset role;


-- =============================================================================
-- C2. O caso nasce inteiro
-- =============================================================================

select pg_temp.como('gestao.cc@clickbaby.test');
select lives_ok(
  $$ select public.criar_caso('  ana clara ', 'josé', pg_temp.pac('standard'), pg_temp.mat('HSC'), '2029-06-10 10:00-03', true) $$,
  'C2: a gestão cria'
);
reset role;

select is(
  (select mae_nome || '/' || bebe_nome from public.casos where mae_nome = 'ANA CLARA'),
  'ANA CLARA/JOSÉ',
  'C2: nomes em maiúsculas e sem espaço sobrando — como o sync vai reler do título'
);

select is(
  (select string_agg(tipo::text, ',' order by ordem, tipo) from public.caso_etapas
    where caso_id = (select id from public.casos where mae_nome = 'ANA CLARA')),
  (select string_agg(pe.etapa_tipo::text, ',' order by pe.ordem, pe.etapa_tipo)
     from public.pacote_etapas pe where pe.pacote_id = pg_temp.pac('standard')) || ',click_home',
  'C2: as etapas do STANDARD, mais o New Born pedido'
);

select is(
  (select google_pendente::text || '/' || coalesce(google_calendar_event_id, 'sem evento') || '/' || (criado_por is not null)::text
     from public.casos where mae_nome = 'ANA CLARA'),
  'true/sem evento/true',
  'C2: nasce pendente de ir ao Google, sem evento, com quem criou'
);

select is(
  (select e.tipo || '/' || p.nome from public.eventos e join public.pessoas p on p.id = e.pessoa_id
    where e.caso_id = (select id from public.casos where mae_nome = 'ANA CLARA') and e.tipo = 'caso_criado'),
  'caso_criado/Gestao CC',
  'C2: o histórico diz quem criou'
);

select ok(
  public.caso_tem_trabalho((select id from public.casos where mae_nome = 'ANA CLARA')),
  'C2: caso criado por uma pessoa conta como trabalho — o evento sumir do Google não o cancela'
);


-- =============================================================================
-- C3. A cor
-- =============================================================================

select pg_temp.como('gestao.cc@clickbaby.test');
select public.criar_caso('Birth HSC', null, pg_temp.pac('birth-reels'), pg_temp.mat('HSC'), '2029-06-11 10:00-03');
select public.criar_caso('Basic GNDI', null, pg_temp.pac('basic'), pg_temp.mat('GNDI'), '2029-06-11 11:00-03');
select public.criar_caso('Basic HNSF', null, pg_temp.pac('basic'), pg_temp.mat('HNSF'), '2029-06-11 12:00-03');
reset role;

select is(
  (select string_agg(mae_nome || '=' || coalesce(cor_calendar, 'padrao'), ',' order by mae_nome)
     from public.casos where mae_nome in ('BIRTH HSC', 'BASIC GNDI', 'BASIC HNSF')),
  'BASIC GNDI=5,BASIC HNSF=padrao,BIRTH HSC=11',
  'C3: BIRTH é tomate em qualquer maternidade; o resto segue a maternidade; sem regra, a cor padrão'
);


-- =============================================================================
-- C4. O que é recusado
-- =============================================================================

select pg_temp.como('gestao.cc@clickbaby.test');
select throws_ok(
  $$ select public.criar_caso('   ', null, pg_temp.pac('basic'), pg_temp.mat('HSC'), '2029-06-10 10:00-03') $$,
  'P0001', 'Informe o nome da mãe.', 'C4: sem nome de mãe'
);
select throws_ok(
  $$ select public.criar_caso('Ana/Maria', null, pg_temp.pac('basic'), pg_temp.mat('HSC'), '2029-06-10 10:00-03') $$,
  'P0001', 'O nome não pode ter barra (/).', 'C4: barra quebraria o título do Google'
);
select throws_ok(
  $$ select public.criar_caso('Ana', null, pg_temp.pac('basic'), pg_temp.mat('HSC'), null) $$,
  'P0001', 'Informe o dia previsto.', 'C4: sem previsão'
);
select throws_ok(
  $$ select public.criar_caso('Ana', null, null, pg_temp.mat('HSC'), '2029-06-10 10:00-03') $$,
  'P0001', 'Escolha um pacote e uma maternidade do cadastro.', 'C4: sem pacote não há checklist — não vira rascunho por aqui'
);
reset role;


-- =============================================================================
-- G1. O lado do sync
-- =============================================================================

-- O id vai para uma tabela temporária ANTES de virar service_role: localmente
-- ele não tem SELECT em `casos` (dívida #5), e é justamente por isso que o sync
-- lê os pendentes por função, e não pela tabela.
create temp table ana_clara as select id from public.casos where mae_nome = 'ANA CLARA';
grant select on ana_clara to service_role;

select pg_temp.como('gestao.cc@clickbaby.test');
select throws_ok(
  $$ select * from public.sync_casos_para_o_google() $$,
  '42501', null, 'G1: a lista de pendentes não é da tela'
);
reset role;

set local role service_role;
select is(
  (select pacote_nome || ' + ' || maternidade_sigla || ' + ' || click_home::text
     from public.sync_casos_para_o_google() where mae_nome = 'ANA CLARA'),
  'STANDARD + HSC + true',
  'G1: o sync recebe os pedaços do título prontos'
);

select is(
  public.sync_vincular_evento_google((select id from ana_clara), 'cbteste1'),
  'vinculado',
  'G1: liga o evento criado'
);
select is(
  public.sync_vincular_evento_google((select id from ana_clara), 'cbteste2'),
  'sem_efeito',
  'G1: uma segunda vez não troca o evento'
);
select is(
  (select count(*)::int from public.sync_casos_para_o_google() where mae_nome = 'ANA CLARA'),
  0,
  'G1: e sai da lista'
);
reset role;

select is(
  (select google_pendente::text || '/' || google_calendar_event_id from public.casos where mae_nome = 'ANA CLARA'),
  'false/cbteste1',
  'G1: ligado, deixa de ser pendente'
);


-- =============================================================================
-- G2. O cinza
-- =============================================================================

select throws_ok(
  $$ update public.maternidades set cor_calendar = '8' where sigla = 'ROCIO' $$,
  '23514', null,
  'G2: cinza no cadastro criaria eventos que o próprio sync cancelaria'
);

select * from finish();
rollback;
