-- =============================================================================
-- O GRÁFICO DO RECORTE E O PADRÃO DE TEMPO EM USO (30/09/2026, pedido do gestor)
-- =============================================================================
--
-- Duas funções novas, as duas só da gestão e só de leitura:
--
--   `operacao_grafico`          — "todo filtro colocado virar gráfico": os
--                                 números do recorte do relatório externo,
--                                 quebrados no tempo (dia, mês) ou por uma
--                                 dimensão (maternidade, pacote, situação…).
--   `metricas_dentro_do_padrao` — "os padrões que esperam (…) para que seja
--                                 feito nessa média": quantas etapas de cada
--                                 pessoa ficaram dentro do padrão de tempo.
--                                 Até aqui a régua existia e ninguém a lia.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. O gráfico do recorte
-- -----------------------------------------------------------------------------
--
-- MESMA REGRA DE FILTRO das outras três (`operacao_marcas`, casos sem falha) e
-- os MESMOS números de `operacao_resumo`, só que por pedaço — por isso somar as
-- linhas dá o resumo, e o gráfico nunca discorda dos cartões em cima dele.
-- A mediana é refeita pedaço a pedaço, no banco: mediana não se compõe.
--
-- Pedaço sem caso não vem: a tela preenche os dias vazios do eixo do tempo, e
-- numa dimensão a opção sem caso não tem o que desenhar.
--
-- `parto_por` agrupa pelo NOME de quem fotografou o parto, que é o que a view
-- tem; duas pessoas com o mesmo nome cairiam juntas, e hoje não há.

create function public.operacao_grafico(p_filtros jsonb, p_eixo text)
returns table (
  chave                   text,
  rotulo                  text,
  casos                   integer,
  partos                  integer,
  enviados                integer,
  no_prazo                integer,
  mediana_horas_ate_envio numeric,
  total_despesas          numeric,
  cancelados              integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform public.exigir_gestao();

  if p_eixo is null or p_eixo not in (
    'dia', 'mes', 'maternidade', 'pacote', 'situacao', 'prazo',
    'parto_por', 'turno', 'dia_semana', 'termo'
  ) then
    raise exception 'Eixo do gráfico desconhecido: %.', p_eixo;
  end if;

  return query
  with x as (
    select o.*,
           case p_eixo
             when 'dia'         then o.dia::text
             when 'mes'         then to_char(date_trunc('month', o.dia), 'YYYY-MM-DD')
             when 'maternidade' then coalesce(o.maternidade_id::text, 'sem')
             when 'pacote'      then coalesce(o.pacote_id::text, 'sem')
             when 'situacao'    then o.situacao
             when 'prazo'       then o.prazo
             when 'parto_por'   then coalesce(o.fotografou_o_parto, 'sem')
             when 'turno'       then coalesce(o.turno, 'sem')
             when 'dia_semana'  then o.dia_semana::text
             when 'termo'       then o.termo
           end as g_chave,
           case p_eixo
             when 'maternidade' then coalesce(o.maternidade_sigla, 'Sem maternidade')
             when 'pacote'      then coalesce(o.pacote_nome, 'Sem pacote')
             when 'parto_por'   then coalesce(o.fotografou_o_parto, 'Sem parto registrado')
           end as g_rotulo
    from public.operacao_marcas(p_filtros) m
    join public.operacao_dos_casos o on o.id = m.id
    where m.falhas = 0
  )
  select x.g_chave,
         max(x.g_rotulo),
         count(*)::integer,
         count(*) filter (where x.nasceu)::integer,
         count(*) filter (where x.prazo in ('no_prazo', 'atrasado'))::integer,
         count(*) filter (where x.prazo = 'no_prazo')::integer,
         round((percentile_cont(0.5) within group (order by x.horas_ate_envio))::numeric, 1),
         coalesce(sum(x.total_despesas), 0),
         count(*) filter (where x.situacao in ('cancelado_agenda', 'cancelado_equipe'))::integer
  from x
  where x.g_chave is not null
  group by x.g_chave;
end;
$$;

comment on function public.operacao_grafico(jsonb, text) is
  'Relatório externo: os números do recorte (os mesmos de operacao_resumo) quebrados por dia, mês ou dimensão (maternidade, pacote, situacao, prazo, parto_por, turno, dia_semana, termo). Só gestão.';

revoke all on function public.operacao_grafico(jsonb, text) from public, anon;
grant execute on function public.operacao_grafico(jsonb, text) to authenticated;


-- -----------------------------------------------------------------------------
-- 2. Dentro do padrão
-- -----------------------------------------------------------------------------
--
-- Uma linha por (pessoa, tipo): quantas etapas MEDIDAS (ciclo ≥ 5 min, a mesma
-- régua de `metricas_por_etapa`) tinham padrão para comparar, e quantas ficaram
-- dentro dele (ciclo líquido ≤ minutos esperados).
--
-- O PADRÃO É O DA DATA DA CONCLUSÃO. A régua é versionada: mudar o padrão hoje
-- não reescreve o mês que passou. A exceção é o que veio ANTES DA PRIMEIRA
-- régua da etapa — ali vale a primeira. Sem isso, o gestor que define o padrão
-- em novembro olharia outubro e veria "sem padrão" em tudo, e a pergunta que ele
-- quer responder ("a equipe está fazendo nessa média?") ficaria sem resposta
-- até o mês seguinte. É o mesmo arranjo da régua de pontos, que vale desde
-- 01/10 mesmo definida depois.
--
-- Crédito do RESPONSÁVEL, piso de 01/10/2026, só gestão — como as outras.
-- A equipe é a soma das pessoas: contagem se compõe.

create function public.metricas_dentro_do_padrao(p_inicio date, p_fim date)
returns table (
  pessoa_id  uuid,
  tipo       public.etapa_tipo,
  medidas    integer,
  com_padrao integer,
  dentro     integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_ini timestamptz;
  v_fim timestamptz;
begin
  perform public.exigir_gestao();
  select p.inicio, p.fim into v_ini, v_fim from public.periodo_das_metricas(p_inicio, p_fim) p;

  return query
  with conc as (
    select ce.tipo, ce.responsavel_id,
           (ce.concluido_em at time zone 'America/Sao_Paulo')::date as dia,
           extract(epoch from (ce.concluido_em - ce.iniciado_em
                               - coalesce(ce.pausa_acumulada, interval '0'))) / 60.0 as ciclo_min
    from public.caso_etapas ce
    where ce.status = 'concluida'
      and ce.responsavel_id is not null
      and ce.concluido_em >= v_ini
      and ce.concluido_em <  v_fim
  ),
  medidas as (
    select c.*,
           coalesce(
             (select pt.minutos_esperados from public.padroes_tempo pt
               where pt.etapa_tipo = c.tipo and pt.pacote_id is null and pt.vigente_desde <= c.dia
               order by pt.vigente_desde desc limit 1),
             (select pt.minutos_esperados from public.padroes_tempo pt
               where pt.etapa_tipo = c.tipo and pt.pacote_id is null
               order by pt.vigente_desde asc limit 1)
           ) as padrao_min
    from conc c
    where c.ciclo_min >= 5
  )
  select m.responsavel_id,
         m.tipo,
         count(*)::integer,
         count(*) filter (where m.padrao_min is not null)::integer,
         count(*) filter (where m.ciclo_min <= m.padrao_min)::integer
  from medidas m
  group by m.responsavel_id, m.tipo;
end;
$$;

comment on function public.metricas_dentro_do_padrao(date, date) is
  'Por pessoa e tipo de etapa: quantas etapas medidas (ciclo ≥ 5 min) tinham padrão de tempo e quantas ficaram dentro dele. Padrão da data da conclusão; antes da primeira régua da etapa, vale a primeira. Crédito do responsável, piso de 01/10/2026. Só gestão.';

revoke all on function public.metricas_dentro_do_padrao(date, date) from public, anon;
grant execute on function public.metricas_dentro_do_padrao(date, date) to authenticated;
