-- pgTAP: fecha a dívida da seção 13 do CLAUDE.md — UPDATE direto de
-- casos.status_operacional/status_entrega/motivo_cancelamento revogado por
-- privilégio de coluna, mesmo para adm. Colunas de dado continuam livres
-- para adm. RLS (linha) continua bloqueando operador e atendimento por
-- completo. RPCs (SECURITY DEFINER, rodam como dono da tabela) não são
-- afetadas pelo REVOKE mirado em authenticated.

begin;
select plan(7);

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
-- Fixtures
-- =============================================================================

insert into auth.users (id, email, aud, role, created_at, updated_at)
values
  (gen_random_uuid(), 'operador.teste.revoga@clickbaby.test', 'authenticated', 'authenticated', now(), now()),
  (gen_random_uuid(), 'atendimento.teste.revoga@clickbaby.test', 'authenticated', 'authenticated', now(), now()),
  (gen_random_uuid(), 'adm.teste.revoga@clickbaby.test', 'authenticated', 'authenticated', now(), now());

insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'Operador Teste Revoga', u.id, 'operador', true from auth.users u where u.email = 'operador.teste.revoga@clickbaby.test';
insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'Atendimento Teste Revoga', u.id, 'atendimento', true from auth.users u where u.email = 'atendimento.teste.revoga@clickbaby.test';
insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'Adm Teste Revoga', u.id, 'gestao', true from auth.users u where u.email = 'adm.teste.revoga@clickbaby.test';

insert into public.maternidades (nome, sigla)
values ('Maternidade Revoga Test', 'REVOGA');

insert into public.casos (mae_nome, pacote_id, maternidade_id)
select 'Mãe Revoga Direto', (select id from public.pacotes where slug = 'basic'), (select id from public.maternidades where sigla = 'REVOGA');
insert into public.casos (mae_nome, pacote_id, maternidade_id)
select 'Mãe Revoga RPC', (select id from public.pacotes where slug = 'basic'), (select id from public.maternidades where sigla = 'REVOGA');

insert into public.entregaveis (caso_id, tipo, url)
select id, 'google_photos', 'https://fixture.example/revoga-direto'
from public.casos where mae_nome = 'Mãe Revoga Direto';


-- =============================================================================
-- A. adm tenta UPDATE direto de máquina de estado -> falha por privilégio
-- de coluna (42501), antes mesmo da RLS
-- =============================================================================

select set_config('request.jwt.claim.sub', (select auth_user_id::text from public.pessoas where nome = 'Adm Teste Revoga'), true);
set local role authenticated;

select ok(
  pg_temp.levanta_erro(format(
    $$ update public.casos set status_operacional = 'em_atendimento' where id = '%s'::uuid $$,
    (select id from public.casos where mae_nome = 'Mãe Revoga Direto')
  )),
  'A1: adm NÃO consegue mudar status_operacional por UPDATE direto'
);

select ok(
  pg_temp.levanta_erro(format(
    $$ update public.casos set status_entrega = 'links_prontos' where id = '%s'::uuid $$,
    (select id from public.casos where mae_nome = 'Mãe Revoga Direto')
  )),
  'A2: adm NÃO consegue mudar status_entrega por UPDATE direto'
);

select ok(
  pg_temp.levanta_erro(format(
    $$ update public.casos set motivo_cancelamento = 'tentativa direta' where id = '%s'::uuid $$,
    (select id from public.casos where mae_nome = 'Mãe Revoga Direto')
  )),
  'A3: adm NÃO consegue mudar motivo_cancelamento por UPDATE direto'
);


-- =============================================================================
-- B. adm CONSEGUE editar campo de dado (observacao) direto
-- =============================================================================

with upd as (
  update public.casos set observacao = 'Corrigido por adm depois da dívida fechada'
  where mae_nome = 'Mãe Revoga Direto'
  returning id
)
select is(
  (select count(*)::int from upd),
  1,
  'B1: adm CONSEGUE editar observacao por UPDATE direto (coluna de dado, não máquina de estado)'
);


-- =============================================================================
-- C. operador e atendimento continuam sem NENHUM UPDATE direto (RLS de
-- linha bloqueia mesmo tendo privilégio de coluna em observacao)
-- =============================================================================

select set_config('request.jwt.claim.sub', (select auth_user_id::text from public.pessoas where nome = 'Operador Teste Revoga'), true);

with upd as (
  update public.casos set observacao = 'tentativa de operador'
  where mae_nome = 'Mãe Revoga Direto'
  returning id
)
select is(
  (select count(*)::int from upd),
  0,
  'C1: operador não consegue editar observacao (bloqueado pela RLS de linha, não pela coluna)'
);

select set_config('request.jwt.claim.sub', (select auth_user_id::text from public.pessoas where nome = 'Atendimento Teste Revoga'), true);

with upd as (
  update public.casos set observacao = 'tentativa de atendimento'
  where mae_nome = 'Mãe Revoga Direto'
  returning id
)
select is(
  (select count(*)::int from upd),
  0,
  'C2: atendimento não consegue editar observacao — a policy interina foi derrubada, agora é igual operador'
);


-- =============================================================================
-- D. As RPCs continuam funcionando: cancelar_caso escreve exatamente as
-- colunas revogadas, porque SECURITY DEFINER roda como dono da tabela
-- =============================================================================

select set_config('request.jwt.claim.sub', (select auth_user_id::text from public.pessoas where nome = 'Adm Teste Revoga'), true);

select public.cancelar_caso(
  (select id from public.casos where mae_nome = 'Mãe Revoga RPC'),
  'Motivo válido via RPC, mesmo com a coluna revogada para authenticated'
);

reset role;

select is(
  (select status_operacional::text from public.casos where mae_nome = 'Mãe Revoga RPC'),
  'cancelado',
  'D1: cancelar_caso (RPC) continua escrevendo status_operacional normalmente'
);

select * from finish();
rollback;
