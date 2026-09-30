-- pgTAP: relatório externo — links, equipamento e as colunas dos filtros
-- (migration 20260930204404).
--
--   L1 — LINKS: os tipos marcados somam; "nenhum" acha quem não tem link.
--   L2 — a contagem de LINKS ignora o próprio grupo.
--   Q1 — EQUIPAMENTO: pelo aparelho ou cartão, sem caixa e sem espaço sobrando;
--        a contagem traz o rótulo com o tipo por extenso.
--   B1 — a busca traz os links com endereço, o equipamento e quem fez.
--   B2 — "antigos" vem do dia mais velho e, no mesmo dia, pela hora.
--
-- Os dados moram em MAIO DE 2029, longe dos fictícios e dos outros testes.

begin;
select plan(9);

insert into auth.users (id, email, aud, role, created_at, updated_at)
values (gen_random_uuid(), 'gestao.le@clickbaby.test', 'authenticated', 'authenticated', now(), now());
insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'Gestao LE', u.id, 'gestao', true from auth.users u where u.email = 'gestao.le@clickbaby.test';

insert into public.maternidades (nome, sigla) values ('Maternidade LE', 'LETESTE');

insert into public.casos (mae_nome, bebe_nome, pacote_id, maternidade_id, previsao_em)
select v.mae, null, (select id from public.pacotes where slug = 'basic'),
       (select id from public.maternidades where sigla = 'LETESTE'), v.quando::timestamptz
from (values
  ('LE Google',  '2029-05-10 15:00-03'),
  ('LE Wetrans', '2029-05-10 09:00-03'),
  ('LE Nenhum',  '2029-05-09 20:00-03')
) as v(mae, quando);

create function pg_temp.caso(p_mae text) returns uuid language sql as $$
  select id from public.casos where mae_nome = p_mae;
$$;

insert into public.entregaveis (caso_id, tipo, url)
values (pg_temp.caso('LE Google'), 'google_photos', 'https://photos.exemplo/le-google'),
       (pg_temp.caso('LE Wetrans'), 'wetransfer', 'https://we.exemplo/le-wetrans');

update public.caso_etapas
   set cartao_video = '  cel click 3 ', cartao_foto = '14 HSC',
       responsavel_id = (select id from public.pessoas where nome = 'Gestao LE')
 where caso_id = pg_temp.caso('LE Google') and tipo = 'entrada';

select set_config('request.jwt.claims',
  json_build_object('sub', (select id from auth.users where email = 'gestao.le@clickbaby.test'), 'role', 'authenticated')::text, true);
set local role authenticated;

create function pg_temp.maes(p_filtros jsonb) returns text language sql as $$
  select string_agg(mae_nome, ',' order by mae_nome) from public.operacao_buscar(
    p_filtros || jsonb_build_object('de', '2029-05-01', 'ate', '2029-05-31'))
$$;


-- =============================================================================
-- L1 / L2. Links
-- =============================================================================

select is(
  pg_temp.maes('{"links": ["google_photos", "wetransfer"]}'),
  'LE Google,LE Wetrans',
  'L1: os tipos marcados somam'
);
select is(
  pg_temp.maes('{"links": ["nenhum"]}'),
  'LE Nenhum',
  'L1: "nenhum" acha o caso sem link'
);
select is(
  (select string_agg(valor || '=' || contagem, ',' order by valor) from public.operacao_facetas(
     '{"links": ["wetransfer"], "de": "2029-05-01", "ate": "2029-05-31"}'::jsonb) where grupo = 'links'),
  'google_photos=1,nenhum=1,wetransfer=1',
  'L2: a contagem de cada tipo ignora o próprio grupo'
);


-- =============================================================================
-- Q1. Equipamento
-- =============================================================================

select is(
  pg_temp.maes('{"equipamentos": ["cel:CEL CLICK 3"]}'),
  'LE Google',
  'Q1: acha o caso pelo aparelho, com o texto digitado em minúsculas e com espaço'
);
select is(
  (select string_agg(valor || '=' || rotulo, ',' order by valor) from public.operacao_facetas(
     '{"de": "2029-05-01", "ate": "2029-05-31"}'::jsonb) where grupo = 'equipamentos'),
  'cartao:14 HSC=Cartão · 14 HSC,cel:CEL CLICK 3=Celular · CEL CLICK 3',
  'Q1: a contagem traz o tipo por extenso no rótulo'
);


-- =============================================================================
-- B1 / B2. A busca
-- =============================================================================

select is(
  (select links from public.operacao_buscar('{"de": "2029-05-01", "ate": "2029-05-31"}'::jsonb) where mae_nome = 'LE Google'),
  '[{"tipo": "google_photos", "url": "https://photos.exemplo/le-google"}]'::jsonb,
  'B1: o link vem com o tipo e o endereço, para a coluna clicável'
);
select is(
  (select equipamentos from public.operacao_buscar('{"de": "2029-05-01", "ate": "2029-05-31"}'::jsonb) where mae_nome = 'LE Google'),
  array['cartao:14 HSC', 'cel:CEL CLICK 3'],
  'B1: e o equipamento do caso'
);
select is(
  (select trabalho -> 0 ->> 'etapa' || ':' || (trabalho -> 0 ->> 'pessoa')
     from public.operacao_buscar('{"de": "2029-05-01", "ate": "2029-05-31"}'::jsonb) where mae_nome = 'LE Google'),
  'entrada:Gestao LE',
  'B1: e quem fez cada etapa'
);
select is(
  (select string_agg(mae_nome, ',' order by n) from (
     select mae_nome, row_number() over () as n
     from public.operacao_buscar('{"de": "2029-05-01", "ate": "2029-05-31"}'::jsonb, 'antigos')) x),
  'LE Nenhum,LE Wetrans,LE Google',
  'B2: dos mais antigos, e no mesmo dia pela hora'
);

reset role;
select * from finish();
rollback;
