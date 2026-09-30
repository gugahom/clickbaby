-- pgTAP: editar e cancelar pelo calendário, com o Google acompanhando
-- (migration 20260930164416).
--
--   E1 — só o adm edita.
--   E2 — a edição de um caso ligado ao Google: nomes em maiúsculas, previsão
--        nova, histórico sem nomes, e a marca para o sync atualizar o evento.
--   E3 — nada mudou não marca nada; bebê vazio é o mesmo que "BEBÊ".
--   E4 — New Born só se marca, e marcar cria a etapa.
--   E5 — maternidade nova traz a cor da regra.
--   E6 — cancelado não se edita.
--   S1 — enquanto marcado, o sync não relê o evento (nem para cancelar).
--   S2 — o sync desliga a marca só da versão que escreveu, e segura um minuto.
--   S3 — passada a quarentena, o Google volta a mandar, e o que vem dele não
--        volta para a fila.
--   X1 — cancelar pelo sistema pinta de cinza: marca o caso ligado; o pendente
--        deixa de ir; o rascunho descartado não pinta.
--   Q1 — o "Editar caso" do Quadro (UPDATE direto) também vai para o Google.
--   P1 — as funções do sync não são da tela.

begin;
select plan(27);

insert into auth.users (id, email, aud, role, created_at, updated_at)
values
  (gen_random_uuid(), 'gestao.ec@clickbaby.test',      'authenticated', 'authenticated', now(), now()),
  (gen_random_uuid(), 'atendimento.ec@clickbaby.test', 'authenticated', 'authenticated', now(), now());

insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select v.nome, u.id, v.papel::public.papel_sistema, true
from (values
  ('Gestao EC',      'gestao.ec@clickbaby.test',      'gestao'),
  ('Atendimento EC', 'atendimento.ec@clickbaby.test', 'atendimento')
) as v(nome, email, papel)
join auth.users u on u.email = v.email;

create function pg_temp.como(p_email text) returns void language plpgsql as $$
declare v_id uuid;
begin
  select id into v_id from auth.users where email = p_email;
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L',
    json_build_object('sub', v_id, 'role', 'authenticated')::text);
end;
$$;

-- O sync: chave de serviço, SEM usuário. É o `auth.uid()` nulo que a trigger
-- lê como "isto veio do Google".
create function pg_temp.como_sync() returns void language plpgsql as $$
begin
  execute 'set local role service_role';
  execute format('set local request.jwt.claims = %L', json_build_object('role', 'service_role')::text);
end;
$$;

-- Volta a postgres e ESQUECE o usuário (reset role não limpa as claims).
create function pg_temp.sair() returns void language plpgsql as $$
begin
  execute 'reset role';
  execute 'set local request.jwt.claims = ''{}''';
end;
$$;

create function pg_temp.pac(p_slug text) returns uuid language sql as $$
  select id from public.pacotes where slug = p_slug;
$$;
create function pg_temp.mat(p_sigla text) returns uuid language sql as $$
  select id from public.maternidades where sigla = p_sigla;
$$;

-- Casos que vieram do Google (ligados a um evento), um pendente e um rascunho.
insert into public.casos (mae_nome, bebe_nome, pacote_id, maternidade_id, previsao_em, cor_calendar, google_calendar_event_id)
values
  ('ANA',   'BEBÊ', pg_temp.pac('standard'), pg_temp.mat('HSC'), '2029-07-10 10:00-03', '9', 'evt-ana'),
  ('BIA',   'LUIZ', pg_temp.pac('basic'),    pg_temp.mat('HSC'), '2029-07-11 10:00-03', '9', 'evt-bia'),
  ('CARLA', 'NINA', pg_temp.pac('basic'),    pg_temp.mat('HSC'), '2029-07-12 10:00-03', '9', 'evt-carla'),
  ('DORA',  null,   null,                    null,               '2029-07-13 10:00-03', null, 'evt-dora');

insert into public.casos (mae_nome, pacote_id, maternidade_id, previsao_em, google_pendente)
values ('ELISA', pg_temp.pac('basic'), pg_temp.mat('GNDI'), '2029-07-14 10:00-03', true);

create temp table ids as select mae_nome, id from public.casos where mae_nome in ('ANA', 'BIA', 'CARLA', 'DORA', 'ELISA');
grant select on ids to authenticated, service_role;

create function pg_temp.caso(p_mae text) returns uuid language sql as $$
  select id from ids where mae_nome = p_mae;
$$;


-- =============================================================================
-- E1. Quem edita
-- =============================================================================

select pg_temp.como('atendimento.ec@clickbaby.test');
select throws_ok(
  $$ select public.editar_caso(pg_temp.caso('ANA'), 'Ana', null, pg_temp.pac('standard'), pg_temp.mat('HSC'), '2029-07-10 15:00-03') $$,
  'P0001', 'Só a gestão, a coordenação, o comercial e o financeiro editam o caso.',
  'E1: o atendimento vê e não edita'
);
select pg_temp.sair();


-- =============================================================================
-- E2. A edição de um caso ligado ao Google
-- =============================================================================

select pg_temp.como('gestao.ec@clickbaby.test');
select is(
  public.editar_caso(pg_temp.caso('ANA'), ' ana paula ', 'théo', pg_temp.pac('standard'), pg_temp.mat('HSC'), '2029-07-10 15:00-03'),
  'editado',
  'E2: a gestão edita'
);
select pg_temp.sair();

select is(
  (select mae_nome || '/' || bebe_nome || '/' || to_char(previsao_em at time zone 'America/Sao_Paulo', 'DD HH24:MI')
     from public.casos where id = pg_temp.caso('ANA')),
  'ANA PAULA/THÉO/10 15:00',
  'E2: nomes em maiúsculas e a hora nova'
);
select is(
  (select google_desatualizado::text || '/' || google_versao from public.casos where id = pg_temp.caso('ANA')),
  'true/1',
  'E2: marcado para o sync levar ao Google'
);
select is(
  (select payload -> 'campos' from public.eventos where caso_id = pg_temp.caso('ANA') and tipo = 'caso_editado'),
  '["mae_nome", "bebe_nome", "previsao_em"]'::jsonb,
  'E2: o histórico diz o que mudou'
);
select ok(
  (select payload::text not like '%ANA PAULA%' and payload::text not like '%THÉO%'
     from public.eventos where caso_id = pg_temp.caso('ANA') and tipo = 'caso_editado'),
  'E2: e não guarda os nomes'
);


-- =============================================================================
-- E3. Nada mudou
-- =============================================================================

select pg_temp.como('gestao.ec@clickbaby.test');
select is(
  public.editar_caso(pg_temp.caso('BIA'), 'bia', 'luiz', pg_temp.pac('basic'), pg_temp.mat('HSC'), '2029-07-11 10:00-03'),
  'sem_efeito',
  'E3: os mesmos valores (em outra caixa) não são edição'
);
select pg_temp.sair();
select is(
  (select google_desatualizado::text || '/' || google_versao from public.casos where id = pg_temp.caso('BIA')),
  'false/0',
  'E3: e não vão ao Google'
);

-- ANA ficou com "THÉO"; um caso com "BEBÊ" e o campo vazio é o mesmo estado.
update public.casos set bebe_nome = 'BEBÊ' where id = pg_temp.caso('CARLA');
select pg_temp.como('gestao.ec@clickbaby.test');
select is(
  public.editar_caso(pg_temp.caso('CARLA'), 'CARLA', '', pg_temp.pac('basic'), pg_temp.mat('HSC'), '2029-07-12 10:00-03'),
  'sem_efeito',
  'E3: bebê vazio num caso "BEBÊ" não apaga nada'
);
select pg_temp.sair();


-- =============================================================================
-- E4. New Born só se marca
-- =============================================================================

select pg_temp.como('gestao.ec@clickbaby.test');
select public.editar_caso(pg_temp.caso('BIA'), 'BIA', 'LUIZ', pg_temp.pac('basic'), pg_temp.mat('HSC'), '2029-07-11 10:00-03', true);
select public.editar_caso(pg_temp.caso('BIA'), 'BIA', 'LUIZ', pg_temp.pac('basic'), pg_temp.mat('HSC'), '2029-07-11 10:00-03', false);
select pg_temp.sair();

select is(
  (select c.click_home::text || '/' || count(ce.id) from public.casos c
     left join public.caso_etapas ce on ce.caso_id = c.id and ce.tipo = 'click_home'
    where c.id = pg_temp.caso('BIA') group by c.click_home),
  'true/1',
  'E4: marcar cria a etapa; desmarcar aqui não desfaz (o caminho é dispensar na seção)'
);


-- =============================================================================
-- E5. A cor acompanha a maternidade
-- =============================================================================

select pg_temp.como('gestao.ec@clickbaby.test');
select public.editar_caso(pg_temp.caso('CARLA'), 'CARLA', null, pg_temp.pac('basic'), pg_temp.mat('GNDI'), '2029-07-12 10:00-03');
select pg_temp.sair();
select is(
  (select cor_calendar || '/' || google_desatualizado::text from public.casos where id = pg_temp.caso('CARLA')),
  '5/true',
  'E5: da HSC (mirtilo) para o GNDI (banana), e o Google recebe a cor nova'
);


-- =============================================================================
-- S1. Enquanto marcado, o sync não relê o evento
-- =============================================================================

select pg_temp.como_sync();
select is(
  public.sync_upsert_caso('evt-ana', 'ANA', 'BEBÊ', pg_temp.pac('standard'), pg_temp.mat('HSC'), '2029-07-10 10:00-03', '9', false),
  'sem_efeito',
  'S1: o título velho que o sync leu não volta por cima da edição'
);
select is(
  public.sync_upsert_caso('evt-ana', 'ANA', 'BEBÊ', pg_temp.pac('standard'), pg_temp.mat('HSC'), '2029-07-10 10:00-03', '8', true),
  'sem_efeito',
  'S1: nem o cinza — ele entra depois da quarentena'
);
select is(
  public.sync_cancelar_caso('evt-ana'),
  'sem_efeito',
  'S1: nem a checagem de deleção (a data nova pode ainda não estar no Google)'
);
select pg_temp.sair();

select is(
  (select mae_nome || '/' || status_operacional::text from public.casos where id = pg_temp.caso('ANA')),
  'ANA PAULA/agendado',
  'S1: o caso continua com o que a pessoa escreveu'
);


-- =============================================================================
-- S2. A versão e a quarentena
-- =============================================================================

select pg_temp.como_sync();
select is(
  (select mae_nome || '/' || bebe_nome || '/' || pacote_nome || '/' || maternidade_sigla || '/' || versao || '/' || cancelado::text
     from public.sync_casos_para_atualizar_no_google() where caso_id = pg_temp.caso('ANA')),
  'ANA PAULA/THÉO/STANDARD/HSC/1/false',
  'S2: o sync recebe os pedaços do título e a versão'
);
select is(
  public.sync_marcar_google_atualizado(pg_temp.caso('ANA'), 0),
  'sem_efeito',
  'S2: versão velha não desliga a marca (outra edição chegou no meio)'
);
select is(
  public.sync_marcar_google_atualizado(pg_temp.caso('ANA'), 1),
  'atualizado',
  'S2: a versão escrita desliga'
);
select is(
  public.sync_upsert_caso('evt-ana', 'ANA', 'BEBÊ', pg_temp.pac('standard'), pg_temp.mat('HSC'), '2029-07-10 10:00-03', '9', false),
  'sem_efeito',
  'S2: por um minuto depois da escrita, um ciclo atrasado ainda não relê'
);
select pg_temp.sair();


-- =============================================================================
-- S3. Passada a quarentena, o Google volta a mandar
-- =============================================================================

update public.casos set google_escrito_em = now() - interval '2 minutes' where id = pg_temp.caso('ANA');

select pg_temp.como_sync();
select is(
  public.sync_upsert_caso('evt-ana', 'ANA PAULA', 'THÉO', pg_temp.pac('standard'), pg_temp.mat('HSC'), '2029-07-10 16:00-03', '9', false),
  'caso_atualizado',
  'S3: a equipe mudou a hora no Google, e o caso acompanha'
);
select pg_temp.sair();
select is(
  (select google_desatualizado::text || '/' || google_versao from public.casos where id = pg_temp.caso('ANA')),
  'false/1',
  'S3: o que veio do Google não volta para a fila'
);


-- =============================================================================
-- X1. Cancelar pelo sistema pinta de cinza
-- =============================================================================

select pg_temp.como('atendimento.ec@clickbaby.test');
select public.cancelar_caso(pg_temp.caso('BIA'), 'Família desistiu');
select public.cancelar_caso(pg_temp.caso('ELISA'), 'Criado por engano');
select public.cancelar_caso(pg_temp.caso('DORA'), 'Não é caso');
select pg_temp.sair();

select pg_temp.como_sync();
select is(
  (select string_agg(mae_nome || '=' || cancelado::text, ',' order by mae_nome)
     from public.sync_casos_para_atualizar_no_google() where caso_id in (pg_temp.caso('BIA'), pg_temp.caso('ELISA'), pg_temp.caso('DORA'))),
  'BIA=true',
  'X1: só o caso de verdade ligado ao Google vai ser pintado — nem o pendente, nem o rascunho'
);
select pg_temp.sair();
select is(
  (select google_pendente::text from public.casos where id = pg_temp.caso('ELISA')),
  'false',
  'X1: o pendente cancelado deixa de ser pendente — não vai mais ao Google'
);

select pg_temp.como('gestao.ec@clickbaby.test');
select throws_ok(
  $$ select public.editar_caso(pg_temp.caso('BIA'), 'BIA', 'LUIZ', pg_temp.pac('basic'), pg_temp.mat('HSC'), '2029-07-11 10:00-03') $$,
  'P0001', 'Caso cancelado não se edita.',
  'E6: cancelado não se edita'
);
select pg_temp.sair();


-- =============================================================================
-- Q1. O "Editar caso" do Quadro também vai para o Google
-- =============================================================================

select pg_temp.como('gestao.ec@clickbaby.test');
update public.casos set mae_nome = 'CARLA MARIA' where id = pg_temp.caso('CARLA');
select pg_temp.sair();
select is(
  (select google_versao from public.casos where id = pg_temp.caso('CARLA')),
  2,
  'Q1: o UPDATE direto do Quadro entra na fila — antes, o sync revertia o nome'
);


-- =============================================================================
-- P1. As funções do sync não são da tela
-- =============================================================================

select pg_temp.como('gestao.ec@clickbaby.test');
select throws_ok(
  $$ select * from public.sync_casos_para_atualizar_no_google() $$,
  '42501', null, 'P1: a fila do Google não é da tela'
);
select throws_ok(
  $$ select public.sync_marcar_google_atualizado(pg_temp.caso('CARLA'), 2) $$,
  '42501', null, 'P1: nem desligar a marca'
);
select pg_temp.sair();

select * from finish();
rollback;
