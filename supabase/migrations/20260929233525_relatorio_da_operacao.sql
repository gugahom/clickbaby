-- =============================================================================
-- O RELATÓRIO EXTERNO — A OPERAÇÃO INTEIRA, COM FILTROS (29/09/2026, pedido do
-- gestor).
-- =============================================================================
--
-- O interno responde "como a equipe está trabalhando"; este responde "o que
-- está acontecendo na operação" — e o que importa nele, nas palavras do gestor,
-- são os FILTROS: "como SóCarrão ou Webmotors, um filtro bem completo, com
-- diversas possibilidades, de misturar vários tipos de filtros para chegar num
-- denominador comum".
--
-- O MODELO É BUSCA FACETADA, o dos classificados:
--   * dentro de um grupo as opções SOMAM (HSC ou HNSG), entre grupos elas
--     CORTAM (HSC e atrasado);
--   * cada opção mostra QUANTOS CASOS ela daria, contando com todos os OUTROS
--     filtros marcados e ignorando o do próprio grupo — é o que deixa misturar
--     sem cair num resultado vazio: a pessoa vê o tamanho antes de clicar.
--
-- TRÊS FUNÇÕES, todas só da gestão (a lista tem nome de mãe e bebê — seção 10):
--   `operacao_buscar`   — a página de casos do recorte, já ordenada;
--   `operacao_facetas`  — a contagem de cada opção de cada grupo;
--   `operacao_resumo`   — os números do recorte (quantos, prazo, despesas).
-- As três leem a MESMA view e a MESMA regra de filtro (`operacao_marcas`), para
-- a lista, as contagens e o resumo nunca discordarem.
--
-- OS FILTROS CHEGAM NUM `jsonb`, com as chaves que `operacao_marcas` conhece.
-- Chave desconhecida é ignorada, lista vazia é "sem filtro". A tela escreve o
-- mesmo objeto no endereço da página, e por isso um link leva a busca junto.
--
-- NÃO HÁ PISO DE DATA, ao contrário do relatório interno. Aquele mede PESSOAS e
-- começa em 01/10/2026 porque setembro creditava partos a quem não estava na
-- sala; este acha CASOS, e um caso de agosto continua sendo um caso que alguém
-- vai querer achar. A tela abre no mês corrente.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Um caso, com tudo por que ele pode ser filtrado
-- -----------------------------------------------------------------------------
--
-- Sem GRANT para ninguém: só as funções abaixo (SECURITY DEFINER, que conferem
-- a gestão) a leem. `security_barrier` não é preciso — ninguém a consulta por
-- fora.

create view public.operacao_dos_casos as
select
  q.id,
  q.mae_nome,
  q.bebe_nome,
  q.dia,
  q.previsao_em,
  q.maternidade_id,
  q.maternidade_sigla,
  q.maternidade_nome,
  q.pacote_id,
  q.pacote_nome,
  -- A SITUAÇÃO que a gestão lê, e não o status do banco: "em Entregáveis" é
  -- caso aberto esperando o ADM, e o cancelamento se separa pelo autor — o sync
  -- só escreve os dois textos fixos (ver restaurar_caso_cancelado_pelo_sync).
  case
    when q.status_operacional = 'cancelado' then
      case
        when q.motivo_cancelamento like 'Evento removido do Google Calendar%'
          or q.motivo_cancelamento = 'Cancelado via Google Calendar (card cinza)'
        then 'cancelado_agenda'
        else 'cancelado_equipe'
      end
    when q.eh_rascunho then 'rascunho'
    when q.status_operacional = 'encerrado' then 'encerrado'
    when q.liberado_para_entrega_em is not null then 'em_entregaveis'
    else 'aberto'
  end as situacao,
  -- O PRAZO conta no ENVIO para Entregáveis, como no relatório interno. Caso
  -- encerrado antes de 06/09/2026 não tem envio (a aba não existia): vale o
  -- encerramento.
  case
    when q.status_operacional = 'cancelado' or q.vence_em is null then 'sem_prazo'
    when e.enviado_em is not null then
      case when e.enviado_em <= q.vence_em then 'no_prazo' else 'atrasado' end
    when now() > q.vence_em and not q.sla_pausado then 'vencido'
    else 'correndo'
  end as prazo,
  round((extract(epoch from (e.enviado_em - q.nascimento_concluido_em)) / 3600.0)::numeric, 1) as horas_ate_envio,
  q.nascimento_concluido_em is not null as nasceu,
  coalesce(q.total_despesas, 0) as total_despesas,
  coalesce(q.termo_status::text, 'sem_resposta') as termo,
  q.avaliacao_em is not null as avaliado,
  (q.na_uti or coalesce(q.uti_horas_total, 0) > 0) as passou_uti,
  exists (
    select 1 from public.handoffs h
    join public.caso_etapas ce on ce.id = h.caso_etapa_id
    where ce.caso_id = q.id
  ) as teve_handoff,
  q.reaberto_em is not null as reaberto,
  array(
    select distinct case ce.tipo
                      when 'click_home' then 'new_born'
                      when 'album' then 'fotolivro'
                      else 'video_master'
                    end
    from public.caso_etapas ce
    where ce.caso_id = q.id
      and ce.tipo in ('click_home', 'album', 'edicao_video')
      and ce.status <> 'dispensada'
  ) as adicionais,
  -- O TURNO é o do PARTO quando ele já aconteceu, e o da previsão antes disso.
  case
    when coalesce(q.nascimento_concluido_em, q.previsao_em) is null then null
    when extract(hour from coalesce(q.nascimento_concluido_em, q.previsao_em) at time zone 'America/Sao_Paulo') < 6 then 'madrugada'
    when extract(hour from coalesce(q.nascimento_concluido_em, q.previsao_em) at time zone 'America/Sao_Paulo') < 12 then 'manha'
    when extract(hour from coalesce(q.nascimento_concluido_em, q.previsao_em) at time zone 'America/Sao_Paulo') < 18 then 'tarde'
    else 'noite'
  end as turno,
  extract(isodow from q.dia)::integer as dia_semana,
  (
    select p.nome from public.caso_etapas ce
    join public.pessoas p on p.id = ce.responsavel_id
    where ce.caso_id = q.id and ce.tipo = 'nascimento'
    order by ce.rodada
    limit 1
  ) as fotografou_o_parto,
  -- Para a busca por nome: sem acento e sem caixa, como as listas de pessoas.
  translate(lower(q.mae_nome || ' ' || coalesce(q.bebe_nome, '')),
            'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc') as nome_de_busca
from public.quadro_casos q
cross join lateral (
  select coalesce(
    q.liberado_para_entrega_em,
    case when q.status_operacional = 'encerrado' then q.encerrado_em end
  ) as enviado_em
) e;

comment on view public.operacao_dos_casos is
  'Um caso por linha, com tudo por que o relatório externo filtra: situação, prazo, horas até o envio, despesas, termo, avaliação, UTI, handoff, reabertura, adicionais, turno, dia da semana. Sem GRANT: lida só pelas funções operacao_*.';

revoke all on table public.operacao_dos_casos from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- 2. A regra de filtro — UMA, lida pelas três funções
-- -----------------------------------------------------------------------------
--
-- `operacao_marcas` lê o `jsonb` UMA VEZ e devolve, para cada caso do recorte de
-- data, nome e faixas, uma MARCA por grupo: passa ou não passa. Com isso:
--   * a LISTA e o RESUMO são os casos sem falha nenhuma;
--   * a CONTAGEM de uma opção do grupo X são os casos em que só X falhou, ou
--     nenhum — "todos os outros filtros, menos o meu", sem refazer a regra.
-- A primeira versão avaliava a regra caso a caso e grupo a grupo, relendo o
-- `jsonb` a cada vez: 8 segundos para as facetas de 1.800 casos.
--
-- `pessoas` e `etapas` são DOIS grupos de UMA condição ("teve etapa de tal tipo
-- feita por tal pessoa"): a marca vem inteira e também sem cada metade, para a
-- faceta de cada um ignorar só a si mesmo.

create function public.lista_do_filtro(p_filtros jsonb, p_chave text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(p_filtros -> p_chave) = 'array'
      then array(select jsonb_array_elements_text(p_filtros -> p_chave))
    else '{}'::text[]
  end
$$;

revoke all on function public.lista_do_filtro(jsonb, text) from public;


create function public.operacao_marcas(p_filtros jsonb)
returns table (
  id                     uuid,
  m_maternidades         boolean,
  m_pacotes              boolean,
  m_situacoes            boolean,
  m_prazos               boolean,
  m_termos               boolean,
  m_adicionais           boolean,
  m_turnos               boolean,
  m_dias_semana          boolean,
  m_uti                  boolean,
  m_handoff              boolean,
  m_reaberto             boolean,
  m_avaliado             boolean,
  m_com_despesa          boolean,
  m_trabalho             boolean,
  m_trabalho_sem_pessoas boolean,
  m_trabalho_sem_etapas  boolean,
  -- Quantos dos grupos acima (o trabalho inteiro contando como um) falharam.
  falhas                 integer
)
language plpgsql
stable
set search_path = ''
as $$
#variable_conflict use_column
declare
  f           jsonb   := coalesce(p_filtros, '{}'::jsonb);
  v_de        date    := nullif(f ->> 'de', '')::date;
  v_ate       date    := nullif(f ->> 'ate', '')::date;
  v_busca     text    := translate(lower(btrim(coalesce(f ->> 'busca', ''))),
                                   'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc');
  v_mat       text[]  := public.lista_do_filtro(f, 'maternidades');
  v_pac       text[]  := public.lista_do_filtro(f, 'pacotes');
  v_sit       text[]  := public.lista_do_filtro(f, 'situacoes');
  v_prazo     text[]  := public.lista_do_filtro(f, 'prazos');
  v_termo     text[]  := public.lista_do_filtro(f, 'termos');
  v_adic      text[]  := public.lista_do_filtro(f, 'adicionais');
  v_turno     text[]  := public.lista_do_filtro(f, 'turnos');
  v_dow       text[]  := public.lista_do_filtro(f, 'dias_semana');
  v_pes       text[]  := public.lista_do_filtro(f, 'pessoas');
  v_etp       text[]  := public.lista_do_filtro(f, 'etapas');
  v_uti       boolean := case when jsonb_typeof(f -> 'uti') = 'boolean' then (f ->> 'uti')::boolean end;
  v_hand      boolean := case when jsonb_typeof(f -> 'handoff') = 'boolean' then (f ->> 'handoff')::boolean end;
  v_reab      boolean := case when jsonb_typeof(f -> 'reaberto') = 'boolean' then (f ->> 'reaberto')::boolean end;
  v_aval      boolean := case when jsonb_typeof(f -> 'avaliado') = 'boolean' then (f ->> 'avaliado')::boolean end;
  v_desp      boolean := case when jsonb_typeof(f -> 'com_despesa') = 'boolean' then (f ->> 'com_despesa')::boolean end;
  v_horas_min numeric := nullif(f ->> 'horas_min', '')::numeric;
  v_horas_max numeric := nullif(f ->> 'horas_max', '')::numeric;
  v_desp_min  numeric := nullif(f ->> 'despesa_min', '')::numeric;
  v_desp_max  numeric := nullif(f ->> 'despesa_max', '')::numeric;
begin
  return query
  with m as (
    select
      o.id,
      (cardinality(v_mat) = 0 or o.maternidade_id::text = any (v_mat)) as m_maternidades,
      (cardinality(v_pac) = 0 or o.pacote_id::text = any (v_pac)) as m_pacotes,
      (cardinality(v_sit) = 0 or o.situacao = any (v_sit)) as m_situacoes,
      (cardinality(v_prazo) = 0 or o.prazo = any (v_prazo)) as m_prazos,
      (cardinality(v_termo) = 0 or o.termo = any (v_termo)) as m_termos,
      (cardinality(v_adic) = 0 or o.adicionais && v_adic) as m_adicionais,
      (cardinality(v_turno) = 0 or o.turno = any (v_turno)) as m_turnos,
      (cardinality(v_dow) = 0 or o.dia_semana::text = any (v_dow)) as m_dias_semana,
      (v_uti is null or o.passou_uti = v_uti) as m_uti,
      (v_hand is null or o.teve_handoff = v_hand) as m_handoff,
      (v_reab is null or o.reaberto = v_reab) as m_reaberto,
      (v_aval is null or o.avaliado = v_aval) as m_avaliado,
      (v_desp is null or (o.total_despesas > 0) = v_desp) as m_com_despesa,
      (
        (cardinality(v_pes) = 0 and cardinality(v_etp) = 0)
        or exists (
          select 1 from public.caso_etapas ce
          where ce.caso_id = o.id and ce.status <> 'dispensada' and ce.responsavel_id is not null
            and (cardinality(v_pes) = 0 or ce.responsavel_id::text = any (v_pes))
            and (cardinality(v_etp) = 0 or ce.tipo::text = any (v_etp))
        )
      ) as m_trabalho,
      (
        cardinality(v_etp) = 0
        or exists (
          select 1 from public.caso_etapas ce
          where ce.caso_id = o.id and ce.status <> 'dispensada' and ce.responsavel_id is not null
            and ce.tipo::text = any (v_etp)
        )
      ) as m_trabalho_sem_pessoas,
      (
        cardinality(v_pes) = 0
        or exists (
          select 1 from public.caso_etapas ce
          where ce.caso_id = o.id and ce.status <> 'dispensada'
            and ce.responsavel_id::text = any (v_pes)
        )
      ) as m_trabalho_sem_etapas
    from public.operacao_dos_casos o
    -- Data, nome e faixas não são grupos com contagem: cortam antes de tudo.
    where (v_de is null or o.dia >= v_de)
      and (v_ate is null or o.dia <= v_ate)
      and (v_busca = '' or o.nome_de_busca like '%' || v_busca || '%')
      and (v_horas_min is null or o.horas_ate_envio >= v_horas_min)
      and (v_horas_max is null or o.horas_ate_envio <= v_horas_max)
      and (v_desp_min is null or o.total_despesas >= v_desp_min)
      and (v_desp_max is null or o.total_despesas <= v_desp_max)
  )
  select m.*,
         (   (not m.m_maternidades)::int + (not m.m_pacotes)::int + (not m.m_situacoes)::int
           + (not m.m_prazos)::int + (not m.m_termos)::int + (not m.m_adicionais)::int
           + (not m.m_turnos)::int + (not m.m_dias_semana)::int + (not m.m_uti)::int
           + (not m.m_handoff)::int + (not m.m_reaberto)::int + (not m.m_avaliado)::int
           + (not m.m_com_despesa)::int + (not m.m_trabalho)::int)::integer
  from m;
end;
$$;

comment on function public.operacao_marcas(jsonb) is
  'A regra de filtro do relatório externo: para cada caso do recorte (data, nome, faixas), uma marca por grupo — passa ou não — e quantos grupos falharam. Dentro de um grupo as opções somam; entre grupos, cortam. Interna: lida só pelas funções operacao_*.';

revoke all on function public.operacao_marcas(jsonb) from public;


-- -----------------------------------------------------------------------------
-- 3. A página de casos
-- -----------------------------------------------------------------------------
--
-- Ordenação TOTAL, com o id no fim (seção 5 do CLAUDE.md): a página seguinte
-- não pode repetir nem pular caso. `total` vem em toda linha, para a tela dizer
-- "51–100 de 312" sem uma segunda consulta.

create function public.operacao_buscar(
  p_filtros      jsonb,
  p_ordem        text default 'recentes',
  p_limite       integer default 50,
  p_deslocamento integer default 0
)
returns table (
  id                 uuid,
  mae_nome           text,
  bebe_nome          text,
  dia                date,
  maternidade_sigla  text,
  pacote_nome        text,
  situacao           text,
  prazo              text,
  horas_ate_envio    numeric,
  total_despesas     numeric,
  termo              text,
  fotografou_o_parto text,
  adicionais         text[],
  passou_uti         boolean,
  reaberto           boolean,
  total              integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform public.exigir_gestao();

  if p_limite is null or p_limite < 1 or p_limite > 200 then
    raise exception 'A página tem de 1 a 200 casos.';
  end if;

  return query
  select o.id, o.mae_nome, o.bebe_nome, o.dia, o.maternidade_sigla, o.pacote_nome,
         o.situacao, o.prazo, o.horas_ate_envio, o.total_despesas, o.termo,
         o.fotografou_o_parto, o.adicionais, o.passou_uti, o.reaberto,
         (count(*) over ())::integer
  from public.operacao_marcas(p_filtros) m
  join public.operacao_dos_casos o on o.id = m.id
  where m.falhas = 0
  order by
    case when p_ordem = 'antigos' then o.dia end asc nulls last,
    case when p_ordem = 'mais_horas' then o.horas_ate_envio end desc nulls last,
    case when p_ordem = 'mais_despesas' then o.total_despesas end desc nulls last,
    case when p_ordem = 'maternidade' then o.maternidade_sigla end asc nulls last,
    o.dia desc nulls last,
    o.previsao_em desc nulls last,
    o.id
  limit p_limite
  offset greatest(coalesce(p_deslocamento, 0), 0);
end;
$$;

comment on function public.operacao_buscar(jsonb, text, integer, integer) is
  'Relatório externo: uma página dos casos que passam nos filtros, ordenada (recentes, antigos, mais_horas, mais_despesas, maternidade) e desempatada pelo id; total do recorte em cada linha. Só gestão.';

revoke all on function public.operacao_buscar(jsonb, text, integer, integer) from public, anon;
grant execute on function public.operacao_buscar(jsonb, text, integer, integer) to authenticated;


-- -----------------------------------------------------------------------------
-- 4. As facetas
-- -----------------------------------------------------------------------------
--
-- Uma linha por (grupo, opção) com a contagem de casos. Um caso conta para o
-- grupo X quando NENHUM grupo falhou, ou quando o ÚNICO que falhou foi o X. Só
-- opções com caso aparecem: a tela junta as marcadas que zeraram e as opções
-- fixas dos grupos pequenos.

create function public.operacao_facetas(p_filtros jsonb)
returns table (
  grupo    text,
  valor    text,
  rotulo   text,
  contagem integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  f     jsonb  := coalesce(p_filtros, '{}'::jsonb);
  v_pes text[] := public.lista_do_filtro(f, 'pessoas');
  v_etp text[] := public.lista_do_filtro(f, 'etapas');
begin
  perform public.exigir_gestao();

  return query
  with b as materialized (
    select o.*, m.m_maternidades, m.m_pacotes, m.m_situacoes, m.m_prazos, m.m_termos,
           m.m_adicionais, m.m_turnos, m.m_dias_semana, m.m_uti, m.m_handoff, m.m_reaberto,
           m.m_avaliado, m.m_com_despesa, m.m_trabalho, m.m_trabalho_sem_pessoas,
           m.m_trabalho_sem_etapas, m.falhas
    from public.operacao_marcas(f) m
    join public.operacao_dos_casos o on o.id = m.id
    where m.falhas <= 1
  ),
  por_grupo as (
    select 'maternidades' as g, b.maternidade_id::text as v, coalesce(b.maternidade_sigla, 'Sem maternidade') as r
      from b where b.falhas - (not b.m_maternidades)::int = 0
    union all
    select 'pacotes', b.pacote_id::text, coalesce(b.pacote_nome, 'Sem pacote')
      from b where b.falhas - (not b.m_pacotes)::int = 0
    union all
    select 'situacoes', b.situacao, null from b where b.falhas - (not b.m_situacoes)::int = 0
    union all
    select 'prazos', b.prazo, null from b where b.falhas - (not b.m_prazos)::int = 0
    union all
    select 'termos', b.termo, null from b where b.falhas - (not b.m_termos)::int = 0
    union all
    select 'adicionais', a.v, null
      from b cross join lateral unnest(b.adicionais) as a(v)
      where b.falhas - (not b.m_adicionais)::int = 0
    union all
    select 'turnos', b.turno, null from b where b.falhas - (not b.m_turnos)::int = 0
    union all
    select 'dias_semana', b.dia_semana::text, null from b where b.falhas - (not b.m_dias_semana)::int = 0
    union all
    select 'uti', b.passou_uti::text, null from b where b.falhas - (not b.m_uti)::int = 0
    union all
    select 'handoff', b.teve_handoff::text, null from b where b.falhas - (not b.m_handoff)::int = 0
    union all
    select 'reaberto', b.reaberto::text, null from b where b.falhas - (not b.m_reaberto)::int = 0
    union all
    select 'avaliado', b.avaliado::text, null from b where b.falhas - (not b.m_avaliado)::int = 0
    union all
    select 'com_despesa', (b.total_despesas > 0)::text, null from b where b.falhas - (not b.m_com_despesa)::int = 0
    union all
    -- PESSOAS: um caso conta uma vez para cada pessoa que fez nele uma etapa do
    -- tipo marcado (ou de qualquer tipo, sem tipo marcado).
    select 'pessoas', x.pid::text, x.nome
      from b
      cross join lateral (
        select distinct ce.responsavel_id as pid, p.nome
        from public.caso_etapas ce
        join public.pessoas p on p.id = ce.responsavel_id
        where ce.caso_id = b.id and ce.status <> 'dispensada'
          and (cardinality(v_etp) = 0 or ce.tipo::text = any (v_etp))
      ) x
      where b.falhas - (not b.m_trabalho)::int = 0 and b.m_trabalho_sem_pessoas
    union all
    select 'etapas', x.tipo, null
      from b
      cross join lateral (
        select distinct ce.tipo::text as tipo
        from public.caso_etapas ce
        where ce.caso_id = b.id and ce.status <> 'dispensada' and ce.responsavel_id is not null
          and (cardinality(v_pes) = 0 or ce.responsavel_id::text = any (v_pes))
      ) x
      where b.falhas - (not b.m_trabalho)::int = 0 and b.m_trabalho_sem_etapas
  )
  select pg.g, pg.v, max(pg.r), count(*)::integer
  from por_grupo pg
  where pg.v is not null
  group by pg.g, pg.v;
end;
$$;

comment on function public.operacao_facetas(jsonb) is
  'Relatório externo: para cada grupo de filtro e cada opção, quantos casos ela daria com todos os OUTROS filtros marcados (busca facetada). Só gestão.';

revoke all on function public.operacao_facetas(jsonb) from public, anon;
grant execute on function public.operacao_facetas(jsonb) to authenticated;


-- -----------------------------------------------------------------------------
-- 5. Os números do recorte
-- -----------------------------------------------------------------------------

create function public.operacao_resumo(p_filtros jsonb)
returns table (
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

  return query
  select count(*)::integer,
         count(*) filter (where o.nasceu)::integer,
         count(*) filter (where o.prazo in ('no_prazo', 'atrasado'))::integer,
         count(*) filter (where o.prazo = 'no_prazo')::integer,
         round((percentile_cont(0.5) within group (order by o.horas_ate_envio))::numeric, 1),
         coalesce(sum(o.total_despesas), 0),
         count(*) filter (where o.situacao in ('cancelado_agenda', 'cancelado_equipe'))::integer
  from public.operacao_marcas(p_filtros) m
  join public.operacao_dos_casos o on o.id = m.id
  where m.falhas = 0;
end;
$$;

comment on function public.operacao_resumo(jsonb) is
  'Relatório externo: os números dos casos que passam nos filtros — quantos, partos, enviados e no prazo, mediana de horas do parto ao envio, total de despesas, cancelados. Só gestão.';

revoke all on function public.operacao_resumo(jsonb) from public, anon;
grant execute on function public.operacao_resumo(jsonb) to authenticated;
