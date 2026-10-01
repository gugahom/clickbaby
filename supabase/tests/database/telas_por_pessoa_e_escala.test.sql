-- pgTAP: telas por pessoa e escala de plantão (migration 20260930232424).
--
--   T1 — o padrão do papel, e a tela escolhida vencendo o papel.
--   T2 — a tela Relatórios dá o poder: coordenação COM a tela lê, gestão SEM ela não.
--   E1 — cadastro e escala: quem tem a tela Equipe escreve, quem não tem não.
--   E2 — ninguém tira a tela Equipe da última pessoa que a tem.
--   E3 — mudança de acesso fica em `eventos`.
--   F1 — a foto de outra pessoa só na pasta dela.
--   P1 — as horas de plantão somadas por pessoa.
--
-- Os plantões moram em MARÇO DE 2029, longe dos dados fictícios.

begin;
select plan(15);

insert into auth.users (id, email, aud, role, created_at, updated_at)
select gen_random_uuid(), e, 'authenticated', 'authenticated', now(), now()
from unnest(array['tp.gestao@clickbaby.test', 'tp.coord@clickbaby.test', 'tp.coordrel@clickbaby.test',
                  'tp.gestaosemrel@clickbaby.test', 'tp.operador@clickbaby.test']) as e;

insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo, telas)
select v.nome, u.id, v.papel::public.papel_sistema, true, v.telas::public.tela[]
from (values
  ('TP Gestao', 'tp.gestao@clickbaby.test', 'gestao', null),
  ('TP Coord', 'tp.coord@clickbaby.test', 'coordenacao', null),
  ('TP CoordRel', 'tp.coordrel@clickbaby.test', 'coordenacao', '{quadro,relatorios}'),
  ('TP GestaoSemRel', 'tp.gestaosemrel@clickbaby.test', 'gestao', '{quadro}'),
  ('TP Operador', 'tp.operador@clickbaby.test', 'operador', null)
) as v(nome, email, papel, telas)
join auth.users u on u.email = v.email;

create function pg_temp.pessoa(p_nome text) returns uuid language sql as $$
  select id from public.pessoas where nome = p_nome;
$$;

-- Os ids lidos ANTES de trocar de papel: `authenticated` não lê auth.users.
create temp table ids as select email, id from auth.users where email like 'tp.%@clickbaby.test';
grant select on ids to authenticated;

create function pg_temp.como(p_email text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', (select id from ids where email = p_email), 'role', 'authenticated')::text, true);
$$;

grant execute on function pg_temp.pessoa(text) to authenticated;


-- =============================================================================
-- T1 / T2. As telas, e o poder que vem com a de Relatórios
-- =============================================================================

select is(public.telas_padrao_do_papel('operador'), '{quadro}'::public.tela[], 'T1: operador tem só o Quadro por padrão');

select pg_temp.como('tp.operador@clickbaby.test');
set local role authenticated;
select ok(public.tem_tela('quadro') and not public.tem_tela('relatorios'), 'T1: o padrão do papel vale quando a lista é nula');

select pg_temp.como('tp.coord@clickbaby.test');
select throws_ok(
  $$ select * from public.metricas_plantoes_por_pessoa('2029-03-01', '2029-03-31') $$,
  'P0001', 'Os relatórios são de quem tem a tela Relatórios liberada.',
  'T2: coordenação sem a tela não lê os relatórios'
);

select pg_temp.como('tp.coordrel@clickbaby.test');
select lives_ok(
  $$ select * from public.metricas_plantoes_por_pessoa('2029-03-01', '2029-03-31') $$,
  'T2: coordenação COM a tela lê — a tela dá o poder'
);

select pg_temp.como('tp.gestaosemrel@clickbaby.test');
select throws_ok(
  $$ select * from public.metricas_por_pessoa('2029-03-01', '2029-03-31') $$,
  'P0001', 'Os relatórios são de quem tem a tela Relatórios liberada.',
  'T2: gestão com a tela tirada não lê'
);


-- =============================================================================
-- E1. Cadastro e escala
-- =============================================================================

select pg_temp.como('tp.coord@clickbaby.test');
update public.pessoas set nome = 'TP Operador Mexido' where id = pg_temp.pessoa('TP Operador');
select pg_temp.como('tp.gestao@clickbaby.test');
select is(
  (select count(*)::int from public.pessoas where nome = 'TP Operador Mexido'), 0,
  'E1: sem a tela Equipe, o UPDATE em pessoas não alcança nenhuma linha'
);

update public.pessoas set nome = 'TP Operadora' where id = (select id from public.pessoas where nome = 'TP Operador');
select is(
  (select count(*)::int from public.pessoas where nome = 'TP Operadora'), 1,
  'E1: com a tela Equipe, muda o nome de outra pessoa'
);

select lives_ok(
  $$ insert into public.escalas (pessoa_id, data, turno, inicio, fim)
     values (pg_temp.pessoa('TP Operadora'), '2029-03-05', 'diurno', '2029-03-05 07:00-03', '2029-03-05 19:00-03'),
            (pg_temp.pessoa('TP Operadora'), '2029-03-07', 'noturno', '2029-03-07 19:00-03', '2029-03-08 07:00-03') $$,
  'E1: com a tela Equipe, lança plantão'
);

select pg_temp.como('tp.coord@clickbaby.test');
select throws_ok(
  $$ insert into public.escalas (pessoa_id, data, turno, inicio, fim)
     values (pg_temp.pessoa('TP Operadora'), '2029-03-09', 'diurno', '2029-03-09 07:00-03', '2029-03-09 19:00-03') $$,
  '42501', null,
  'E1: sem a tela Equipe, não lança plantão'
);


-- =============================================================================
-- P1. As horas de plantão
-- =============================================================================

select pg_temp.como('tp.gestao@clickbaby.test');
select is(
  (select plantoes || ':' || minutos from public.metricas_plantoes_por_pessoa('2029-03-01', '2029-03-31')
    where pessoa_id = pg_temp.pessoa('TP Operadora')),
  '2:1440',
  'P1: dois plantões de 12h somam 1.440 minutos'
);


-- =============================================================================
-- E3. A mudança de acesso fica registrada
-- =============================================================================

update public.pessoas set telas = '{quadro,calendario}' where id = pg_temp.pessoa('TP Operadora');
reset role;
select is(
  (select payload ->> 'telas_depois' from public.eventos
    where tipo = 'acesso_alterado' and payload ->> 'pessoa_id' = pg_temp.pessoa('TP Operadora')::text),
  '["quadro", "calendario"]',
  'E3: quem mexeu e o antes/depois vão para eventos'
);
select is(
  (select pessoa_id from public.eventos
    where tipo = 'acesso_alterado' and payload ->> 'pessoa_id' = pg_temp.pessoa('TP Operadora')::text),
  pg_temp.pessoa('TP Gestao'),
  'E3: o ator é quem estava logado'
);


-- =============================================================================
-- E2. Ninguém se tranca para fora
-- =============================================================================

-- Deixa a TP Gestao como a ÚNICA com a tela Equipe (em transação, desfeito no fim).
update public.pessoas set ativo = false where id <> pg_temp.pessoa('TP Gestao') and ativo;

select pg_temp.como('tp.gestao@clickbaby.test');
set local role authenticated;
select throws_ok(
  $$ update public.pessoas set telas = '{quadro}' where id = pg_temp.pessoa('TP Gestao') $$,
  'P0001', 'Sobraria ninguém com a tela Equipe. Dê a tela a outra pessoa antes.',
  'E2: a última pessoa com a tela Equipe não a perde'
);


-- =============================================================================
-- F1. A foto de outra pessoa
-- =============================================================================

select throws_ok(
  format($$ select public.definir_foto_da_pessoa(%L, 'equipe/outra-pessoa/1.jpg') $$, pg_temp.pessoa('TP Operadora')),
  'P0001', 'O caminho da foto tem que estar na pasta desta pessoa.',
  'F1: o caminho precisa estar na pasta da própria pessoa'
);
select lives_ok(
  format($$ select public.definir_foto_da_pessoa(%1$L, 'equipe/' || %1$L || '/1.jpg') $$, pg_temp.pessoa('TP Operadora')),
  'F1: na pasta dela, a Equipe troca a foto'
);

reset role;
select * from finish();
rollback;
