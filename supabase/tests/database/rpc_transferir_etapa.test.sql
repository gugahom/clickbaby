-- pgTAP: RPC transferir_etapa — o handoff (item 3 da seção 13, invariante
-- 3.2 do CLAUDE.md). Usa o pacote 'basic' do seed real (entrada, nascimento).

begin;
select plan(8);

create function pg_temp.levanta_erro(p_sql text) returns boolean
language plpgsql
as $$
begin
  execute p_sql;
  return false;
exception when others then
  return true;
end;
$$;


-- =============================================================================
-- Fixtures: A, B, C fazem a cadeia de handoff; D é a coordenação que executa
-- as transferências sem nunca ser dona da etapa — prova que
-- eventos.pessoa_id (quem executou) e handoffs.de/para_pessoa_id (entre quem
-- a etapa passou) são campos distintos.
-- =============================================================================

insert into auth.users (id, email, aud, role, created_at, updated_at)
values
  (gen_random_uuid(), 'a.teste.handoff@clickbaby.test', 'authenticated', 'authenticated', now(), now()),
  (gen_random_uuid(), 'b.teste.handoff@clickbaby.test', 'authenticated', 'authenticated', now(), now()),
  (gen_random_uuid(), 'c.teste.handoff@clickbaby.test', 'authenticated', 'authenticated', now(), now()),
  (gen_random_uuid(), 'd.coordenacao.teste.handoff@clickbaby.test', 'authenticated', 'authenticated', now(), now());

insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'A Teste Handoff', u.id, 'operador', true from auth.users u where u.email = 'a.teste.handoff@clickbaby.test';
insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'B Teste Handoff', u.id, 'operador', true from auth.users u where u.email = 'b.teste.handoff@clickbaby.test';
insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'C Teste Handoff', u.id, 'operador', true from auth.users u where u.email = 'c.teste.handoff@clickbaby.test';
insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'D Coordenacao Teste Handoff', u.id, 'coordenacao', true from auth.users u where u.email = 'd.coordenacao.teste.handoff@clickbaby.test';

insert into public.maternidades (nome, sigla)
values ('Maternidade Handoff Test', 'HANDOFF');

-- Caso 1: usado na cadeia A->B->C (etapa entrada) e no erro "sem
-- responsável" (etapa nascimento, nunca tocada).
insert into public.casos (mae_nome, pacote_id, maternidade_id)
select 'Mãe Handoff Cadeia',
       (select id from public.pacotes where slug = 'basic'),
       (select id from public.maternidades where sigla = 'HANDOFF');

-- Caso 2: usado só para o erro "etapa concluida".
insert into public.casos (mae_nome, pacote_id, maternidade_id)
select 'Mãe Handoff Concluida',
       (select id from public.pacotes where slug = 'basic'),
       (select id from public.maternidades where sigla = 'HANDOFF');

-- A inicia a etapa "entrada" do caso 1 -> responsavel_id = A (fallback do
-- iniciar_etapa), sem precisar de uma RPC de atribuição que ainda não existe.
select set_config('request.jwt.claim.sub', (select auth_user_id::text from public.pessoas where nome = 'A Teste Handoff'), true);
set local role authenticated;
select public.iniciar_etapa(
  (select ce.id from public.caso_etapas ce join public.casos c on c.id = ce.caso_id where c.mae_nome = 'Mãe Handoff Cadeia' and ce.tipo = 'entrada')
);

-- A também inicia e conclui a etapa "entrada" do caso 2, para chegar num
-- estado concluida com responsável definido.
select public.iniciar_etapa(
  (select ce.id from public.caso_etapas ce join public.casos c on c.id = ce.caso_id where c.mae_nome = 'Mãe Handoff Concluida' and ce.tipo = 'entrada')
);
select public.concluir_etapa(
  (select ce.id from public.caso_etapas ce join public.casos c on c.id = ce.caso_id where c.mae_nome = 'Mãe Handoff Concluida' and ce.tipo = 'entrada')
);


-- =============================================================================
-- A. D (coordenação) transfere a etapa "entrada" do caso 1: A -> B
-- =============================================================================

select set_config('request.jwt.claim.sub', (select auth_user_id::text from public.pessoas where nome = 'D Coordenacao Teste Handoff'), true);

select public.transferir_etapa(
  (select ce.id from public.caso_etapas ce join public.casos c on c.id = ce.caso_id where c.mae_nome = 'Mãe Handoff Cadeia' and ce.tipo = 'entrada'),
  (select id from public.pessoas where nome = 'B Teste Handoff'),
  'Troca de turno'
);

reset role;

select is(
  (select responsavel_id from public.caso_etapas ce join public.casos c on c.id = ce.caso_id where c.mae_nome = 'Mãe Handoff Cadeia' and ce.tipo = 'entrada'),
  (select id from public.pessoas where nome = 'B Teste Handoff'),
  'A1: responsavel_id vira B depois da transferência'
);

select is(
  (
    select h.de_pessoa_id::text || '>' || h.para_pessoa_id::text
    from public.handoffs h
    join public.caso_etapas ce on ce.id = h.caso_etapa_id
    join public.casos c on c.id = ce.caso_id
    where c.mae_nome = 'Mãe Handoff Cadeia' and ce.tipo = 'entrada'
  ),
  (select id from public.pessoas where nome = 'A Teste Handoff') || '>' || (select id from public.pessoas where nome = 'B Teste Handoff'),
  'A2: handoffs ganha exatamente 1 linha A -> B'
);

select is(
  (
    select e.pessoa_id
    from public.eventos e
    join public.casos c on c.id = e.caso_id
    where c.mae_nome = 'Mãe Handoff Cadeia' and e.tipo = 'etapa_transferida'
  ),
  (select id from public.pessoas where nome = 'D Coordenacao Teste Handoff'),
  'A3: evento registra pessoa_id = quem executou (D), distinto de de/para (A/B)'
);


-- =============================================================================
-- B. B transfere para C (cadeia A -> B -> C) -- histórico não se perde
-- =============================================================================

select set_config('request.jwt.claim.sub', (select auth_user_id::text from public.pessoas where nome = 'B Teste Handoff'), true);
set local role authenticated;

select public.transferir_etapa(
  (select ce.id from public.caso_etapas ce join public.casos c on c.id = ce.caso_id where c.mae_nome = 'Mãe Handoff Cadeia' and ce.tipo = 'entrada'),
  (select id from public.pessoas where nome = 'C Teste Handoff')
);

reset role;

select is(
  (
    select string_agg(h.de_pessoa_id::text || '>' || h.para_pessoa_id::text, ',' order by h.ocorrido_em)
    from public.handoffs h
    join public.caso_etapas ce on ce.id = h.caso_etapa_id
    join public.casos c on c.id = ce.caso_id
    where c.mae_nome = 'Mãe Handoff Cadeia' and ce.tipo = 'entrada'
  ),
  (select id from public.pessoas where nome = 'A Teste Handoff') || '>' || (select id from public.pessoas where nome = 'B Teste Handoff')
    || ',' ||
  (select id from public.pessoas where nome = 'B Teste Handoff') || '>' || (select id from public.pessoas where nome = 'C Teste Handoff'),
  'B1: 2 linhas em handoffs, ordem preservada (A->B depois B->C) -- histórico intacto'
);

select is(
  (select responsavel_id from public.caso_etapas ce join public.casos c on c.id = ce.caso_id where c.mae_nome = 'Mãe Handoff Cadeia' and ce.tipo = 'entrada'),
  (select id from public.pessoas where nome = 'C Teste Handoff'),
  'B2: responsável final é C'
);


-- =============================================================================
-- C. Erros
-- =============================================================================

set local role authenticated;

-- C1: etapa "nascimento" do caso 1 nunca foi tocada -> sem responsável.
select ok(
  pg_temp.levanta_erro(format(
    $$ select public.transferir_etapa('%s'::uuid, '%s'::uuid) $$,
    (select ce.id from public.caso_etapas ce join public.casos c on c.id = ce.caso_id where c.mae_nome = 'Mãe Handoff Cadeia' and ce.tipo = 'nascimento'),
    (select id from public.pessoas where nome = 'A Teste Handoff')
  )),
  'C1: transferir etapa sem responsável levanta erro'
);

-- C2: C já é o responsável atual da etapa "entrada" do caso 1.
select ok(
  pg_temp.levanta_erro(format(
    $$ select public.transferir_etapa('%s'::uuid, '%s'::uuid) $$,
    (select ce.id from public.caso_etapas ce join public.casos c on c.id = ce.caso_id where c.mae_nome = 'Mãe Handoff Cadeia' and ce.tipo = 'entrada'),
    (select id from public.pessoas where nome = 'C Teste Handoff')
  )),
  'C2: transferir para o mesmo responsável atual levanta erro'
);

-- C3: etapa "entrada" do caso 2 está concluida.
select ok(
  pg_temp.levanta_erro(format(
    $$ select public.transferir_etapa('%s'::uuid, '%s'::uuid) $$,
    (select ce.id from public.caso_etapas ce join public.casos c on c.id = ce.caso_id where c.mae_nome = 'Mãe Handoff Concluida' and ce.tipo = 'entrada'),
    (select id from public.pessoas where nome = 'B Teste Handoff')
  )),
  'C3: transferir etapa concluida levanta erro'
);

select * from finish();
rollback;
