-- =============================================================================
-- A SÉRIE DA EQUIPE GANHA DOIS GRÃOS: POR DIA E O PERÍODO INTEIRO (29/09/2026,
-- pedido do gestor).
-- =============================================================================
--
-- O gráfico do KPI deixou de comparar mês com mês ("ficou meio esquisito") e
-- passou a mostrar janelas que terminam hoje: a ÚLTIMA SEMANA e os ÚLTIMOS 30
-- DIAS, dia a dia, e o ÚLTIMO ANO, mês a mês. Com isso a série precisa de:
--   'dia'     — um balde por dia do período;
--   'periodo' — UM balde, o período inteiro. É o número do selo do gráfico
--               ("+4 p.p. contra os 30 dias anteriores"), e ele não sai da soma
--               dos dias: mediana não se compõe.
-- 'bloco' e 'mes' continuam iguais — o cartão e a mini-linha usam os dois.
--
-- A função é a mesma (`create or replace`, mesma assinatura): os privilégios da
-- 20260929053020 continuam valendo, e o GRANT abaixo só os repete.
-- =============================================================================

create or replace function public.metricas_serie_da_equipe(p_inicio date, p_fim date, p_grao text)
returns table (
  inicio                        date,
  fim                           date,
  enviados                      integer,
  no_prazo                      integer,
  mediana_horas_ate_envio       numeric,
  mediana_horas_ate_confirmacao numeric,
  por_tipo                      jsonb,
  voltou_para_ajuste            integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_baldes integer;
begin
  perform public.exigir_gestao();
  -- Só para validar as datas com a mesma frase de sempre.
  perform public.periodo_das_metricas(p_inicio, p_fim);

  if p_grao is null or p_grao not in ('dia', 'bloco', 'mes', 'periodo') then
    raise exception 'O grão da série é ''dia'', ''bloco'', ''mes'' ou ''periodo''.';
  end if;

  v_baldes := case p_grao
    when 'dia'     then p_fim - p_inicio + 1
    when 'bloco'   then greatest(1, (p_fim - p_inicio + 1) / 7)
    when 'periodo' then 1
    else ((extract(year from p_fim) * 12 + extract(month from p_fim))
          - (extract(year from p_inicio) * 12 + extract(month from p_inicio)))::integer + 1
  end;

  -- Dois meses em dias, um ano em blocos (52) ou cinco anos em meses (60)
  -- cabem; mais que isso é pedido que nenhuma tela faz, e cada balde refaz três
  -- consultas.
  if v_baldes > 62 then
    raise exception 'Período longo demais para a série (% pedaços; o limite é 62).', v_baldes;
  end if;

  return query
  with baldes as (
    select d::date as b_ini, d::date as b_fim
    from generate_series(p_inicio::timestamp, p_fim::timestamp, interval '1 day') as d
    where p_grao = 'dia'
    union all
    select (p_inicio + 7 * k),
           case when k = v_baldes - 1 then p_fim else p_inicio + 7 * k + 6 end
    from generate_series(0, v_baldes - 1) as k
    where p_grao = 'bloco'
    union all
    select greatest(m::date, p_inicio),
           least((m + interval '1 month' - interval '1 day')::date, p_fim)
    from generate_series(date_trunc('month', p_inicio::timestamp), p_fim::timestamp, interval '1 month') as m
    where p_grao = 'mes'
    union all
    select p_inicio, p_fim
    where p_grao = 'periodo'
  )
  select b.b_ini,
         b.b_fim,
         pr.enviados,
         pr.no_prazo,
         pr.mediana_horas_ate_envio,
         pr.mediana_horas_ate_confirmacao,
         eq.por_tipo,
         aj.total
  from baldes b
  cross join lateral public.metricas_prazo_do_periodo(b.b_ini, b.b_fim) pr
  cross join lateral (
    select coalesce(
             jsonb_object_agg(
               e.tipo,
               jsonb_build_object('concluidas', e.concluidas, 'medidas', e.medidas, 'mediana_min', e.mediana_min)
             ),
             '{}'::jsonb
           ) as por_tipo
    from public.metricas_da_equipe_por_etapa(b.b_ini, b.b_fim) e
  ) eq
  cross join lateral (
    select coalesce(sum(p.voltou_para_ajuste), 0)::integer as total
    from public.metricas_por_pessoa(b.b_ini, b.b_fim) p
  ) aj
  order by b.b_ini;
end;
$$;

comment on function public.metricas_serie_da_equipe(date, date, text) is
  'Os KPIs da equipe por pedaço do período — por dia, em blocos de 7 dias a partir do começo (o último absorve a sobra), por mês, ou o período inteiro num balde só. Cada linha: prazo (enviados, no prazo, medianas até o envio e até o ADM), volume e tempo por tipo de etapa (jsonb) e o que voltou para ajuste. Chama as funções de métrica que já existem, balde a balde, para as definições não se duplicarem. Só gestão.';

revoke all on function public.metricas_serie_da_equipe(date, date, text) from public, anon;
grant execute on function public.metricas_serie_da_equipe(date, date, text) to authenticated;
