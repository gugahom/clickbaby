-- =============================================================================
-- A SÉRIE DA EQUIPE — os seis KPIs do painel, período a período (29/09/2026,
-- pedido do gestor).
-- =============================================================================
--
-- O painel ganhou um gráfico que obedece ao cartão escolhido, e que compara
-- com outro período: o mês anterior, o mesmo mês do ano passado, o ano
-- anterior. Até aqui só o PRAZO tinha série (por semana); o volume tinha outra,
-- e "voltou para ajuste" e o tempo de edição não tinham nenhuma — dois dos seis
-- cartões não tinham o que abrir.
--
-- UMA FUNÇÃO, TODOS OS KPIs, POR BALDE. Cada linha é um pedaço do período com
-- tudo o que os seis cartões precisam. A tela lê a mesma função para o número
-- do cartão (um balde = o mês), para a mini-linha e para o gráfico — e por isso
-- os três não podem discordar.
--
-- AS DEFINIÇÕES NÃO SE REPETEM AQUI. Cada balde chama as funções que já
-- existem (`metricas_prazo_do_periodo`, `metricas_da_equipe_por_etapa`,
-- `metricas_por_pessoa`) com o seu próprio começo e fim. Reescrever "no prazo"
-- ou "voltou para ajuste" numa quarta função seria criar a segunda definição
-- que recebe só metade da próxima correção. O preço é fazer a mesma conta N
-- vezes; com no máximo 62 baldes e ~135 casos por mês, é barato — e o limite
-- está escrito abaixo.
--
-- DOIS GRÃOS:
--   'bloco' — pedaços de 7 dias contados do COMEÇO do período, e o último
--             absorve a sobra: um mês vira 1–7, 8–14, 15–21 e 22–fim. Não é a
--             semana de segunda a domingo, e é de propósito: comparar outubro
--             com setembro "semana a semana" só alinha se a primeira semana
--             dos dois for a mesma coisa, e a semana do calendário não é (uma
--             tem quatro dias, a outra seis). O bloco "1–7" é sempre 1–7.
--   'mes'   — meses do calendário, recortados ao período.
--
-- O PISO CONTINUA DENTRO: um balde antes de 01/10/2026 volta zerado, porque as
-- funções que ele chama aplicam `inicio_das_metricas()`. A função devolve o
-- balde mesmo assim — o gráfico do ano precisa do lugar de janeiro, vazio.
--
-- AS DUAS SÉRIES SEMANAIS SAEM. `metricas_prazo_por_semana` e
-- `metricas_volume_por_semana` nasceram ontem para o painel, e o painel passa a
-- ler esta. Deixá-las seria API aberta que ninguém chama — e a próxima
-- correção de "no prazo" teria que lembrar delas também.
-- =============================================================================

drop function public.metricas_prazo_por_semana(date, date);
drop function public.metricas_volume_por_semana(date, date);


create function public.metricas_serie_da_equipe(p_inicio date, p_fim date, p_grao text)
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

  if p_grao is null or p_grao not in ('bloco', 'mes') then
    raise exception 'O grão da série é ''bloco'' ou ''mes''.';
  end if;

  v_baldes := case p_grao
    when 'bloco' then greatest(1, (p_fim - p_inicio + 1) / 7)
    else ((extract(year from p_fim) * 12 + extract(month from p_fim))
          - (extract(year from p_inicio) * 12 + extract(month from p_inicio)))::integer + 1
  end;

  -- Um ano em blocos (52) ou cinco anos em meses (60) cabem; mais que isso é
  -- pedido que nenhuma tela faz, e cada balde refaz três consultas.
  if v_baldes > 62 then
    raise exception 'Período longo demais para a série (% pedaços; o limite é 62).', v_baldes;
  end if;

  return query
  with baldes as (
    select (p_inicio + 7 * k) as b_ini,
           case when k = v_baldes - 1 then p_fim else p_inicio + 7 * k + 6 end as b_fim
    from generate_series(0, v_baldes - 1) as k
    where p_grao = 'bloco'
    union all
    select greatest(m::date, p_inicio),
           least((m + interval '1 month' - interval '1 day')::date, p_fim)
    from generate_series(date_trunc('month', p_inicio::timestamp), p_fim::timestamp, interval '1 month') as m
    where p_grao = 'mes'
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
  'Os KPIs da equipe por pedaço do período — blocos de 7 dias a partir do começo (o último absorve a sobra) ou meses. Cada linha: prazo (enviados, no prazo, medianas até o envio e até o ADM), volume e tempo por tipo de etapa (jsonb) e o que voltou para ajuste. Chama as funções de métrica que já existem, balde a balde, para as definições não se duplicarem. Só gestão.';

revoke all on function public.metricas_serie_da_equipe(date, date, text) from public, anon;
grant execute on function public.metricas_serie_da_equipe(date, date, text) to authenticated;
