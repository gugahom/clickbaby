-- pgTAP: adicionar_reels (migration 20260824164426).
--
-- O que precisa ser provado:
--   - acrescenta edicao_video a um pacote que não tem (o caso do BASIC que
--     ganha reels na hora da venda);
--   - é idempotente de verdade: segunda chamada devolve false, não erra, e não
--     duplica nem gera evento;
--   - não mexe nas etapas que já existiam nem no pacote do caso;
--   - recusa caso terminal;
--   - a etapa nasce no fim do checklist.

begin;
select plan(13);


-- =============================================================================
-- Fixtures
-- =============================================================================

insert into auth.users (id, email, aud, role, created_at, updated_at)
values (gen_random_uuid(), 'reels.teste@clickbaby.test', 'authenticated', 'authenticated', now(), now());

insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'Operador Reels', u.id, 'operador', true
from auth.users u where u.email = 'reels.teste@clickbaby.test';

-- BASIC: entrada + nascimento, SEM vídeo. É o caso de uso do dono.
insert into public.casos (id, mae_nome, pacote_id, maternidade_id, previsao_em)
values (
  'cccccccc-0000-0000-0000-000000000001',
  'MAE SEM REELS',
  (select id from public.pacotes where slug = 'basic'),
  (select id from public.maternidades where sigla = 'HSC'),
  '2026-09-14 12:00:00+00'
);

-- BABY REELS: já tem edicao_video. Aqui a RPC tem que ser no-op.
insert into public.casos (id, mae_nome, pacote_id, maternidade_id, previsao_em)
values (
  'cccccccc-0000-0000-0000-000000000002',
  'MAE COM REELS',
  (select id from public.pacotes where slug = 'baby-reels'),
  (select id from public.maternidades where sigla = 'HSC'),
  '2026-09-14 14:00:00+00'
);

create function pg_temp.vira(p_email text) returns void
language sql as $$
  select set_config('request.jwt.claim.sub',
    (select id::text from auth.users where email = p_email), true);
$$;

create function pg_temp.levanta(p_sql text) returns boolean
language plpgsql as $$
begin
  execute p_sql;
  return false;
exception when others then
  return true;
end;
$$;


-- =============================================================================
-- 1. Estado inicial
-- =============================================================================

select is(
  (select count(*)::int from public.caso_etapas
    where caso_id = 'cccccccc-0000-0000-0000-000000000001'),
  2,
  'BASIC nasce com 2 etapas (entrada, nascimento) e nenhum vídeo'
);

select ok(
  not exists (select 1 from public.caso_etapas
    where caso_id = 'cccccccc-0000-0000-0000-000000000001' and tipo = 'edicao_video'),
  'o BASIC realmente não tem edicao_video antes da RPC'
);


-- =============================================================================
-- 2. Acrescenta
-- =============================================================================

select pg_temp.vira('reels.teste@clickbaby.test');
set local role authenticated;

select is(
  public.adicionar_reels('cccccccc-0000-0000-0000-000000000001'),
  true,
  'adicionar_reels devolve true quando cria a etapa'
);

reset role;

select ok(
  exists (select 1 from public.caso_etapas
    where caso_id = 'cccccccc-0000-0000-0000-000000000001' and tipo = 'edicao_video'),
  'a etapa edicao_video passou a existir no BASIC'
);

select is(
  (select count(*)::int from public.caso_etapas
    where caso_id = 'cccccccc-0000-0000-0000-000000000001'),
  3,
  'o caso passou a ter 3 etapas — as 2 originais seguem lá'
);

select is(
  (select status from public.caso_etapas
    where caso_id = 'cccccccc-0000-0000-0000-000000000001' and tipo = 'edicao_video'),
  'pendente'::public.status_etapa,
  'a etapa nova nasce pendente, como qualquer outra'
);

select is(
  (select ordem from public.caso_etapas
    where caso_id = 'cccccccc-0000-0000-0000-000000000001' and tipo = 'edicao_video'),
  3,
  'a etapa entra no FIM do checklist (ordem 3, depois de entrada e nascimento)'
);

-- O pacote é o que foi vendido: acrescentar etapa não é trocar produto.
select is(
  (select p.slug from public.casos c join public.pacotes p on p.id = c.pacote_id
    where c.id = 'cccccccc-0000-0000-0000-000000000001'),
  'basic',
  'o pacote do caso NÃO muda — acrescentar etapa não é trocar de produto'
);

select is(
  (select count(*)::int from public.eventos
    where caso_id = 'cccccccc-0000-0000-0000-000000000001' and tipo = 'reels_adicionado'),
  1,
  'gravou um evento reels_adicionado'
);


-- =============================================================================
-- 3. Idempotência — o ponto que faz o botão ser seguro de clicar duas vezes
-- =============================================================================

select pg_temp.vira('reels.teste@clickbaby.test');
set local role authenticated;

select is(
  public.adicionar_reels('cccccccc-0000-0000-0000-000000000001'),
  false,
  'a segunda chamada devolve false em vez de erro'
);

-- Caso que já vinha com vídeo pelo pacote: mesmo no-op.
select is(
  public.adicionar_reels('cccccccc-0000-0000-0000-000000000002'),
  false,
  'caso cujo pacote já traz edicao_video também é no-op'
);

reset role;

select is(
  (select count(*)::int from public.eventos
    where caso_id = 'cccccccc-0000-0000-0000-000000000001' and tipo = 'reels_adicionado'),
  1,
  'sem mudança real, sem evento novo — segue 1'
);


-- =============================================================================
-- 4. Caso terminal
-- =============================================================================

update public.casos
   set status_operacional = 'cancelado',
       motivo_cancelamento = 'teste'
 where id = 'cccccccc-0000-0000-0000-000000000002';

select pg_temp.vira('reels.teste@clickbaby.test');
set local role authenticated;

select ok(
  pg_temp.levanta(
    'select public.adicionar_reels(''cccccccc-0000-0000-0000-000000000002'')'),
  'caso cancelado recusa etapa nova'
);

reset role;


select * from finish();
rollback;
