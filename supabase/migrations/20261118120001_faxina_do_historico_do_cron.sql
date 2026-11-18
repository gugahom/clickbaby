-- =============================================================================
-- FAXINA DO HISTÓRICO DO AGENDADOR (18/11/2026, depois da queda de 16/11)
-- =============================================================================
--
-- O pg_cron grava UMA linha em `cron.job_run_details` a cada execução de job, e
-- ninguém apaga. Com o sync a cada 25 segundos (20260909134858) são ~3.500
-- linhas por dia: em 16/11 a tabela tinha 41 MB e o índice 5 MB — 48% do banco
-- inteiro, maior que todos os dados da operação somados. Não foi o que derrubou
-- o projeto (foi memória da máquina Nano), mas é peso morto que cresce sozinho
-- e disputa cache com o que importa.
--
-- Um job diário, de madrugada (04:15 de Brasília = 07:15 UTC, depois do backup
-- das 07:00 UTC ter começado a ler), apaga o histórico com mais de 7 dias. Sete
-- dias bastam para investigar uma falha do sync; o resumo de cada execução que
-- importa já mora nos logs da Edge Function.
-- =============================================================================

do $$
begin
  perform cron.unschedule('faxina-historico-cron');
exception
  when others then null;
end;
$$;

select cron.schedule(
  'faxina-historico-cron',
  '15 7 * * *',
  $$delete from cron.job_run_details where end_time < now() - interval '7 days'$$
);
