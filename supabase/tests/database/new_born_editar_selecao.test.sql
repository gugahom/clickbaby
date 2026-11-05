-- pgTAP: "Editar seleção", "Enviado à família" e as marcas do sino do New Born
-- (migrations 20261105120001 e 20261105120002).
--
--   S1 — a seleção exige o link da galeria, chega pausada e o play abre o relógio.
--   E1 — "enviado à família" carimba quem e quando, grava o evento uma vez só.
--   E2 — só na fase da escolha e só no New Born; o anon não alcança.
--   E3 — galeria nova zera o carimbo.
--   M1 — as marcas nascem desligadas; quem tem a tela Equipe liga, a fotógrafa não.

begin;
select plan(13);

insert into auth.users (id, email, aud, role, created_at, updated_at)
values
  (gen_random_uuid(), 'gestao.nbsel@clickbaby.test', 'authenticated', 'authenticated', now(), now()),
  (gen_random_uuid(), 'foto.nbsel@clickbaby.test', 'authenticated', 'authenticated', now(), now());

insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select v.nome, u.id, v.papel::public.papel_sistema, true
from (values ('Gestao NBSEL', 'gestao.nbsel@clickbaby.test', 'gestao'),
             ('Foto NBSEL', 'foto.nbsel@clickbaby.test', 'operador')) as v(nome, email, papel)
join auth.users u on u.email = v.email;

insert into public.maternidades (nome, sigla) values ('Maternidade NBSEL', 'NBSEL');
insert into public.casos (mae_nome, pacote_id, maternidade_id, previsao_em, click_home)
values ('Mae NBSEL', (select id from public.pacotes where slug = 'standard'),
        (select id from public.maternidades where sigla = 'NBSEL'), '2029-09-10 08:00-03', true);

create function pg_temp.ensaio() returns uuid language sql as $$
  select ce.id from public.caso_etapas ce
  join public.casos c on c.id = ce.caso_id
  where c.mae_nome = 'Mae NBSEL' and ce.tipo = 'click_home';
$$;
create function pg_temp.outra_etapa() returns uuid language sql as $$
  select ce.id from public.caso_etapas ce
  join public.casos c on c.id = ce.caso_id
  where c.mae_nome = 'Mae NBSEL' and ce.tipo = 'nascimento';
$$;
grant execute on function pg_temp.ensaio() to authenticated;
grant execute on function pg_temp.outra_etapa() to authenticated;

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

-- S1 e E2: antes da galeria
select pg_temp.como('foto.nbsel@clickbaby.test');
select throws_ok(
  $$ select public.mover_click_home(pg_temp.ensaio(), 'editar_selecao') $$,
  'Para mandar o Click Home para escolha é preciso o link da galeria.',
  'S1: sem o link da galeria não há seleção a editar'
);
select throws_ok(
  $$ select public.marcar_click_home_enviado(pg_temp.ensaio()) $$,
  'Só se marca o envio do New Born que está em "Enviar para escolha".',
  'E2: fora da escolha não se marca o envio'
);
select throws_ok(
  $$ select public.marcar_click_home_enviado(pg_temp.outra_etapa()) $$,
  'Só a galeria do New Born é enviada à família por aqui.',
  'E2: e só no New Born'
);

-- E1
select public.enviar_click_home_para_escolha(pg_temp.ensaio(), 'https://galeria.exemplo/nbsel');
select lives_ok($$ select public.marcar_click_home_enviado(pg_temp.ensaio()) $$, 'E1: quem faz o meio de campo marca o envio');
select lives_ok($$ select public.marcar_click_home_enviado(pg_temp.ensaio()) $$, 'E1: marcar de novo não erra');
select pg_temp.sair();

select is(
  (select p.nome from public.caso_etapas ce join public.pessoas p on p.id = ce.click_home_enviado_por
   where ce.id = pg_temp.ensaio() and ce.click_home_enviado_em is not null),
  'Foto NBSEL',
  'E1: o carimbo diz quem mandou'
);
select is(
  (select count(*)::int from public.eventos where caso_etapa_id = pg_temp.ensaio() and tipo = 'click_home_enviado_a_familia'),
  1,
  'E1: um evento só'
);

-- E3
select pg_temp.como('foto.nbsel@clickbaby.test');
select public.enviar_click_home_para_escolha(pg_temp.ensaio(), 'https://galeria.exemplo/nbsel-2');
select pg_temp.sair();
select is(
  (select click_home_enviado_em from public.caso_etapas where id = pg_temp.ensaio()),
  null,
  'E3: galeria nova com o ensaio já na escolha zera o envio'
);

-- S1
select pg_temp.como('foto.nbsel@clickbaby.test');
select public.mover_click_home(pg_temp.ensaio(), 'editar_selecao');
select pg_temp.sair();
select is(
  (select status::text from public.caso_etapas where id = pg_temp.ensaio()),
  'pausada',
  'S1: a seleção chega pausada: o relógio espera quem edita'
);
select pg_temp.como('foto.nbsel@clickbaby.test');
select public.iniciar_etapa(pg_temp.ensaio());
select pg_temp.sair();
select is(
  (select status::text || '/' || fase_click_home::text from public.caso_etapas where id = pg_temp.ensaio()),
  'em_andamento/editar_selecao',
  'S1: o play abre o relógio sem tirar o ensaio da coluna'
);

-- M1
select is(
  (select avisa_escolha_new_born or avisa_edicao_new_born from public.pessoas where nome = 'Foto NBSEL'),
  false,
  'M1: as marcas nascem desligadas'
);
select pg_temp.como('foto.nbsel@clickbaby.test');
update public.pessoas set avisa_edicao_new_born = true where nome = 'Foto NBSEL';
select pg_temp.sair();
select is(
  (select avisa_edicao_new_born from public.pessoas where nome = 'Foto NBSEL'),
  false,
  'M1: quem não tem a tela Equipe não liga a própria marca'
);
select pg_temp.como('gestao.nbsel@clickbaby.test');
update public.pessoas set avisa_edicao_new_born = true where nome = 'Foto NBSEL';
select pg_temp.sair();
select is(
  (select avisa_edicao_new_born from public.pessoas where nome = 'Foto NBSEL'),
  true,
  'M1: a gestão liga'
);

select * from finish();
rollback;
