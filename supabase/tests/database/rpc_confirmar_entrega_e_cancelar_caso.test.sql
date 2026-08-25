-- pgTAP: RPCs confirmar_entrega e cancelar_caso — os dois caminhos
-- terminais do caso (item 3 da seção 13, invariante 3.5 do CLAUDE.md).
-- Primeiras RPCs com restrição de papel_sistema: cobre o caso negativo em
-- ambas.

begin;
select plan(15);

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
  (gen_random_uuid(), 'operador.teste.terminal@clickbaby.test', 'authenticated', 'authenticated', now(), now()),
  (gen_random_uuid(), 'atendimento.teste.terminal@clickbaby.test', 'authenticated', 'authenticated', now(), now()),
  (gen_random_uuid(), 'adm.teste.terminal@clickbaby.test', 'authenticated', 'authenticated', now(), now());

insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'Operador Teste Terminal', u.id, 'operador', true from auth.users u where u.email = 'operador.teste.terminal@clickbaby.test';
insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'Atendimento Teste Terminal', u.id, 'atendimento', true from auth.users u where u.email = 'atendimento.teste.terminal@clickbaby.test';
insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'Adm Teste Terminal', u.id, 'gestao', true from auth.users u where u.email = 'adm.teste.terminal@clickbaby.test';

insert into public.maternidades (nome, sigla)
values ('Maternidade Terminal Test', 'TERMTEST');

insert into public.casos (mae_nome, pacote_id, maternidade_id)
select 'Mãe Confirma OK', (select id from public.pacotes where slug = 'basic'), (select id from public.maternidades where sigla = 'TERMTEST');
insert into public.casos (mae_nome, pacote_id, maternidade_id)
select 'Mãe Confirma SemLink', (select id from public.pacotes where slug = 'basic'), (select id from public.maternidades where sigla = 'TERMTEST');
insert into public.casos (mae_nome, pacote_id, maternidade_id)
select 'Mãe Cancelar OK', (select id from public.pacotes where slug = 'basic'), (select id from public.maternidades where sigla = 'TERMTEST');
insert into public.casos (mae_nome, pacote_id, maternidade_id)
select 'Mãe Cancelar RoleErro', (select id from public.pacotes where slug = 'basic'), (select id from public.maternidades where sigla = 'TERMTEST');

-- =============================================================================
-- A. Encadeamento real: registrar_entregavel (operador) -> confirmar_entrega
-- (atendimento). Antes disso a fixture inseria o entregável direto por
-- INSERT, bypassando RLS — agora é a RPC de verdade, provando que as duas
-- se encaixam (registrar_entregavel existe exatamente pra confirmar_entrega
-- deixar de ser um botão morto).
-- =============================================================================

select set_config('request.jwt.claim.sub', (select auth_user_id::text from public.pessoas where nome = 'Operador Teste Terminal'), true);
set local role authenticated;

select public.registrar_entregavel(
  (select id from public.casos where mae_nome = 'Mãe Confirma OK'),
  'google_photos',
  'https://fixture.example/confirma-ok'
);

select set_config('request.jwt.claim.sub', (select auth_user_id::text from public.pessoas where nome = 'Atendimento Teste Terminal'), true);

select public.confirmar_entrega((select id from public.casos where mae_nome = 'Mãe Confirma OK'));

reset role;

select is(
  (select status_entrega::text from public.casos where mae_nome = 'Mãe Confirma OK'),
  'confirmado',
  'CE1: confirmar_entrega seta status_entrega=confirmado'
);

select is(
  (select status_operacional::text from public.casos where mae_nome = 'Mãe Confirma OK'),
  'encerrado',
  'CE2: confirmar_entrega ENCERRA o caso no mesmo gesto (status_operacional=encerrado)'
);

select ok(
  (select confirmado_por is not null and confirmado_em is not null
     from public.entregaveis where url = 'https://fixture.example/confirma-ok'),
  'CE3: entregavel ganha confirmado_por/confirmado_em'
);

select is(
  (select e.pessoa_id from public.eventos e join public.casos c on c.id = e.caso_id
     where c.mae_nome = 'Mãe Confirma OK' and e.tipo = 'entrega_confirmada'),
  (select id from public.pessoas where nome = 'Atendimento Teste Terminal'),
  'CE4: evento entrega_confirmada registrado com pessoa_id de quem confirmou'
);


-- =============================================================================
-- B. confirmar_entrega — negativos
-- =============================================================================

-- B1: operador AGORA CONSEGUE confirmar (migration 20260825014102).
-- O teste era o inverso: afirmava que o operador era barrado por papel. Quem
-- gera os links são as fotógrafas, então prender o encerramento ao atendimento
-- fazia da Morgana gargalo de um passo que ela não executa.
--
-- A trava que ficou é outra: sem entregável não se encerra. Por isso este caso
-- ganha um link antes — o que o teste prova é que o operador passa pela porta
-- que antes era só do atendimento.
select set_config('request.jwt.claim.sub', (select auth_user_id::text from public.pessoas where nome = 'Operador Teste Terminal'), true);
set local role authenticated;

select public.registrar_entregavel(
  (select id from public.casos where mae_nome = 'Mãe Confirma SemLink'),
  'google_photos',
  'https://exemplo.invalido/operador-confirma'
);

select lives_ok(
  format(
    $$ select public.confirmar_entrega('%s'::uuid) $$,
    (select id from public.casos where mae_nome = 'Mãe Confirma SemLink')
  ),
  'CE5: operador CONFIRMA entrega — a restrição de papel caiu (20260825014102)'
);

select is(
  (select status_operacional from public.casos where mae_nome = 'Mãe Confirma SemLink'),
  'encerrado'::public.status_operacional,
  'CE5b: e o caso encerrou pelo gesto do operador'
);

-- B2: a trava que SOBROU — sem entregável nenhum, ninguém encerra.
--
-- A fixture sai do papel authenticated para ser criada: `authenticated` não tem
-- (nem deve ter) INSERT em casos — o intake é do sync, via service_role.
reset role;

insert into public.casos (mae_nome, pacote_id, maternidade_id, previsao_em)
values (
  'Mãe Sem Link Nenhum',
  (select id from public.pacotes where slug = 'basic'),
  (select id from public.maternidades where sigla = 'HSC'),
  '2026-09-30 10:00:00+00'
);

set local role authenticated;

select ok(
  pg_temp.levanta_erro(format(
    $$ select public.confirmar_entrega('%s'::uuid) $$,
    (select id from public.casos where mae_nome = 'Mãe Sem Link Nenhum')
  )),
  'CE6: confirmar entrega de um caso sem entregável levanta erro — a trava que importa continua'
);

-- B3: confirmar de novo um caso já confirmado/encerrado.
select ok(
  pg_temp.levanta_erro(format(
    $$ select public.confirmar_entrega('%s'::uuid) $$,
    (select id from public.casos where mae_nome = 'Mãe Confirma OK')
  )),
  'CE7: confirmar entrega de novo (caso já encerrado) levanta erro'
);


-- =============================================================================
-- C. cancelar_caso — negativos primeiro (não mutam estado)
-- =============================================================================

-- C1: operador não pode cancelar.
select set_config('request.jwt.claim.sub', (select auth_user_id::text from public.pessoas where nome = 'Operador Teste Terminal'), true);

select ok(
  pg_temp.levanta_erro(format(
    $$ select public.cancelar_caso('%s'::uuid, 'Tentativa de operador') $$,
    (select id from public.casos where mae_nome = 'Mãe Cancelar RoleErro')
  )),
  'CC4: operador não consegue cancelar caso (restrição de papel)'
);

-- C2: adm com motivo vazio.
select set_config('request.jwt.claim.sub', (select auth_user_id::text from public.pessoas where nome = 'Adm Teste Terminal'), true);

select ok(
  pg_temp.levanta_erro(format(
    $$ select public.cancelar_caso('%s'::uuid, '') $$,
    (select id from public.casos where mae_nome = 'Mãe Cancelar RoleErro')
  )),
  'CC5: cancelar com motivo vazio levanta erro'
);

-- C3: adm cancelando um caso já encerrado (o da seção A).
select ok(
  pg_temp.levanta_erro(format(
    $$ select public.cancelar_caso('%s'::uuid, 'Motivo válido') $$,
    (select id from public.casos where mae_nome = 'Mãe Confirma OK')
  )),
  'CC7: cancelar um caso já encerrado levanta erro'
);


-- =============================================================================
-- D. cancelar_caso — caminho positivo (adm) e repetição
-- =============================================================================

select public.cancelar_caso(
  (select id from public.casos where mae_nome = 'Mãe Cancelar OK'),
  'Cliente desistiu do contrato'
);

reset role;

select is(
  (select status_operacional::text from public.casos where mae_nome = 'Mãe Cancelar OK'),
  'cancelado',
  'CC1: cancelar_caso seta status_operacional=cancelado'
);

select is(
  (select motivo_cancelamento from public.casos where mae_nome = 'Mãe Cancelar OK'),
  'Cliente desistiu do contrato',
  'CC2: motivo_cancelamento gravado corretamente'
);

select is(
  (
    select e.pessoa_id from public.eventos e join public.casos c on c.id = e.caso_id
    where c.mae_nome = 'Mãe Cancelar OK' and e.tipo = 'caso_cancelado'
  ),
  (select id from public.pessoas where nome = 'Adm Teste Terminal'),
  'CC3: evento caso_cancelado registrado com pessoa_id de quem cancelou'
);

set local role authenticated;

select ok(
  pg_temp.levanta_erro(format(
    $$ select public.cancelar_caso('%s'::uuid, 'Motivo qualquer') $$,
    (select id from public.casos where mae_nome = 'Mãe Cancelar OK')
  )),
  'CC6: cancelar um caso já cancelado levanta erro'
);

select * from finish();
rollback;
