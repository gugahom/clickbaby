-- pgTAP: a agenda inteira e a hora a definir (migration 20260930184200).
--
--   H1 — o dia sem hora vira a meia-noite de Brasília daquele dia, e só ela.
--   H2 — criar com hora a definir: marca, meia-noite, e o sync recebe a marca
--        para escrever o evento como de dia inteiro.
--   H3 — editar dá a hora (e a tira), e o Google acompanha.
--   H4 — o sync marca e desmarca pelo evento, e respeita a quarentena.
--   H5 — a view do Quadro leva a marca, e o dia continua certo.

begin;
select plan(13);

insert into auth.users (id, email, aud, role, created_at, updated_at)
values (gen_random_uuid(), 'gestao.ah@clickbaby.test', 'authenticated', 'authenticated', now(), now());

insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'Gestao AH', u.id, 'gestao', true from auth.users u where u.email = 'gestao.ah@clickbaby.test';

create function pg_temp.como(p_email text) returns void language plpgsql as $$
declare v_id uuid;
begin
  select id into v_id from auth.users where email = p_email;
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L',
    json_build_object('sub', v_id, 'role', 'authenticated')::text);
end;
$$;
create function pg_temp.como_sync() returns void language plpgsql as $$
begin
  execute 'set local role service_role';
  execute format('set local request.jwt.claims = %L', json_build_object('role', 'service_role')::text);
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


-- =============================================================================
-- H1. A meia-noite do dia
-- =============================================================================

select is(
  public.previsao_do_dia('2029-08-10 23:30-03', true),
  '2029-08-10 00:00-03'::timestamptz,
  'H1: sem hora, a meia-noite de Brasília do mesmo dia (23h30 não vira o dia seguinte)'
);
select is(
  public.previsao_do_dia('2029-08-10 23:30-03', false),
  '2029-08-10 23:30-03'::timestamptz,
  'H1: com hora, o instante como veio'
);


-- =============================================================================
-- H2. Criar com hora a definir
-- =============================================================================

select pg_temp.como('gestao.ah@clickbaby.test');
select lives_ok(
  $$ select public.criar_caso('Hora Livre', null, pg_temp.pac('basic'), pg_temp.mat('HSC'), '2029-08-10 15:00-03', false, true) $$,
  'H2: cria com hora a definir'
);
select pg_temp.sair();

create temp table livre as select id from public.casos where mae_nome = 'HORA LIVRE';
grant select on livre to authenticated, service_role;

select is(
  (select previsao_sem_hora::text || '/' || previsao_em::text from public.casos where mae_nome = 'HORA LIVRE'),
  'true/' || '2029-08-10 00:00-03'::timestamptz::text,
  'H2: marcado, e a previsão é o dia — a hora que veio junto não fica'
);

select pg_temp.como_sync();
select is(
  (select previsao_sem_hora from public.sync_casos_para_o_google() where caso_id = (select id from livre)),
  true,
  'H2: o sync recebe a marca e escreve o evento de dia inteiro'
);
select public.sync_vincular_evento_google((select id from livre), 'evt-livre');
select pg_temp.sair();


-- =============================================================================
-- H3. Editar dá a hora, e tira
-- =============================================================================

select pg_temp.como('gestao.ah@clickbaby.test');
select is(
  public.editar_caso((select id from livre), 'Hora Livre', null, pg_temp.pac('basic'), pg_temp.mat('HSC'), '2029-08-10 14:30-03'),
  'editado',
  'H3: a hora chegou'
);
select pg_temp.sair();

select is(
  (select previsao_sem_hora::text || '/' || google_desatualizado::text from public.casos where id = (select id from livre)),
  'false/true',
  'H3: desmarcado, e o Google vai receber a hora'
);
select is(
  (select payload -> 'campos' from public.eventos where caso_id = (select id from livre) and tipo = 'caso_editado'),
  '["previsao_em", "previsao_sem_hora"]'::jsonb,
  'H3: o histórico diz que a hora mudou e deixou de ser "a definir"'
);

select pg_temp.como('gestao.ah@clickbaby.test');
select is(
  public.editar_caso((select id from livre), 'Hora Livre', null, pg_temp.pac('basic'), pg_temp.mat('HSC'), '2029-08-10 14:30-03', false, true),
  'editado',
  'H3: e volta a ser a definir'
);
select pg_temp.sair();


-- =============================================================================
-- H4. O sync marca pelo evento
-- =============================================================================

-- Fora da quarentena: o Google já recebeu tudo.
update public.casos set google_desatualizado = false, google_escrito_em = null where id = (select id from livre);

select pg_temp.como_sync();
select is(
  public.sync_definir_previsao_sem_hora('evt-livre', true),
  'sem_efeito',
  'H4: já marcado, nada muda'
);
select is(
  public.sync_definir_previsao_sem_hora('evt-livre', false),
  'atualizado',
  'H4: a equipe pôs a hora no Google, e a marca sai'
);
select pg_temp.sair();

update public.casos set google_desatualizado = true where id = (select id from livre);
select pg_temp.como_sync();
select is(
  public.sync_definir_previsao_sem_hora('evt-livre', true),
  'sem_efeito',
  'H4: enquanto o sistema escreve o evento, o sync não mexe na marca'
);
select pg_temp.sair();


-- =============================================================================
-- H5. A view do Quadro
-- =============================================================================

update public.casos set previsao_sem_hora = true where id = (select id from livre);
select is(
  (select previsao_sem_hora::text || '/' || dia::text from public.quadro_casos where id = (select id from livre)),
  'true/2029-08-10',
  'H5: a view leva a marca, e o dia é o do evento'
);

select * from finish();
rollback;
