-- =============================================================================
-- Correção: fecha o EXECUTE de sync_upsert_caso para anon e authenticated.
--
-- Descoberto ao verificar o remoto depois do db push da migration
-- 20260821095647: `REVOKE ALL ... FROM PUBLIC` NÃO fecha o buraco sozinho
-- neste projeto. Este schema public tem ALTER DEFAULT PRIVILEGES
-- configurado (owner postgres) concedendo EXECUTE em toda função NOVA
-- automaticamente para anon, authenticated e service_role, no instante da
-- criação — antes de qualquer REVOKE/GRANT subsequente no mesmo arquivo de
-- migration rodar. Revogar de PUBLIC (o pseudo-papel "todo mundo") não
-- desfaz um GRANT explícito que já foi feito nomeadamente para anon/
-- authenticated via default privilege — são coisas diferentes.
--
-- Confirmado via pg_default_acl no remoto: existe uma entrada
-- defaclobjtype='f' (função) com ACL concedendo EXECUTE a anon,
-- authenticated e service_role. Ambiente local não reproduz isso (o
-- teste H1 de rpc_sync_upsert_caso.test.sql passou de verdade lá) — é uma
-- diferença real entre o Supabase local via Docker e o projeto hospedado.
--
-- sync_upsert_caso é a única RPC sem checagem interna de auth.uid()/pessoa
-- (por design — não tem ator humano). Isso a torna a única onde esse
-- default privilege é uma falha de acesso completa, não só um desperdício
-- de tentativa: para as outras RPCs (concluir_etapa, iniciar_etapa etc.),
-- anon/authenticated executando cai na checagem interna e falha ali —
-- aqui não existe checagem nenhuma, o GRANT É o controle de acesso.
-- =============================================================================

revoke execute on function public.sync_upsert_caso(text, text, text, uuid, uuid, timestamptz, text, boolean) from anon;
revoke execute on function public.sync_upsert_caso(text, text, text, uuid, uuid, timestamptz, text, boolean) from authenticated;
