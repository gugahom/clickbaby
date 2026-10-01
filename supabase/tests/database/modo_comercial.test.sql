-- pgTAP: o modo comercial do relatório externo (migrations 20261001001602 e
-- 20261001001607).
--
--   O1 — quais ofertas se aplicam a cada caso: reels só no BASIC e STANDARD;
--        New Born e Foto/Livro onde a etapa ainda não existe; BIRTH fora.
--   A1 — a tela Comercial abre o relatório externo SÓ no modo comercial, e não
--        abre o relatório interno; sem a tela, não muda fase.
--   F1 — mudar a fase grava a linha e o evento; repetir a mesma fase não grava.
--   V1 — VENDIDO no New Born cria a etapa Click Home, mesmo no caso encerrado,
--        sem reabri-lo; e a oferta continua "vendido" com a etapa já criada.
--   B1 — o filtro por fase e o corte do modo comercial na busca.
--
-- Os casos moram em JUNHO DE 2029, longe dos fictícios e dos outros testes.

begin;
select plan(16);

insert into auth.users (id, email, aud, role, created_at, updated_at)
select gen_random_uuid(), e, 'authenticated', 'authenticated', now(), now()
from unnest(array['mc.comercial@clickbaby.test', 'mc.coord@clickbaby.test']) as e;

insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select v.nome, u.id, v.papel::public.papel_sistema, true
from (values ('MC Comercial', 'mc.comercial@clickbaby.test', 'comercial'),
             ('MC Coord', 'mc.coord@clickbaby.test', 'coordenacao')) as v(nome, email, papel)
join auth.users u on u.email = v.email;

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
create function pg_temp.caso(p_mae text) returns uuid language sql as $$ select id from public.casos where mae_nome = p_mae; $$;
grant execute on function pg_temp.caso(text) to authenticated;

insert into public.casos (mae_nome, bebe_nome, pacote_id, maternidade_id, previsao_em)
select v.mae, null, pg_temp.pac(v.slug), (select id from public.maternidades where sigla = 'HSC'), v.quando::timestamptz
from (values
  ('MC Basic',    'basic',        '2029-06-10 10:00-03'),
  ('MC Album',    'master-album', '2029-06-11 10:00-03'),
  ('MC Birth',    'birth',        '2029-06-12 10:00-03'),
  ('MC Entregue', 'standard',     '2029-06-13 10:00-03')
) as v(mae, slug, quando);

-- Um caso já ENTREGUE, como a venda pós-parto costuma encontrar.
insert into public.entregaveis (caso_id, tipo, url) values (pg_temp.caso('MC Entregue'), 'google_photos', 'https://photos.exemplo/mc');
update public.casos set status_entrega = 'confirmado', status_operacional = 'encerrado' where id = pg_temp.caso('MC Entregue');

create function pg_temp.ofertas(p_mae text) returns text language sql as $$
  select coalesce(oferta_reels, '-') || '/' || coalesce(oferta_new_born, '-') || '/' || coalesce(oferta_fotolivro, '-')
  from public.operacao_dos_casos where id = pg_temp.caso(p_mae);
$$;

create function pg_temp.maes(p_filtros jsonb) returns text language sql as $$
  select string_agg(mae_nome, ',' order by mae_nome) from public.operacao_buscar(
    p_filtros || jsonb_build_object('de', '2029-06-01', 'ate', '2029-06-30'))
$$;


-- =============================================================================
-- O1. Quais ofertas se aplicam
-- =============================================================================

select is(pg_temp.ofertas('MC Basic'), 'apresentar/apresentar/apresentar', 'O1: BASIC — as três ofertas');
select is(pg_temp.ofertas('MC Album'), '-/apresentar/-', 'O1: MASTER + ÁLBUM — sem reels e sem Foto/Livro (já tem)');
select is(pg_temp.ofertas('MC Birth'), '-/-/-', 'O1: BIRTH — fora do comercial');


-- =============================================================================
-- A1. Quem entra
-- =============================================================================

select pg_temp.como('mc.comercial@clickbaby.test');
select lives_ok(
  $$ select * from public.operacao_buscar('{"comercial": true}'::jsonb) $$,
  'A1: a tela Comercial abre o relatório externo no modo comercial'
);
select throws_ok(
  $$ select * from public.operacao_buscar('{}'::jsonb) $$,
  'P0001', 'O relatório externo é de quem tem a tela Relatórios — ou a tela Comercial, no modo comercial.',
  'A1: fora do modo comercial, não'
);
select throws_ok(
  $$ select * from public.metricas_por_pessoa('2029-06-01', '2029-06-30') $$,
  'P0001', 'Os relatórios são de quem tem a tela Relatórios liberada.',
  'A1: e o relatório interno continua fechado'
);
select pg_temp.sair();

select pg_temp.como('mc.coord@clickbaby.test');
select throws_ok(
  format($$ select public.definir_oferta_comercial(%L, 'reels', 'enviado') $$, pg_temp.caso('MC Basic')),
  'P0001', 'Só quem tem a tela Comercial muda a fase das ofertas.',
  'A1: sem a tela Comercial, não muda fase'
);
select pg_temp.sair();


-- =============================================================================
-- F1 / V1. Mudar a fase
-- =============================================================================

select pg_temp.como('mc.comercial@clickbaby.test');
select is(
  public.definir_oferta_comercial(pg_temp.caso('MC Basic'), 'reels', 'enviado'), false,
  'F1: enviado não cria etapa nenhuma'
);
select is(public.definir_oferta_comercial(pg_temp.caso('MC Basic'), 'reels', 'enviado'), false, 'F1: repetir a fase não faz nada');
select throws_ok(
  format($$ select public.definir_oferta_comercial(%L, 'reels', 'enviado') $$, pg_temp.caso('MC Birth')),
  'P0001', 'Esta oferta não se aplica a este caso.',
  'F1: oferta que não se aplica é recusada'
);
select is(
  public.definir_oferta_comercial(pg_temp.caso('MC Entregue'), 'new_born', 'vendido'), true,
  'V1: vendido no New Born cria a etapa'
);
select pg_temp.sair();

select is(
  (select count(*)::int from public.eventos where caso_id = pg_temp.caso('MC Basic') and tipo = 'oferta_comercial'), 1,
  'F1: uma mudança, um evento'
);
select is(
  (select c.status_operacional::text || ':' || ce.status::text
     from public.casos c join public.caso_etapas ce on ce.caso_id = c.id and ce.tipo = 'click_home'
    where c.id = pg_temp.caso('MC Entregue')),
  'encerrado:pendente',
  'V1: a etapa nasce no caso encerrado, e o caso continua encerrado'
);
select is(pg_temp.ofertas('MC Entregue'), 'apresentar/vendido/apresentar', 'V1: com a etapa criada, a oferta continua vendida');


-- =============================================================================
-- B1. A busca no modo comercial
-- =============================================================================

select pg_temp.como('mc.comercial@clickbaby.test');
select is(pg_temp.maes('{"comercial": true}'), 'MC Album,MC Basic,MC Entregue', 'B1: o modo comercial deixa o BIRTH de fora');
select is(
  pg_temp.maes('{"comercial": true, "oferta_reels": ["enviado"]}'), 'MC Basic',
  'B1: o filtro por fase acha o reels enviado'
);
select pg_temp.sair();

select * from finish();
rollback;
