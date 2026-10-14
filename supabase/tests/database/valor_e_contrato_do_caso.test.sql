-- pgTAP: o valor da venda e o contrato do caso (migration 20261014104728).
--
--   V — as vendas: atendimento e adm lançam; fotógrafa não lança nem VÊ; valor
--       zero e "outro" sem descrição recusados; apagar; o valor fora de eventos.
--   C — o contrato: link válido, trocar, igual não grava, em branco tira; a
--       fotógrafa não vê; o link fora de eventos.

begin;
select plan(17);

insert into auth.users (id, email, aud, role, created_at, updated_at)
values
  (gen_random_uuid(), 'foto.venda@clickbaby.test', 'authenticated', 'authenticated', now(), now()),
  (gen_random_uuid(), 'atend.venda@clickbaby.test', 'authenticated', 'authenticated', now(), now()),
  (gen_random_uuid(), 'comercial.venda@clickbaby.test', 'authenticated', 'authenticated', now(), now());

insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select v.nome, u.id, v.papel::public.papel_sistema, true
from (values ('Foto Venda', 'foto.venda@clickbaby.test', 'operador'),
             ('Atendimento Venda', 'atend.venda@clickbaby.test', 'atendimento'),
             ('Comercial Venda', 'comercial.venda@clickbaby.test', 'comercial')) as v(nome, email, papel)
join auth.users u on u.email = v.email;

insert into public.maternidades (nome, sigla) values ('Maternidade Venda', 'VNDTEST');
insert into public.casos (mae_nome, pacote_id, maternidade_id)
values ('Mae Venda', (select id from public.pacotes where slug = 'standard'),
        (select id from public.maternidades where sigla = 'VNDTEST'));

create function pg_temp.caso() returns uuid language sql as $$
  select id from public.casos where mae_nome = 'Mae Venda';
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


-- =============================================================================
-- V. As vendas
-- =============================================================================

select pg_temp.como('atend.venda@clickbaby.test');
select lives_ok(
  $$ select public.registrar_venda_do_caso(pg_temp.caso(), 'pacote', 4500) $$,
  'V1: o atendimento lança o valor do pacote'
);
select pg_temp.sair();

select pg_temp.como('comercial.venda@clickbaby.test');
select lives_ok(
  $$ select public.registrar_venda_do_caso(pg_temp.caso(), 'reels', 600.555) $$,
  'V2: o comercial (adm) lança uma venda a mais'
);
select throws_ok(
  $$ select public.registrar_venda_do_caso(pg_temp.caso(), 'pacote', 0) $$,
  'P0001', 'O valor da venda precisa ser maior que zero.',
  'V3: valor zero é recusado'
);
select throws_ok(
  $$ select public.registrar_venda_do_caso(pg_temp.caso(), 'outro', 100, '  ') $$,
  'P0001', 'Diga o que foi vendido em "outro".',
  'V4: "outro" sem descrição é recusado'
);
select is(
  (select sum(valor) from public.vendas_do_caso where caso_id = pg_temp.caso()),
  5100.56::numeric,
  'V5: quem é adm vê as duas linhas, e o valor guarda centavos arredondados'
);
select pg_temp.sair();

select pg_temp.como('foto.venda@clickbaby.test');
select throws_ok(
  $$ select public.registrar_venda_do_caso(pg_temp.caso(), 'pacote', 100) $$,
  'P0001', 'Quem lança o valor da venda é o atendimento ou a gestão.',
  'V6: a fotógrafa não lança venda'
);
select is(
  (select count(*)::int from public.vendas_do_caso where caso_id = pg_temp.caso()),
  0,
  'V7: a fotógrafa não VÊ as vendas — o banco esconde, não só a tela'
);
select pg_temp.sair();

select is(
  (select count(*)::int from public.eventos
    where caso_id = pg_temp.caso() and tipo = 'venda_registrada'
      and payload ? 'item' and not payload ? 'valor'),
  2,
  'V8: o evento diz o item e NÃO o valor (eventos é lido pela equipe toda)'
);

select pg_temp.como('atend.venda@clickbaby.test');
select lives_ok(
  $$ select public.remover_venda_do_caso(
       (select id from public.vendas_do_caso where caso_id = pg_temp.caso() and item = 'reels')) $$,
  'V9: o atendimento apaga uma venda'
);
select pg_temp.sair();

select results_eq(
  $$ select (select count(*)::int from public.vendas_do_caso where caso_id = pg_temp.caso()),
            (select count(*)::int from public.eventos where caso_id = pg_temp.caso() and tipo = 'venda_removida') $$,
  $$ values (1, 1) $$,
  'V10: sobrou o pacote, e a remoção ficou no histórico'
);


-- =============================================================================
-- C. O contrato
-- =============================================================================

select pg_temp.como('atend.venda@clickbaby.test');
select throws_ok(
  $$ select public.definir_contrato_do_caso(pg_temp.caso(), 'drive.google.com/contrato') $$,
  'P0001', 'O link do contrato precisa começar com http:// ou https:// e não ter espaço.',
  'C1: link sem http é recusado'
);
select lives_ok(
  $$ select public.definir_contrato_do_caso(pg_temp.caso(), ' https://exemplo.test/contrato-1 ') $$,
  'C2: o atendimento informa o contrato (espaço em volta sai)'
);
select lives_ok(
  $$ select public.definir_contrato_do_caso(pg_temp.caso(), 'https://exemplo.test/contrato-1') $$,
  'C3: o mesmo link de novo não é erro'
);
select lives_ok(
  $$ select public.definir_contrato_do_caso(pg_temp.caso(), 'https://exemplo.test/contrato-2') $$,
  'C4: trocar o link'
);
select pg_temp.sair();

select pg_temp.como('foto.venda@clickbaby.test');
select is(
  (select count(*)::int from public.contratos_dos_casos where caso_id = pg_temp.caso()),
  0,
  'C5: a fotógrafa não vê o contrato'
);
select pg_temp.sair();

select pg_temp.como('comercial.venda@clickbaby.test');
select lives_ok(
  $$ select public.definir_contrato_do_caso(pg_temp.caso(), '') $$,
  'C6: em branco tira o contrato'
);
select pg_temp.sair();

select results_eq(
  $$ select (select count(*)::int from public.contratos_dos_casos where caso_id = pg_temp.caso()),
            (select string_agg(tipo, ',' order by tipo) from public.eventos
              where caso_id = pg_temp.caso() and tipo like 'contrato_%'),
            (select count(*)::int from public.eventos
              where caso_id = pg_temp.caso() and tipo like 'contrato_%' and payload::text like '%exemplo.test%') $$,
  $$ values (0, 'contrato_definido,contrato_definido,contrato_removido'::text, 0) $$,
  'C7: três eventos (o link repetido não gravou), e nenhum com o link dentro'
);


select * from finish();
rollback;
