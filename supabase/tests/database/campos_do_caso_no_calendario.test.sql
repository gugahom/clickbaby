-- pgTAP: cesárea, observações e fotolivro no calendário (migration 20260930192224).
--
--   F1 — criar guarda cesárea e observações, e o Foto/Livro vira etapa.
--   F2 — no MASTER + ÁLBUM o Foto/Livro já veio: marcar não duplica.
--   F3 — editar: os campos mudam, o histórico diz quais SEM os textos, e o
--        Foto/Livro só se marca.
--   F4 — a descrição do evento só é do sistema no caso que ele criou: a
--        observação de um caso que veio do Google não mexe no Google.
--   F5 — o sync recebe os campos novos.

begin;
select plan(11);

insert into auth.users (id, email, aud, role, created_at, updated_at)
values (gen_random_uuid(), 'gestao.cp@clickbaby.test', 'authenticated', 'authenticated', now(), now());
insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'Gestao CP', u.id, 'gestao', true from auth.users u where u.email = 'gestao.cp@clickbaby.test';

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
create function pg_temp.pac(p_slug text) returns uuid language sql as $$ select id from public.pacotes where slug = p_slug; $$;
create function pg_temp.mat(p_sigla text) returns uuid language sql as $$ select id from public.maternidades where sigla = p_sigla; $$;
create function pg_temp.caso(p_mae text) returns uuid language sql as $$ select id from public.casos where mae_nome = p_mae; $$;
create function pg_temp.livros(p_mae text) returns int language sql as $$
  select count(*)::int from public.caso_etapas where caso_id = pg_temp.caso(p_mae) and tipo = 'album';
$$;


-- =============================================================================
-- F1. Criar
-- =============================================================================

select pg_temp.como('gestao.cp@clickbaby.test');
select lives_ok(
  $$ select public.criar_caso('Cesarea Um', null, pg_temp.pac('basic'), pg_temp.mat('HSC'), '2029-09-10 10:00-03',
       false, false, '2029-09-10 11:30-03', '  Nome: Cesarea Um  ', true) $$,
  'F1: cria com cesárea, observações e Foto/Livro'
);
select pg_temp.sair();

select is(
  (select to_char(cesarea_em at time zone 'America/Sao_Paulo', 'HH24:MI') || '/' || observacao_calendar from public.casos where mae_nome = 'CESAREA UM'),
  '11:30/Nome: Cesarea Um',
  'F1: a cesárea e a observação (sem espaço sobrando)'
);
select is(pg_temp.livros('CESAREA UM'), 1, 'F1: o Foto/Livro vendido virou etapa num BASIC');


-- =============================================================================
-- F2. MASTER + ÁLBUM
-- =============================================================================

select pg_temp.como('gestao.cp@clickbaby.test');
select public.criar_caso('Master Livro', null, pg_temp.pac('master-album'), pg_temp.mat('HSC'), '2029-09-11 10:00-03',
  false, false, null, null, true);
select pg_temp.sair();
select is(pg_temp.livros('MASTER LIVRO'), 1, 'F2: já vinha no pacote, e continua um só');


-- =============================================================================
-- F3. Editar
-- =============================================================================

select pg_temp.como('gestao.cp@clickbaby.test');
select public.criar_caso('Editar Campos', null, pg_temp.pac('basic'), pg_temp.mat('HSC'), '2029-09-12 10:00-03');
select is(
  public.editar_caso(pg_temp.caso('EDITAR CAMPOS'), 'Editar Campos', null, pg_temp.pac('basic'), pg_temp.mat('HSC'),
    '2029-09-12 10:00-03', false, false, '2029-09-12 13:00-03', 'CPF: 000', true),
  'editado',
  'F3: edita cesárea, observação e marca o Foto/Livro'
);
select public.editar_caso(pg_temp.caso('EDITAR CAMPOS'), 'Editar Campos', null, pg_temp.pac('basic'), pg_temp.mat('HSC'),
  '2029-09-12 10:00-03', false, false, '2029-09-12 13:00-03', 'CPF: 000', false);
select pg_temp.sair();

select is(
  (select payload -> 'campos' from public.eventos where caso_id = pg_temp.caso('EDITAR CAMPOS') and tipo = 'caso_editado'),
  '["cesarea_em", "observacao_calendar", "fotolivro"]'::jsonb,
  'F3: o histórico diz quais campos mudaram'
);
select ok(
  (select payload::text not like '%CPF%' from public.eventos where caso_id = pg_temp.caso('EDITAR CAMPOS') and tipo = 'caso_editado'),
  'F3: e não guarda o texto das observações'
);
select is(pg_temp.livros('EDITAR CAMPOS'), 1, 'F3: desmarcar o Foto/Livro aqui não desfaz a etapa');


-- =============================================================================
-- F4. A descrição do caso que veio do Google é da equipe
-- =============================================================================

insert into public.casos (mae_nome, pacote_id, maternidade_id, previsao_em, google_calendar_event_id)
values ('DO GOOGLE', pg_temp.pac('basic'), pg_temp.mat('HSC'), '2029-09-13 10:00-03', 'evt-do-google');

select pg_temp.como('gestao.cp@clickbaby.test');
select public.editar_caso(pg_temp.caso('DO GOOGLE'), 'Do Google', null, pg_temp.pac('basic'), pg_temp.mat('HSC'),
  '2029-09-13 10:00-03', false, false, '2029-09-13 12:00-03', 'anotação', false);
select pg_temp.sair();
select is(
  (select google_desatualizado from public.casos where id = pg_temp.caso('DO GOOGLE')),
  false,
  'F4: só observação e cesárea num caso do Google não reescrevem o evento da equipe'
);

-- O caso criado pelo sistema (já ligado ao Google) acompanha.
update public.casos set google_pendente = false, google_calendar_event_id = 'evt-cesarea' where id = pg_temp.caso('CESAREA UM');
select pg_temp.como('gestao.cp@clickbaby.test');
select public.editar_caso(pg_temp.caso('CESAREA UM'), 'Cesarea Um', null, pg_temp.pac('basic'), pg_temp.mat('HSC'),
  '2029-09-10 10:00-03', false, false, '2029-09-10 12:00-03', 'Nome: Cesarea Um', true);
select pg_temp.sair();
select is(
  (select google_desatualizado from public.casos where id = pg_temp.caso('CESAREA UM')),
  true,
  'F4: no caso que o sistema criou, a cesárea nova vai para a descrição do evento'
);


-- =============================================================================
-- F5. O sync recebe os campos
-- =============================================================================

-- O id sai ANTES de virar service_role, que localmente não lê `casos` (dívida #5).
create temp table cesarea as select pg_temp.caso('CESAREA UM') as id;
grant select on cesarea to service_role;
set local role service_role;
select is(
  (select descricao_do_sistema::text || '/' || observacao_calendar
     from public.sync_casos_para_atualizar_no_google() where caso_id = (select id from cesarea)),
  'true/Nome: Cesarea Um',
  'F5: o sync sabe que a descrição é do sistema e recebe o texto'
);
reset role;

select * from finish();
rollback;
