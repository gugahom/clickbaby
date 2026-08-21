-- pgTAP: RPC iniciar_etapa (item 3 da seção 13 do CLAUDE.md).
-- Mesma técnica de simulação de papel e mesmo cuidado de reset role antes de
-- ler eventos (só adm lê, via RLS) que rpc_concluir_etapa.test.sql.

begin;
select plan(9);

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
values (gen_random_uuid(), 'iniciante.teste.rpc@clickbaby.test', 'authenticated', 'authenticated', now(), now());

insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'Iniciante Teste RPC', u.id, 'operador', true
from auth.users u where u.email = 'iniciante.teste.rpc@clickbaby.test';

insert into public.maternidades (nome, sigla)
values ('Maternidade RPC Iniciar Test', 'RPCINIC');

-- pacote 'basic' do seed real: entrada (ordem 1), nascimento (ordem 2).
insert into public.casos (mae_nome, pacote_id, maternidade_id)
select 'Mãe RPC Iniciar',
       (select id from public.pacotes where slug = 'basic'),
       (select id from public.maternidades where sigla = 'RPCINIC');


-- =============================================================================
-- A. iniciar a etapa "entrada", pendente
-- =============================================================================

select set_config('request.jwt.claim.sub', (select auth_user_id::text from public.pessoas where nome = 'Iniciante Teste RPC'), true);
set local role authenticated;

select public.iniciar_etapa(
  (select ce.id from public.caso_etapas ce join public.casos c on c.id = ce.caso_id where c.mae_nome = 'Mãe RPC Iniciar' and ce.tipo = 'entrada')
);

reset role;

select is(
  (select status::text from public.caso_etapas ce join public.casos c on c.id = ce.caso_id where c.mae_nome = 'Mãe RPC Iniciar' and ce.tipo = 'entrada'),
  'em_andamento',
  'A1: inicia etapa pendente -> status em_andamento'
);

select ok(
  (select iniciado_em is not null from public.caso_etapas ce join public.casos c on c.id = ce.caso_id where c.mae_nome = 'Mãe RPC Iniciar' and ce.tipo = 'entrada'),
  'A2: iniciado_em carimbado pelo servidor'
);

select ok(
  (select concluido_em is null from public.caso_etapas ce join public.casos c on c.id = ce.caso_id where c.mae_nome = 'Mãe RPC Iniciar' and ce.tipo = 'entrada'),
  'A3: concluido_em continua nulo (só iniciou, não concluiu)'
);

select is(
  (select responsavel_id from public.caso_etapas ce join public.casos c on c.id = ce.caso_id where c.mae_nome = 'Mãe RPC Iniciar' and ce.tipo = 'entrada'),
  (select id from public.pessoas where nome = 'Iniciante Teste RPC'),
  'A4: responsavel_id preenchido com quem iniciou (estava nulo)'
);

select is(
  (
    select count(*)::int from public.eventos e
    join public.casos c on c.id = e.caso_id
    where c.mae_nome = 'Mãe RPC Iniciar' and e.tipo = 'etapa_iniciada' and e.payload->>'tipo' = 'entrada'
  ),
  1,
  'A5: evento etapa_iniciada registrado com o tipo certo no payload'
);


-- =============================================================================
-- B. tentar iniciar de novo a mesma etapa (já em_andamento) -> erro
-- =============================================================================

set local role authenticated;

select ok(
  pg_temp.levanta_erro(format(
    $$ select public.iniciar_etapa('%s'::uuid) $$,
    (select ce.id from public.caso_etapas ce join public.casos c on c.id = ce.caso_id where c.mae_nome = 'Mãe RPC Iniciar' and ce.tipo = 'entrada')
  )),
  'B1: iniciar uma etapa já em_andamento levanta erro'
);


-- =============================================================================
-- C. concluir a etapa iniciada -> ciclo real (iniciado_em < concluido_em)
-- =============================================================================

select public.concluir_etapa(
  (select ce.id from public.caso_etapas ce join public.casos c on c.id = ce.caso_id where c.mae_nome = 'Mãe RPC Iniciar' and ce.tipo = 'entrada')
);

reset role;

select ok(
  (
    select iniciado_em <= concluido_em
    from public.caso_etapas ce join public.casos c on c.id = ce.caso_id
    where c.mae_nome = 'Mãe RPC Iniciar' and ce.tipo = 'entrada'
  ),
  'C1: etapa iniciada e depois concluída -> iniciado_em <= concluido_em, tempo de ciclo real (não sobrescreve iniciado_em)'
);

select is(
  (select status::text from public.caso_etapas ce join public.casos c on c.id = ce.caso_id where c.mae_nome = 'Mãe RPC Iniciar' and ce.tipo = 'entrada'),
  'concluida',
  'C2: concluir_etapa ainda funciona normalmente depois de iniciar_etapa'
);

-- Tentar iniciar uma etapa já concluida também deve falhar (só
-- pendente/atribuida são origem válida).
set local role authenticated;

select ok(
  pg_temp.levanta_erro(format(
    $$ select public.iniciar_etapa('%s'::uuid) $$,
    (select ce.id from public.caso_etapas ce join public.casos c on c.id = ce.caso_id where c.mae_nome = 'Mãe RPC Iniciar' and ce.tipo = 'entrada')
  )),
  'C3: iniciar uma etapa já concluida levanta erro'
);

select * from finish();
rollback;
