-- pgTAP: RPC sync_cancelar_caso (migration 20260831132545).
--
-- É o cancelamento por EVENTO DELETADO do Google Calendar — diferente do
-- card cinza, que já passa por sync_upsert_caso (p_cancelado). Um evento
-- apagado direto simplesmente para de existir na resposta da API: não sobra
-- título, não sobra nada para reler. Por isso esta RPC recebe só o
-- google_event_id que já se sabia pertencer a um caso, e um motivo — nunca
-- dados do evento em si.

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
values (gen_random_uuid(), 'operador.teste.cancelasync@clickbaby.test', 'authenticated', 'authenticated', now(), now());

insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'Operador Teste CancelaSync', u.id, 'operador', true
from auth.users u where u.email = 'operador.teste.cancelasync@clickbaby.test';

insert into public.casos (mae_nome, bebe_nome, previsao_em, google_calendar_event_id)
values ('Mãe Evento Deletado', 'Bebê', now(), 'evt-deletado-001');

insert into public.casos (mae_nome, bebe_nome, previsao_em, google_calendar_event_id,
                           status_operacional, motivo_cancelamento)
values ('Mãe Já Cancelada', 'Bebê', now(), 'evt-deletado-ja-cancelado',
        'cancelado', 'motivo anterior, não deve ser sobrescrito');

insert into public.casos (mae_nome, bebe_nome, previsao_em, google_calendar_event_id,
                           status_operacional, status_entrega)
values ('Mãe Já Encerrada', 'Bebê', now(), 'evt-deletado-ja-encerrado', 'encerrado', 'confirmado');


-- =============================================================================
-- A. Cancela um caso aberto cujo evento sumiu
-- =============================================================================

set local role service_role;

select is(
  public.sync_cancelar_caso('evt-deletado-001'),
  'caso_cancelado',
  'A0: retorna caso_cancelado'
);

reset role;

select is(
  (select status_operacional from public.casos where google_calendar_event_id = 'evt-deletado-001'),
  'cancelado'::public.status_operacional,
  'A1: status_operacional virou cancelado'
);

select ok(
  (select motivo_cancelamento from public.casos where google_calendar_event_id = 'evt-deletado-001')
    like '%removido do Google Calendar%',
  'A2: motivo padrão explica que foi deleção, não card cinza'
);

select is(
  (select count(*)::int from public.eventos e join public.casos c on c.id = e.caso_id
    where c.google_calendar_event_id = 'evt-deletado-001' and e.tipo = 'caso_cancelado_via_sync'),
  1,
  'A3: gravou evento caso_cancelado_via_sync — invariante 3.3'
);


-- =============================================================================
-- B. Motivo customizado
-- =============================================================================

insert into public.casos (mae_nome, bebe_nome, previsao_em, google_calendar_event_id)
values ('Mãe Motivo Custom', 'Bebê', now(), 'evt-deletado-motivo');

set local role service_role;
select public.sync_cancelar_caso('evt-deletado-motivo', 'motivo escrito à mão para o teste');
reset role;

select is(
  (select motivo_cancelamento from public.casos where google_calendar_event_id = 'evt-deletado-motivo'),
  'motivo escrito à mão para o teste',
  'B0: aceita motivo customizado em vez do padrão'
);


-- =============================================================================
-- C. Sem efeito — id inexistente, e casos já terminais
-- =============================================================================

set local role service_role;

select is(
  public.sync_cancelar_caso('evt-nunca-existiu'),
  'sem_efeito',
  'C0: google_event_id sem caso correspondente é sem_efeito, não erro'
);

select is(
  public.sync_cancelar_caso('evt-deletado-ja-cancelado'),
  'sem_efeito',
  'C1: caso já cancelado é sem_efeito'
);

select is(
  public.sync_cancelar_caso('evt-deletado-ja-encerrado'),
  'sem_efeito',
  'C2: caso já encerrado é sem_efeito — sem caminho de volta pela invariante 3.5'
);

reset role;

select is(
  (select motivo_cancelamento from public.casos where google_calendar_event_id = 'evt-deletado-ja-cancelado'),
  'motivo anterior, não deve ser sobrescrito',
  'C3: sem_efeito realmente não tocou o motivo já gravado'
);


-- =============================================================================
-- D. Segurança: só service_role, igual a sync_upsert_caso
-- =============================================================================

select set_config('request.jwt.claim.sub',
  (select auth_user_id::text from public.pessoas where nome = 'Operador Teste CancelaSync'), true);
set local role authenticated;

select ok(
  pg_temp.levanta_erro($$ select public.sync_cancelar_caso('evt-deletado-001') $$),
  'D0: operador autenticado NÃO consegue executar sync_cancelar_caso'
);

reset role;
set local role anon;

select ok(
  pg_temp.levanta_erro($$ select public.sync_cancelar_caso('evt-deletado-001') $$),
  'D1: usuário anônimo (anon) também NÃO consegue executar sync_cancelar_caso'
);


select * from finish();
rollback;
