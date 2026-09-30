-- pgTAP: o ranking por pontos (migration 20260929210556).
--
--   P1 — só a gestão lê e define.
--   P2 — a régua de fábrica é a tabela que a gestão mandou.
--   P3 — o item certo: nascimento de pacote Birth vale como "fotografia de
--        Birth"; a edição de fotos da rodada 1 é "foto parto".
--   P4 — etapa que passou de mão (handoff) divide os pontos em partes iguais.
--   P5 — peso novo vale da data em diante, e muda o ranking.
--
-- Os dados moram em MARÇO DE 2029, longe dos dados fictícios locais
-- (out/2026 a dez/2027) e dos testes das métricas (fevereiro de 2029).

begin;
select plan(10);

insert into auth.users (id, email, aud, role, created_at, updated_at)
values
  (gen_random_uuid(), 'gestao.pts@clickbaby.test',      'authenticated', 'authenticated', now(), now()),
  (gen_random_uuid(), 'atendimento.pts@clickbaby.test', 'authenticated', 'authenticated', now(), now()),
  (gen_random_uuid(), 'fotografa.pts@clickbaby.test',   'authenticated', 'authenticated', now(), now()),
  (gen_random_uuid(), 'editora.pts@clickbaby.test',     'authenticated', 'authenticated', now(), now());

insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select v.nome, u.id, v.papel::public.papel_sistema, true
from (values
  ('Gestao PTS',      'gestao.pts@clickbaby.test',      'gestao'),
  ('Atendimento PTS', 'atendimento.pts@clickbaby.test', 'atendimento'),
  ('Fotografa PTS',   'fotografa.pts@clickbaby.test',   'operador'),
  ('Editora PTS',     'editora.pts@clickbaby.test',     'operador')
) as v(nome, email, papel)
join auth.users u on u.email = v.email;

insert into public.maternidades (nome, sigla) values ('Maternidade PTS', 'PTSTEST');

insert into public.casos (mae_nome, pacote_id, maternidade_id)
select v.mae, (select id from public.pacotes where slug = v.pacote),
       (select id from public.maternidades where sigla = 'PTSTEST')
from (values ('Mae PTS Basic', 'basic'), ('Mae PTS Birth', 'birth')) as v(mae, pacote);

create function pg_temp.como(p_email text) returns void language plpgsql as $$
declare v_id uuid;
begin
  select id into v_id from auth.users where email = p_email;
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L',
    json_build_object('sub', v_id, 'role', 'authenticated')::text);
end;
$$;

create function pg_temp.pessoa(p_nome text) returns uuid language sql as $$
  select id from public.pessoas where nome = p_nome;
$$;

create function pg_temp.etapa(p_mae text, p_tipo public.etapa_tipo) returns uuid language sql as $$
  select ce.id from public.caso_etapas ce join public.casos c on c.id = ce.caso_id
  where c.mae_nome = p_mae and ce.tipo = p_tipo and ce.rodada = 1;
$$;

create function pg_temp.concluir(p_etapa uuid, p_pessoa uuid, p_ini timestamptz, p_fim timestamptz)
returns void language sql as $$
  update public.caso_etapas
     set status = 'concluida', responsavel_id = p_pessoa, iniciado_em = p_ini, concluido_em = p_fim
   where id = p_etapa;
$$;

-- A fotógrafa fotografa os dois partos (um BASIC, um BIRTH). A edição de fotos
-- do BASIC ela COMEÇA e passa para a editora, que termina.
select pg_temp.concluir(pg_temp.etapa('Mae PTS Basic', 'nascimento'), pg_temp.pessoa('Fotografa PTS'),
                        '2029-03-10 10:00-03', '2029-03-10 12:00-03');
select pg_temp.concluir(pg_temp.etapa('Mae PTS Birth', 'nascimento'), pg_temp.pessoa('Fotografa PTS'),
                        '2029-03-11 10:00-03', '2029-03-11 12:00-03');
select pg_temp.concluir(pg_temp.etapa('Mae PTS Basic', 'edicao_foto'), pg_temp.pessoa('Editora PTS'),
                        '2029-03-10 14:00-03', '2029-03-10 18:00-03');
insert into public.handoffs (caso_etapa_id, de_pessoa_id, para_pessoa_id, motivo, ocorrido_em)
values (pg_temp.etapa('Mae PTS Basic', 'edicao_foto'), pg_temp.pessoa('Fotografa PTS'),
        pg_temp.pessoa('Editora PTS'), 'Fim do turno', '2029-03-10 16:00-03');


-- =============================================================================
-- P1. Só a gestão
-- =============================================================================

select pg_temp.como('atendimento.pts@clickbaby.test');
select throws_ok(
  $$ select * from public.metricas_pontos_por_pessoa('2029-03-01', '2029-03-31') $$,
  'P0001', 'Os relatórios são de quem tem a tela Relatórios liberada.',
  'P1: nem o atendimento lê o ranking por pontos'
);
reset role;

select pg_temp.como('fotografa.pts@clickbaby.test');
select throws_ok(
  $$ select public.definir_pontos_do_item('nascimento', 10) $$,
  'P0001', 'Os relatórios são de quem tem a tela Relatórios liberada.',
  'P1: a fotógrafa não mexe nos pesos'
);
reset role;


-- =============================================================================
-- P2 a P4. A régua de fábrica, o item certo, e a divisão
-- =============================================================================

select pg_temp.como('gestao.pts@clickbaby.test');

select is(
  (select string_agg(item || '=' || pontos, ',' order by item)
     from public.pontos_por_item_vigentes()
    where item in ('nascimento', 'nascimento_birth', 'foto_parto', 'fotolivro', 'entrada', 'video_master', 'reels_parto')),
  'nascimento=3.00,nascimento_birth=3.00,entrada=1.00,foto_parto=2.00,reels_parto=0.50,video_master=1.00,fotolivro=1.50',
  'P2: a régua de fábrica é a tabela da gestão'
);

select is(
  (select count(*)::int from public.pontos_por_item_vigentes()),
  17,
  'P2: todo item tem peso — nenhum fica de fora da régua'
);

select is(
  (select string_agg(item || ':' || etapas || ':' || divididas || ':' || pontos, ',' order by item)
     from public.metricas_pontos_por_pessoa('2029-03-01', '2029-03-31')
    where pessoa_id = pg_temp.pessoa('Fotografa PTS')),
  'nascimento:1:0:3.00,nascimento_birth:1:0:3.00,foto_parto:1:1:1.00',
  'P3/P4: parto de BASIC é nascimento, de BIRTH é fotografia de Birth; a edição que ela começou vale a metade'
);

select is(
  (select item || ':' || etapas || ':' || divididas || ':' || pontos
     from public.metricas_pontos_por_pessoa('2029-03-01', '2029-03-31')
    where pessoa_id = pg_temp.pessoa('Editora PTS')),
  'foto_parto:1:1:1.00',
  'P4: e quem terminou fica com a outra metade'
);


-- =============================================================================
-- P5. Peso novo
-- =============================================================================

select lives_ok(
  $$ select public.definir_pontos_do_item('nascimento', 4) $$,
  'P5: a gestão muda o peso do nascimento'
);

select is(
  (select sum(pontos) from public.metricas_pontos_por_pessoa('2029-03-01', '2029-03-31')
    where pessoa_id = pg_temp.pessoa('Fotografa PTS')),
  8.00::numeric,
  'P5: e o ranking de depois da mudança usa o peso novo (4 + 3 + 1)'
);

select public.definir_pontos_do_item('nascimento', 3.5);
reset role;

select is(
  (select count(*)::int from public.pontos_por_item
    where item = 'nascimento' and vigente_desde = public.dia_da_regua_de_pontos()),
  1,
  'P5: no mesmo dia, definir de novo SUBSTITUI — é correção, não régua nova'
);

select is(
  (select count(*)::int from public.eventos
    where tipo = 'pontos_do_item_definidos' and pessoa_id = pg_temp.pessoa('Gestao PTS')),
  2,
  'P5: cada mudança fica no histórico'
);

select * from finish();
rollback;
