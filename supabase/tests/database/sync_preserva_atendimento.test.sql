-- pgTAP: o sync não cancela atendimento que aconteceu (migration 20260915030822).
--
-- O QUE ESTE ARQUIVO PROTEGE
-- Em produção, três casos com trabalho feito foram cancelados porque o evento
-- sumiu do Calendar DEPOIS do parto, e dois se perderam. As guardas daqui são o
-- que impede isso de voltar:
--   - evento removido NÃO cancela caso com trabalho, nem caso cuja previsão já
--     passou — e o cancelamento normal (evento sumiu antes, sem trabalho)
--     continua funcionando;
--   - card cinza NÃO cancela caso com trabalho;
--   - o evento de auditoria é gravado UMA vez, não a cada ciclo de 25s;
--   - só o que o SYNC cancelou se restaura, e só por atendimento ou adm.
--
-- AS RPCs DO SYNC RODAM COMO service_role, E AS LEITURAS NÃO. No banco local o
-- service_role não tem SELECT em `casos` (divergência conhecida, dívida #5 do
-- CLAUDE.md). O resultado de cada chamada vai para `set_config`, e a conferência
-- acontece depois do `reset role` — o mesmo padrão de rpc_sync_upsert_caso.

begin;
select plan(22);

-- =============================================================================
-- Fixtures
-- =============================================================================

insert into auth.users (id, email, aud, role, created_at, updated_at)
values
  (gen_random_uuid(), 'operador.preserva@clickbaby.test', 'authenticated', 'authenticated', now(), now()),
  (gen_random_uuid(), 'atendimento.preserva@clickbaby.test', 'authenticated', 'authenticated', now(), now());

insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'Operador Preserva', u.id, 'operador', true from auth.users u where u.email = 'operador.preserva@clickbaby.test';
insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'Atendimento Preserva', u.id, 'atendimento', true from auth.users u where u.email = 'atendimento.preserva@clickbaby.test';

insert into public.maternidades (nome, sigla) values ('Maternidade Preserva', 'PRSTEST');

-- W: futuro, COM trabalho (nascimento concluído).
-- H: previsão JÁ PASSOU, sem trabalho.
-- F: futuro, sem trabalho — o cancelamento legítimo, que tem de continuar.
-- G: futuro, com link de entrega — recebe card cinza.
insert into public.casos (mae_nome, bebe_nome, pacote_id, maternidade_id, previsao_em, google_calendar_event_id)
select v.mae, 'Bebe', (select id from public.pacotes where slug = 'basic'),
       (select id from public.maternidades where sigla = 'PRSTEST'), v.prev, v.evt
from (values
  ('Mae Com Trabalho',   now() + interval '2 days',  'evt-prs-trabalho'),
  ('Mae Horario Passou', now() - interval '3 hours', 'evt-prs-horario'),
  ('Mae Futuro Vazio',   now() + interval '2 days',  'evt-prs-futuro'),
  ('Mae Cinza Trabalho', now() + interval '2 days',  'evt-prs-cinza')
) as v(mae, prev, evt);

update public.caso_etapas ce
   set status = 'concluida', iniciado_em = now() - interval '1 hour', concluido_em = now()
  from public.casos c
 where c.id = ce.caso_id and c.google_calendar_event_id = 'evt-prs-trabalho' and ce.tipo = 'nascimento';

insert into public.entregaveis (caso_id, tipo, url)
select id, 'google_photos', 'https://exemplo.test/album' from public.casos where google_calendar_event_id = 'evt-prs-cinza';

-- R: cancelado PELO SYNC, com nascimento concluído — restaura para edição.
-- M: cancelado PELA EQUIPE — não se restaura.
insert into public.casos (mae_nome, pacote_id, maternidade_id, previsao_em, google_calendar_event_id,
                          status_operacional, motivo_cancelamento)
select v.mae, (select id from public.pacotes where slug = 'basic'),
       (select id from public.maternidades where sigla = 'PRSTEST'), now() - interval '1 day', v.evt,
       'cancelado', v.motivo
from (values
  ('Mae Restauravel',      'evt-prs-restauravel', 'Evento removido do Google Calendar (sem correspondência na sincronização)'),
  ('Mae Cancelada Humana', 'evt-prs-humana',      'família desistiu do contrato')
) as v(mae, evt, motivo);

update public.caso_etapas ce
   set status = 'concluida', iniciado_em = now() - interval '1 hour', concluido_em = now()
  from public.casos c
 where c.id = ce.caso_id and c.google_calendar_event_id = 'evt-prs-restauravel' and ce.tipo = 'nascimento';

create function pg_temp.como(p_email text) returns void language plpgsql as $$
declare v_id uuid;
begin
  select id into v_id from auth.users where email = p_email;
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L', json_build_object('sub', v_id, 'role', 'authenticated')::text);
end;
$$;

create function pg_temp.status(p_evt text) returns text language sql as $$
  select status_operacional::text from public.casos where google_calendar_event_id = p_evt;
$$;

create function pg_temp.caso(p_evt text) returns uuid language sql as $$
  select id from public.casos where google_calendar_event_id = p_evt;
$$;

-- A previsão do caso G, lida AGORA, como superusuário: as chamadas de card
-- cinza abaixo rodam como service_role, que não lê `casos`.
select set_config('prs.prev_cinza',
  (select previsao_em::text from public.casos where google_calendar_event_id = 'evt-prs-cinza'), true);


-- =============================================================================
-- 1. Evento removido
-- =============================================================================

set local role service_role;
select set_config('prs.p1', public.sync_cancelar_caso('evt-prs-trabalho'), true);
select set_config('prs.p3', public.sync_cancelar_caso('evt-prs-trabalho'), true);
select set_config('prs.p6', public.sync_cancelar_caso('evt-prs-horario'), true);
select set_config('prs.p8', public.sync_cancelar_caso('evt-prs-futuro'), true);
reset role;

select is(current_setting('prs.p1'), 'preservado',
  'P1: evento removido de caso COM TRABALHO não cancela');
select is(pg_temp.status('evt-prs-trabalho'), 'agendado',
  'P2: e o status do caso fica como estava');
select is(current_setting('prs.p3'), 'preservado',
  'P3: o ciclo seguinte do cron também preserva');
select is(
  (select count(*)::int from public.eventos
    where caso_id = pg_temp.caso('evt-prs-trabalho') and tipo = 'evento_calendar_removido'),
  1,
  'P4: o evento de auditoria é gravado UMA vez, não a cada 25s');
select is(
  (select payload ->> 'preservado_por' from public.eventos
    where caso_id = pg_temp.caso('evt-prs-trabalho') and tipo = 'evento_calendar_removido'),
  'caso_com_trabalho',
  'P5: e diz por que preservou');
select is(current_setting('prs.p6'), 'preservado',
  'P6: evento removido com a PREVISÃO JÁ PASSADA não cancela, mesmo sem trabalho (registro retroativo, seção 9)');
select is(
  (select payload ->> 'preservado_por' from public.eventos
    where caso_id = pg_temp.caso('evt-prs-horario') and tipo = 'evento_calendar_removido'),
  'horario_ja_passou',
  'P7: e registra a trava de horário');
select is(current_setting('prs.p8'), 'caso_cancelado',
  'P8: evento removido ANTES do parto e sem trabalho continua cancelando — o comportamento legítimo não mudou');
select is(pg_temp.status('evt-prs-futuro'), 'cancelado',
  'P9: e o caso fica cancelado');


-- =============================================================================
-- 2. Card cinza
-- =============================================================================

set local role service_role;
select set_config('prs.c1', public.sync_upsert_caso('evt-prs-cinza', 'Mae Cinza Trabalho', 'Bebe', null, null,
  current_setting('prs.prev_cinza')::timestamptz, '8', true), true);
select set_config('prs.c4', public.sync_upsert_caso('evt-prs-cinza', 'Mae Cinza Trabalho', 'Bebe', null, null,
  current_setting('prs.prev_cinza')::timestamptz, '8', true), true);
reset role;

select is(current_setting('prs.c1'), 'caso_atualizado',
  'C1: card cinza em caso COM TRABALHO não cancela — segue para o update normal');
select is(pg_temp.status('evt-prs-cinza'), 'agendado',
  'C2: o status fica como estava');
select is(
  (select cor_calendar from public.casos where google_calendar_event_id = 'evt-prs-cinza'),
  '8',
  'C3: e a cor do Calendar continua chegando ao card');
select is(current_setting('prs.c4'), 'sem_efeito',
  'C4: o ciclo seguinte, sem nada novo, é sem_efeito');
select is(
  (select count(*)::int from public.eventos
    where caso_id = pg_temp.caso('evt-prs-cinza') and tipo = 'card_cinza_ignorado'),
  1,
  'C5: o card cinza ignorado é registrado uma vez');


-- =============================================================================
-- 3. Restaurar
-- =============================================================================

select ok(
  not has_function_privilege('authenticated', 'public.caso_tem_trabalho(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.restaurar_caso_cancelado_pelo_sync(uuid, text)', 'EXECUTE'),
  'R0: caso_tem_trabalho é interna, e anon não restaura');

select pg_temp.como('operador.preserva@clickbaby.test');
select throws_ok(
  format($$ select public.restaurar_caso_cancelado_pelo_sync(%L::uuid, 'tentativa') $$, pg_temp.caso('evt-prs-futuro')),
  'P0001', null,
  'R1: operador NÃO restaura — é o mesmo par de papéis que cancela');
reset role;

select pg_temp.como('atendimento.preserva@clickbaby.test');
select throws_ok(
  format($$ select public.restaurar_caso_cancelado_pelo_sync(%L::uuid, '   ') $$, pg_temp.caso('evt-prs-futuro')),
  'P0001', null,
  'R2: sem motivo, não restaura');
select throws_ok(
  format($$ select public.restaurar_caso_cancelado_pelo_sync(%L::uuid, 'tentativa') $$, pg_temp.caso('evt-prs-humana')),
  'P0001', null,
  'R3: cancelamento HUMANO não se restaura — é decisão comercial');
select lives_ok(
  format($$ select public.restaurar_caso_cancelado_pelo_sync(%L::uuid, 'o parto aconteceu') $$, pg_temp.caso('evt-prs-restauravel')),
  'R4: atendimento restaura um caso que o sync cancelou');
reset role;

select is(
  (select status_operacional::text || '/' || coalesce(motivo_cancelamento, 'sem motivo')
     from public.casos where google_calendar_event_id = 'evt-prs-restauravel'),
  'em_edicao/sem motivo',
  'R5: volta para EDIÇÃO (nascimento concluído) e perde o motivo de cancelamento');

select pg_temp.como('atendimento.preserva@clickbaby.test');
select lives_ok(
  format($$ select public.restaurar_caso_cancelado_pelo_sync(%L::uuid, 'evento apagado por engano') $$, pg_temp.caso('evt-prs-futuro')),
  'R6: restaura também o caso sem trabalho');
reset role;

set local role service_role;
select set_config('prs.r7', public.sync_cancelar_caso('evt-prs-futuro'), true);
reset role;

select is(current_setting('prs.r7'), 'preservado',
  'R7: e o sync NÃO o cancela de novo no ciclo seguinte — a restauração é ação humana e conta como trabalho');

select * from finish();
rollback;
