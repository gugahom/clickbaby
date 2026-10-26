-- =============================================================================
-- A FORMA DE PAGAMENTO DA VENDA, E AS VENDAS NO RELATÓRIO EXTERNO
-- (26/10/2026, pedido do gestor)
-- =============================================================================
--
-- "A possibilidade de colocar ali o parcelamento, o valor, em quantas vezes foi
-- parcelado, e quando for no Pix também. Isso aí eu quero que vá para o
-- relatório para ser possível fazer uma pesquisa de quanto já foi vendido em
-- novembro para o Brígida, quanto já foi vendido em novembro para o Santa Cruz."
--
-- 1. CADA LINHA DE VENDA GANHA A FORMA (Pix ou Cartão — decisão do gestor) e o
--    número de PARCELAS (1 = à vista). As duas andam juntas: as linhas lançadas
--    antes de hoje não têm nenhuma das duas, e ninguém inventa a forma delas.
--    A RPC aceita as duas vazias, para o aparelho com a tela antiga em cache
--    não perder a venda; quem cobra a forma é a tela, a mais estrita.
--
-- 2. O MODO VENDAS DO RELATÓRIO EXTERNO (`vendas: true` no filtro), ao lado de
--    Atendimentos e Nascimentos. "Vendido em novembro" é o MÊS EM QUE A VENDA
--    FOI LANÇADA (decisão do gestor, perguntado), e não o mês do parto: um parto
--    de dezembro vendido em novembro conta em novembro. No modo:
--      * o período corta pelo dia em que a venda foi registrada (Brasília);
--      * entra o caso com ao menos uma venda lançada no período;
--      * o "vendido" de cada caso é a soma do que foi lançado NO PERÍODO.
--    Os outros filtros (maternidade, pacote…) cortam como sempre — "Brígida em
--    novembro" é o modo Vendas com novembro e a GNDI marcada.
--    Fora do modo, o "vendido" é tudo o que o caso já vendeu.
--
--    A DATA DO CASO, no modo, é a da PRIMEIRA venda dele no período: é ela que
--    a lista mostra e que o gráfico no tempo usa. Um caso com o pacote vendido
--    em outubro e o Reels em novembro, olhado nos dois meses de uma vez, cai
--    inteiro em outubro no gráfico por mês — o NÚMERO do resumo continua exato,
--    porque soma linha a linha.
--
-- 3. QUEM VÊ O VALOR é quem vê a venda: atendimento, adm ou a tela Comercial
--    (20261020173657). O relatório externo também abre para quem tem só a tela
--    Relatórios; para essa pessoa os campos de venda voltam NULOS e o modo
--    Vendas é recusado. As funções são `security definer` — sem esta guarda,
--    elas leriam `vendas_do_caso` por cima da RLS.
--
-- As três funções que devolvem números (resumo, gráfico, busca) mudam o RETORNO,
-- e isso pede DROP + CREATE: o REVOKE de PUBLIC e de anon vai junto, repetido.
-- =============================================================================

create type public.forma_de_pagamento as enum ('pix', 'cartao');

alter table public.vendas_do_caso
  add column forma_pagamento public.forma_de_pagamento,
  add column parcelas smallint check (parcelas between 1 and 24),
  add constraint vendas_do_caso_forma_e_parcelas_juntas
    check ((forma_pagamento is null) = (parcelas is null));

comment on column public.vendas_do_caso.forma_pagamento is
  'Pix ou Cartão (26/10/2026). Nulo nas vendas lançadas antes disso.';
comment on column public.vendas_do_caso.parcelas is
  'Em quantas vezes: 1 é à vista. Anda junto com a forma.';


-- -----------------------------------------------------------------------------
-- 1. Lançar a venda, agora com a forma e as parcelas
-- -----------------------------------------------------------------------------

drop function public.registrar_venda_do_caso(uuid, public.item_de_venda, numeric, text);

create function public.registrar_venda_do_caso(
  p_caso_id   uuid,
  p_item      public.item_de_venda,
  p_valor     numeric,
  p_descricao text default null,
  p_forma     public.forma_de_pagamento default null,
  p_parcelas  integer default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pessoa_id uuid;
  v_descricao text := nullif(btrim(coalesce(p_descricao, '')), '');
  -- Forma sem parcelas é à vista; parcelas sem forma não dizem nada.
  v_parcelas  integer := case when p_forma is not null then coalesce(p_parcelas, 1) end;
  v_id        uuid;
begin
  select p.id into v_pessoa_id
  from public.pessoas p
  where p.auth_user_id = auth.uid()
    and p.ativo;

  if v_pessoa_id is null then
    raise exception 'Usuário autenticado não corresponde a nenhuma pessoa ativa.';
  end if;

  if not (public.eh_atendimento() or public.eh_adm() or public.tem_tela('comercial')) then
    raise exception 'Quem lança o valor da venda é o atendimento, a gestão ou quem tem a tela Comercial.';
  end if;

  if not exists (select 1 from public.casos c where c.id = p_caso_id) then
    raise exception 'caso % não encontrado.', p_caso_id;
  end if;

  if p_valor is null or round(p_valor, 2) <= 0 then
    raise exception 'O valor da venda precisa ser maior que zero.';
  end if;

  if p_item = 'outro' and v_descricao is null then
    raise exception 'Diga o que foi vendido em "outro".';
  end if;

  if p_forma is null and p_parcelas is not null then
    raise exception 'Diga a forma de pagamento das parcelas: Pix ou Cartão.';
  end if;

  if v_parcelas is not null and v_parcelas not between 1 and 24 then
    raise exception 'As parcelas vão de 1 (à vista) a 24.';
  end if;

  insert into public.vendas_do_caso (caso_id, item, descricao, valor, registrado_por, forma_pagamento, parcelas)
  values (p_caso_id, p_item, v_descricao, round(p_valor, 2), v_pessoa_id, p_forma, v_parcelas)
  returning id into v_id;

  -- Sem o valor e sem a descrição: `eventos` é lido pela equipe inteira. A
  -- forma também fica de fora, pelo mesmo motivo.
  insert into public.eventos (caso_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    p_caso_id, v_pessoa_id, 'venda_registrada',
    jsonb_build_object('venda_id', v_id, 'item', p_item),
    now()
  );

  return v_id;
end;
$$;

comment on function public.registrar_venda_do_caso(uuid, public.item_de_venda, numeric, text, public.forma_de_pagamento, integer) is
  'Lança uma linha de venda no caso (pacote ou venda a mais), com o valor, a forma e as parcelas. Atendimento, adm ou quem tem a tela Comercial.';

revoke all on function public.registrar_venda_do_caso(uuid, public.item_de_venda, numeric, text, public.forma_de_pagamento, integer) from public;
revoke all on function public.registrar_venda_do_caso(uuid, public.item_de_venda, numeric, text, public.forma_de_pagamento, integer) from anon;
grant execute on function public.registrar_venda_do_caso(uuid, public.item_de_venda, numeric, text, public.forma_de_pagamento, integer) to authenticated;


-- -----------------------------------------------------------------------------
-- 2. O que um caso vendeu num período — interna, só as funções do relatório
-- -----------------------------------------------------------------------------

create function public.venda_no_periodo(p_caso_id uuid, p_de date, p_ate date)
returns table (
  total        numeric,
  pix          numeric,
  cartao       numeric,
  primeiro_dia date,
  -- "Pix, Cartão 10x": como a planilha e a coluna mostram.
  pagamentos   text
)
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(v.valor), 0),
         coalesce(sum(v.valor) filter (where v.forma_pagamento = 'pix'), 0),
         coalesce(sum(v.valor) filter (where v.forma_pagamento = 'cartao'), 0),
         min((v.created_at at time zone 'America/Sao_Paulo')::date),
         string_agg(distinct
           case v.forma_pagamento
             when 'pix' then case when v.parcelas > 1 then 'Pix ' || v.parcelas || 'x' else 'Pix' end
             when 'cartao' then 'Cartão ' || v.parcelas || 'x'
             else 'Sem forma'
           end, ', ')
  from public.vendas_do_caso v
  where v.caso_id = p_caso_id
    and (p_de is null or (v.created_at at time zone 'America/Sao_Paulo')::date >= p_de)
    and (p_ate is null or (v.created_at at time zone 'America/Sao_Paulo')::date <= p_ate);
$$;

comment on function public.venda_no_periodo(uuid, date, date) is
  'Quanto um caso vendeu entre duas datas de lançamento (nulas = tudo), por forma. Interna: os valores só saem pelas funções do relatório, que conferem quem pode vê-los.';

revoke all on function public.venda_no_periodo(uuid, date, date) from public;
revoke all on function public.venda_no_periodo(uuid, date, date) from anon;
revoke all on function public.venda_no_periodo(uuid, date, date) from authenticated;


-- Quem vê o valor da venda — o mesmo par das policies de `vendas_do_caso`.
create function public.pode_ver_venda()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.eh_atendimento() or public.eh_adm() or public.tem_tela('comercial');
$$;

comment on function public.pode_ver_venda() is
  'Atendimento, adm ou a tela Comercial: quem lê o valor vendido. Interna, das funções do relatório externo.';

revoke all on function public.pode_ver_venda() from public;
revoke all on function public.pode_ver_venda() from anon;
revoke all on function public.pode_ver_venda() from authenticated;


-- -----------------------------------------------------------------------------
-- 3. As marcas: o modo Vendas corta pelo dia da venda
-- -----------------------------------------------------------------------------

create or replace function public.operacao_marcas(p_filtros jsonb)
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
  m_retorno              boolean,
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
  v_retorno   text[]  := public.lista_do_filtro(f, 'retorno');
  v_comercial boolean := coalesce(case when jsonb_typeof(f -> 'comercial') = 'boolean' then (f ->> 'comercial')::boolean end, false);
  v_nasc      boolean := coalesce(case when jsonb_typeof(f -> 'nascimentos') = 'boolean' then (f ->> 'nascimentos')::boolean end, false);
  -- O MODO VENDAS (26/10/2026) também corta antes de tudo.
  v_vend      boolean := coalesce(case when jsonb_typeof(f -> 'vendas') = 'boolean' then (f ->> 'vendas')::boolean end, false);
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
  -- O modo Vendas diz QUEM VENDEU QUANDO: só para quem vê a venda.
  if v_vend and not public.pode_ver_venda() then
    raise exception 'As vendas do relatório são de quem vê o valor da venda: atendimento, gestão ou a tela Comercial.';
  end if;

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
      (
        cardinality(v_links) = 0
        or o.links && v_links
        or ('nenhum' = any (v_links) and cardinality(o.links) = 0)
      ) as m_links,
      (cardinality(v_equip) = 0 or o.equipamentos && v_equip) as m_equipamentos,
      (cardinality(v_of_reels) = 0 or o.oferta_reels = any (v_of_reels)) as m_oferta_reels,
      (cardinality(v_of_nb) = 0 or o.oferta_new_born = any (v_of_nb)) as m_oferta_new_born,
      (cardinality(v_of_livro) = 0 or o.oferta_fotolivro = any (v_of_livro)) as m_oferta_fotolivro,
      (cardinality(v_of_birth) = 0 or o.oferta_birth = any (v_of_birth)) as m_oferta_birth,
      (cardinality(v_retorno) = 0 or public.situacao_do_retorno(o.retorno_comercial) = any (v_retorno)) as m_retorno
    from public.operacao_dos_casos o
    -- Data, nome e faixas não são grupos com contagem: cortam antes de tudo.
    -- No modo Vendas a data não é a do caso: é a da venda, logo abaixo.
    where (v_vend or v_de is null or (case when v_nasc then o.dia_nascimento else o.dia end) >= v_de)
      and (v_vend or v_ate is null or (case when v_nasc then o.dia_nascimento else o.dia end) <= v_ate)
      and (not v_nasc or (o.nasceu and o.situacao not in ('cancelado_agenda', 'cancelado_equipe')))
      and (not v_vend or exists (
        select 1 from public.vendas_do_caso v
        where v.caso_id = o.id
          and (v_de is null or (v.created_at at time zone 'America/Sao_Paulo')::date >= v_de)
          and (v_ate is null or (v.created_at at time zone 'America/Sao_Paulo')::date <= v_ate)
      ))
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
           + (not m.m_oferta_fotolivro)::int + (not m.m_oferta_birth)::int
           + (not m.m_retorno)::int)::integer
  from m;
end;
$$;


-- -----------------------------------------------------------------------------
-- 4. Os números do recorte, com o vendido
-- -----------------------------------------------------------------------------

drop function public.operacao_resumo(jsonb);

create function public.operacao_resumo(p_filtros jsonb)
returns table (
  casos                   integer,
  partos                  integer,
  enviados                integer,
  no_prazo                integer,
  mediana_horas_ate_envio numeric,
  total_despesas          numeric,
  cancelados              integer,
  -- Nulos para quem não vê a venda (26/10/2026).
  total_vendido           numeric,
  vendido_pix             numeric,
  vendido_cartao          numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_vend boolean := coalesce(case when jsonb_typeof(p_filtros -> 'vendas') = 'boolean'
                                  then (p_filtros ->> 'vendas')::boolean end, false);
  v_de   date    := case when v_vend then nullif(p_filtros ->> 'de', '')::date end;
  v_ate  date    := case when v_vend then nullif(p_filtros ->> 'ate', '')::date end;
  v_pode boolean;
begin
  perform public.exigir_operacao(p_filtros);
  v_pode := public.pode_ver_venda();

  return query
  select count(*)::integer,
         count(*) filter (where o.nasceu)::integer,
         count(*) filter (where o.prazo in ('no_prazo', 'atrasado'))::integer,
         count(*) filter (where o.prazo = 'no_prazo')::integer,
         round((percentile_cont(0.5) within group (order by o.horas_ate_envio))::numeric, 1),
         coalesce(sum(o.total_despesas), 0),
         count(*) filter (where o.situacao in ('cancelado_agenda', 'cancelado_equipe'))::integer,
         case when v_pode then coalesce(sum(vp.total), 0) end,
         case when v_pode then coalesce(sum(vp.pix), 0) end,
         case when v_pode then coalesce(sum(vp.cartao), 0) end
  from public.operacao_marcas(p_filtros) m
  join public.operacao_dos_casos o on o.id = m.id
  cross join lateral public.venda_no_periodo(o.id, v_de, v_ate) vp
  where m.falhas = 0;
end;
$$;

comment on function public.operacao_resumo(jsonb) is
  'Os números do recorte do relatório externo; o vendido só para quem vê a venda (26/10/2026).';

revoke all on function public.operacao_resumo(jsonb) from public;
revoke all on function public.operacao_resumo(jsonb) from anon;
grant execute on function public.operacao_resumo(jsonb) to authenticated;


-- -----------------------------------------------------------------------------
-- 5. A busca, com o vendido e as formas de cada caso
-- -----------------------------------------------------------------------------

drop function public.operacao_buscar(jsonb, text, integer, integer);

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
  turno              text,
  dia_semana         integer,
  avaliado           boolean,
  teve_handoff       boolean,
  equipamentos       text[],
  links              jsonb,
  trabalho           jsonb,
  ofertas            jsonb,
  -- O VENDIDO do caso (no modo Vendas, o do período) e as formas — nulos para
  -- quem não vê a venda (26/10/2026).
  vendido            numeric,
  pagamentos         text,
  total              integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_nasc boolean := coalesce(case when jsonb_typeof(p_filtros -> 'nascimentos') = 'boolean'
                                  then (p_filtros ->> 'nascimentos')::boolean end, false);
  v_vend boolean := coalesce(case when jsonb_typeof(p_filtros -> 'vendas') = 'boolean'
                                  then (p_filtros ->> 'vendas')::boolean end, false);
  v_de   date    := case when v_vend then nullif(p_filtros ->> 'de', '')::date end;
  v_ate  date    := case when v_vend then nullif(p_filtros ->> 'ate', '')::date end;
  v_pode boolean;
begin
  perform public.exigir_operacao(p_filtros);
  v_pode := public.pode_ver_venda();

  if p_limite is null or p_limite < 1 or p_limite > 200 then
    raise exception 'A página tem de 1 a 200 casos.';
  end if;

  return query
  select o.id, o.mae_nome, o.bebe_nome,
         x.dia,
         o.maternidade_sigla, o.pacote_nome,
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
                            'fotolivro', o.oferta_fotolivro, 'eh_birth', o.eh_birth,
                            'retorno', o.retorno_comercial),
         case when v_pode then vp.total end,
         case when v_pode then vp.pagamentos end,
         (count(*) over ())::integer
  from public.operacao_marcas(p_filtros) m
  join public.operacao_dos_casos o on o.id = m.id
  cross join lateral public.venda_no_periodo(o.id, v_de, v_ate) vp
  -- A DATA DA LINHA: a do caso, a do nascimento ou a da primeira venda.
  cross join lateral (
    select case when v_vend then vp.primeiro_dia when v_nasc then o.dia_nascimento else o.dia end as dia
  ) x
  where m.falhas = 0
  order by
    case when p_ordem = 'antigos' then x.dia end asc nulls last,
    case when p_ordem = 'antigos' then o.previsao_em end asc nulls last,
    case when p_ordem = 'mais_horas' then o.horas_ate_envio end desc nulls last,
    case when p_ordem = 'mais_despesas' then o.total_despesas end desc nulls last,
    case when p_ordem = 'maternidade' then o.maternidade_sigla end asc nulls last,
    case when p_ordem = 'retorno' then o.retorno_comercial end asc nulls last,
    -- O MAIOR VENDIDO primeiro (26/10/2026), só para quem vê a venda.
    case when p_ordem = 'mais_vendido' and v_pode then vp.total end desc nulls last,
    x.dia desc nulls last,
    o.previsao_em desc nulls last,
    o.id
  limit p_limite
  offset greatest(coalesce(p_deslocamento, 0), 0);
end;
$$;

comment on function public.operacao_buscar(jsonb, text, integer, integer) is
  'A lista paginada do relatório externo; o vendido e as formas só para quem vê a venda (26/10/2026).';

revoke all on function public.operacao_buscar(jsonb, text, integer, integer) from public;
revoke all on function public.operacao_buscar(jsonb, text, integer, integer) from anon;
grant execute on function public.operacao_buscar(jsonb, text, integer, integer) to authenticated;


-- -----------------------------------------------------------------------------
-- 6. O gráfico, com o vendido
-- -----------------------------------------------------------------------------

drop function public.operacao_grafico(jsonb, text);

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
  cancelados              integer,
  total_vendido           numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_nasc boolean := coalesce(case when jsonb_typeof(p_filtros -> 'nascimentos') = 'boolean'
                                  then (p_filtros ->> 'nascimentos')::boolean end, false);
  v_vend boolean := coalesce(case when jsonb_typeof(p_filtros -> 'vendas') = 'boolean'
                                  then (p_filtros ->> 'vendas')::boolean end, false);
  v_de   date    := case when v_vend then nullif(p_filtros ->> 'de', '')::date end;
  v_ate  date    := case when v_vend then nullif(p_filtros ->> 'ate', '')::date end;
  v_pode boolean;
begin
  perform public.exigir_operacao(p_filtros);
  v_pode := public.pode_ver_venda();

  if p_eixo is null or p_eixo not in (
    'dia', 'mes', 'maternidade', 'pacote', 'situacao', 'prazo',
    'parto_por', 'turno', 'dia_semana', 'termo'
  ) then
    raise exception 'Eixo do gráfico desconhecido: %.', p_eixo;
  end if;

  return query
  with x as (
    select o.*,
           vp.total as vendido,
           case p_eixo
             when 'dia'         then d.dia::text
             when 'mes'         then to_char(date_trunc('month', d.dia), 'YYYY-MM-DD')
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
    cross join lateral public.venda_no_periodo(o.id, v_de, v_ate) vp
    cross join lateral (
      select case when v_vend then vp.primeiro_dia when v_nasc then o.dia_nascimento else o.dia end as dia
    ) d
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
         count(*) filter (where x.situacao in ('cancelado_agenda', 'cancelado_equipe'))::integer,
         case when v_pode then coalesce(sum(x.vendido), 0) end
  from x
  where x.g_chave is not null
  group by x.g_chave;
end;
$$;

comment on function public.operacao_grafico(jsonb, text) is
  'O recorte do relatório externo por dia, mês ou dimensão; o vendido só para quem vê a venda (26/10/2026).';

revoke all on function public.operacao_grafico(jsonb, text) from public;
revoke all on function public.operacao_grafico(jsonb, text) from anon;
grant execute on function public.operacao_grafico(jsonb, text) to authenticated;
