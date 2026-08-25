-- pgTAP: RLS por papel nas tabelas da etapa 2 (item 2 da seção 13 do
-- CLAUDE.md) — pessoas, maternidades, pacotes, pacote_etapas, caso_etapas,
-- handoffs, entregaveis, escalas, eventos.
--
-- Simula os 3 papéis (operador, adm, atendimento) via SET LOCAL role +
-- request.jwt.claim.sub, sem precisar de login real.
--
-- Detalhes técnicos que não são óbvios lendo o arquivo:
--   - SET/SET LOCAL não aceita subquery direto, por isso a troca de
--     identidade usa select set_config('request.jwt.claim.sub', (select
--     ...), true) em vez de "set local ... = (select ...)".
--   - A PRIMEIRA troca de identidade resolve o auth_user_id ANTES de
--     "set local role authenticated": nesse momento ainda não existe
--     identidade nenhuma, então se a busca já rodasse como authenticated
--     ela mesma seria bloqueada pela RLS de pessoas (ovo-e-galinha). Da
--     segunda troca em diante já existe uma pessoa autenticada válida, que
--     enxerga todo mundo em pessoas (SELECT é compartilhado), então a busca
--     do próximo auth_user_id funciona normalmente.
--   - "with upd as (update ... returning id) select is((select count(*)
--     from upd), n, desc)" em vez de "select is((with upd as (...) select
--     ...), n, desc)": Postgres exige que uma CTE com comando que altera
--     dado fique no nível superior da instrução, não aninhada dentro de uma
--     chamada de função como argumento.
--   - throws_ok() tem overloads ambíguos entre (sql, errcode, description) e
--     (sql, errcode, errmsg) — na prática resolveu para a segunda e comparou
--     a descrição como se fosse a mensagem de erro esperada. Em vez disso,
--     uso uma função pg_temp (droppada com a sessão, sem sujar o schema)
--     que executa o SQL e devolve true só se o erro for 42501, testada com
--     ok() — sem ambiguidade de overload.
--
-- Tudo numa única transação, revertida no final: não deixa dado de teste no
-- banco.

begin;
select plan(29);

create function pg_temp.levanta_42501(p_sql text) returns boolean
language plpgsql
as $$
begin
  execute p_sql;
  return false;
exception when sqlstate '42501' then
  return true;
end;
$$;


-- =============================================================================
-- Fixtures (executadas com o papel privilegiado da conexão de teste, antes de
-- qualquer troca de identidade)
-- =============================================================================

insert into auth.users (id, email, aud, role, created_at, updated_at)
values
  (gen_random_uuid(), 'operador.teste.rls@clickbaby.test', 'authenticated', 'authenticated', now(), now()),
  (gen_random_uuid(), 'adm.teste.rls@clickbaby.test', 'authenticated', 'authenticated', now(), now()),
  (gen_random_uuid(), 'atendimento.teste.rls@clickbaby.test', 'authenticated', 'authenticated', now(), now());

insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'Operador Teste RLS', u.id, 'operador', true
from auth.users u where u.email = 'operador.teste.rls@clickbaby.test';

insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'Adm Teste RLS', u.id, 'gestao', true
from auth.users u where u.email = 'adm.teste.rls@clickbaby.test';

insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'Atendimento Teste RLS', u.id, 'atendimento', true
from auth.users u where u.email = 'atendimento.teste.rls@clickbaby.test';

insert into public.maternidades (nome, sigla)
values ('Maternidade Teste RLS', 'RLSTEST');

insert into public.pacotes (nome, slug)
values ('Pacote RLS Test', 'pacote-rls-test');

insert into public.pacote_etapas (pacote_id, etapa_tipo, ordem)
select id, 'entrada', 1 from public.pacotes where slug = 'pacote-rls-test';

-- pacote com 1 etapa: a trigger gerar_caso_etapas cria 1 caso_etapas e 1
-- evento etapas_geradas ao inserir o caso abaixo.
insert into public.casos (mae_nome, pacote_id, maternidade_id)
select 'Mãe RLS Suite',
       (select id from public.pacotes where slug = 'pacote-rls-test'),
       (select id from public.maternidades where sigla = 'RLSTEST');

insert into public.handoffs (caso_etapa_id, para_pessoa_id, motivo)
select ce.id, p.id, 'Fixture RLS suite'
from public.caso_etapas ce
join public.casos c on c.id = ce.caso_id
cross join (select id from public.pessoas where nome = 'Operador Teste RLS') p
where c.mae_nome = 'Mãe RLS Suite';

insert into public.entregaveis (caso_id, tipo, url)
select c.id, 'google_photos', 'https://fixture.example/rls-suite'
from public.casos c
where c.mae_nome = 'Mãe RLS Suite';

insert into public.escalas (pessoa_id, data, turno, inicio, fim)
select p.id, current_date, 'diurno', now(), now() + interval '8 hours'
from public.pessoas p
where p.nome = 'Operador Teste RLS';


-- =============================================================================
-- A. pessoas (cadastro — SELECT geral, escrita só adm)
-- =============================================================================

-- Bootstrap: resolve o primeiro auth_user_id ANTES de virar authenticated.
select set_config('request.jwt.claim.sub', (select auth_user_id::text from public.pessoas where nome = 'Operador Teste RLS'), true);
set local role authenticated;

select is(
  (select count(*)::int from public.pessoas where nome = 'Adm Teste RLS'),
  1,
  'A1: operador consegue ler cadastro de pessoas'
);

select ok(
  pg_temp.levanta_42501($$ insert into public.pessoas (nome, papel_sistema) values ('Pessoa Nao Deveria Existir', 'operador') $$),
  'A2: operador não consegue inserir pessoa diretamente'
);

with upd as (
  update public.pessoas set nome = 'Nome Hackeado' where nome = 'Adm Teste RLS'
  returning id
)
select is(
  (select count(*)::int from upd),
  0,
  'A3: operador não consegue atualizar pessoas diretamente'
);

select set_config('request.jwt.claim.sub', (select auth_user_id::text from public.pessoas where nome = 'Adm Teste RLS'), true);

with ins as (
  insert into public.pessoas (nome, papel_sistema)
  values ('Pessoa Inserida Por Adm', 'operador')
  returning id
)
select is(
  (select count(*)::int from ins),
  1,
  'A4: adm consegue inserir pessoa diretamente'
);

with upd as (
  update public.pessoas set nome = 'Operador Teste RLS (renomeado por adm)'
  where nome = 'Operador Teste RLS'
  returning id
)
select is(
  (select count(*)::int from upd),
  1,
  'A5: adm consegue atualizar pessoas diretamente'
);


-- =============================================================================
-- B. maternidades (cadastro)
-- =============================================================================

select set_config('request.jwt.claim.sub', (select auth_user_id::text from public.pessoas where nome ilike 'Operador Teste RLS%'), true);

select is(
  (select count(*)::int from public.maternidades where sigla = 'RLSTEST'),
  1,
  'B1: operador consegue ler cadastro de maternidades'
);

select ok(
  pg_temp.levanta_42501($$ insert into public.maternidades (nome, sigla) values ('Nao Deveria Existir', 'NAOEXISTE') $$),
  'B2: operador não consegue inserir maternidade diretamente'
);

select set_config('request.jwt.claim.sub', (select auth_user_id::text from public.pessoas where nome ilike 'Adm Teste RLS%'), true);

with ins as (
  insert into public.maternidades (nome, sigla)
  values ('Maternidade Inserida Por Adm', 'RLSADM')
  returning id
)
select is(
  (select count(*)::int from ins),
  1,
  'B3: adm consegue inserir maternidade diretamente'
);


-- =============================================================================
-- C. pacotes (cadastro)
-- =============================================================================

select set_config('request.jwt.claim.sub', (select auth_user_id::text from public.pessoas where nome = 'Atendimento Teste RLS'), true);

select is(
  (select count(*)::int from public.pacotes where slug = 'pacote-rls-test'),
  1,
  'C1: atendimento consegue ler cadastro de pacotes'
);

select set_config('request.jwt.claim.sub', (select auth_user_id::text from public.pessoas where nome ilike 'Operador Teste RLS%'), true);

with upd as (
  update public.pacotes set nome = 'Pacote Hackeado' where slug = 'pacote-rls-test'
  returning id
)
select is(
  (select count(*)::int from upd),
  0,
  'C2: operador não consegue atualizar pacotes diretamente'
);

select set_config('request.jwt.claim.sub', (select auth_user_id::text from public.pessoas where nome ilike 'Adm Teste RLS%'), true);

with upd as (
  update public.pacotes set nome = 'Pacote RLS Test (atualizado por adm)' where slug = 'pacote-rls-test'
  returning id
)
select is(
  (select count(*)::int from upd),
  1,
  'C3: adm consegue atualizar pacotes diretamente'
);


-- =============================================================================
-- D. pacote_etapas (cadastro)
-- =============================================================================

select set_config('request.jwt.claim.sub', (select auth_user_id::text from public.pessoas where nome ilike 'Operador Teste RLS%'), true);

select is(
  (select count(*)::int from public.pacote_etapas pe join public.pacotes p on p.id = pe.pacote_id where p.slug = 'pacote-rls-test'),
  1,
  'D1: operador consegue ler pacote_etapas'
);

select ok(
  pg_temp.levanta_42501($$ insert into public.pacote_etapas (pacote_id, etapa_tipo, ordem)
     select id, 'nascimento', 2 from public.pacotes where slug = 'pacote-rls-test' $$),
  'D2: operador não consegue inserir pacote_etapas diretamente'
);

select set_config('request.jwt.claim.sub', (select auth_user_id::text from public.pessoas where nome ilike 'Adm Teste RLS%'), true);

with ins as (
  insert into public.pacote_etapas (pacote_id, etapa_tipo, ordem)
  select id, 'nascimento', 2 from public.pacotes where slug = 'pacote-rls-test'
  returning id
)
select is(
  (select count(*)::int from ins),
  1,
  'D3: adm consegue inserir pacote_etapas diretamente'
);


-- =============================================================================
-- E. caso_etapas (operacional — completar escrita: continua 100% negada,
-- inclusive para adm, diferente de casos)
-- =============================================================================

select set_config('request.jwt.claim.sub', (select auth_user_id::text from public.pessoas where nome = 'Atendimento Teste RLS'), true);

select is(
  (select count(*)::int from public.caso_etapas ce join public.casos c on c.id = ce.caso_id where c.mae_nome = 'Mãe RLS Suite'),
  1,
  'E1: atendimento consegue ler caso_etapas'
);

select set_config('request.jwt.claim.sub', (select auth_user_id::text from public.pessoas where nome ilike 'Operador Teste RLS%'), true);

-- Sem GRANT de UPDATE em caso_etapas (só SELECT, desde a etapa 1): a
-- tentativa falha por permissão antes mesmo da RLS ser avaliada — não é o
-- caso de "0 linhas afetadas" silencioso dos cadastros. Por isso o helper de
-- exceção, não o padrão CTE-contagem usado em A3/C2.
select ok(
  pg_temp.levanta_42501($$ update public.caso_etapas set status = 'em_andamento'
     where caso_id = (select id from public.casos where mae_nome = 'Mãe RLS Suite') $$),
  'E2: operador não consegue atualizar caso_etapas diretamente'
);

select set_config('request.jwt.claim.sub', (select auth_user_id::text from public.pessoas where nome ilike 'Adm Teste RLS%'), true);

select ok(
  pg_temp.levanta_42501($$ update public.caso_etapas set status = 'em_andamento'
     where caso_id = (select id from public.casos where mae_nome = 'Mãe RLS Suite') $$),
  'E3: adm também não consegue atualizar caso_etapas diretamente (sem exceção administrativa aqui)'
);

select ok(
  pg_temp.levanta_42501($$ insert into public.caso_etapas (caso_id, tipo) values ('00000000-0000-0000-0000-000000000000'::uuid, 'entrada') $$),
  'E4: adm não consegue inserir caso_etapas diretamente (sem RPC)'
);


-- =============================================================================
-- F. handoffs (operacional)
-- =============================================================================

select set_config('request.jwt.claim.sub', (select auth_user_id::text from public.pessoas where nome = 'Atendimento Teste RLS'), true);

select is(
  (select count(*)::int from public.handoffs where motivo = 'Fixture RLS suite'),
  1,
  'F1: atendimento consegue ler handoffs'
);

select set_config('request.jwt.claim.sub', (select auth_user_id::text from public.pessoas where nome ilike 'Adm Teste RLS%'), true);

select ok(
  pg_temp.levanta_42501($$ insert into public.handoffs (caso_etapa_id, para_pessoa_id)
     values ('00000000-0000-0000-0000-000000000000'::uuid, '00000000-0000-0000-0000-000000000000'::uuid) $$),
  'F2: adm não consegue inserir handoff diretamente (sem RPC)'
);


-- =============================================================================
-- G. entregaveis (operacional)
-- =============================================================================

select set_config('request.jwt.claim.sub', (select auth_user_id::text from public.pessoas where nome ilike 'Operador Teste RLS%'), true);

select is(
  (select count(*)::int from public.entregaveis where url = 'https://fixture.example/rls-suite'),
  1,
  'G1: operador consegue ler entregaveis'
);

select set_config('request.jwt.claim.sub', (select auth_user_id::text from public.pessoas where nome ilike 'Adm Teste RLS%'), true);

select ok(
  pg_temp.levanta_42501($$ update public.entregaveis set url = 'https://hack.example' where url = 'https://fixture.example/rls-suite' $$),
  'G2: adm não consegue atualizar entregaveis diretamente (sem RPC)'
);


-- =============================================================================
-- H. escalas (cadastro — a escala 12/36 é definida pela gestão, dado
-- administrativo, não transição de estado; mesmo padrão de
-- pessoas/maternidades/pacotes/pacote_etapas)
-- =============================================================================

select set_config('request.jwt.claim.sub', (select auth_user_id::text from public.pessoas where nome ilike 'Operador Teste RLS%'), true);

select is(
  (select count(*)::int from public.escalas s join public.pessoas p on p.id = s.pessoa_id where p.nome ilike 'Operador Teste RLS%'),
  1,
  'H1: operador consegue ler escalas'
);

select ok(
  pg_temp.levanta_42501($$ insert into public.escalas (pessoa_id, data, turno, inicio, fim)
     values ('00000000-0000-0000-0000-000000000000'::uuid, current_date, 'diurno', now(), now() + interval '8 hours') $$),
  'H2: operador não consegue inserir escala diretamente'
);

select set_config('request.jwt.claim.sub', (select auth_user_id::text from public.pessoas where nome ilike 'Adm Teste RLS%'), true);

with ins as (
  insert into public.escalas (pessoa_id, data, turno, inicio, fim)
  select id, current_date + 1, 'noturno', now() + interval '1 day', now() + interval '1 day 8 hours'
  from public.pessoas where nome ilike 'Operador Teste RLS%'
  returning id
)
select is(
  (select count(*)::int from ins),
  1,
  'H3: adm consegue inserir escala diretamente'
);


-- =============================================================================
-- I. eventos (SELECT só adm; escrita de ninguém)
-- =============================================================================

select set_config('request.jwt.claim.sub', (select auth_user_id::text from public.pessoas where nome ilike 'Adm Teste RLS%'), true);

select is(
  (select count(*)::int from public.eventos e join public.casos c on c.id = e.caso_id where c.mae_nome = 'Mãe RLS Suite' and e.tipo = 'etapas_geradas'),
  1,
  'I1: adm consegue ler eventos'
);

select ok(
  pg_temp.levanta_42501($$ insert into public.eventos (tipo, payload) values ('teste_indevido', '{}'::jsonb) $$),
  'I2: adm não consegue inserir eventos diretamente — append-only só via trigger/RPC'
);

-- I3 e I4 afirmavam o contrário até a migration 20260825020122, que abriu a
-- LEITURA de eventos para qualquer pessoa ativa. O histórico de quem fez o quê
-- é o produto (invariante 3.2) e a visibilidade compartilhada é valor declarado
-- da seção 9 — um log que a gestão lê sobre a equipe e a equipe não é
-- exatamente o clima que aquela seção evita.
--
-- A ESCRITA continua negada para todos, inclusive adm: ver I1 e I2 acima.
select set_config('request.jwt.claim.sub', (select auth_user_id::text from public.pessoas where nome ilike 'Operador Teste RLS%'), true);

select is(
  (select count(*)::int from public.eventos e join public.casos c on c.id = e.caso_id where c.mae_nome = 'Mãe RLS Suite' and e.tipo = 'etapas_geradas'),
  1,
  'I3: operador LÊ eventos (leitura compartilhada desde 20260825020122)'
);

select set_config('request.jwt.claim.sub', (select auth_user_id::text from public.pessoas where nome = 'Atendimento Teste RLS'), true);

select is(
  (select count(*)::int from public.eventos e join public.casos c on c.id = e.caso_id where c.mae_nome = 'Mãe RLS Suite' and e.tipo = 'etapas_geradas'),
  1,
  'I4: atendimento também LÊ eventos'
);

select * from finish();
rollback;
