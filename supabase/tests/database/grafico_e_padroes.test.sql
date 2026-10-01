-- pgTAP: o gráfico do recorte e o padrão de tempo em uso
-- (migration 20260930052252).
--
--   G1 — só a gestão; eixo desconhecido é recusado.
--   G2 — por dimensão, as linhas somam o resumo do mesmo recorte.
--   G3 — no tempo, um pedaço por dia (ou mês) com caso.
--   P1 — o padrão é o da data da conclusão (a régua é versionada).
--   P2 — antes da primeira régua, vale a primeira; sem régua nenhuma, não conta.
--
-- Os dados moram em MAIO DE 2029, longe dos dados fictícios locais e dos
-- outros testes de métricas.

begin;
select plan(9);

insert into auth.users (id, email, aud, role, created_at, updated_at)
values
  (gen_random_uuid(), 'gestao.gp@clickbaby.test',      'authenticated', 'authenticated', now(), now()),
  (gen_random_uuid(), 'atendimento.gp@clickbaby.test', 'authenticated', 'authenticated', now(), now()),
  (gen_random_uuid(), 'fotografa.gp@clickbaby.test',   'authenticated', 'authenticated', now(), now());

insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select v.nome, u.id, v.papel::public.papel_sistema, true
from (values
  ('Gestao GP',      'gestao.gp@clickbaby.test',      'gestao'),
  ('Atendimento GP', 'atendimento.gp@clickbaby.test', 'atendimento'),
  ('Fotografa GP',   'fotografa.gp@clickbaby.test',   'operador')
) as v(nome, email, papel)
join auth.users u on u.email = v.email;

insert into public.maternidades (nome, sigla) values ('Maternidade GP Um', 'GPUM'), ('Maternidade GP Dois', 'GPDOIS');

-- Três casos: dois na GPUM (dias 10 e 11), um na GPDOIS (dia 11).
insert into public.casos (mae_nome, bebe_nome, pacote_id, maternidade_id, previsao_em)
select v.mae, 'Bebe', (select id from public.pacotes where slug = 'basic'),
       (select id from public.maternidades where sigla = v.sigla), v.previsao::timestamptz
from (values
  ('Mae GP Um',   'GPUM',   '2029-05-10 08:00-03'),
  ('Mae GP Dois', 'GPUM',   '2029-05-11 08:00-03'),
  ('Mae GP Tres', 'GPDOIS', '2029-05-11 09:00-03')
) as v(mae, sigla, previsao);

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

-- Três reels da fotógrafa, todos com 45 min de relógio, concluídos em 10, 20 e
-- 25 de maio. A régua do reels é trocada por esta, só dentro do teste.
update public.caso_etapas
   set status = 'concluida', responsavel_id = (select id from public.pessoas where nome = 'Fotografa GP'),
       iniciado_em = v.fim::timestamptz - interval '45 minutes', concluido_em = v.fim::timestamptz
  from (values ('Mae GP Um', '2029-05-10 12:00-03'),
               ('Mae GP Dois', '2029-05-20 12:00-03'),
               ('Mae GP Tres', '2029-05-25 12:00-03')) as v(mae, fim)
 where caso_id = pg_temp.caso(v.mae) and tipo = 'reels' and rodada = 1;

delete from public.padroes_tempo where etapa_tipo = 'reels' and pacote_id is null;
insert into public.padroes_tempo (etapa_tipo, pacote_id, minutos_esperados, vigente_desde)
values ('reels', null, 60, '2029-05-15'), ('reels', null, 30, '2029-05-22');


-- =============================================================================
-- G1. Só a gestão
-- =============================================================================

select pg_temp.como('atendimento.gp@clickbaby.test');
select throws_ok(
  $$ select * from public.operacao_grafico('{}'::jsonb, 'dia') $$,
  'P0001', 'O relatório externo é de quem tem a tela Relatórios — ou a tela Comercial, no modo comercial.',
  'G1: o atendimento não abre o gráfico do relatório externo'
);
select throws_ok(
  $$ select * from public.metricas_dentro_do_padrao('2029-05-01', '2029-05-31') $$,
  'P0001', 'Os relatórios são de quem tem a tela Relatórios liberada.',
  'G1: nem as métricas do padrão'
);
reset role;

select pg_temp.como('gestao.gp@clickbaby.test');

select throws_ok(
  $$ select * from public.operacao_grafico('{}'::jsonb, 'cor_do_card') $$,
  'P0001', 'Eixo do gráfico desconhecido: cor_do_card.',
  'G1: eixo desconhecido é recusado'
);


-- =============================================================================
-- G2 / G3. O recorte quebrado
-- =============================================================================

select is(
  (select string_agg(rotulo || '=' || casos, ',' order by rotulo) from public.operacao_grafico(
     jsonb_build_object('de', '2029-05-01', 'ate', '2029-05-31'), 'maternidade')),
  'GPDOIS=1,GPUM=2',
  'G2: por maternidade, um pedaço para cada uma'
);

select is(
  (select sum(casos)::integer from public.operacao_grafico(
     jsonb_build_object('de', '2029-05-01', 'ate', '2029-05-31'), 'situacao')),
  (select casos from public.operacao_resumo(jsonb_build_object('de', '2029-05-01', 'ate', '2029-05-31'))),
  'G2: as linhas somam o resumo do mesmo recorte'
);

select is(
  (select string_agg(chave || '=' || casos, ',' order by chave) from public.operacao_grafico(
     jsonb_build_object('de', '2029-05-01', 'ate', '2029-05-31'), 'dia')),
  '2029-05-10=1,2029-05-11=2',
  'G3: por dia, só os dias com caso'
);

select is(
  (select string_agg(chave || '=' || casos, ',' order by chave) from public.operacao_grafico(
     jsonb_build_object('de', '2029-05-01', 'ate', '2029-05-31'), 'mes')),
  '2029-05-01=3',
  'G3: por mês, o primeiro dia do mês é a chave'
);


-- =============================================================================
-- P. Dentro do padrão
-- =============================================================================

-- 10/05: antes da primeira régua → vale a primeira (60): dentro.
-- 20/05: régua de 60: dentro.   25/05: régua de 30: fora.
select is(
  (select medidas || '/' || com_padrao || '/' || dentro from public.metricas_dentro_do_padrao('2029-05-01', '2029-05-31')
    where pessoa_id = (select id from public.pessoas where nome = 'Fotografa GP') and tipo = 'reels'),
  '3/3/2',
  'P1/P2: o padrão é o da data da conclusão, e antes da primeira régua vale a primeira'
);
reset role;

delete from public.padroes_tempo where etapa_tipo = 'reels' and pacote_id is null;
select pg_temp.como('gestao.gp@clickbaby.test');
select is(
  (select medidas || '/' || com_padrao || '/' || dentro from public.metricas_dentro_do_padrao('2029-05-01', '2029-05-31')
    where pessoa_id = (select id from public.pessoas where nome = 'Fotografa GP') and tipo = 'reels'),
  '3/0/0',
  'P2: sem régua nenhuma, a etapa é medida mas não tem com o que comparar'
);
reset role;

select * from finish();
rollback;
