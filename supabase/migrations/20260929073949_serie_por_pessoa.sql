-- =============================================================================
-- A SÉRIE DA EQUIPE FILTRA POR PESSOA (29/09/2026, pedido do gestor).
-- =============================================================================
--
-- "Eu coloco o gráfico de partos, assim que selecionar uma pessoa ele deve
-- filtrar os partos realizados por esse funcionário naquele período mostrado."
--
-- `p_pessoa_id` nulo é a equipe inteira, como até aqui. Preenchido, a PRODUÇÃO
-- vira a daquela pessoa — e continua sem definição nova: em vez de
-- `metricas_da_equipe_por_etapa`, o balde lê `metricas_por_etapa` (a mesma que
-- a aba Pessoas usa) filtrada por ela, e "voltou para ajuste" é a coluna dela em
-- `metricas_por_pessoa`. O crédito segue sendo do RESPONSÁVEL — o parto é de
-- quem estava na sala, não de quem clicou (ver 20260929020655).
--
-- O PRAZO CONTINUA DA EQUIPE, com ou sem pessoa: enviar para Entregáveis é um
-- fato do CASO, que tem várias mãos, e dividi-lo por pessoa inventaria um dono.
-- A tela mostra o prazo como número da equipe e não o filtra.
--
-- ASSINATURA NOVA, então DROP + CREATE — e o CREATE reaplica os default
-- privileges, que é a armadilha da seção 5 do CLAUDE.md: o REVOKE de PUBLIC e o
-- GRANT abaixo não são enfeite.
-- =============================================================================

drop function public.metricas_serie_da_equipe(date, date, text);

create function public.metricas_serie_da_equipe(
  p_inicio    date,
  p_fim       date,
  p_grao      text,
  p_pessoa_id uuid default null
)
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
               t.tipo,
               jsonb_build_object('concluidas', t.concluidas, 'medidas', t.medidas, 'mediana_min', t.mediana_min)
             ),
             '{}'::jsonb
           ) as por_tipo
    from (
      select e.tipo, e.concluidas, e.medidas, e.mediana_min
      from public.metricas_da_equipe_por_etapa(b.b_ini, b.b_fim) e
      where p_pessoa_id is null
      union all
      select e.tipo, e.concluidas, e.medidas, e.mediana_min
      from public.metricas_por_etapa(b.b_ini, b.b_fim) e
      where p_pessoa_id is not null and e.pessoa_id = p_pessoa_id
    ) t
  ) eq
  cross join lateral (
    select coalesce(sum(p.voltou_para_ajuste), 0)::integer as total
    from public.metricas_por_pessoa(b.b_ini, b.b_fim) p
    where p_pessoa_id is null or p.pessoa_id = p_pessoa_id
  ) aj
  order by b.b_ini;
end;
$$;

comment on function public.metricas_serie_da_equipe(date, date, text, uuid) is
  'Os KPIs da equipe — ou da produção de UMA pessoa, com p_pessoa_id — por pedaço do período: por dia, em blocos de 7 dias a partir do começo (o último absorve a sobra), por mês, ou o período inteiro num balde só. Cada linha: prazo (sempre da equipe: é fato do caso), volume e tempo por tipo de etapa (jsonb, crédito do responsável) e o que voltou para ajuste. Chama as funções de métrica que já existem, balde a balde, para as definições não se duplicarem. Só gestão.';

revoke all on function public.metricas_serie_da_equipe(date, date, text, uuid) from public, anon;
grant execute on function public.metricas_serie_da_equipe(date, date, text, uuid) to authenticated;
