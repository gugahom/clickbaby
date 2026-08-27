-- pgTAP: adicionar_video (migration 20260827140400).
--
-- Substitui rpc_adicionar_reels.test.sql. A função mudou de nome porque mudou
-- de significado: enquanto reels e vídeo eram a mesma coisa, `adicionar_reels`
-- criava `edicao_video` e ninguém notava a contradição. Agora `reels` está em
-- TODO pacote e não precisa ser adicionado; o que se acrescenta à mão é o
-- VÍDEO HORIZONTAL, que de fábrica só o MASTER tem.
--
-- O que precisa ser provado:
--   - acrescenta edicao_video a um pacote que não tem (o BASIC que fecha a
--     venda do horizontal na hora);
--   - é idempotente de verdade: segunda chamada devolve false, não erra, e não
--     duplica nem gera evento;
--   - não mexe nas etapas que já existiam nem no pacote do caso;
--   - recusa caso terminal;
--   - a etapa nasce com a ordem PADRÃO do tipo, não no fim da lista.

begin;
select plan(13);


-- =============================================================================
-- Fixtures
-- =============================================================================

insert into auth.users (id, email, aud, role, created_at, updated_at)
values (gen_random_uuid(), 'video.teste@clickbaby.test', 'authenticated', 'authenticated', now(), now());

insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'Operador Video', u.id, 'operador', true
from auth.users u where u.email = 'video.teste@clickbaby.test';

-- BASIC: entrada, nascimento, edicao_foto, reels. SEM o horizontal.
insert into public.casos (id, mae_nome, pacote_id, maternidade_id, previsao_em)
values (
  'cccccccc-0000-0000-0000-000000000001',
  'MAE SEM VIDEO',
  (select id from public.pacotes where slug = 'basic'),
  (select id from public.maternidades where sigla = 'HSC'),
  '2026-09-14 12:00:00+00'
);

-- MASTER: já traz edicao_video pelo pacote. Aqui a RPC tem que ser no-op.
insert into public.casos (id, mae_nome, pacote_id, maternidade_id, previsao_em)
values (
  'cccccccc-0000-0000-0000-000000000002',
  'MAE COM VIDEO',
  (select id from public.pacotes where slug = 'master'),
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
  (select array_agg(tipo order by ordem) from public.caso_etapas
    where caso_id = 'cccccccc-0000-0000-0000-000000000001'),
  array['entrada', 'nascimento', 'edicao_foto', 'reels']::public.etapa_tipo[],
  'BASIC nasce com campo (entrada, nascimento) e edição (foto, reels) — e sem o horizontal'
);

select ok(
  not exists (select 1 from public.caso_etapas
    where caso_id = 'cccccccc-0000-0000-0000-000000000001' and tipo = 'edicao_video'),
  'o BASIC realmente não tem edicao_video antes da RPC'
);


-- =============================================================================
-- 2. Acrescenta
-- =============================================================================

select pg_temp.vira('video.teste@clickbaby.test');
set local role authenticated;

select is(
  public.adicionar_video('cccccccc-0000-0000-0000-000000000001'),
  true,
  'adicionar_video devolve true quando cria a etapa'
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
  5,
  'o caso passou a ter 5 etapas — as 4 originais seguem lá'
);

select is(
  (select status from public.caso_etapas
    where caso_id = 'cccccccc-0000-0000-0000-000000000001' and tipo = 'edicao_video'),
  'pendente'::public.status_etapa,
  'a etapa nova nasce pendente, como qualquer outra'
);

-- Antes era max(ordem)+1, o que dava um número diferente conforme o pacote.
-- Agora a ordem é propriedade do TIPO: o vídeo é 7 em qualquer caso.
select is(
  (select ordem from public.caso_etapas
    where caso_id = 'cccccccc-0000-0000-0000-000000000001' and tipo = 'edicao_video'),
  public.ordem_padrao_da_etapa('edicao_video'),
  'a etapa entra com a ordem PADRÃO do tipo, igual em todo caso'
);

select is(
  (select trilha from public.caso_etapas
    where caso_id = 'cccccccc-0000-0000-0000-000000000001' and tipo = 'edicao_video'),
  'edicao',
  'e cai na trilha de edição, sem ninguém preencher — a coluna é gerada'
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
    where caso_id = 'cccccccc-0000-0000-0000-000000000001' and tipo = 'video_adicionado'),
  1,
  'gravou um evento video_adicionado'
);


-- =============================================================================
-- 3. Idempotência — o ponto que faz o botão ser seguro de clicar duas vezes
-- =============================================================================

select pg_temp.vira('video.teste@clickbaby.test');
set local role authenticated;

select is(
  public.adicionar_video('cccccccc-0000-0000-0000-000000000001'),
  false,
  'a segunda chamada devolve false em vez de erro'
);

-- MASTER já vem com o horizontal pelo pacote: mesmo no-op.
select is(
  public.adicionar_video('cccccccc-0000-0000-0000-000000000002'),
  false,
  'caso cujo pacote já traz edicao_video também é no-op'
);

reset role;


-- =============================================================================
-- 4. Caso terminal
-- =============================================================================

update public.casos
   set status_operacional = 'cancelado',
       motivo_cancelamento = 'teste'
 where id = 'cccccccc-0000-0000-0000-000000000002';

select pg_temp.vira('video.teste@clickbaby.test');
set local role authenticated;

select ok(
  pg_temp.levanta(
    'select public.adicionar_video(''cccccccc-0000-0000-0000-000000000002'')'),
  'caso cancelado recusa etapa nova'
);

reset role;


select * from finish();
rollback;
