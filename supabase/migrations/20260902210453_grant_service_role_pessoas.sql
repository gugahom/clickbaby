-- O `service_role` passa a poder cadastrar pessoa — e isso vira MIGRATION, não
-- um clique no painel.
--
-- POR QUE ISTO APARECE SÓ AGORA
-- A Edge Function `admin-pessoas` (02/09/2026) cria a conta de auth e a linha
-- em `pessoas` na mesma chamada. No REMOTO ela funcionaria de primeira: foi
-- assim que as onze contas das fotógrafas entraram hoje. No LOCAL ela falha com
-- `permission denied for table pessoas`.
--
-- A diferença não é bug da função — é a dívida #3 do CLAUDE.md acontecendo pela
-- terceira vez: `npm run auditar:privilegios` compara `anon` e `authenticated`
-- contra o esperado e NÃO olha `service_role`, então os dois ambientes
-- divergiram sem ninguém ver. O remoto tem mais do que o local, e a única razão
-- de isso ter passado despercebido é que quase nada usava `service_role` fora
-- do sync — que fala com o banco por RPC `SECURITY DEFINER`, não por tabela.
--
-- Esta migration não "conserta" a divergência: ela declara, versionada, o que a
-- função precisa, para que os dois ambientes concordem PELO MOTIVO CERTO. O
-- remoto já concede isso e mais; o teste pgTAP que acompanha trava o piso.
--
-- O MÍNIMO, E SÓ ELE
--   select  — a função devolve a pessoa recém-criada (`.select().single()`).
--   insert  — o cadastro em si.
-- Sem `update` e sem `delete`: a função não altera nem apaga pessoa, e conceder
-- "por via das dúvidas" é como o privilégio a mais nasce. O desfazer da função,
-- quando o insert falha, é `auth.admin.deleteUser` — GoTrue, não esta tabela.
--
-- RLS não entra na conversa: `service_role` a ignora por ser BYPASSRLS. É
-- exatamente por isso que o GRANT é a única barreira que sobra aqui, e por isso
-- ele é estreito.

grant select, insert on table public.pessoas to service_role;

comment on table public.pessoas is
  'Operadores do sistema. O papel de TRABALHO é por etapa (invariante 3.1); '
  '`papel_sistema` só governa permissão administrativa. Escrita por '
  'authenticated passa pela policy pessoas_escrita_adm; o service_role tem '
  'select+insert para a Edge Function admin-pessoas cadastrar conta e pessoa '
  'na mesma transação lógica.';
