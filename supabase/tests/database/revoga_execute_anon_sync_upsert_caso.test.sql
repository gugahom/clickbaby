-- pgTAP: EXECUTE de sync_upsert_caso fechado para anon e authenticated
-- (migration 20260822041132).
--
-- LEIA ISTO ANTES DE CONFIAR NESTE ARQUIVO
-- Este teste roda contra o banco LOCAL, e o local NÃO tem os default
-- privileges do Supabase Cloud (auto_expose_new_tables desligado). Lá o
-- default de FUNCTIONS é só `postgres`, então a função já nasce fechada e
-- estas asserções passam mesmo que a migration não existisse.
--
-- Ou seja: ele NÃO teria detectado a regressão que a migration 20260822041132
-- conserta — aquela só existia no remoto. Enquanto os dois bancos tiverem
-- default privileges diferentes, a prova real é o teste contra o REMOTO, que
-- vem junto com a migration de segurança completa.
--
-- O que este arquivo entrega mesmo assim:
--   1. documenta a invariante de forma executável, ao lado da migration;
--   2. vira teste de verdade no dia em que os defaults do local forem
--      alinhados aos do remoto (parte da tarefa de segurança);
--   3. pega o caso em que alguém recria a função numa migration futura E o
--      ambiente já estiver alinhado.
--
-- A comparação com as outras RPCs não é decorativa: é ela que mostra POR QUE
-- só esta função precisa do EXECUTE fechado.

begin;
select plan(5);

select ok(
  not has_function_privilege(
    'anon',
    'public.sync_upsert_caso(text, text, text, uuid, uuid, timestamptz, text, boolean)',
    'EXECUTE'
  ),
  'anon NÃO executa sync_upsert_caso (é SECURITY DEFINER e não valida o chamador)'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.sync_upsert_caso(text, text, text, uuid, uuid, timestamptz, text, boolean)',
    'EXECUTE'
  ),
  'authenticated NÃO executa sync_upsert_caso (o caminho do usuário logado são as RPCs de transição)'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.sync_upsert_caso(text, text, text, uuid, uuid, timestamptz, text, boolean)',
    'EXECUTE'
  ),
  'service_role CONTINUA executando — é a Edge Function do sync, o único chamador legítimo'
);

-- Contraste: as RPCs de transição resolvem auth.uid() -> pessoas e levantam
-- exceção se não achar, então o EXECUTE aberto para authenticated é o
-- comportamento correto delas. sync_upsert_caso é a única que não tem como
-- fazer essa checagem, e por isso é a única que depende do GRANT.
select ok(
  has_function_privilege('authenticated', 'public.concluir_etapa(uuid, text)', 'EXECUTE'),
  'concluir_etapa segue executável por authenticated (valida o chamador no corpo)'
);

select ok(
  has_function_privilege('authenticated', 'public.iniciar_etapa(uuid)', 'EXECUTE'),
  'iniciar_etapa segue executável por authenticated (valida o chamador no corpo)'
);

select * from finish();
rollback;
