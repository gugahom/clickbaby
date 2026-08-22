-- =============================================================================
-- CORREÇÃO DE SEGURANÇA — fecha EXECUTE de sync_upsert_caso para anon.
--
-- O QUE ESTAVA ABERTO
-- No banco REMOTO, `anon` podia executar public.sync_upsert_caso. A função é
-- SECURITY DEFINER e, diferente das outras RPCs, NÃO checa auth.uid() — ela
-- não pode: roda como service_role dentro da Edge Function do sync, onde não
-- existe usuário logado. O GRANT era a única barreira.
--
-- Consequência, confirmada por sonda contra o remoto antes desta migration:
-- com a anon key (que vai no bundle do navegador, é pública por design)
-- qualquer pessoa podia criar casos e sobrescrever ou cancelar qualquer caso
-- cujo google_calendar_event_id conhecesse. RLS não protege: SECURITY DEFINER
-- roda como o dono.
--
-- POR QUE ISSO VOLTOU (a migration 20260821100857 já tinha fechado)
-- A 20260821102004 mudou o tipo de retorno da função, o que exige
-- `drop function` + `create function`. Objeto novo herda os DEFAULT PRIVILEGES
-- do schema — e no remoto eles são os padrão do Supabase Cloud:
--
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
--     GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
--
-- Então o CREATE re-concedeu EXECUTE a anon, desfazendo em silêncio o revoke
-- de duas migrations antes.
--
-- POR QUE NINGUÉM VIU
-- O banco LOCAL não tem esses default privileges (auto_expose_new_tables
-- desligado no config.toml): lá o default de FUNCTIONS é só `postgres`, então
-- o revoke da 20260821100857 continua valendo e `has_function_privilege('anon',
-- ..., 'EXECUTE')` é false. `supabase db reset` + `supabase test db` rodam
-- contra o local e são ESTRUTURALMENTE CEGOS para esta classe de regressão
-- enquanto os dois bancos tiverem defaults diferentes.
--
-- ESCOPO DESTA MIGRATION: só o buraco ativo, para ser revisável em 30 segundos.
-- A correção da causa raiz — revogar tudo de anon no schema, apertar
-- authenticated, e mudar os DEFAULT PRIVILEGES do remoto para o próximo objeto
-- não nascer aberto — é tarefa própria, com teste rodando contra o REMOTO.
-- Sem isso, a próxima recriação de função reabre exatamente este buraco.
--
-- EFEITO POR AMBIENTE
--   - local: no-op (o revoke da 20260821100857 nunca foi desfeito lá);
--   - remoto: efetivo.
-- Os dois convergem para o mesmo estado, igual à 20260820043748.
-- =============================================================================

-- PUBLIC entra junto por defesa: hoje já está revogado no remoto, mas anon
-- herda de PUBLIC, então deixar explícito custa uma linha e fecha o caminho
-- indireto.
revoke execute on function public.sync_upsert_caso(
  text, text, text, uuid, uuid, timestamptz, text, boolean
) from public;

revoke execute on function public.sync_upsert_caso(
  text, text, text, uuid, uuid, timestamptz, text, boolean
) from anon;

revoke execute on function public.sync_upsert_caso(
  text, text, text, uuid, uuid, timestamptz, text, boolean
) from authenticated;

comment on function public.sync_upsert_caso(
  text, text, text, uuid, uuid, timestamptz, text, boolean
) is
  'Upsert de caso por google_calendar_event_id, chamado pela Edge Function do sync (service_role) — nunca por usuário logado. Cancelamento tem prioridade; caso novo nasce rascunho pendente se pacote_id ou maternidade_id vierem null; update de caso existente nunca sobrescreve pacote_id/maternidade_id já resolvidos nem toca status_operacional. Idempotente: sem mudança real, sem UPDATE e sem evento. Retorna a ação tomada (caso_criado, rascunho_criado, caso_atualizado, caso_cancelado, sem_efeito) para a Edge Function montar o resumo do lote sem reimplementar a decisão. ATENÇÃO: é SECURITY DEFINER e NÃO valida o chamador (não pode — roda sem usuário logado). O EXECUTE precisa ficar fechado para anon e authenticated; se esta função for recriada (drop + create), os default privileges do remoto reconcedem EXECUTE a anon e o revoke precisa ser reaplicado — foi o que aconteceu entre as migrations 20260821100857 e 20260821102004.';
