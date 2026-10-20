-- pgTAP: a venda para quem tem a tela Comercial (migration 20261020173657).
--
--   T1 — uma fotógrafa com a tela Comercial concedida lança a venda, a vê e
--        informa o contrato.
--   T2 — a fotógrafa SEM a tela continua sem lançar e sem ver (o caso negativo).

begin;
select plan(6);

insert into auth.users (id, email, aud, role, created_at, updated_at)
values
  (gen_random_uuid(), 'com.tela@clickbaby.test', 'authenticated', 'authenticated', now(), now()),
  (gen_random_uuid(), 'sem.tela@clickbaby.test', 'authenticated', 'authenticated', now(), now());

insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo, telas)
select v.nome, u.id, 'operador', true, v.telas::public.tela[]
from (values ('Com Tela', 'com.tela@clickbaby.test', '{quadro,comercial}'),
             ('Sem Tela', 'sem.tela@clickbaby.test', null)) as v(nome, email, telas)
join auth.users u on u.email = v.email;

insert into public.maternidades (nome, sigla) values ('Maternidade Tela', 'TELATEST');
insert into public.casos (mae_nome, pacote_id, maternidade_id)
values ('Mae Tela', (select id from public.pacotes where slug = 'standard'),
        (select id from public.maternidades where sigla = 'TELATEST'));

create function pg_temp.caso() returns uuid language sql as $$
  select id from public.casos where mae_nome = 'Mae Tela';
$$;
grant execute on function pg_temp.caso() to authenticated;

create function pg_temp.como(p_email text) returns void language plpgsql as $$
declare v_id uuid;
begin
  select id into v_id from auth.users where email = p_email;
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L', json_build_object('sub', v_id, 'role', 'authenticated')::text);
end;
$$;
create function pg_temp.sair() returns void language plpgsql as $$
begin
  execute 'reset role';
  execute 'set local request.jwt.claims = ''{}''';
end;
$$;

select pg_temp.como('com.tela@clickbaby.test');
select lives_ok(
  $$ select public.registrar_venda_do_caso(pg_temp.caso(), 'pacote', 3200) $$,
  'T1: com a tela Comercial, a fotógrafa lança o valor do pacote'
);
select is(
  (select count(*)::int from public.vendas_do_caso where caso_id = pg_temp.caso()),
  1,
  'T1: e vê a venda que lançou'
);
select lives_ok(
  $$ select public.definir_contrato_do_caso(pg_temp.caso(), 'https://contrato.test/tela') $$,
  'T1: e informa o link do contrato'
);
select pg_temp.sair();

select pg_temp.como('sem.tela@clickbaby.test');
select throws_ok(
  $$ select public.registrar_venda_do_caso(pg_temp.caso(), 'reels', 500) $$,
  'P0001', 'Quem lança o valor da venda é o atendimento, a gestão ou quem tem a tela Comercial.',
  'T2: sem a tela, a fotógrafa não lança'
);
select is(
  (select count(*)::int from public.vendas_do_caso where caso_id = pg_temp.caso()),
  0,
  'T2: e não vê a venda'
);
select is(
  (select count(*)::int from public.contratos_dos_casos where caso_id = pg_temp.caso()),
  0,
  'T2: nem o contrato'
);
select pg_temp.sair();

select * from finish();
rollback;
