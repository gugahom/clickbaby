-- pgTAP: privilégios mínimos no schema public (migration 20260822072158).
--
-- O QUE ESTE ARQUIVO PROVA E O QUE NÃO PROVA
-- Ele roda contra o LOCAL, então cobre bem a direção "revoguei demais": se um
-- SELECT necessário sumir, ou se os helpers das policies ficarem sem EXECUTE,
-- as asserções de leitura abaixo quebram na hora.
--
-- Ele é CEGO para a direção oposta — "o remoto tem mais privilégio do que eu
-- pedi" — sempre que os default privileges dos dois ambientes divergirem. Essa
-- metade é coberta por `npm run auditar:privilegios` (diff do dump do remoto
-- contra supabase/seguranca/privilegios-esperados.txt) e `npm run sondar:anon`.
-- A migration 20260822072158 alinha os defaults, o que reduz — mas não elimina
-- — essa cegueira: só o dump prova o estado real do remoto.
--
-- As asserções de leitura não são decorativas: são elas que teriam pegado o
-- erro de revogar EXECUTE de eh_pessoa_ativa(), que derrubaria o app inteiro.

begin;
select plan(22);


-- =============================================================================
-- 1. anon — zero em tudo
-- =============================================================================

select is(
  (select count(*)::int from information_schema.role_table_grants
   where table_schema = 'public' and grantee = 'anon'),
  0,
  'anon não tem NENHUM privilégio de tabela em public'
);

select is(
  (select count(*)::int from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'EXECUTE')),
  0,
  'anon não executa NENHUMA função de public (o revoke inclui PUBLIC, de onde anon herda)'
);


-- =============================================================================
-- 2. authenticated — tabelas, o mínimo exato
-- =============================================================================

select ok(
  has_table_privilege('authenticated', 'public.casos', 'SELECT'),
  'authenticated lê casos'
);

select ok(
  not has_table_privilege('authenticated', 'public.casos', 'INSERT')
  and not has_table_privilege('authenticated', 'public.casos', 'DELETE')
  and not has_table_privilege('authenticated', 'public.casos', 'TRUNCATE'),
  'authenticated NÃO insere, apaga nem trunca casos'
);

select ok(
  has_column_privilege('authenticated', 'public.casos', 'observacao', 'UPDATE')
  and has_column_privilege('authenticated', 'public.casos', 'situacao_clinica', 'UPDATE')
  and has_column_privilege('authenticated', 'public.casos', 'pacote_id', 'UPDATE'),
  'authenticated atualiza as colunas de dado de casos'
);

select ok(
  not has_column_privilege('authenticated', 'public.casos', 'status_operacional', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.casos', 'status_entrega', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.casos', 'motivo_cancelamento', 'UPDATE'),
  'a máquina de estado de casos segue fora do UPDATE direto (dívida da 20260821065740 preservada)'
);

-- Leitura pura: SELECT sim, escrita não.
select ok(
  has_table_privilege('authenticated', 'public.caso_etapas', 'SELECT')
  and not has_table_privilege('authenticated', 'public.caso_etapas', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.caso_etapas', 'INSERT'),
  'caso_etapas: só leitura (escrita é das RPCs)'
);

select ok(
  has_table_privilege('authenticated', 'public.handoffs', 'SELECT')
  and not has_table_privilege('authenticated', 'public.handoffs', 'INSERT'),
  'handoffs: só leitura'
);

select ok(
  has_table_privilege('authenticated', 'public.entregaveis', 'SELECT')
  and not has_table_privilege('authenticated', 'public.entregaveis', 'INSERT'),
  'entregaveis: só leitura'
);

select ok(
  has_table_privilege('authenticated', 'public.quadro_casos', 'SELECT'),
  'quadro_casos: leitura (a view é o Quadro)'
);

-- eventos: a metade da invariante 3.3 que o GRANT ALL do remoto tinha comido.
select ok(
  has_table_privilege('authenticated', 'public.eventos', 'SELECT')
  and not has_table_privilege('authenticated', 'public.eventos', 'INSERT')
  and not has_table_privilege('authenticated', 'public.eventos', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.eventos', 'DELETE')
  and not has_table_privilege('authenticated', 'public.eventos', 'TRUNCATE'),
  'eventos é append-only TAMBÉM por permissão de tabela, não só por RLS (invariante 3.3)'
);

-- Cadastros: os quatro verbos, porque a policy escrita_adm é FOR ALL.
select ok(
  has_table_privilege('authenticated', 'public.pacotes', 'SELECT')
  and has_table_privilege('authenticated', 'public.pacotes', 'INSERT')
  and has_table_privilege('authenticated', 'public.pacotes', 'UPDATE')
  and has_table_privilege('authenticated', 'public.pacotes', 'DELETE'),
  'cadastros mantêm os 4 verbos — quem limita a escrita a adm é a RLS, não o GRANT'
);

select ok(
  not has_table_privilege('authenticated', 'public.pacotes', 'TRUNCATE'),
  'TRUNCATE sai até dos cadastros — é o único verbo de escrita que policy nenhuma filtra'
);

select ok(
  not has_table_privilege('authenticated', 'public.padroes_tempo', 'SELECT'),
  'padroes_tempo segue fechada (RLS sem policy + sem grant): nada a lê ainda'
);


-- =============================================================================
-- 3. authenticated — funções
-- =============================================================================

select ok(
  has_function_privilege('authenticated', 'public.eh_pessoa_ativa()', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.eh_adm()', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.eh_atendimento()', 'EXECUTE'),
  'helpers das policies mantêm EXECUTE — sem isso TODA leitura do app quebra'
);

select ok(
  has_function_privilege('authenticated', 'public.concluir_etapa(uuid, text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.iniciar_etapa(uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.transferir_etapa(uuid, uuid, text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.confirmar_entrega(uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.cancelar_caso(uuid, text)', 'EXECUTE'),
  'as 5 RPCs de transição seguem executáveis (validam o chamador no corpo)'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.sync_upsert_caso(text, text, text, uuid, uuid, timestamptz, text, boolean)',
    'EXECUTE'),
  'sync_upsert_caso continua fechada para authenticated'
);

select ok(
  not has_function_privilege('authenticated', 'public.set_updated_at()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.gerar_caso_etapas()', 'EXECUTE'),
  'funções de trigger ficam fechadas — não precisam de EXECUTE de quem dispara'
);


-- =============================================================================
-- 4. service_role — o sync não pode quebrar
-- =============================================================================

select ok(
  has_function_privilege(
    'service_role',
    'public.sync_upsert_caso(text, text, text, uuid, uuid, timestamptz, text, boolean)',
    'EXECUTE'),
  'service_role executa sync_upsert_caso (a Edge Function do sync depende disso)'
);

select ok(
  has_table_privilege('service_role', 'public.pacotes', 'SELECT')
  and has_table_privilege('service_role', 'public.maternidades', 'SELECT'),
  'service_role lê pacotes e maternidades (o sync resolve sigla/nome -> id antes da RPC)'
);


-- =============================================================================
-- 5. Prova de ponta a ponta: o app ainda funciona
--
-- has_*_privilege() diz o que o catálogo contém; estas duas dizem se a coisa
-- REALMENTE funciona com as policies no caminho — é aqui que um revoke a mais
-- em eh_pessoa_ativa() apareceria.
-- =============================================================================

insert into auth.users (id, email, aud, role, created_at, updated_at)
values (gen_random_uuid(), 'operador.privilegios@clickbaby.test',
        'authenticated', 'authenticated', now(), now());

insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'Operador Privilegios', u.id, 'operador', true
from auth.users u where u.email = 'operador.privilegios@clickbaby.test';

insert into public.casos (id, mae_nome, pacote_id, maternidade_id, previsao_em)
values ('99999999-9999-9999-9999-999999999999', 'MAE PRIVILEGIOS',
        (select id from public.pacotes where slug = 'basic'),
        (select id from public.maternidades where sigla = 'HSC'),
        '2026-09-20 12:00:00+00');

select set_config(
  'request.jwt.claim.sub',
  (select id::text from auth.users where email = 'operador.privilegios@clickbaby.test'),
  true
);
set local role authenticated;

select ok(
  (select count(*) from public.casos
   where id = '99999999-9999-9999-9999-999999999999') = 1,
  'operador autenticado LÊ casos de verdade — a policy conseguiu chamar eh_pessoa_ativa()'
);

select ok(
  (select count(*) from public.quadro_casos
   where id = '99999999-9999-9999-9999-999999999999') = 1,
  'operador autenticado lê a view quadro_casos (security_invoker + policy da tabela base)'
);

reset role;

select * from finish();
rollback;
