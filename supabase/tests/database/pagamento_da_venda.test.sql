-- pgTAP: a forma de pagamento da venda e o modo Vendas do relatório externo
-- (migration 20261026140001).
--
--   P1 — a venda grava a forma e as parcelas; forma sem parcelas é à vista.
--   P2 — parcelas sem forma são recusadas, e fora de 1 a 24 também.
--   P3 — o lançamento antigo, sem forma, continua aceito.
--   V1 — no modo Vendas o período é o DIA DA VENDA: o parto de dezembro vendido
--        em novembro entra em novembro, e o vendido é só o do período.
--   V2 — o resumo soma o vendido, por forma, e a maternidade corta como sempre.
--   V3 — quem só tem a tela Relatórios não vê o valor e não abre o modo.
--
-- Os dados moram em 2029, longe dos dados fictícios e dos outros testes.

begin;
select plan(12);

insert into auth.users (id, email, aud, role, created_at, updated_at)
values
  (gen_random_uuid(), 'gestao.venda@clickbaby.test', 'authenticated', 'authenticated', now(), now()),
  (gen_random_uuid(), 'so.relatorio@clickbaby.test', 'authenticated', 'authenticated', now(), now());

insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo, telas)
select v.nome, u.id, v.papel::public.papel_sistema, true, v.telas::public.tela[]
from (values ('Gestao VENDA', 'gestao.venda@clickbaby.test', 'gestao', null),
             ('So Relatorio', 'so.relatorio@clickbaby.test', 'operador', '{quadro,relatorios}')) as v(nome, email, papel, telas)
join auth.users u on u.email = v.email;

insert into public.maternidades (nome, sigla) values ('Maternidade VENDA A', 'VENDAA'), ('Maternidade VENDA B', 'VENDAB');

-- A: parto em dezembro na A; B: parto em novembro na B.
insert into public.casos (mae_nome, pacote_id, maternidade_id, previsao_em)
select v.mae, (select id from public.pacotes where slug = 'basic'),
       (select id from public.maternidades where sigla = v.mat), v.prev::timestamptz
from (values ('Mae VENDA A', 'VENDAA', '2029-12-10 08:00-03'),
             ('Mae VENDA B', 'VENDAB', '2029-11-05 08:00-03')) as v(mae, mat, prev);

create function pg_temp.caso(p_mae text) returns uuid language sql as $$
  select id from public.casos where mae_nome = p_mae;
$$;
grant execute on function pg_temp.caso(text) to authenticated;

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

select pg_temp.como('gestao.venda@clickbaby.test');

-- P1
select lives_ok(
  $$ select public.registrar_venda_do_caso(pg_temp.caso('Mae VENDA A'), 'pacote', 4500, null, 'cartao', 10) $$,
  'P1: lança o pacote no cartão em 10x'
);
select lives_ok(
  $$ select public.registrar_venda_do_caso(pg_temp.caso('Mae VENDA A'), 'reels', 500, null, 'pix') $$,
  'P1: lança o Reels no Pix, sem dizer as parcelas'
);
select pg_temp.sair();
select is(
  (select string_agg(forma_pagamento || ':' || parcelas, ',' order by valor) from public.vendas_do_caso
   where caso_id = pg_temp.caso('Mae VENDA A')),
  'pix:1,cartao:10',
  'P1: grava a forma e as parcelas; Pix sem parcelas é à vista'
);

select pg_temp.como('gestao.venda@clickbaby.test');
-- P2
select throws_ok(
  $$ select public.registrar_venda_do_caso(pg_temp.caso('Mae VENDA B'), 'pacote', 100, null, null, 3) $$,
  'Diga a forma de pagamento das parcelas: Pix ou Cartão.',
  'P2: parcelas sem forma são recusadas'
);
select throws_ok(
  $$ select public.registrar_venda_do_caso(pg_temp.caso('Mae VENDA B'), 'pacote', 100, null, 'cartao', 30) $$,
  'As parcelas vão de 1 (à vista) a 24.',
  'P2: e parcelas fora de 1 a 24 também'
);
-- P3
select lives_ok(
  $$ select public.registrar_venda_do_caso(pg_temp.caso('Mae VENDA B'), 'pacote', 3000) $$,
  'P3: o lançamento sem forma continua aceito (a tela antiga em cache)'
);
select pg_temp.sair();

-- As vendas de A em NOVEMBRO, a de B em DEZEMBRO: o dia é o do lançamento.
update public.vendas_do_caso set created_at = '2029-11-20 10:00-03'
where caso_id = pg_temp.caso('Mae VENDA A') and item = 'pacote';
update public.vendas_do_caso set created_at = '2029-12-02 10:00-03'
where caso_id = pg_temp.caso('Mae VENDA A') and item = 'reels';
update public.vendas_do_caso set created_at = '2029-12-03 10:00-03'
where caso_id = pg_temp.caso('Mae VENDA B');

select pg_temp.como('gestao.venda@clickbaby.test');

create function pg_temp.maes(p_filtros jsonb) returns text language sql as $$
  select string_agg(right(b.mae_nome, 1) || '=' || b.vendido::int, ',' order by b.mae_nome)
  from public.operacao_buscar(p_filtros, 'antigos', 50, 0) b
  where b.mae_nome like 'Mae VENDA %';
$$;

-- V1
select is(
  pg_temp.maes('{"de":"2029-11-01","ate":"2029-11-30","vendas":true}'),
  'A=4500',
  'V1: em novembro entra o parto de DEZEMBRO vendido em novembro, só com o que se vendeu em novembro'
);
select is(
  pg_temp.maes('{"de":"2029-11-01","ate":"2029-11-30"}'),
  'B=3000',
  'V1: sem o modo, novembro é o mês do parto, e o vendido é o do caso inteiro'
);
select is(
  (select b.dia::text || ' ' || b.pagamentos from public.operacao_buscar('{"de":"2029-12-01","ate":"2029-12-31","vendas":true}'::jsonb, 'antigos', 50, 0) b
   where b.mae_nome = 'Mae VENDA A'),
  '2029-12-02 Pix',
  'V1: a data da linha é a da primeira venda do período, com as formas dela'
);

-- V2
select is(
  (select total_vendido || '/' || vendido_pix || '/' || vendido_cartao
   from public.operacao_resumo(jsonb_build_object('de', '2029-11-01', 'ate', '2029-12-31', 'vendas', true,
     'maternidades', jsonb_build_array((select id::text from public.maternidades where sigla = 'VENDAA'))))),
  '5000.00/500.00/4500.00',
  'V2: o resumo soma o vendido da maternidade marcada, separado por forma'
);
select pg_temp.sair();

-- V3
select pg_temp.como('so.relatorio@clickbaby.test');
select is(
  (select total_vendido from public.operacao_resumo('{"de":"2029-11-01","ate":"2029-12-31"}'::jsonb)),
  null,
  'V3: com só a tela Relatórios, o vendido volta vazio'
);
select throws_ok(
  $$ select * from public.operacao_resumo('{"de":"2029-11-01","ate":"2029-11-30","vendas":true}'::jsonb) $$,
  'As vendas do relatório são de quem vê o valor da venda: atendimento, gestão ou a tela Comercial.',
  'V3: e o modo Vendas é recusado'
);
select pg_temp.sair();

select * from finish();
rollback;
