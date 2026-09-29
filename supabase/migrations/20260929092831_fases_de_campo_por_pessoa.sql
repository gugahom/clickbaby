-- =============================================================================
-- AS FASES DO TRABALHO DE CAMPO, POR PESSOA (29/09/2026, pedido do gestor).
-- =============================================================================
--
-- "Sempre que clicarmos em um funcionário, abra um mini perfil (…) com todas as
-- infos que coletamos nos cards (…) quantidade de produção e tempo médio em
-- cada etapa dessa produção." Quase tudo o que o card coleta já tinha função de
-- métrica (20260929020655). Faltava a única coisa que nasceu DEPOIS delas: as
-- fases de campo (20260928183313) — o pedido que as criou já dizia que elas
-- "vão servir de métrica nos relatórios".
--
-- O TEMPO DE UMA FASE é do instante em que ela foi declarada ao instante em que
-- a próxima foi — ou, na última, à conclusão da etapa. Sai dos carimbos de
-- `eventos` (`fase_de_campo_registrada`, com `ocorrido_em` do servidor), e não
-- de `segundos_na_anterior` do payload, porque a ÚLTIMA fase não tem evento
-- seguinte que a meça: só a conclusão da etapa fecha o parto.
--
-- A MESMA FASE DUAS VEZES NA MESMA ETAPA SOMA (ida e volta: CCO, parto, CCO de
-- novo), e a média é POR ETAPA — "quanto tempo um parto dela passa em cuidados",
-- não "quanto dura cada toque no seletor".
--
-- AS MESMAS REGRAS DAS OUTRAS MÉTRICAS: crédito do RESPONSÁVEL, só etapas
-- CONCLUÍDAS no período, piso de 01/10/2026 dentro da função, só gestão.
-- NENHUMA FASE PASSA DA CONCLUSÃO: a etapa acabou ali. Uma fase declarada
-- depois de concluir (registro atrasado) não tem duração e fica de fora — e
-- também não estica a anterior até ela, que é o defeito que o teste F1 pegou
-- na primeira versão desta função (o parto de 60 minutos virava 90).
-- =============================================================================

create function public.metricas_fases_de_campo(p_inicio date, p_fim date)
returns table (
  pessoa_id  uuid,
  etapa_tipo public.etapa_tipo,
  fase       public.fase_de_campo,
  etapas     integer,
  soma_min   numeric,
  media_min  numeric
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
  with etapas_do_periodo as (
    select ce.id, ce.tipo, ce.responsavel_id, ce.concluido_em
    from public.caso_etapas ce
    where ce.status = 'concluida'
      and ce.responsavel_id is not null
      and ce.tipo in ('entrada', 'nascimento')
      and ce.concluido_em >= v_ini
      and ce.concluido_em <  v_fim
  ),
  marcas as (
    select e.caso_etapa_id,
           (e.payload->>'fase')::public.fase_de_campo as fase,
           e.ocorrido_em,
           lead(e.ocorrido_em) over (partition by e.caso_etapa_id order by e.ocorrido_em, e.id) as proxima
    from public.eventos e
    join etapas_do_periodo c on c.id = e.caso_etapa_id
    where e.tipo = 'fase_de_campo_registrada'
  ),
  por_etapa as (
    select c.responsavel_id, c.tipo, m.caso_etapa_id, m.fase,
           sum(extract(epoch from (least(coalesce(m.proxima, c.concluido_em), c.concluido_em) - m.ocorrido_em)) / 60.0) as minutos
    from marcas m
    join etapas_do_periodo c on c.id = m.caso_etapa_id
    where least(coalesce(m.proxima, c.concluido_em), c.concluido_em) > m.ocorrido_em
    group by c.responsavel_id, c.tipo, m.caso_etapa_id, m.fase
  )
  select pe.responsavel_id,
         pe.tipo,
         pe.fase,
         count(*)::integer,
         round(sum(pe.minutos)::numeric, 1),
         round(avg(pe.minutos)::numeric, 1)
  from por_etapa pe
  group by pe.responsavel_id, pe.tipo, pe.fase;
end;
$$;

comment on function public.metricas_fases_de_campo(date, date) is
  'Quanto tempo cada pessoa passa em cada fase do trabalho de campo (entrada: deslocamento/recebimento, aguardando internamento; nascimento: admissão CCO, nascimento, cuidados), por etapa concluída no período: quantas etapas, soma e média em minutos. A fase dura da declaração à próxima, ou à conclusão da etapa. Crédito do responsável. Só gestão.';

revoke all on function public.metricas_fases_de_campo(date, date) from public, anon;
grant execute on function public.metricas_fases_de_campo(date, date) to authenticated;
