-- pgTAP: EVENTO e NEWBORN (migrations 20260930200345 e 20260930200425).
--
--   E1 — o EVENTO nasce com acompanhamento, edição de fotos e reels; o
--        acompanhamento é da trilha de campo e vem primeiro.
--   E2 — o prazo do EVENTO conta do acompanhamento (não há nascimento).
--   N1 — o NEWBORN nasce com acompanhamento e New Born, e só depois do ensaio
--        passa a viver na seção (sai do Quadro).
--   N2 — a galeria do NEWBORN entregue encerra o caso.
--   P1 — o acompanhamento tem item próprio no ranking por pontos.

begin;
select plan(10);

insert into auth.users (id, email, aud, role, created_at, updated_at)
values (gen_random_uuid(), 'gestao.en@clickbaby.test', 'authenticated', 'authenticated', now(), now());
insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'Gestao EN', u.id, 'gestao', true from auth.users u where u.email = 'gestao.en@clickbaby.test';

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
create function pg_temp.pac(p_slug text) returns uuid language sql as $$ select id from public.pacotes where slug = p_slug; $$;
create function pg_temp.mat(p_sigla text) returns uuid language sql as $$ select id from public.maternidades where sigla = p_sigla; $$;
create function pg_temp.caso(p_mae text) returns uuid language sql as $$ select id from public.casos where mae_nome = p_mae; $$;
create function pg_temp.etapa(p_mae text, p_tipo text) returns uuid language sql as $$
  select id from public.caso_etapas where caso_id = pg_temp.caso(p_mae) and tipo = p_tipo::public.etapa_tipo;
$$;

insert into public.casos (mae_nome, bebe_nome, pacote_id, maternidade_id, previsao_em)
values ('EVENTO', 'MKT TESTE', pg_temp.pac('evento'), pg_temp.mat('HSC'), '2029-10-10 09:00-03'),
       ('NB TESTE', 'LUIZA', pg_temp.pac('newborn'), pg_temp.mat('HSC'), '2029-10-11 10:00-03');


-- =============================================================================
-- E1 / E2. EVENTO
-- =============================================================================

select is(
  (select string_agg(tipo::text || ':' || trilha, ',' order by ordem) from public.caso_etapas where caso_id = pg_temp.caso('EVENTO')),
  'acompanhamento:acompanhamento,edicao_foto:edicao,reels:edicao',
  'E1: acompanhamento (campo, primeiro), edição de fotos e reels'
);

select pg_temp.como('gestao.en@clickbaby.test');
select public.concluir_etapa(pg_temp.etapa('EVENTO', 'acompanhamento'), null);
select pg_temp.sair();

select is(
  (select vence_em - n.concluido_em from public.quadro_casos q
     join public.caso_etapas n on n.caso_id = q.id and n.tipo = 'acompanhamento'
    where q.id = pg_temp.caso('EVENTO')),
  interval '48 hours',
  'E2: o prazo de 48h conta da conclusão do acompanhamento'
);
select is(
  (select nascimento_concluido_em from public.quadro_casos where id = pg_temp.caso('EVENTO')),
  null,
  'E2: e o evento não vira "nasceu" — a coluna do nascimento continua sendo só do parto'
);


-- =============================================================================
-- N1. NEWBORN
-- =============================================================================

select is(
  (select string_agg(tipo::text, ',' order by ordem) from public.caso_etapas where caso_id = pg_temp.caso('NB TESTE')),
  'acompanhamento,click_home',
  'N1: o ensaio e o New Born, e mais nada'
);
select is(
  (select na_secao from public.quadro_casos where id = pg_temp.caso('NB TESTE')),
  false,
  'N1: antes do ensaio, o caso está no Quadro'
);

select pg_temp.como('gestao.en@clickbaby.test');
select public.concluir_etapa(pg_temp.etapa('NB TESTE', 'acompanhamento'), null);
select pg_temp.sair();

select is(
  (select na_secao from public.quadro_casos where id = pg_temp.caso('NB TESTE')),
  true,
  'N1: ensaio concluído, o caso passa a viver só na seção New Born'
);
select is(
  (select na_secao from public.quadro_casos where id = pg_temp.caso('EVENTO')),
  false,
  'N1: e isso é só do NEWBORN — o EVENTO continua no Quadro com a edição aberta'
);


-- =============================================================================
-- N2. A galeria entregue encerra
-- =============================================================================

select pg_temp.como('gestao.en@clickbaby.test');
select public.enviar_click_home_para_escolha(pg_temp.etapa('NB TESTE', 'click_home'), 'https://galeria.exemplo/nb');
select lives_ok(
  $$ select public.confirmar_entrega_do_click_home(pg_temp.etapa('NB TESTE', 'click_home')) $$,
  'N2: a Morgana confirma a galeria'
);
select pg_temp.sair();

select is(
  (select status_operacional::text || '/' || status_entrega::text || '/' || (encerrado_em is not null)::text
     from public.casos where id = pg_temp.caso('NB TESTE')),
  'encerrado/confirmado/true',
  'N2: e o NEWBORN encerra junto — não sobra trabalho nenhum'
);


-- =============================================================================
-- P1. Pontos
-- =============================================================================

select is(
  public.item_de_pontuacao('acompanhamento', 1, 'evento')::text,
  'acompanhamento',
  'P1: o acompanhamento é um item do ranking (nasce sem peso)'
);

select * from finish();
rollback;
