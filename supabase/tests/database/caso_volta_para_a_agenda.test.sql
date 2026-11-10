-- pgTAP: o caso volta para a agenda (migration 20261110120001).
--
--   A1 — a fotógrafa não devolve; dia de hoje ou de antes é recusado.
--   A2 — o atendimento devolve: o dia muda, a etapa em andamento pausa, a
--        entrada concluída volta pausada com o início mantido, o nascimento
--        previsto anda junto, a despesa fica, e o evento é gravado.
--   A3 — bebê já nascido não volta.

begin;
select plan(10);

insert into auth.users (id, email, aud, role, created_at, updated_at)
values
  (gen_random_uuid(), 'atend.agenda@clickbaby.test', 'authenticated', 'authenticated', now(), now()),
  (gen_random_uuid(), 'foto.agenda@clickbaby.test', 'authenticated', 'authenticated', now(), now());

insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select v.nome, u.id, v.papel::public.papel_sistema, true
from (values ('Atend AGENDA', 'atend.agenda@clickbaby.test', 'atendimento'),
             ('Foto AGENDA', 'foto.agenda@clickbaby.test', 'operador')) as v(nome, email, papel)
join auth.users u on u.email = v.email;

insert into public.maternidades (nome, sigla) values ('Maternidade AGENDA', 'AGENDA');
insert into public.casos (mae_nome, pacote_id, maternidade_id, previsao_em, cesarea_em)
select v.mae, (select id from public.pacotes where slug = 'baby-reels'),
       (select id from public.maternidades where sigla = 'AGENDA'), now(), now() + interval '3 hours'
from (values ('Mae AGENDA'), ('Mae AGENDA Nasceu')) as v(mae);

create function pg_temp.caso(p_mae text) returns uuid language sql as $$
  select id from public.casos where mae_nome = p_mae;
$$;
create function pg_temp.etapa(p_mae text, p_tipo text) returns uuid language sql as $$
  select ce.id from public.caso_etapas ce join public.casos c on c.id = ce.caso_id
  where c.mae_nome = p_mae and ce.tipo::text = p_tipo and ce.rodada = 1;
$$;
grant execute on function pg_temp.caso(text) to authenticated;
grant execute on function pg_temp.etapa(text, text) to authenticated;

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

-- O dia de hoje: a entrada feita, o nascimento começado, um Uber lançado.
select pg_temp.como('foto.agenda@clickbaby.test');
select public.iniciar_etapa(pg_temp.etapa('Mae AGENDA', 'entrada'));
select public.concluir_etapa(pg_temp.etapa('Mae AGENDA', 'entrada'), null);
select public.iniciar_etapa(pg_temp.etapa('Mae AGENDA', 'nascimento'));
select public.registrar_despesa(pg_temp.caso('Mae AGENDA'), 'uber_ida', 40, null, null, null);

select public.iniciar_etapa(pg_temp.etapa('Mae AGENDA Nasceu', 'nascimento'));
select public.concluir_etapa(pg_temp.etapa('Mae AGENDA Nasceu', 'nascimento'), null);

-- A1
select throws_ok(
  $$ select public.devolver_para_a_agenda(pg_temp.caso('Mae AGENDA'), now() + interval '5 days') $$,
  'Só o atendimento e a gestão devolvem um caso para a agenda.',
  'A1: a fotógrafa não devolve'
);
select pg_temp.sair();

select pg_temp.como('atend.agenda@clickbaby.test');
select throws_ok(
  $$ select public.devolver_para_a_agenda(pg_temp.caso('Mae AGENDA'), now()) $$,
  'O caso volta num dia depois de hoje.',
  'A1: hoje não é outro dia'
);

-- A3
select throws_ok(
  $$ select public.devolver_para_a_agenda(pg_temp.caso('Mae AGENDA Nasceu'), now() + interval '5 days') $$,
  'O bebê já nasceu — o caso não volta para a agenda.',
  'A3: bebê nascido não volta'
);

-- A2
select lives_ok(
  $$ select public.devolver_para_a_agenda(pg_temp.caso('Mae AGENDA'), now() + interval '5 days', false, 'Mandada para casa') $$,
  'A2: o atendimento devolve para daqui a cinco dias'
);
select pg_temp.sair();

select is(
  (select (previsao_em at time zone 'America/Sao_Paulo')::date - (now() at time zone 'America/Sao_Paulo')::date
   from public.casos where id = pg_temp.caso('Mae AGENDA')),
  5,
  'A2: o dia do caso mudou'
);
select ok(
  (select cesarea_em > now() + interval '4 days' from public.casos where id = pg_temp.caso('Mae AGENDA')),
  'A2: o nascimento previsto andou junto'
);
select is(
  (select status::text from public.caso_etapas where id = pg_temp.etapa('Mae AGENDA', 'nascimento')),
  'pausada',
  'A2: o nascimento começado pausa'
);
select ok(
  (select status = 'pausada' and concluido_em is null and iniciado_em is not null and pausado_em is not null
   from public.caso_etapas where id = pg_temp.etapa('Mae AGENDA', 'entrada')),
  'A2: a entrada volta para ser refeita, pausada e com o início mantido'
);
select is(
  (select count(*)::int from public.despesas where caso_id = pg_temp.caso('Mae AGENDA')),
  1,
  'A2: a despesa fica'
);
select is(
  (select payload->>'motivo' from public.eventos
   where caso_id = pg_temp.caso('Mae AGENDA') and tipo = 'caso_voltou_para_a_agenda'),
  'Mandada para casa',
  'A2: o evento guarda o motivo'
);

select * from finish();
rollback;
