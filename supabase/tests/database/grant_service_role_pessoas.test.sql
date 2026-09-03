-- pgTAP: o piso e o teto do que o `service_role` pode fazer em `pessoas`
-- (migrations 20260902210453 e 20260903154141).
--
-- POR QUE ESTE ARQUIVO EXISTE
-- A Edge Function `admin-pessoas` cadastra e exclui pessoa — conta de auth e
-- linha do cadastro, juntas. Ela é o único uso de `service_role` contra uma
-- TABELA do schema public; o sync, o outro cliente dessa chave, fala só por RPC
-- `SECURITY DEFINER`. Sem estas asserções, revogar um dos grants quebraria o
-- cadastro em produção e nada no local acusaria.
--
-- E ele trava o teto: `update` NÃO é concedido, e essa ausência é a regra.
-- Desativar e trocar papel são update, e vão por RLS com o usuário logado
-- (`pessoas_escrita_adm`) — não pela chave que ignora RLS. Se alguém ampliar
-- "por via das dúvidas", o teste falha e a conversa acontece antes do merge.
--
-- O DELETE ENTROU DEPOIS, em 20260903154141, e a asserção que dizia o contrário
-- foi quem apontou a contradição quando a função ganhou o caminho de exclusão.
-- Isso é o teste fazendo o trabalho dele: o teto de ontem virou o piso de hoje
-- por uma migration, não por alguém alargando um grant para destravar a tela.

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
  has_table_privilege('service_role', 'public.pessoas', 'DELETE'),
  'service_role APAGA pessoas — cadastro e conta de auth caem juntos'
);

select ok(
  not has_table_privilege('service_role', 'public.pessoas', 'UPDATE'),
  'service_role NÃO altera pessoas — desativar e trocar papel são RLS, não chave'
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
