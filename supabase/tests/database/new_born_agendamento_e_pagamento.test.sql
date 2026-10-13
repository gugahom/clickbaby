-- pgTAP: o agendamento e o pagamento do New Born (migrations 20261013172946 e
-- 20261013172953).
--
--   G — agendar grava a data E a fase, sem começar o relógio nem atribuir quem
--       agendou; reagendar troca a data; "agendado" sem data é recusado.
--   G — depois do ensaio, a edição anda como antes; e não se reagenda mais.
--   P — o pagamento: só atendimento/adm, só no New Born, com evento, e o
--       valor igual não grava outro evento.

begin;
select plan(13);

insert into auth.users (id, email, aud, role, created_at, updated_at)
values
  (gen_random_uuid(), 'editora.nb@clickbaby.test', 'authenticated', 'authenticated', now(), now()),
  (gen_random_uuid(), 'atendimento.nb@clickbaby.test', 'authenticated', 'authenticated', now(), now());

insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select v.nome, u.id, v.papel::public.papel_sistema, true
from (values ('Editora NB', 'editora.nb@clickbaby.test', 'operador'),
             ('Atendimento NB', 'atendimento.nb@clickbaby.test', 'atendimento')) as v(nome, email, papel)
join auth.users u on u.email = v.email;

insert into public.maternidades (nome, sigla) values ('Maternidade NB', 'NBTEST');

insert into public.casos (mae_nome, pacote_id, maternidade_id, click_home)
values ('Mae NB', (select id from public.pacotes where slug = 'standard'),
        (select id from public.maternidades where sigla = 'NBTEST'), true);

create function pg_temp.como(p_email text) returns void language plpgsql as $$
declare v_id uuid;
begin
  select id into v_id from auth.users where email = p_email;
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L', json_build_object('sub', v_id, 'role', 'authenticated')::text);
end;
$$;
create function pg_temp.sair() returns void language plpgsql as $$
begin
  execute 'reset role';
  execute 'set local request.jwt.claims = ''{}''';
end;
$$;
create function pg_temp.ensaio() returns uuid language sql as $$
  select ce.id from public.caso_etapas ce join public.casos c on c.id = ce.caso_id
   where c.mae_nome = 'Mae NB' and ce.tipo = 'click_home';
$$;
grant execute on function pg_temp.ensaio() to authenticated;


-- =============================================================================
-- G. Agendar
-- =============================================================================

select pg_temp.como('editora.nb@clickbaby.test');

select throws_ok(
  $$ select public.mover_click_home(pg_temp.ensaio(), 'agendado') $$,
  'P0001', 'Para agendar o New Born é preciso a data do ensaio.',
  'G1: arrastar para "agendado" sem data é recusado'
);

select lives_ok(
  $$ select public.agendar_click_home(pg_temp.ensaio(), '2029-08-14 15:00-03') $$,
  'G2: agendar grava a data e a fase'
);
select pg_temp.sair();

select is(
  (select fase_click_home::text || ' / ' || status::text || ' / ' || (iniciado_em is null)::text || ' / ' || (responsavel_id is null)::text
     || ' / ' || to_char(previsao_em at time zone 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI')
     from public.caso_etapas where id = pg_temp.ensaio()),
  'agendado / pendente / true / true / 2029-08-14 15:00',
  'G2: agendado, pendente, sem relógio, sem atribuir quem agendou, com a data'
);

select pg_temp.como('editora.nb@clickbaby.test');
select public.agendar_click_home(pg_temp.ensaio(), '2029-08-16 10:00-03');
select pg_temp.sair();

select is(
  (select to_char(previsao_em at time zone 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI') from public.caso_etapas where id = pg_temp.ensaio()),
  '2029-08-16 10:00',
  'G3: reagendar troca a data'
);
select is(
  (select count(*)::int from public.eventos where caso_etapa_id = pg_temp.ensaio() and tipo = 'etapa_agendada'),
  2,
  'G3: cada agendamento fica no histórico, com a data anterior'
);
select is(
  (select count(*)::int from public.eventos where caso_etapa_id = pg_temp.ensaio() and tipo = 'fase_do_click_home_movida'),
  1,
  'G3: e reagendar não move a fase de novo'
);

-- O ensaio aconteceu: quem fez move para a edição.
select pg_temp.como('editora.nb@clickbaby.test');
select public.mover_click_home(pg_temp.ensaio(), 'aguardando_edicao');
select public.mover_click_home(pg_temp.ensaio(), 'editando');
select pg_temp.sair();

select is(
  (select status::text || ' / ' || (iniciado_em is not null)::text from public.caso_etapas where id = pg_temp.ensaio()),
  'em_andamento / true',
  'G4: depois do ensaio a edição anda como antes, e o relógio começa'
);

select pg_temp.como('editora.nb@clickbaby.test');
select throws_ok(
  $$ select public.agendar_click_home(pg_temp.ensaio(), '2029-08-20 10:00-03') $$,
  'P0001', 'O ensaio deste New Born já aconteceu — a edição está em andamento.',
  'G5: com a edição começada, não se reagenda'
);


-- =============================================================================
-- P. O pagamento
-- =============================================================================

select throws_ok(
  $$ select public.registrar_pagamento_do_click_home(pg_temp.ensaio(), 'pago') $$,
  'P0001', 'Quem informa o pagamento do New Born é o atendimento ou a gestão.',
  'P1: a fotógrafa não informa o pagamento'
);
select pg_temp.sair();

select pg_temp.como('atendimento.nb@clickbaby.test');
select lives_ok($$ select public.registrar_pagamento_do_click_home(pg_temp.ensaio(), 'a_cobrar') $$, 'P2: o atendimento informa');
select lives_ok($$ select public.registrar_pagamento_do_click_home(pg_temp.ensaio(), 'a_cobrar') $$, 'P2: o mesmo valor não erra');
select public.registrar_pagamento_do_click_home(pg_temp.ensaio(), 'pago');
select pg_temp.sair();

select is(
  (select pagamento_click_home::text from public.caso_etapas where id = pg_temp.ensaio()),
  'pago',
  'P3: o pagamento muda de "a cobrar" para "pago"'
);
select is(
  (select count(*)::int from public.eventos where caso_etapa_id = pg_temp.ensaio() and tipo = 'pagamento_do_click_home_registrado'),
  2,
  'P3: duas mudanças, dois eventos — o clique repetido não conta'
);

select * from finish();
rollback;
