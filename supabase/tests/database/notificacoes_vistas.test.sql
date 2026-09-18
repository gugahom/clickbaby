-- pgTAP: a marca de "já vi" do sino (migration 20260917215442).
--
-- O QUE ESTE ARQUIVO PROTEGE
--   1. A MARCA É PRIVADA. Ela guarda a que horas cada pessoa abriu o app, e
--      isso não pode virar relógio de presença para a equipe inteira ler
--      (seção 9 do CLAUDE.md). Uma pessoa não enxerga a linha da outra.
--   2. A ESCRITA É SÓ PELA RPC, e a RPC não recebe pessoa_id — não há como
--      marcar o sino de outra pessoa.
--   3. Chamar duas vezes ATUALIZA, não duplica: é uma linha por pessoa.
--   4. LIMPAR AS GERAIS (20260918083153) carimba a mesma linha, e marca o sino
--      como visto junto — quem limpou acabou de olhar.

begin;
select plan(11);

-- =============================================================================
-- Fixtures: duas pessoas, para o caso negativo da RLS existir de verdade.
-- =============================================================================

insert into auth.users (id, email, aud, role, created_at, updated_at)
values
  (gen_random_uuid(), 'sino.a@clickbaby.test', 'authenticated', 'authenticated', now(), now()),
  (gen_random_uuid(), 'sino.b@clickbaby.test', 'authenticated', 'authenticated', now(), now());

insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select v.nome, u.id, 'operador'::public.papel_sistema, true
  from (values ('Sino A', 'sino.a@clickbaby.test'), ('Sino B', 'sino.b@clickbaby.test')) as v(nome, email)
  join auth.users u on u.email = v.email;

create function pg_temp.como(p_email text) returns void language plpgsql as $$
declare v_id uuid;
begin
  select id into v_id from auth.users where email = p_email;
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L', json_build_object('sub', v_id, 'role', 'authenticated')::text);
end;
$$;


-- =============================================================================
-- 1. Privilégios
-- =============================================================================

select ok(
  has_function_privilege('authenticated', 'public.marcar_notificacoes_vistas()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.marcar_notificacoes_vistas()', 'EXECUTE'),
  'E1: authenticated executa a RPC; anon não');

select ok(
  has_table_privilege('authenticated', 'public.notificacoes_vistas', 'SELECT')
  and not has_table_privilege('authenticated', 'public.notificacoes_vistas', 'INSERT')
  and not has_table_privilege('authenticated', 'public.notificacoes_vistas', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.notificacoes_vistas', 'DELETE'),
  'E2: authenticated LÊ e não escreve — a escrita é só pela RPC');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.notificacoes_vistas'::regclass),
  'E3: RLS ligada');


-- =============================================================================
-- 2. Marcar
-- =============================================================================

select pg_temp.como('sino.a@clickbaby.test');
select lives_ok(
  'select public.marcar_notificacoes_vistas()',
  'W1: a pessoa marca o próprio sino como visto');
select lives_ok(
  'select public.marcar_notificacoes_vistas()',
  'W2: marcar de novo não explode — é uma linha por pessoa');
reset role;

select is(
  (select count(*)::int from public.notificacoes_vistas nv
     join public.pessoas p on p.id = nv.pessoa_id
    where p.nome = 'Sino A'),
  1,
  'W3: e continua sendo UMA linha');


select ok(
  has_function_privilege('authenticated', 'public.limpar_notificacoes_gerais()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.limpar_notificacoes_gerais()', 'EXECUTE'),
  'E4: authenticated limpa as gerais; anon não');

select pg_temp.como('sino.a@clickbaby.test');
select lives_ok(
  'select public.limpar_notificacoes_gerais()',
  'W4: a pessoa limpa as próprias notificações gerais');
reset role;

select ok(
  (select nv.gerais_limpas_em is not null and nv.gerais_limpas_em = nv.visto_em
     from public.notificacoes_vistas nv
     join public.pessoas p on p.id = nv.pessoa_id
    where p.nome = 'Sino A'),
  'W5: o carimbo de limpeza entra na MESMA linha, e o sino fica visto junto');


-- =============================================================================
-- 3. A marca é privada
-- =============================================================================

select pg_temp.como('sino.b@clickbaby.test');
select is(
  (select count(*)::int from public.notificacoes_vistas),
  0,
  'R1: a pessoa B não enxerga a marca da A — nem sabe que existe');
reset role;

-- Sem pessoa ativa não há sino nenhum para marcar.
--
-- O `reset role` acima devolve o papel e NÃO limpa as claims: `set local` vale
-- até o fim da transação, então sem esta linha o auth.uid() continuaria sendo
-- o da pessoa B e a RPC passaria. Claims sem `sub` é o que deixa auth.uid()
-- nulo de verdade.
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  'select public.marcar_notificacoes_vistas()',
  null, null,
  'R2: sem pessoa ativa, recusa');
reset role;

select * from finish();
rollback;
