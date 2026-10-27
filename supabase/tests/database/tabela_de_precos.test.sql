-- pgTAP: a tabela de preços e a venda com as duas condições (migration
-- 20261027120001).
--
--   T1 — a tabela tem os dois grupos do gestor: 6 pacotes em 7 maternidades, e
--        a Rocio e o BIRTH ficam de fora.
--   T2 — quem vê a venda lê a tabela; a fotógrafa sem a tela Comercial, não.
--   C1 — a venda grava "até 6x de 265" e o Pix, e o Pix é o valor da linha.
--   C2 — parcela sem "até quantas vezes" e parcelas sem valor são recusadas, e
--        a condição não se mistura com a forma de pagamento de 26/10.
--   C3 — o relatório mostra a condição e soma o Pix.
--
-- Os dados moram em 2029, longe dos dados fictícios e dos outros testes.

begin;
select plan(11);

-- T1 (como dono: os números do cadastro, sem RLS)
select is(
  (select count(*)::int from public.precos_dos_pacotes),
  42,
  'T1: 6 pacotes em 7 maternidades'
);
select is(
  (select pr.valor_pix || '/' || pr.parcelas || 'x' || pr.valor_parcela
   from public.precos_dos_pacotes pr
   join public.pacotes p on p.id = pr.pacote_id
   join public.maternidades m on m.id = pr.maternidade_id
   where p.slug = 'baby-reels' and m.sigla = 'HNSG'),
  '1530.00/6x271.00',
  'T1: BABY REELS nas Graças, como na tabela'
);
select is(
  (select count(*)::int from public.precos_dos_pacotes pr
   join public.pacotes p on p.id = pr.pacote_id
   join public.maternidades m on m.id = pr.maternidade_id
   where m.sigla = 'ROCIO' or p.slug like 'birth%' or p.slug = 'basic-reels-venda'),
  0,
  'T1: Rocio, os dois BIRTH e o BASIC + REELS ficam sem preço'
);

insert into auth.users (id, email, aud, role, created_at, updated_at)
values
  (gen_random_uuid(), 'gestao.preco@clickbaby.test', 'authenticated', 'authenticated', now(), now()),
  (gen_random_uuid(), 'foto.preco@clickbaby.test', 'authenticated', 'authenticated', now(), now());

insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select v.nome, u.id, v.papel::public.papel_sistema, true
from (values ('Gestao PRECO', 'gestao.preco@clickbaby.test', 'gestao'),
             ('Foto PRECO', 'foto.preco@clickbaby.test', 'operador')) as v(nome, email, papel)
join auth.users u on u.email = v.email;

insert into public.maternidades (nome, sigla) values ('Maternidade PRECO', 'PRECOT');
insert into public.casos (mae_nome, pacote_id, maternidade_id, previsao_em)
values ('Mae PRECO', (select id from public.pacotes where slug = 'baby-reels'),
        (select id from public.maternidades where sigla = 'PRECOT'), '2029-08-10 08:00-03');

create function pg_temp.caso() returns uuid language sql as $$
  select id from public.casos where mae_nome = 'Mae PRECO';
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

-- T2
select pg_temp.como('foto.preco@clickbaby.test');
select is((select count(*)::int from public.precos_dos_pacotes), 0, 'T2: a fotógrafa sem a tela Comercial não lê a tabela');
select pg_temp.sair();

select pg_temp.como('gestao.preco@clickbaby.test');
select is((select count(*)::int from public.precos_dos_pacotes), 42, 'T2: a gestão lê a tabela inteira');

-- C1
select lives_ok(
  $$ select public.registrar_venda_do_caso(pg_temp.caso(), 'pacote', 1490, null, null, 6, 265) $$,
  'C1: lança o pacote com até 6x de 265 ou 1.490 no Pix'
);

-- C2
select throws_ok(
  $$ select public.registrar_venda_do_caso(pg_temp.caso(), 'reels', 300, null, null, null, 60) $$,
  'Diga em até quantas vezes vale o valor da parcela.',
  'C2: valor da parcela sem o "até quantas vezes" é recusado'
);
select throws_ok(
  $$ select public.registrar_venda_do_caso(pg_temp.caso(), 'reels', 300, null, null, 5) $$,
  'Diga o valor de cada parcela.',
  'C2: parcelas sem o valor também'
);
select throws_ok(
  $$ select public.registrar_venda_do_caso(pg_temp.caso(), 'reels', 300, null, 'cartao', 5, 60) $$,
  'A venda leva a condição do cartão OU a forma em que foi paga, não as duas.',
  'C2: e a condição não se mistura com a forma de 26/10'
);
select pg_temp.sair();

select is(
  (select valor || '/' || parcelas || '/' || valor_parcela || '/' || coalesce(forma_pagamento::text, '-')
   from public.vendas_do_caso where caso_id = pg_temp.caso()),
  '1490.00/6/265.00/-',
  'C1: o Pix é o valor da linha, e a condição do cartão vem ao lado'
);

-- C3
update public.vendas_do_caso set created_at = '2029-08-05 10:00-03' where caso_id = pg_temp.caso();
select pg_temp.como('gestao.preco@clickbaby.test');
select is(
  (select b.vendido::text || ' · ' || b.pagamentos
   from public.operacao_buscar('{"de":"2029-08-01","ate":"2029-08-31","vendas":true}'::jsonb, 'antigos', 50, 0) b
   where b.mae_nome = 'Mae PRECO'),
  '1490.00 · Até 6x de R$ 265,00 ou Pix',
  'C3: o relatório soma o Pix e mostra a condição do cartão'
);
select pg_temp.sair();

select * from finish();
rollback;
