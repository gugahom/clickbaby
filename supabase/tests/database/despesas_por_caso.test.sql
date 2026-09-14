-- pgTAP: relatório de despesas (migration 20260914195059).
--
-- O QUE ESTE ARQUIVO PROTEGE
-- É daqui que o financeiro tira o número do mês. O erro caro não é a view
-- quebrar — é ela SOMAR ERRADO em silêncio: um tipo caindo na coluna de outro,
-- um caso cancelado sumindo do total, um caso sem gasto aparecendo com zero.
-- Cada um desses produziria um relatório com cara de certo.

begin;
select plan(12);

-- =============================================================================
-- Fixtures
-- =============================================================================

insert into public.maternidades (nome, sigla) values ('Maternidade Relatorio', 'RELTEST');

insert into public.pessoas (nome, papel_sistema, ativo)
values ('Fotografa Relatorio', 'operador', true);

insert into public.casos (mae_nome, pacote_id, maternidade_id, previsao_em)
select v.mae, (select id from public.pacotes where slug = 'basic'),
       (select id from public.maternidades where sigla = 'RELTEST'),
       v.previsao
from (values
  ('Mae Relatorio Com Gasto', '2026-09-10 03:00:00-03'::timestamptz),
  ('Mae Relatorio Sem Gasto', '2026-09-11 03:00:00-03'::timestamptz)
) as v(mae, previsao);

insert into public.casos (mae_nome, pacote_id, maternidade_id, previsao_em, status_operacional, motivo_cancelamento)
select 'Mae Relatorio Cancelada',
       (select id from public.pacotes where slug = 'basic'),
       (select id from public.maternidades where sigla = 'RELTEST'),
       -- 23h30 em São Paulo do dia 30: em UTC já é dia 1º. O relatório tem que
       -- pôr no dia 30 — é o mês em que o parto aconteceu na planilha deles.
       '2026-09-30 23:30:00-03'::timestamptz,
       'cancelado',
       'Cancelado via Google Calendar (card cinza)';

create function pg_temp.caso(p_mae text) returns uuid language sql as $$
  select id from public.casos where mae_nome = p_mae;
$$;

-- Lançamentos direto na tabela: aqui se testa a SOMA, não a RPC — a RPC tem o
-- próprio arquivo (despesas.test.sql).
insert into public.despesas (caso_id, pessoa_id, tipo, valor, descricao, registrado_por)
select pg_temp.caso(v.mae), p.id, v.tipo::public.tipo_despesa, v.valor, v.descricao, p.id
from public.pessoas p,
  (values
    ('Mae Relatorio Com Gasto', 'uber_ida',   24.90, null),
    ('Mae Relatorio Com Gasto', 'uber_volta', 18.10, null),
    ('Mae Relatorio Com Gasto', 'uber_ida',   11.00, null),
    ('Mae Relatorio Com Gasto', 'refeicao',   32.00, null),
    ('Mae Relatorio Com Gasto', 'outro',       8.00, 'estacionamento'),
    ('Mae Relatorio Cancelada', 'uber_ida',   40.00, null)
  ) as v(mae, tipo, valor, descricao)
where p.nome = 'Fotografa Relatorio';

create function pg_temp.linha(p_mae text) returns public.despesas_por_caso language sql as $$
  select * from public.despesas_por_caso where caso_id = pg_temp.caso(p_mae);
$$;


-- =============================================================================
-- 1. Privilégios
-- =============================================================================

select ok(
  has_table_privilege('authenticated', 'public.despesas_por_caso', 'SELECT'),
  'authenticated lê o relatório'
);

select ok(
  not has_table_privilege('anon', 'public.despesas_por_caso', 'SELECT'),
  'anon não lê o relatório'
);

select ok(
  (select coalesce(reloptions, '{}') @> array['security_invoker=true']
     from pg_class where oid = 'public.despesas_por_caso'::regclass),
  'a view roda como quem consulta — sem isso ela passaria por cima da RLS'
);


-- =============================================================================
-- 2. A soma
-- =============================================================================

select is(
  (pg_temp.linha('Mae Relatorio Com Gasto')).total,
  94.00::numeric,
  'RL1: o total do caso é a soma de todos os lançamentos'
);

select is(
  (pg_temp.linha('Mae Relatorio Com Gasto')).total_uber_ida,
  35.90::numeric,
  'RL2: duas corridas de ida somam na mesma coluna'
);

select is(
  (select (l.total_uber_volta, l.total_refeicao, l.total_outro)::text
     from pg_temp.linha('Mae Relatorio Com Gasto') l),
  '(18.10,32.00,8.00)',
  'RL3: cada tipo cai na própria coluna, e nenhum na de outro'
);

select is(
  (pg_temp.linha('Mae Relatorio Com Gasto')).lancamentos,
  5,
  'RL4: a contagem de lançamentos acompanha a soma'
);

select is(
  (select count(*)::int from public.despesas_por_caso where caso_id = pg_temp.caso('Mae Relatorio Sem Gasto')),
  0,
  'RL5: caso sem gasto NÃO aparece — o relatório é de despesa, não de zeros'
);

select is(
  (pg_temp.linha('Mae Relatorio Cancelada')).total,
  40.00::numeric,
  'RL6: caso CANCELADO entra no relatório — a corrida foi paga mesmo sem parto'
);

select is(
  (pg_temp.linha('Mae Relatorio Cancelada')).dia,
  '2026-09-30'::date,
  'RL7: o dia é o de São Paulo — 23h30 do dia 30 não vira dia 1º do mês seguinte'
);


-- =============================================================================
-- 3. O total no Quadro
-- =============================================================================

select is(
  (select total_despesas from public.quadro_casos where id = pg_temp.caso('Mae Relatorio Com Gasto')),
  94.00::numeric,
  'RL8: quadro_casos traz o mesmo total que o relatório'
);

select is(
  (select total_despesas from public.quadro_casos where id = pg_temp.caso('Mae Relatorio Sem Gasto')),
  0::numeric,
  'RL9: e ZERO, não nulo, no caso sem gasto — o card distingue "sem despesa" de "não carregou"'
);

select * from finish();
rollback;
