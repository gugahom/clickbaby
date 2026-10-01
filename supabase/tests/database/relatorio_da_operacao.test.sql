-- pgTAP: o relatório externo — a operação inteira, com filtros
-- (migration 20260929233525).
--
--   O1 — só a gestão.
--   O2 — dentro de um grupo as opções SOMAM; entre grupos, CORTAM.
--   O3 — a contagem de cada opção ignora o PRÓPRIO grupo e respeita os outros.
--   O4 — a situação separa o cancelamento da AGENDA do da equipe, e o prazo
--        conta no envio.
--   O5 — "quem fez": pessoa E tipo de etapa na mesma condição.
--   O6 — busca por nome sem acento; resumo e paginação batem com a lista.
--
-- Os dados moram em ABRIL DE 2029, longe dos dados fictícios locais e dos
-- outros testes de métricas.

begin;
select plan(13);

insert into auth.users (id, email, aud, role, created_at, updated_at)
values
  (gen_random_uuid(), 'gestao.op@clickbaby.test',      'authenticated', 'authenticated', now(), now()),
  (gen_random_uuid(), 'atendimento.op@clickbaby.test', 'authenticated', 'authenticated', now(), now()),
  (gen_random_uuid(), 'fotografa.op@clickbaby.test',   'authenticated', 'authenticated', now(), now());

insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select v.nome, u.id, v.papel::public.papel_sistema, true
from (values
  ('Gestao OP',      'gestao.op@clickbaby.test',      'gestao'),
  ('Atendimento OP', 'atendimento.op@clickbaby.test', 'atendimento'),
  ('Fotografa OP',   'fotografa.op@clickbaby.test',   'operador')
) as v(nome, email, papel)
join auth.users u on u.email = v.email;

insert into public.maternidades (nome, sigla) values ('Maternidade OP Um', 'OPUM'), ('Maternidade OP Dois', 'OPDOIS');

-- Três casos no mesmo dia: dois na OPUM (um José, um cancelado pela agenda) e
-- um na OPDOIS.
insert into public.casos (mae_nome, bebe_nome, pacote_id, maternidade_id, previsao_em)
select v.mae, v.bebe, (select id from public.pacotes where slug = 'basic'),
       (select id from public.maternidades where sigla = v.sigla), '2029-04-10 08:00-03'
from (values
  ('Mae OP Um',   'José',  'OPUM'),
  ('Mae OP Dois', 'Maria', 'OPUM'),
  ('Mae OP Tres', 'Ana',   'OPDOIS')
) as v(mae, bebe, sigla);

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

create function pg_temp.mat(p_sigla text) returns text language sql as $$
  select id::text from public.maternidades where sigla = p_sigla;
$$;

-- Um: o parto foi da fotógrafa, e o caso foi ENVIADO depois de vencer (BASIC,
-- 48h: nasceu 10/04 10h, vence 12/04 10h, enviado 13/04).
update public.caso_etapas
   set status = 'concluida', responsavel_id = (select id from public.pessoas where nome = 'Fotografa OP'),
       iniciado_em = '2029-04-10 09:00-03', concluido_em = '2029-04-10 10:00-03'
 where caso_id = pg_temp.caso('Mae OP Um') and tipo = 'nascimento';
update public.casos set liberado_para_entrega_em = '2029-04-13 10:00-03' where id = pg_temp.caso('Mae OP Um');

-- Dois: cancelado pelo SYNC (card cinza).
update public.casos
   set status_operacional = 'cancelado', motivo_cancelamento = 'Cancelado via Google Calendar (card cinza)'
 where id = pg_temp.caso('Mae OP Dois');

-- Três: a fotógrafa EDITOU as fotos, mas não fez o parto.
update public.caso_etapas
   set status = 'concluida', responsavel_id = (select id from public.pessoas where nome = 'Fotografa OP'),
       iniciado_em = '2029-04-11 09:00-03', concluido_em = '2029-04-11 11:00-03'
 where caso_id = pg_temp.caso('Mae OP Tres') and tipo = 'edicao_foto' and rodada = 1;


-- =============================================================================
-- O1. Só a gestão
-- =============================================================================

select pg_temp.como('atendimento.op@clickbaby.test');
select throws_ok(
  $$ select * from public.operacao_buscar('{}'::jsonb) $$,
  'P0001', 'O relatório externo é de quem tem a tela Relatórios — ou a tela Comercial, no modo comercial.',
  'O1: o atendimento não abre o relatório externo'
);
reset role;

select pg_temp.como('gestao.op@clickbaby.test');

-- =============================================================================
-- O2. Somar dentro, cortar entre
-- =============================================================================

select is(
  (select max(total) from public.operacao_buscar(
     jsonb_build_object('de', '2029-04-01', 'ate', '2029-04-30',
                        'maternidades', jsonb_build_array(pg_temp.mat('OPUM'), pg_temp.mat('OPDOIS'))))),
  3,
  'O2: duas maternidades marcadas SOMAM — os três casos'
);

select is(
  (select string_agg(mae_nome, ',' order by mae_nome) from public.operacao_buscar(
     jsonb_build_object('de', '2029-04-01', 'ate', '2029-04-30',
                        'maternidades', jsonb_build_array(pg_temp.mat('OPUM')),
                        'situacoes', jsonb_build_array('aberto', 'em_entregaveis')))),
  'Mae OP Um',
  'O2: maternidade E situação CORTAM — sobra o caso aberto da OPUM'
);


-- =============================================================================
-- O3. Facetas
-- =============================================================================

select is(
  (select string_agg(rotulo || '=' || contagem, ',' order by rotulo) from public.operacao_facetas(
     jsonb_build_object('de', '2029-04-01', 'ate', '2029-04-30',
                        'maternidades', jsonb_build_array(pg_temp.mat('OPUM'))))
    where grupo = 'maternidades'),
  'OPDOIS=1,OPUM=2',
  'O3: com a OPUM marcada, a contagem das maternidades ignora esse filtro — a OPDOIS continua com o dela'
);

select is(
  (select string_agg(valor || '=' || contagem, ',' order by valor) from public.operacao_facetas(
     jsonb_build_object('de', '2029-04-01', 'ate', '2029-04-30',
                        'maternidades', jsonb_build_array(pg_temp.mat('OPUM'))))
    where grupo = 'situacoes'),
  'cancelado_agenda=1,em_entregaveis=1',
  'O3: e as outras contagens respeitam a OPUM marcada'
);


-- =============================================================================
-- O4. Situação e prazo
-- =============================================================================

select is(
  (select situacao || '/' || prazo from public.operacao_buscar(
     jsonb_build_object('busca', 'Mae OP Dois'))),
  'cancelado_agenda/sem_prazo',
  'O4: o card cinza é cancelamento da AGENDA, e cancelado não tem prazo'
);

select is(
  (select situacao || '/' || prazo || '/' || horas_ate_envio from public.operacao_buscar(
     jsonb_build_object('busca', 'Mae OP Um'))),
  'em_entregaveis/atrasado/72.0',
  'O4: enviado 72h depois do parto num pacote de 48h — em Entregáveis, atrasado'
);


-- =============================================================================
-- O5. Quem fez
-- =============================================================================

select is(
  (select string_agg(mae_nome, ',' order by mae_nome) from public.operacao_buscar(
     jsonb_build_object('de', '2029-04-01', 'ate', '2029-04-30',
                        'pessoas', jsonb_build_array((select id::text from public.pessoas where nome = 'Fotografa OP'))))),
  'Mae OP Tres,Mae OP Um',
  'O5: a pessoa sozinha — todo caso em que ela fez alguma etapa'
);

select is(
  (select string_agg(mae_nome, ',' order by mae_nome) from public.operacao_buscar(
     jsonb_build_object('de', '2029-04-01', 'ate', '2029-04-30',
                        'pessoas', jsonb_build_array((select id::text from public.pessoas where nome = 'Fotografa OP')),
                        'etapas', jsonb_build_array('nascimento')))),
  'Mae OP Um',
  'O5: pessoa E etapa juntas — só o caso em que ela fez o PARTO'
);

select is(
  (select contagem from public.operacao_facetas(
     jsonb_build_object('de', '2029-04-01', 'ate', '2029-04-30', 'etapas', jsonb_build_array('nascimento')))
    where grupo = 'pessoas' and rotulo = 'Fotografa OP'),
  1,
  'O5: a contagem da pessoa respeita a etapa marcada'
);


-- =============================================================================
-- O6. Busca, resumo e página
-- =============================================================================

select is(
  (select mae_nome from public.operacao_buscar(jsonb_build_object('busca', 'jose'))),
  'Mae OP Um',
  'O6: "jose" acha o bebê José — sem acento e sem caixa'
);

select is(
  (select casos || '/' || enviados || '/' || no_prazo || '/' || cancelados from public.operacao_resumo(
     jsonb_build_object('de', '2029-04-01', 'ate', '2029-04-30'))),
  '3/1/0/1',
  'O6: o resumo é o recorte — três casos, um enviado (atrasado), um cancelado'
);

select is(
  (select count(*)::int || '/' || max(total) from public.operacao_buscar(
     jsonb_build_object('de', '2029-04-01', 'ate', '2029-04-30'), 'recentes', 1, 0)),
  '1/3',
  'O6: a página traz um caso e o total do recorte'
);
reset role;

select * from finish();
rollback;
