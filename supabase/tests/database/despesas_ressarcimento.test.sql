-- pgTAP: a pessoa de cada gasto e o ressarcimento (migration 20261005060950).
--
--   P1 — a view traz de quem foi o gasto e quem lançou, que discordam quando o
--        ADM lança pela fotógrafa.
--   R1 — só a tela Despesas marca; marcar carimba quem e quando; marcar de
--        novo não grava outro evento; ninguém escreve na coluna direto.
--   R2 — gasto ressarcido não se apaga; desmarcado, apaga.
--   R3 — só refeição e "outro" se ressarcem (20261005063038): o Uber é
--        recusado pela RPC e pela constraint.

begin;
select plan(13);

insert into auth.users (id, email, aud, role, created_at, updated_at)
select gen_random_uuid(), e, 'authenticated', 'authenticated', now(), now()
from unnest(array['dr.foto@clickbaby.test', 'dr.adm@clickbaby.test', 'dr.financeiro@clickbaby.test']) as e;

insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select v.nome, u.id, v.papel::public.papel_sistema, true
from (values ('DR Foto', 'dr.foto@clickbaby.test', 'operador'),
             ('DR Adm', 'dr.adm@clickbaby.test', 'atendimento'),
             ('DR Financeiro', 'dr.financeiro@clickbaby.test', 'financeiro')) as v(nome, email, papel)
join auth.users u on u.email = v.email;

insert into public.maternidades (nome, sigla) values ('Maternidade DR', 'DRTEST');
insert into public.casos (mae_nome, pacote_id, maternidade_id, previsao_em)
select 'Mae DR', (select id from public.pacotes where slug = 'basic'),
       (select id from public.maternidades where sigla = 'DRTEST'), '2029-07-10 10:00-03';

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
create function pg_temp.caso() returns uuid language sql as $$ select id from public.casos where mae_nome = 'Mae DR'; $$;
create function pg_temp.despesa() returns uuid language sql as $$ select id from public.despesas where caso_id = pg_temp.caso() and tipo = 'refeicao'; $$;
create function pg_temp.uber() returns uuid language sql as $$ select id from public.despesas where caso_id = pg_temp.caso() and tipo = 'uber_ida'; $$;
create function pg_temp.pessoa(p_nome text) returns uuid language sql as $$ select id from public.pessoas where nome = p_nome; $$;
grant execute on function pg_temp.caso() to authenticated;
grant execute on function pg_temp.despesa() to authenticated;
grant execute on function pg_temp.uber() to authenticated;

-- O ADM lança a refeição e o Uber da fotógrafa.
select pg_temp.como('dr.adm@clickbaby.test');
select public.registrar_despesa(pg_temp.caso(), 'refeicao', 35.00, pg_temp.pessoa('DR Foto'));
select public.registrar_despesa(pg_temp.caso(), 'uber_ida', 22.50, pg_temp.pessoa('DR Foto'));
select pg_temp.sair();


-- =============================================================================
-- P1. A pessoa de cada gasto
-- =============================================================================

select is(
  (select pessoa_nome || ' / ' || registrado_por_nome from public.despesas_detalhe where id = pg_temp.despesa()),
  'DR Foto / DR Adm',
  'P1: a view traz de quem foi o gasto e quem lançou'
);


-- =============================================================================
-- R1. Marcar o ressarcimento
-- =============================================================================

select pg_temp.como('dr.foto@clickbaby.test');
select throws_ok(
  $$ select public.marcar_despesa_ressarcida(pg_temp.despesa(), true) $$,
  'P0001', 'Só quem tem a tela Despesas marca o ressarcimento.',
  'R1: sem a tela Despesas, não marca'
);
select throws_ok(
  $$ update public.despesas set ressarcido_em = now() where id = pg_temp.despesa() $$,
  '42501', null,
  'R1: e ninguém escreve na coluna direto'
);
select pg_temp.sair();

select pg_temp.como('dr.financeiro@clickbaby.test');
select lives_ok($$ select public.marcar_despesa_ressarcida(pg_temp.despesa(), true) $$, 'R1: o financeiro marca');
select lives_ok($$ select public.marcar_despesa_ressarcida(pg_temp.despesa(), true) $$, 'R1: marcar de novo não erra');
select pg_temp.sair();

select is(
  (select (ressarcido_em is not null)::text || ' / ' || ressarcido_por_nome from public.despesas_detalhe where id = pg_temp.despesa()),
  'true / DR Financeiro',
  'R1: carimba quando e quem'
);
select is(
  (select count(*)::int from public.eventos where caso_id = pg_temp.caso() and tipo = 'despesa_ressarcida'),
  1,
  'R1: dois cliques, um evento'
);


-- =============================================================================
-- R2. Ressarcida não se apaga
-- =============================================================================

select pg_temp.como('dr.foto@clickbaby.test');
select throws_ok(
  $$ select public.remover_despesa(pg_temp.despesa(), 'lancei errado') $$,
  'P0001', 'Esta despesa já foi ressarcida. Peça ao financeiro para desmarcar o ressarcimento antes de apagar.',
  'R2: gasto ressarcido não se apaga'
);
select pg_temp.sair();

select pg_temp.como('dr.financeiro@clickbaby.test');
select public.marcar_despesa_ressarcida(pg_temp.despesa(), false);
select pg_temp.sair();

select is(
  (select count(*)::int from public.eventos where caso_id = pg_temp.caso() and tipo = 'ressarcimento_desfeito'),
  1,
  'R2: desmarcar também fica no histórico'
);

select pg_temp.como('dr.foto@clickbaby.test');
select lives_ok($$ select public.remover_despesa(pg_temp.despesa(), 'lancei errado') $$, 'R2: desmarcado, apaga');
select pg_temp.sair();


-- =============================================================================
-- R3. Só refeição e "outro" se ressarcem
-- =============================================================================

select pg_temp.como('dr.financeiro@clickbaby.test');
select throws_ok(
  $$ select public.marcar_despesa_ressarcida(pg_temp.uber(), true) $$,
  'P0001', 'Só refeição e "outro" se ressarcem. O Uber não passa por ressarcimento.',
  'R3: o Uber não se marca'
);
select lives_ok($$ select public.marcar_despesa_ressarcida(pg_temp.uber(), false) $$, 'R3: desmarcar um Uber não erra');
select pg_temp.sair();

select throws_ok(
  $$ update public.despesas
       set ressarcido_em = now(), ressarcido_por = (select id from public.pessoas where nome = 'DR Financeiro')
     where id = pg_temp.uber() $$,
  '23514', null,
  'R3: nem por baixo da RPC — a constraint recusa'
);

select * from finish();
rollback;
