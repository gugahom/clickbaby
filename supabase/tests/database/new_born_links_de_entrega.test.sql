-- pgTAP: os links de entrega do New Born (migrations 20261111140001 e 20261111140002).
--
--   L1 — pronto sem os dois links é recusado, mesmo com a galeria.
--   L2 — a RPC cobra os dois links, com http.
--   L3 — grava o Google Fotos e o WeTransfer e leva a pronto, pausado.
--   L4 — mandar de novo troca o par não conferido, sem acumular.
--   L5 — a confirmação da Morgana confirma a galeria e os dois links.
--   L6 — o anon não alcança a RPC.

begin;
select plan(10);

insert into auth.users (id, email, aud, role, created_at, updated_at)
values
  (gen_random_uuid(), 'atend.nblink@clickbaby.test', 'authenticated', 'authenticated', now(), now()),
  (gen_random_uuid(), 'foto.nblink@clickbaby.test', 'authenticated', 'authenticated', now(), now());

insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select v.nome, u.id, v.papel::public.papel_sistema, true
from (values ('Atend NBLINK', 'atend.nblink@clickbaby.test', 'atendimento'),
             ('Foto NBLINK', 'foto.nblink@clickbaby.test', 'operador')) as v(nome, email, papel)
join auth.users u on u.email = v.email;

insert into public.maternidades (nome, sigla) values ('Maternidade NBLINK', 'NBLINK');
insert into public.casos (mae_nome, pacote_id, maternidade_id, previsao_em, click_home)
values ('Mae NBLINK', (select id from public.pacotes where slug = 'standard'),
        (select id from public.maternidades where sigla = 'NBLINK'), '2029-09-12 08:00-03', true);

create function pg_temp.ensaio() returns uuid language sql as $$
  select ce.id from public.caso_etapas ce
  join public.casos c on c.id = ce.caso_id
  where c.mae_nome = 'Mae NBLINK' and ce.tipo = 'click_home';
$$;
create function pg_temp.caso() returns uuid language sql as $$
  select id from public.casos where mae_nome = 'Mae NBLINK';
$$;
grant execute on function pg_temp.ensaio() to authenticated, anon;
grant execute on function pg_temp.caso() to authenticated;

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

select pg_temp.como('foto.nblink@clickbaby.test');
select public.enviar_click_home_para_escolha(pg_temp.ensaio(), 'https://galeria.exemplo/nblink');
select public.mover_click_home(pg_temp.ensaio(), 'editar_selecao');

-- L1
select throws_ok(
  $$ select public.mover_click_home(pg_temp.ensaio(), 'pronto_para_entrega') $$,
  'Para o New Born ficar pronto para entrega são obrigatórios o link do Google Fotos e o WeTransfer.',
  'L1: pronto sem os dois links não passa'
);

-- L2
select throws_ok(
  $$ select public.enviar_click_home_para_entrega(pg_temp.ensaio(), 'https://photos.exemplo/a', '  ') $$,
  'São obrigatórios o link do Google Fotos e o WeTransfer do New Born.',
  'L2: os dois links são obrigatórios'
);
select throws_ok(
  $$ select public.enviar_click_home_para_entrega(pg_temp.ensaio(), 'photos.exemplo/a', 'https://we.exemplo/a') $$,
  'Os links precisam começar com http:// ou https://.',
  'L2: e começam com http'
);

-- L3
select lives_ok(
  $$ select public.enviar_click_home_para_entrega(pg_temp.ensaio(), 'https://photos.exemplo/a', 'https://we.exemplo/a') $$,
  'L3: com os dois links, vai para pronto'
);
select pg_temp.sair();

select ok(
  (select fase_click_home = 'pronto_para_entrega' and status = 'pausada'
     from public.caso_etapas where id = pg_temp.ensaio()),
  'L3: em pronto para entrega, pausado'
);
select is(
  (select string_agg(tipo::text, ',' order by tipo::text) from public.entregaveis
    where caso_id = pg_temp.caso() and tipo in ('click_home_google', 'click_home_wetransfer')),
  'click_home_google,click_home_wetransfer',
  'L3: os dois links gravados'
);

-- L4
select pg_temp.como('foto.nblink@clickbaby.test');
select public.mover_click_home(pg_temp.ensaio(), 'editar_selecao');
select public.enviar_click_home_para_entrega(pg_temp.ensaio(), 'https://photos.exemplo/b', 'https://we.exemplo/b');
select pg_temp.sair();

select is(
  (select count(*)::int from public.entregaveis
    where caso_id = pg_temp.caso() and tipo in ('click_home_google', 'click_home_wetransfer')),
  2,
  'L4: o par novo troca o não conferido'
);

-- L5
select pg_temp.como('atend.nblink@clickbaby.test');
select public.confirmar_entrega_do_click_home(pg_temp.ensaio());
select pg_temp.sair();

select is(
  (select count(*)::int from public.entregaveis
    where caso_id = pg_temp.caso()
      and tipo in ('click_home', 'click_home_google', 'click_home_wetransfer')
      and confirmado_em is not null),
  3,
  'L5: a galeria e os dois links viram confirmados'
);
select ok(
  (select fase_click_home = 'finalizado' from public.caso_etapas where id = pg_temp.ensaio()),
  'L5: e o New Born finaliza'
);

-- L6
select ok(
  not has_function_privilege('anon', 'public.enviar_click_home_para_entrega(uuid, text, text)', 'execute'),
  'L6: o anon não executa'
);

select * from finish();
rollback;
