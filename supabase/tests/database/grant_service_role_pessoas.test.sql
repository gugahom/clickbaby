-- pgTAP: o piso e o teto do que o `service_role` pode fazer em `pessoas`
-- (migration 20260902210453).
--
-- POR QUE ESTE ARQUIVO EXISTE
-- A Edge Function `admin-pessoas` cadastra conta e pessoa juntas. Ela é o
-- primeiro uso de `service_role` contra uma TABELA do schema public — o sync,
-- até aqui o único cliente dessa chave, fala só por RPC `SECURITY DEFINER`.
-- Sem estas asserções, revogar o grant quebraria o cadastro de pessoa em
-- produção e nada no local acusaria.
--
-- E ele trava o teto também: `update` e `delete` NÃO foram concedidos. Se
-- alguém ampliar "por via das dúvidas", o teste falha e a conversa acontece
-- antes do merge — que é o oposto do que houve com a divergência que motivou
-- esta migration, descoberta por acaso três vezes.

begin;
select plan(5);

select ok(
  has_table_privilege('service_role', 'public.pessoas', 'SELECT'),
  'service_role LÊ pessoas — a função devolve a pessoa recém-criada'
);

select ok(
  has_table_privilege('service_role', 'public.pessoas', 'INSERT'),
  'service_role INSERE em pessoas — é o cadastro da Edge Function'
);

select ok(
  not has_table_privilege('service_role', 'public.pessoas', 'UPDATE'),
  'service_role NÃO altera pessoas — a função não edita ninguém'
);

select ok(
  not has_table_privilege('service_role', 'public.pessoas', 'DELETE'),
  'service_role NÃO apaga pessoas — o desfazer da função é no GoTrue'
);

-- A outra ponta: nada disso pode ter vazado para quem fala com o PostgREST sem
-- sessão. `anon` continua zerado em pessoas, como em toda tabela.
select is(
  (select count(*)::int from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'pessoas' and grantee = 'anon'),
  0,
  'anon segue sem privilégio nenhum em pessoas'
);

select * from finish();
rollback;
