-- =============================================================================
-- O COMERCIAL ABRE O RELATÓRIO EXTERNO INTEIRO, E O BIRTH ENTRA NAS OFERTAS
-- (01/10/2026, pedido do gestor)
-- =============================================================================
--
-- DUAS MUDANÇAS na regra de ontem (20261001001607):
--
-- 1. A TELA COMERCIAL ABRE O RELATÓRIO EXTERNO INTEIRO. Ontem ela abria só o
--    modo comercial, e quem tinha só ela via um destino "Comercial" que parecia
--    a página comercial — que ainda não existe. O gestor: "eu ainda quero que
--    continue como relatório (…) a pessoa vai lá e muda o toggle para
--    comercial". Então a pessoa entra no "Relatório externo" como a gestão, e
--    liga a chave quando quer. O relatório INTERNO (métricas e ranking das
--    pessoas) continua só da tela Relatórios.
--
-- 2. O BIRTH ENTRA NAS OFERTAS. "Os BIRTH são vendidos, então têm que ser
--    apresentados": a oferta nova "birth" é a venda do próprio pacote, com as
--    mesmas fases. No BIRTH, New Born e Foto/Livro ficam ESCONDIDOS ("apenas
--    birth, mas em casos MUITO RAROS é possível que aconteça essa venda (…)
--    num caso específico"): o comercial abre uma delas num BIRTH pela própria
--    célula, e a partir daí ela anda como em qualquer parto. Reels não, nunca:
--    o BIRTH já faz o reels.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. A porta
-- -----------------------------------------------------------------------------

create or replace function public.exigir_operacao(p_filtros jsonb)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- `p_filtros` ficou na assinatura: as quatro funções que chamam esta porta
  -- continuam iguais, e o modo comercial pode voltar a ter regra própria.
  if public.tem_tela('relatorios') or public.tem_tela('comercial') then
    return;
  end if;
  raise exception 'O relatório externo é de quem tem a tela Relatórios ou a tela Comercial.';
end;
$$;

comment on function public.exigir_operacao(jsonb) is
  'A porta das funções operacao_*: a tela Relatórios ou a tela Comercial abrem o relatório externo inteiro (desde 01/10/2026). Interna.';


-- -----------------------------------------------------------------------------
-- 2. A view: o BIRTH vira parto do comercial, com a oferta dele
-- -----------------------------------------------------------------------------

create or replace view public.operacao_dos_casos as
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
            'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc') as nome_de_busca,
  -- NO FIM: `create or replace view` só aceita coluna nova depois das que
  -- existem (30/09/2026).
  -- OS LINKS que o caso tem, pelo TIPO — o endereço só sai na busca, página a
  -- página, e nunca na contagem.
  array(
    select distinct en.tipo::text from public.entregaveis en where en.caso_id = q.id
  ) as links,
  -- O EQUIPAMENTO lançado no card (o material do acompanhamento): o CEL CLICK
  -- do vídeo e o cartão das fotos, com o tipo na frente para os dois não se
  -- confundirem ("cel:CEL CLICK 3", "cartao:14 HSC"). Em maiúsculas e sem
  -- espaço sobrando: é texto digitado, e "cel click 3" é o mesmo aparelho.
  array(
    select distinct x.v
    from public.caso_etapas ce
    cross join lateral (values
      ('cel:' || nullif(upper(btrim(ce.cartao_video)), '')),
      ('cartao:' || nullif(upper(btrim(ce.cartao_foto)), ''))
    ) as x(v)
    where ce.caso_id = q.id and x.v is not null
  ) as equipamentos,
  -- O MODO COMERCIAL (30/09/2026; o BIRTH entrou em 01/10/2026). NO FIM, pela
  -- regra do `create or replace`. `comercial` diz se o caso é PARTO — com
  -- pacote, nem rascunho nem cancelado, fora de EVENTO e NEWBORN. As ofertas
  -- dizem a FASE de cada uma, ou nulo quando ela não se aplica ao caso:
  --   * BIRTH, nos dois BIRTH: a venda do próprio pacote, apresentado aos pais
  --     depois do parto (`oferta_birth`, a última coluna);
  --   * REELS, só nos BASIC e STANDARD puros — os que não venderam o vertical;
  --   * NEW BORN e FOTO/LIVRO, em todo parto que ainda não tem a etapa — MENOS
  --     no BIRTH, onde só aparecem quando o comercial as abre num caso (a venda
  --     é "muito rara", nas palavras do gestor, e mostrá-las em todo BIRTH seria
  --     ruído na lista).
  -- Sem linha em `ofertas_comerciais`, a fase é "apresentar". Uma oferta já
  -- registrada continua aparecendo depois que a venda cria a etapa.
  pc.parto as comercial,
  case
    when pc.parto and q.pacote_slug in ('basic', 'standard') then
      coalesce((select oc.fase::text from public.ofertas_comerciais oc
                where oc.caso_id = q.id and oc.oferta = 'reels'), 'apresentar')
  end as oferta_reels,
  case
    when pc.parto then
      coalesce(
        (select oc.fase::text from public.ofertas_comerciais oc
         where oc.caso_id = q.id and oc.oferta = 'new_born'),
        case when not pc.birth and not exists (
          select 1 from public.caso_etapas ce where ce.caso_id = q.id and ce.tipo = 'click_home'
        ) then 'apresentar' end
      )
  end as oferta_new_born,
  case
    when pc.parto then
      coalesce(
        (select oc.fase::text from public.ofertas_comerciais oc
         where oc.caso_id = q.id and oc.oferta = 'fotolivro'),
        case when not pc.birth and not exists (
          select 1 from public.caso_etapas ce where ce.caso_id = q.id and ce.tipo = 'album'
        ) then 'apresentar' end
      )
  end as oferta_fotolivro,
  pc.birth as eh_birth,
  case
    when pc.parto and pc.birth then
      coalesce((select oc.fase::text from public.ofertas_comerciais oc
                where oc.caso_id = q.id and oc.oferta = 'birth'), 'apresentar')
  end as oferta_birth
from public.quadro_casos q
cross join lateral (
  select coalesce(
    q.liberado_para_entrega_em,
    case when q.status_operacional = 'encerrado' then q.encerrado_em end
  ) as enviado_em
) e
cross join lateral (
  select (
    q.pacote_id is not null
    and not q.eh_rascunho
    and q.status_operacional <> 'cancelado'
    and q.pacote_slug not in ('evento', 'newborn')
  ) as parto,
  coalesce(q.pacote_slug like 'birth%', false) as birth
) pc;

revoke all on table public.operacao_dos_casos from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- 3. A regra de filtro e as contagens ganham a oferta do BIRTH
-- -----------------------------------------------------------------------------

drop function public.operacao_marcas(jsonb);

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
  m_links                boolean,
  m_equipamentos         boolean,
  m_oferta_reels         boolean,
  m_oferta_new_born      boolean,
  m_oferta_fotolivro     boolean,
  m_oferta_birth         boolean,
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
  v_links     text[]  := public.lista_do_filtro(f, 'links');
  v_equip     text[]  := public.lista_do_filtro(f, 'equipamentos');
  v_of_reels  text[]  := public.lista_do_filtro(f, 'oferta_reels');
  v_of_nb     text[]  := public.lista_do_filtro(f, 'oferta_new_born');
  v_of_livro  text[]  := public.lista_do_filtro(f, 'oferta_fotolivro');
  v_of_birth  text[]  := public.lista_do_filtro(f, 'oferta_birth');
  -- O MODO COMERCIAL corta antes de tudo, como a data: só os partos.
  v_comercial boolean := coalesce(case when jsonb_typeof(f -> 'comercial') = 'boolean' then (f ->> 'comercial')::boolean end, false);
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
      ) as m_trabalho_sem_etapas,
      -- LINKS: tem ao menos um dos tipos marcados — ou nenhum link, quando
      -- "nenhum" está marcado. As opções somam, como em todo grupo.
      (
        cardinality(v_links) = 0
        or o.links && v_links
        or ('nenhum' = any (v_links) and cardinality(o.links) = 0)
      ) as m_links,
      (cardinality(v_equip) = 0 or o.equipamentos && v_equip) as m_equipamentos,
      -- AS FASES DE CADA OFERTA: as marcadas somam; caso em que a oferta não
      -- se aplica não passa num filtro dela.
      (cardinality(v_of_reels) = 0 or o.oferta_reels = any (v_of_reels)) as m_oferta_reels,
      (cardinality(v_of_nb) = 0 or o.oferta_new_born = any (v_of_nb)) as m_oferta_new_born,
      (cardinality(v_of_livro) = 0 or o.oferta_fotolivro = any (v_of_livro)) as m_oferta_fotolivro,
      (cardinality(v_of_birth) = 0 or o.oferta_birth = any (v_of_birth)) as m_oferta_birth
    from public.operacao_dos_casos o
    -- Data, nome e faixas não são grupos com contagem: cortam antes de tudo.
    where (v_de is null or o.dia >= v_de)
      and (v_ate is null or o.dia <= v_ate)
      and (v_busca = '' or o.nome_de_busca like '%' || v_busca || '%')
      and (v_horas_min is null or o.horas_ate_envio >= v_horas_min)
      and (v_horas_max is null or o.horas_ate_envio <= v_horas_max)
      and (v_desp_min is null or o.total_despesas >= v_desp_min)
      and (v_desp_max is null or o.total_despesas <= v_desp_max)
      and (not v_comercial or o.comercial)
  )
  select m.*,
         (   (not m.m_maternidades)::int + (not m.m_pacotes)::int + (not m.m_situacoes)::int
           + (not m.m_prazos)::int + (not m.m_termos)::int + (not m.m_adicionais)::int
           + (not m.m_turnos)::int + (not m.m_dias_semana)::int + (not m.m_uti)::int
           + (not m.m_handoff)::int + (not m.m_reaberto)::int + (not m.m_avaliado)::int
           + (not m.m_com_despesa)::int + (not m.m_trabalho)::int
           + (not m.m_links)::int + (not m.m_equipamentos)::int
           + (not m.m_oferta_reels)::int + (not m.m_oferta_new_born)::int
           + (not m.m_oferta_fotolivro)::int + (not m.m_oferta_birth)::int)::integer
  from m;
end;
$$;


comment on function public.operacao_marcas(jsonb) is
  'A regra de filtro do relatório externo: para cada caso do recorte (data, nome, faixas, modo comercial), uma marca por grupo — passa ou não — e quantos grupos falharam. Dentro de um grupo as opções somam; entre grupos, cortam. Interna: lida só pelas funções operacao_*.';

revoke all on function public.operacao_marcas(jsonb) from public;

create or replace function public.operacao_buscar(
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
  -- As colunas que um filtro acrescenta na tela (30/09/2026).
  turno              text,
  dia_semana         integer,
  avaliado           boolean,
  teve_handoff       boolean,
  equipamentos       text[],
  -- Os links COM o endereço, só da página: a coluna do link é clicável
  -- (decisão do gestor). A planilha não os leva — ver exportar.ts.
  links              jsonb,
  -- Quem fez cada etapa, para a coluna "Quem fez".
  trabalho           jsonb,
  -- A fase de cada oferta do comercial, ou nulo onde ela não se aplica.
  ofertas            jsonb,
  total              integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform public.exigir_operacao(p_filtros);

  if p_limite is null or p_limite < 1 or p_limite > 200 then
    raise exception 'A página tem de 1 a 200 casos.';
  end if;

  return query
  select o.id, o.mae_nome, o.bebe_nome, o.dia, o.maternidade_sigla, o.pacote_nome,
         o.situacao, o.prazo, o.horas_ate_envio, o.total_despesas, o.termo,
         o.fotografou_o_parto, o.adicionais, o.passou_uti, o.reaberto,
         o.turno, o.dia_semana, o.avaliado, o.teve_handoff, o.equipamentos,
         coalesce((
           select jsonb_agg(jsonb_build_object('tipo', en.tipo, 'url', en.url) order by en.created_at, en.id)
           from public.entregaveis en where en.caso_id = o.id
         ), '[]'::jsonb),
         coalesce((
           select jsonb_agg(jsonb_build_object('etapa', ce.tipo, 'pessoa_id', ce.responsavel_id, 'pessoa', p.nome)
                            order by ce.rodada, ce.ordem, ce.id)
           from public.caso_etapas ce
           join public.pessoas p on p.id = ce.responsavel_id
           where ce.caso_id = o.id and ce.status <> 'dispensada'
         ), '[]'::jsonb),
         jsonb_build_object('birth', o.oferta_birth, 'reels', o.oferta_reels, 'new_born', o.oferta_new_born,
                            'fotolivro', o.oferta_fotolivro, 'eh_birth', o.eh_birth),
         (count(*) over ())::integer
  from public.operacao_marcas(p_filtros) m
  join public.operacao_dos_casos o on o.id = m.id
  where m.falhas = 0
  order by
    case when p_ordem = 'antigos' then o.dia end asc nulls last,
    case when p_ordem = 'antigos' then o.previsao_em end asc nulls last,
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


create or replace function public.operacao_facetas(p_filtros jsonb)
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
  perform public.exigir_operacao(p_filtros);

  return query
  with b as materialized (
    select o.*, m.m_maternidades, m.m_pacotes, m.m_situacoes, m.m_prazos, m.m_termos,
           m.m_adicionais, m.m_turnos, m.m_dias_semana, m.m_uti, m.m_handoff, m.m_reaberto,
           m.m_avaliado, m.m_com_despesa, m.m_trabalho, m.m_trabalho_sem_pessoas,
           m.m_trabalho_sem_etapas, m.m_links, m.m_equipamentos,
           m.m_oferta_reels, m.m_oferta_new_born, m.m_oferta_fotolivro, m.m_oferta_birth, m.falhas
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
    -- LINKS: um caso conta uma vez para cada tipo de link que tem, ou para
    -- "nenhum" quando não tem link algum.
    select 'links', l.v, null
      from b cross join lateral unnest(
        case when cardinality(b.links) = 0 then array['nenhum'] else b.links end
      ) as l(v)
      where b.falhas - (not b.m_links)::int = 0
    union all
    -- EQUIPAMENTO: o rótulo é o valor sem o prefixo de tipo, com o tipo dito
    -- por extenso na frente.
    select 'equipamentos', e.v,
           case when e.v like 'cel:%' then 'Celular · ' || substr(e.v, 5) else 'Cartão · ' || substr(e.v, 8) end
      from b cross join lateral unnest(b.equipamentos) as e(v)
      where b.falhas - (not b.m_equipamentos)::int = 0
    union all
    -- AS OFERTAS DO COMERCIAL: a fase de cada uma, só onde ela se aplica.
    select 'oferta_reels', b.oferta_reels, null from b where b.falhas - (not b.m_oferta_reels)::int = 0
    union all
    select 'oferta_new_born', b.oferta_new_born, null from b where b.falhas - (not b.m_oferta_new_born)::int = 0
    union all
    select 'oferta_fotolivro', b.oferta_fotolivro, null from b where b.falhas - (not b.m_oferta_fotolivro)::int = 0
    union all
    select 'oferta_birth', b.oferta_birth, null from b where b.falhas - (not b.m_oferta_birth)::int = 0
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



-- -----------------------------------------------------------------------------
-- 4. Mudar a fase, e abrir New Born ou Foto/Livro num BIRTH
-- -----------------------------------------------------------------------------

create or replace function public.definir_oferta_comercial(
  p_caso_id uuid,
  p_oferta  public.oferta_comercial,
  p_fase    public.fase_comercial
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pessoa_id uuid;
  v_aplica    text;
  v_parto     boolean;
  v_birth     boolean;
  v_aberta    boolean := false;
  v_antes     public.fase_comercial;
  v_tipo      public.etapa_tipo;
  v_etapa_id  uuid;
begin
  if not public.tem_tela('comercial') then
    raise exception 'Só quem tem a tela Comercial muda a fase das ofertas.';
  end if;

  select p.id into v_pessoa_id from public.pessoas p where p.auth_user_id = auth.uid();

  select case p_oferta
           when 'birth' then o.oferta_birth
           when 'reels' then o.oferta_reels
           when 'new_born' then o.oferta_new_born
           else o.oferta_fotolivro
         end,
         o.comercial, o.eh_birth
    into v_aplica, v_parto, v_birth
  from public.operacao_dos_casos o
  where o.id = p_caso_id;

  v_tipo := case p_oferta when 'new_born' then 'click_home'::public.etapa_tipo
                          when 'fotolivro' then 'album'::public.etapa_tipo end;

  if v_aplica is null then
    -- O CASO RARO: New Born ou Foto/Livro num BIRTH, aberto pelo comercial —
    -- desde que o caso ainda não tenha a etapa.
    if coalesce(v_parto, false) and coalesce(v_birth, false) and v_tipo is not null
       and not exists (
         select 1 from public.caso_etapas ce where ce.caso_id = p_caso_id and ce.tipo = v_tipo
       ) then
      v_aberta := true;
    else
      raise exception 'Esta oferta não se aplica a este caso.';
    end if;
  end if;

  select oc.fase into v_antes
  from public.ofertas_comerciais oc
  where oc.caso_id = p_caso_id and oc.oferta = p_oferta;

  if not v_aberta and coalesce(v_antes, 'apresentar') = p_fase then
    return false;
  end if;

  insert into public.ofertas_comerciais (caso_id, oferta, fase, atualizado_por)
  values (p_caso_id, p_oferta, p_fase, v_pessoa_id)
  on conflict (caso_id, oferta) do update
    set fase = excluded.fase,
        atualizado_por = excluded.atualizado_por,
        atualizado_em = now();

  -- VENDIDO CRIA A ETAPA do New Born ou do Foto/Livro — só se o caso ainda não
  -- a tiver. Voltar a fase depois não apaga nada. O BIRTH vendido não cria
  -- nada: as etapas dele já existem, e o que muda é a venda, não o trabalho.
  if p_fase = 'vendido' and v_tipo is not null then
    insert into public.caso_etapas (caso_id, tipo, status, ordem, rodada)
    values (p_caso_id, v_tipo, 'pendente', public.ordem_padrao_da_etapa(v_tipo), 1)
    on conflict (caso_id, tipo, rodada) do nothing
    returning id into v_etapa_id;

    if v_etapa_id is not null then
      insert into public.eventos (caso_id, caso_etapa_id, pessoa_id, tipo, payload, ocorrido_em)
      values (
        p_caso_id, v_etapa_id, v_pessoa_id, 'etapa_adicionada',
        jsonb_build_object('caso_id', p_caso_id, 'caso_etapa_id', v_etapa_id, 'tipo', v_tipo, 'pela_venda', true),
        now()
      );
    end if;
  end if;

  insert into public.eventos (caso_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    p_caso_id, v_pessoa_id, 'oferta_comercial',
    jsonb_build_object(
      'oferta', p_oferta,
      'fase', p_fase,
      'fase_anterior', coalesce(v_antes, 'apresentar'),
      'aberta_no_birth', v_aberta,
      'etapa_criada', v_etapa_id is not null
    ),
    now()
  );

  return v_etapa_id is not null;
end;
$$;

comment on function public.definir_oferta_comercial(uuid, public.oferta_comercial, public.fase_comercial) is
  'Muda a fase de uma oferta do comercial (birth, reels, New Born, Foto/Livro) num caso; no BIRTH, também abre New Born ou Foto/Livro. Vendido no New Born ou no Foto/Livro cria a etapa (mesmo com o caso encerrado). Devolve se criou etapa. Só a tela Comercial.';
