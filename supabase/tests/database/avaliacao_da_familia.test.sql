-- pgTAP: a avaliação da família (migration 20260928153831).
--
-- O que este arquivo protege:
--   A — confirmar a entrega carimba o encerramento (é dele que saem os 15 dias).
--   B — quem registra a avaliação é atendimento ou adm, e só em caso entregue.
--   C — entrega NOVA zera a avaliação: quinze dias novos, resposta nova.
--   D — a view leva os dois carimbos para a tela.

begin;
select plan(12);

insert into auth.users (id, email, aud, role, created_at, updated_at)
values
  (gen_random_uuid(), 'fotografa.av@clickbaby.test', 'authenticated', 'authenticated', now(), now()),
  (gen_random_uuid(), 'atendimento.av@clickbaby.test', 'authenticated', 'authenticated', now(), now());

insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'Fotografa AV', u.id, 'operador', true from auth.users u where u.email = 'fotografa.av@clickbaby.test';
insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'Atendimento AV', u.id, 'atendimento', true from auth.users u where u.email = 'atendimento.av@clickbaby.test';

insert into public.maternidades (nome, sigla) values ('Maternidade AV', 'AVTEST');

insert into public.casos (mae_nome, pacote_id, maternidade_id)
select v.mae, (select id from public.pacotes where slug = 'basic'),
       (select id from public.maternidades where sigla = 'AVTEST')
from (values ('Mae AV Um'), ('Mae AV Dois')) as v(mae);

create function pg_temp.como(p_email text) returns void language plpgsql as $$
declare v_id uuid;
begin
  select id into v_id from auth.users where email = p_email;
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L',
    json_build_object('sub', v_id, 'role', 'authenticated')::text);
end;
$$;

create function pg_temp.caso(p_mae text) returns uuid language sql as $$
  select id from public.casos where mae_nome = p_mae;
$$;

-- O trabalho feito e o link, que é o que confirmar_entrega exige.
update public.caso_etapas set status = 'dispensada'
 where caso_id in (pg_temp.caso('Mae AV Um'), pg_temp.caso('Mae AV Dois'));

insert into public.entregaveis (caso_id, tipo, url, criado_por)
select c.id, 'google_photos', 'https://photos.exemplo/' || c.id,
       (select id from public.pessoas where nome = 'Atendimento AV')
from public.casos c where c.mae_nome in ('Mae AV Um', 'Mae AV Dois');


-- =============================================================================
-- A. O carimbo do encerramento
-- =============================================================================

select is(
  (select encerrado_em from public.casos where mae_nome = 'Mae AV Um'),
  null,
  'A1: caso aberto não tem data de encerramento'
);

select pg_temp.como('atendimento.av@clickbaby.test');
select public.confirmar_entrega(pg_temp.caso('Mae AV Um'));
reset role;

select ok(
  (select encerrado_em is not null and status_operacional = 'encerrado'
     from public.casos where mae_nome = 'Mae AV Um'),
  'A2: confirmar a entrega carimba o encerramento — é daqui que saem os 15 dias'
);

select is(
  (select avaliacao_em from public.casos where mae_nome = 'Mae AV Um'),
  null,
  'A3: e o caso nasce esperando a avaliação'
);


-- =============================================================================
-- B. Quem registra, e em que caso
-- =============================================================================

select pg_temp.como('fotografa.av@clickbaby.test');
select throws_ok(
  format($$ select public.registrar_avaliacao(%L::uuid) $$, pg_temp.caso('Mae AV Um')),
  'P0001',
  'Só atendimento ou adm podem registrar a avaliação da família.',
  'B1: a fotógrafa não registra a avaliação'
);
reset role;

select pg_temp.como('atendimento.av@clickbaby.test');

-- O segundo caso segue ABERTO: não há entrega para avaliar.
select throws_ok(
  format($$ select public.registrar_avaliacao(%L::uuid) $$, pg_temp.caso('Mae AV Dois')),
  'P0001',
  'Só se registra avaliação de caso entregue — este está em "agendado".',
  'B2: caso que não foi entregue não tem avaliação'
);

select lives_ok(
  format($$ select public.registrar_avaliacao(%L::uuid) $$, pg_temp.caso('Mae AV Um')),
  'B3: o atendimento registra'
);

reset role;

select ok(
  (select avaliacao_em is not null
      and avaliacao_por = (select id from public.pessoas where nome = 'Atendimento AV')
     from public.casos where mae_nome = 'Mae AV Um'),
  'B4: fica gravado quem marcou'
);

select is(
  (select count(*)::int from public.eventos
    where caso_id = pg_temp.caso('Mae AV Um') and tipo = 'avaliacao_registrada'),
  1,
  'B5: e vira evento no histórico'
);

-- Idempotente: o segundo toque não reescreve quem marcou primeiro.
select pg_temp.como('atendimento.av@clickbaby.test');
select public.registrar_avaliacao(pg_temp.caso('Mae AV Um'));
reset role;

select is(
  (select count(*)::int from public.eventos
    where caso_id = pg_temp.caso('Mae AV Um') and tipo = 'avaliacao_registrada'),
  1,
  'B6: marcar duas vezes não duplica o registro'
);


-- =============================================================================
-- C. Entrega nova, avaliação nova
-- =============================================================================

select pg_temp.como('atendimento.av@clickbaby.test');
select public.reabrir_caso(pg_temp.caso('Mae AV Um'), 'Família pediu alteração nas fotos', array['edicao_foto']::public.etapa_tipo[]);
reset role;

-- Refaz o trabalho e entrega de novo.
update public.caso_etapas set status = 'dispensada'
 where caso_id = pg_temp.caso('Mae AV Um') and status not in ('concluida', 'dispensada');

select pg_temp.como('atendimento.av@clickbaby.test');
select public.confirmar_entrega(pg_temp.caso('Mae AV Um'));
reset role;

select is(
  (select avaliacao_em from public.casos where mae_nome = 'Mae AV Um'),
  null,
  'C1: a entrega nova zera a avaliação — a resposta da anterior não vale para esta'
);


-- =============================================================================
-- D. A tela enxerga os dois carimbos
-- =============================================================================

select pg_temp.como('atendimento.av@clickbaby.test');

select ok(
  (select encerrado_em is not null from public.quadro_casos where id = pg_temp.caso('Mae AV Um')),
  'D1: a view leva o encerramento'
);

select has_column('public', 'quadro_casos', 'avaliacao_em', 'D2: e leva a avaliação');

reset role;

select * from finish();
rollback;
