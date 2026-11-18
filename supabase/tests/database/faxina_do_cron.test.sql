-- pgTAP: a faxina do histórico do agendador (migration 20261118120001).
begin;
select plan(3);

select is(
  (select count(*)::int from cron.job where jobname = 'faxina-historico-cron'),
  1,
  'F1: existe exatamente um job de faxina'
);
select is(
  (select schedule from cron.job where jobname = 'faxina-historico-cron'),
  '15 7 * * *',
  'F2: roda uma vez por dia, 07:15 UTC'
);
select ok(
  (select command like '%cron.job_run_details%interval ''7 days''%' and active
     from cron.job where jobname = 'faxina-historico-cron'),
  'F3: apaga o histórico com mais de 7 dias e está ligado'
);

select * from finish();
rollback;
