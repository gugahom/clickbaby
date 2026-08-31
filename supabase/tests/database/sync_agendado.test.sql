-- =============================================================================
-- O agendamento do sync do Calendar (migration 20260828015512).
--
-- POR QUE ESTE ARQUIVO EXISTE
-- As duas funções novas são as mais perigosas do schema depois de
-- sync_upsert_caso: `disparar_sync_calendar` monta um cabeçalho Authorization
-- com a service_role key, e `configurar_segredo_do_sync` escreve no Vault. As
-- duas são SECURITY DEFINER e nenhuma valida o chamador — não podem, rodam sem
-- usuário logado. O GRANT é a única barreira, exatamente como em
-- sync_upsert_caso, que já foi encontrado aberto em produção uma vez
-- (migration 20260822041132).
--
-- NÃO se chama `disparar_sync_calendar()` aqui. Com os segredos configurados
-- ela faz uma requisição HTTP de verdade, e um teste que dispara o sync a cada
-- `supabase test db` escreveria casos como efeito colateral de rodar a suíte.
-- =============================================================================

begin;
select plan(11);


-- -----------------------------------------------------------------------------
-- O job existe e está ligado
-- -----------------------------------------------------------------------------

select is(
  (select count(*)::int from cron.job where jobname = 'sync-calendar'),
  1,
  'A0: existe exatamente um job chamado sync-calendar'
);

-- 2 minutos -> 1 minuto (migration 20260831132545, a pedido do gestor): uma
-- falha isolada do sync não fica dois minutos sem tentar de novo.
select is(
  (select schedule from cron.job where jobname = 'sync-calendar'),
  '* * * * *',
  'A1: roda a cada minuto'
);

select is(
  (select active from cron.job where jobname = 'sync-calendar'),
  true,
  'A2: o job está ativo'
);

select is(
  (select command from cron.job where jobname = 'sync-calendar'),
  'select public.disparar_sync_calendar()',
  'A3: o job chama a função de disparo, e não a Edge Function direto — a URL e a chave vêm do Vault, não do comando versionado'
);


-- -----------------------------------------------------------------------------
-- Privilégio: as duas funções são fechadas
--
-- É a mesma classe de regressão da 20260822041132: um `drop function` +
-- `create function` numa migration futura reaplica os default privileges do
-- remoto e reabre EXECUTE para anon. Estes testes falham quando isso
-- acontecer — no local eles são cegos para os defaults do remoto, mas pegam o
-- revoke esquecido.
-- -----------------------------------------------------------------------------

select ok(
  not has_function_privilege('anon', 'public.disparar_sync_calendar()', 'EXECUTE'),
  'B0: anon NÃO dispara o sync'
);

select ok(
  not has_function_privilege('authenticated', 'public.disparar_sync_calendar()', 'EXECUTE'),
  'B1: authenticated NÃO dispara o sync'
);

select ok(
  not has_function_privilege('anon', 'public.configurar_segredo_do_sync(text, text)', 'EXECUTE'),
  'B2: anon NÃO escreve no Vault'
);

select ok(
  not has_function_privilege('authenticated', 'public.configurar_segredo_do_sync(text, text)', 'EXECUTE'),
  'B3: authenticated NÃO escreve no Vault'
);

select ok(
  has_function_privilege('service_role', 'public.configurar_segredo_do_sync(text, text)', 'EXECUTE'),
  'B4: service_role escreve no Vault — é o papel do script de configuração, e sem isto ele leva 403'
);


-- -----------------------------------------------------------------------------
-- A RPC de segredo é estreita de propósito
-- -----------------------------------------------------------------------------

select throws_ok(
  $$ select public.configurar_segredo_do_sync('qualquer_outro', 'valor') $$,
  'Segredo "qualquer_outro" não faz parte do sync do Calendar.',
  'C0: recusa nome fora da lista — não é uma primitiva genérica de escrita no Vault'
);

select throws_ok(
  $$ select public.configurar_segredo_do_sync('sync_calendar_chave', '   ') $$,
  'Valor vazio para "sync_calendar_chave" — para desligar o sync, remova o job do cron.',
  'C1: recusa valor em branco — um segredo vazio faria o job falhar em silêncio a cada minuto'
);


select * from finish();
rollback;
