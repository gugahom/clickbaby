-- pgTAP: RPC concluir_etapa (item 3 da seção 13 do CLAUDE.md).
-- Usa o pacote 'basic' do seed real (entrada, nascimento) em vez de criar um
-- pacote de teste — exercita a função contra dado real do cliente.

begin;
select plan(11);

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
values (gen_random_uuid(), 'concluinte.teste.rpc@clickbaby.test', 'authenticated', 'authenticated', now(), now());

insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'Concluinte Teste RPC', u.id, 'operador', true
from auth.users u where u.email = 'concluinte.teste.rpc@clickbaby.test';

insert into public.maternidades (nome, sigla)
values ('Maternidade RPC Test', 'RPCTEST');

-- pacote 'basic' do seed real: entrada (ordem 1), nascimento (ordem 2).
insert into public.casos (mae_nome, pacote_id, maternidade_id)
select 'Mãe RPC Concluir',
       (select id from public.pacotes where slug = 'basic'),
       (select id from public.maternidades where sigla = 'RPCTEST');


-- =============================================================================
-- A. concluir a etapa "entrada", ainda pendente, nunca iniciada
-- =============================================================================

-- Resolve o auth_user_id ANTES de virar authenticated: nesse momento ainda
-- não existe identidade nenhuma, então se a busca já rodasse como
-- authenticated ela mesma seria bloqueada pela RLS de pessoas.
select set_config('request.jwt.claim.sub', (select auth_user_id::text from public.pessoas where nome = 'Concluinte Teste RPC'), true);
set local role authenticated;

select public.concluir_etapa(
  (select ce.id from public.caso_etapas ce join public.casos c on c.id = ce.caso_id where c.mae_nome = 'Mãe RPC Concluir' and ce.tipo = 'entrada')
);

-- Volta ao papel privilegiado da conexão de teste para as verificações:
-- eventos só é legível por adm (RLS da etapa 2) — o próprio operador que
-- concluiu não conseguiria ler o evento de volta, o que não é bug da RPC,
-- é a RLS funcionando. reset role não apaga request.jwt.claim.sub (é GUC
-- separado), então a identidade do operador continua pronta para retomar.
reset role;

select is(
  (select status::text from public.caso_etapas ce join public.casos c on c.id = ce.caso_id where c.mae_nome = 'Mãe RPC Concluir' and ce.tipo = 'entrada'),
  'concluida',
  'A1: conclui etapa pendente -> status concluida'
);

select ok(
  (select concluido_em is not null from public.caso_etapas ce join public.casos c on c.id = ce.caso_id where c.mae_nome = 'Mãe RPC Concluir' and ce.tipo = 'entrada'),
  'A2: concluido_em carimbado pelo servidor'
);

select ok(
  (select iniciado_em is not null and iniciado_em = concluido_em from public.caso_etapas ce join public.casos c on c.id = ce.caso_id where c.mae_nome = 'Mãe RPC Concluir' and ce.tipo = 'entrada'),
  'A3: etapa nunca iniciada -> iniciado_em carimbado no mesmo instante (ciclo zero), sem violar a constraint'
);

select is(
  (select responsavel_id from public.caso_etapas ce join public.casos c on c.id = ce.caso_id where c.mae_nome = 'Mãe RPC Concluir' and ce.tipo = 'entrada'),
  (select id from public.pessoas where nome = 'Concluinte Teste RPC'),
  'A4: responsavel_id preenchido com quem concluiu (estava nulo)'
);

select is(
  (
    select count(*)::int from public.eventos e
    join public.casos c on c.id = e.caso_id
    where c.mae_nome = 'Mãe RPC Concluir' and e.tipo = 'etapa_concluida'
      and e.payload->>'tipo' = 'entrada'
  ),
  1,
  'A5: evento etapa_concluida registrado com o tipo certo no payload'
);

select is(
  (
    select e.pessoa_id from public.eventos e
    join public.casos c on c.id = e.caso_id
    where c.mae_nome = 'Mãe RPC Concluir' and e.tipo = 'etapa_concluida' and e.payload->>'tipo' = 'entrada'
  ),
  (select id from public.pessoas where nome = 'Concluinte Teste RPC'),
  'A6: evento registra pessoa_id de quem concluiu'
);


-- =============================================================================
-- B. tentar concluir de novo a mesma etapa (já concluida) -> erro
-- =============================================================================

-- Retoma a identidade do operador (claim.sub já estava setado desde o
-- bootstrap) para a chamada de RPC valer como teste de "já concluída", não
-- como teste de "identidade inválida".
set local role authenticated;

select ok(
  pg_temp.levanta_erro(format(
    $$ select public.concluir_etapa('%s'::uuid) $$,
    (select ce.id from public.caso_etapas ce join public.casos c on c.id = ce.caso_id where c.mae_nome = 'Mãe RPC Concluir' and ce.tipo = 'entrada')
  )),
  'B1: concluir uma etapa já concluida levanta erro'
);


-- =============================================================================
-- C. concluir a etapa "nascimento" -> marco do SLA é o próprio concluido_em
-- =============================================================================

select public.concluir_etapa(
  (select ce.id from public.caso_etapas ce join public.casos c on c.id = ce.caso_id where c.mae_nome = 'Mãe RPC Concluir' and ce.tipo = 'nascimento'),
  'Nasceu às 3h, parto tranquilo'
);

reset role;

select is(
  (select status::text from public.caso_etapas ce join public.casos c on c.id = ce.caso_id where c.mae_nome = 'Mãe RPC Concluir' and ce.tipo = 'nascimento'),
  'concluida',
  'C1: conclui etapa nascimento -> status concluida'
);

select is(
  (select ce.observacao from public.caso_etapas ce join public.casos c on c.id = ce.caso_id where c.mae_nome = 'Mãe RPC Concluir' and ce.tipo = 'nascimento'),
  'Nasceu às 3h, parto tranquilo',
  'C2: observacao gravada'
);

-- O "marco do SLA" É o concluido_em da etapa nascimento — sem coluna extra.
-- O vencimento derivado (concluido_em + prazo_entrega do pacote) precisa
-- bater com a soma manual, provando que a derivação funciona sem dado
-- duplicado.
select is(
  (
    select ce.concluido_em + p.prazo_entrega
    from public.caso_etapas ce
    join public.casos c on c.id = ce.caso_id
    join public.pacotes p on p.id = c.pacote_id
    where c.mae_nome = 'Mãe RPC Concluir' and ce.tipo = 'nascimento'
  ),
  (
    select ce.concluido_em + interval '48 hours'
    from public.caso_etapas ce
    join public.casos c on c.id = ce.caso_id
    where c.mae_nome = 'Mãe RPC Concluir' and ce.tipo = 'nascimento'
  ),
  'C3: vencimento do SLA deriva corretamente de concluido_em + pacotes.prazo_entrega (basic = 48h), sem coluna nova'
);

select is(
  (
    select count(*)::int from public.eventos e
    join public.casos c on c.id = e.caso_id
    where c.mae_nome = 'Mãe RPC Concluir' and e.tipo = 'etapa_concluida'
  ),
  2,
  'C4: agora existem 2 eventos etapa_concluida para o caso (entrada + nascimento)'
);

select * from finish();
rollback;
