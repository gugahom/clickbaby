-- pgTAP: RPC registrar_entregavel. Sem restrição de papel — qualquer
-- pessoa autenticada e ativa pode chamar (decisão registrada na
-- migration). O teste de encadeamento real com confirmar_entrega vive em
-- rpc_confirmar_entrega_e_cancelar_caso.test.sql (não aqui, pra não
-- duplicar fixtures).

begin;
select plan(6);

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
values (gen_random_uuid(), 'operador.teste.entregavel@clickbaby.test', 'authenticated', 'authenticated', now(), now());

insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'Operador Teste Entregavel', u.id, 'operador', true
from auth.users u where u.email = 'operador.teste.entregavel@clickbaby.test';

insert into public.maternidades (nome, sigla)
values ('Maternidade Entregavel Test', 'ENTRTEST');

insert into public.casos (mae_nome, pacote_id, maternidade_id)
select 'Mãe Entregavel Teste', (select id from public.pacotes where slug = 'basic'), (select id from public.maternidades where sigla = 'ENTRTEST');


-- =============================================================================
-- A. Registrar um entregável — caminho positivo
-- =============================================================================

select set_config('request.jwt.claim.sub', (select auth_user_id::text from public.pessoas where nome = 'Operador Teste Entregavel'), true);
set local role authenticated;

select public.registrar_entregavel(
  (select id from public.casos where mae_nome = 'Mãe Entregavel Teste'),
  'google_photos',
  'https://photos.google.com/fixture-teste'
);

reset role;

select ok(
  (
    select e.criado_por is not null and e.criado_em is not null and e.confirmado_por is null
    from public.entregaveis e
    join public.casos c on c.id = e.caso_id
    where c.mae_nome = 'Mãe Entregavel Teste' and e.url = 'https://photos.google.com/fixture-teste'
  ),
  'A1: entregável aparece com criado_por/criado_em preenchidos e ainda não confirmado'
);

select is(
  (
    select e2.tipo::text
    from public.entregaveis e2
    join public.casos c on c.id = e2.caso_id
    where c.mae_nome = 'Mãe Entregavel Teste'
  ),
  'google_photos',
  'A2: tipo gravado corretamente'
);

select is(
  (
    select count(*)::int from public.eventos ev
    join public.casos c on c.id = ev.caso_id
    where c.mae_nome = 'Mãe Entregavel Teste' and ev.tipo = 'entregavel_registrado'
      and ev.pessoa_id = (select id from public.pessoas where nome = 'Operador Teste Entregavel')
  ),
  1,
  'A3: evento entregavel_registrado gravado com pessoa_id de quem registrou'
);


-- =============================================================================
-- B. Erros
-- =============================================================================

set local role authenticated;

select ok(
  pg_temp.levanta_erro(format(
    $$ select public.registrar_entregavel('%s'::uuid, 'wetransfer', '') $$,
    (select id from public.casos where mae_nome = 'Mãe Entregavel Teste')
  )),
  'B1: url vazia levanta erro'
);

select ok(
  pg_temp.levanta_erro(format(
    $$ select public.registrar_entregavel('%s'::uuid, 'wetransfer', '   ') $$,
    (select id from public.casos where mae_nome = 'Mãe Entregavel Teste')
  )),
  'B2: url só com espaço também levanta erro'
);

select ok(
  pg_temp.levanta_erro(
    $$ select public.registrar_entregavel('00000000-0000-0000-0000-000000000000'::uuid, 'wetransfer', 'https://valida.example') $$
  ),
  'B3: caso inexistente levanta erro'
);

select * from finish();
rollback;
