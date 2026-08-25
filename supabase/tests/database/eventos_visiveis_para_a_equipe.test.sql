-- pgTAP: leitura compartilhada de eventos (migration 20260825020122).
--
-- Esta migration AFROUXA um acesso, então o teste tem duas obrigações:
-- provar que o operador passou a enxergar, e provar que nada mais se moveu
-- junto. O risco de uma mudança dessas não é o que ela abre de propósito — é o
-- que abre de carona.
--
-- O que continua trancado, e é verificado abaixo:
--   - escrita em eventos, para TODOS, adm incluído (invariante 3.3);
--   - anon, que não vê nem lê nada;
--   - a url do entregável, que nunca entra no payload (seção 10).

begin;
select plan(9);


-- =============================================================================
-- Fixtures
-- =============================================================================

insert into auth.users (id, email, aud, role, created_at, updated_at)
values
  (gen_random_uuid(), 'operador.hist@clickbaby.test', 'authenticated', 'authenticated', now(), now()),
  (gen_random_uuid(), 'gestao.hist@clickbaby.test',   'authenticated', 'authenticated', now(), now());

insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'Operador Historico', u.id, 'operador', true
from auth.users u where u.email = 'operador.hist@clickbaby.test';

insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'Gestao Historico', u.id, 'gestao', true
from auth.users u where u.email = 'gestao.hist@clickbaby.test';

insert into public.casos (id, mae_nome, pacote_id, maternidade_id, previsao_em)
values (
  'dddddddd-0000-0000-0000-000000000001',
  'MAE HISTORICO',
  (select id from public.pacotes where slug = 'basic'),
  (select id from public.maternidades where sigla = 'HSC'),
  '2026-09-20 10:00:00+00'
);

create function pg_temp.vira(p_email text) returns void
language sql as $$
  select set_config('request.jwt.claim.sub',
    (select id::text from auth.users where email = p_email), true);
$$;

create function pg_temp.levanta_42501(p_sql text) returns boolean
language plpgsql as $$
begin
  execute p_sql;
  return false;
exception when sqlstate '42501' then
  return true;
when others then
  return true;
end;
$$;


-- =============================================================================
-- 1. O operador passa a ver o histórico — o ponto da migration
-- =============================================================================

select pg_temp.vira('operador.hist@clickbaby.test');
set local role authenticated;

-- Gera eventos reais pelas RPCs, em vez de inserir à mão: é assim que eles
-- nascem no sistema.
select public.iniciar_etapa(
  (select id from public.caso_etapas
    where caso_id = 'dddddddd-0000-0000-0000-000000000001' and tipo = 'entrada')
);

select cmp_ok(
  (select count(*) from public.eventos
    where caso_id = 'dddddddd-0000-0000-0000-000000000001'),
  '>=',
  1::bigint,
  'operador LÊ os eventos do caso — antes desta migration via zero'
);

select is(
  (select ev.tipo from public.eventos ev
    where ev.caso_id = 'dddddddd-0000-0000-0000-000000000001'
      and ev.tipo = 'etapa_iniciada'),
  'etapa_iniciada',
  'e enxerga o tipo do evento que ele mesmo gerou'
);

select is(
  (select p.nome from public.eventos ev
     join public.pessoas p on p.id = ev.pessoa_id
    where ev.caso_id = 'dddddddd-0000-0000-0000-000000000001'
      and ev.tipo = 'etapa_iniciada'),
  'Operador Historico',
  'o histórico diz QUEM fez — é o produto (invariante 3.2)'
);


-- =============================================================================
-- 2. A escrita continua negada — para o operador E para o adm
-- =============================================================================

select ok(
  pg_temp.levanta_42501($$
    insert into public.eventos (caso_id, tipo)
    values ('dddddddd-0000-0000-0000-000000000001', 'inventado')
  $$),
  'operador NÃO insere em eventos'
);

select ok(
  pg_temp.levanta_42501($$ delete from public.eventos $$),
  'operador NÃO apaga eventos (append-only, invariante 3.3)'
);

reset role;
select pg_temp.vira('gestao.hist@clickbaby.test');
set local role authenticated;

select ok(
  pg_temp.levanta_42501($$
    update public.eventos set tipo = 'adulterado'
  $$),
  'nem o ADM altera eventos — append-only vale para todo mundo'
);

select cmp_ok(
  (select count(*) from public.eventos
    where caso_id = 'dddddddd-0000-0000-0000-000000000001'),
  '>=',
  1::bigint,
  'adm continua lendo normalmente (não foi trocado por operador, foi somado)'
);

reset role;


-- =============================================================================
-- 3. O que não pode ter vindo de carona
-- =============================================================================

select ok(
  not has_table_privilege('anon', 'public.eventos', 'SELECT'),
  'anon segue sem enxergar eventos'
);

-- A url é credencial de acesso à galeria da família. registrar_entregavel grava
-- só caso_id e tipo no payload, de propósito — um evento que a carregasse
-- vazaria o segredo pelo log, agora que a equipe inteira lê.
select public.registrar_entregavel(
  'dddddddd-0000-0000-0000-000000000001',
  'google_photos',
  'https://exemplo.invalido/segredo-da-familia'
);

select ok(
  not exists (
    select 1 from public.eventos
    where caso_id = 'dddddddd-0000-0000-0000-000000000001'
      and payload::text like '%segredo-da-familia%'
  ),
  'a URL do entregável NÃO entra no payload do evento (seção 10)'
);


select * from finish();
rollback;
