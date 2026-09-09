-- =============================================================================
-- O SYNC DO CALENDAR PASSA A CADA 25 SEGUNDOS.
--
-- Era um minuto desde 31/08 (migration 20260831132545), e dois antes disso. A
-- razão de encurtar é sempre a mesma e continua valendo: a latência que a
-- equipe sente entre marcar o parto na agenda e ver o card no Quadro é, no pior
-- caso, o intervalo inteiro do cron. De 60s para 25s ela cai para menos da
-- metade — e a janela de recuperação de uma falha isolada (rede, cota do
-- Google) cai junto.
--
-- POR QUE ISTO NÃO É UM CRON NORMAL. A sintaxe de cinco campos não desce de um
-- minuto. O pg_cron aceita, desde a 1.5, um INTERVALO no lugar da expressão —
-- '25 seconds' —, e o remoto e o local rodam 1.6.4. Se um dia esta migration
-- for aplicada num Postgres com pg_cron anterior à 1.5, ela FALHA no push, que
-- é o comportamento certo: melhor recusar do que aceitar e agendar outra coisa.
--
-- O CUSTO. São 3.456 disparos por dia no lugar de 1.440. A cota da Calendar API
-- está na casa do milhão de consultas diárias, e a de invocação de Edge Function
-- na casa dos milhões por mês — nenhuma das duas chega perto. O que cresce de
-- verdade é a linha de log do cron, e ela já era ruído.
--
-- SOBRE SOBREPOSIÇÃO, que é a pergunta que este intervalo levanta. O job em si
-- nunca se atropela: `disparar_sync_calendar` usa `net.http_post` do pg_net, que
-- devolve na hora um id de requisição e não espera resposta — a função termina
-- em milissegundos, muito antes do próximo disparo.
--
-- Quem PODE se sobrepor são as execuções da Edge Function: o timeout dela é de
-- 30s, maior que os 25s do intervalo, então duas leituras da agenda podem estar
-- no ar ao mesmo tempo num dia lento. Isso é aceitável porque as duas escritas
-- que o sync faz são idempotentes por construção — `sync_upsert_caso` casa por
-- `google_calendar_event_id`, e `sync_cancelar_caso` devolve 'sem_efeito' num
-- caso que já está terminal. Duas execuções simultâneas fazem trabalho repetido,
-- não trabalho errado.
--
-- O QUE NÃO MUDA: o `refetchInterval` do Quadro, que continua em 2 minutos. Ele
-- não é o caminho pelo qual um card novo chega à tela — quem faz isso é o
-- Realtime, que escuta INSERT em `casos` e recarrega na hora em que o sync
-- escreve. O refetch é a rede de segurança para quando o canal cai, e alinhá-lo
-- a 25s multiplicaria por cinco o tráfego do Quadro inteiro (194 casos, 1.030
-- etapas) para cobrir uma falha que é rara.
-- =============================================================================

do $$
begin
  perform cron.unschedule('sync-calendar');
exception
  when others then null;
end;
$$;

select cron.schedule(
  'sync-calendar',
  '25 seconds',
  $$select public.disparar_sync_calendar()$$
);
