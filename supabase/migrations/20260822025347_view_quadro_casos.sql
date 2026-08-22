-- =============================================================================
-- View de leitura do Quadro (tela A, seção 7 de docs/plano.md).
--
-- POR QUE UMA VIEW, E NÃO DERIVAÇÃO NO FRONT
-- Três regras precisam de UMA definição só, porque a Fila de Edição e o Painel
-- vão reusá-las e não podem divergir da tela do Quadro:
--   1. vencimento de SLA  = concluido_em da etapa de nascimento + prazo_entrega
--      do pacote. Derivado, NUNCA armazenado (ver comentário de
--      pacotes.prazo_entrega na migration 20260820041026): mudar o prazo do
--      pacote recalcula todos os casos sozinho.
--   2. rascunho pendente  = pacote_id IS NULL OR maternidade_id IS NULL
--      (seção 7 do CLAUDE.md). Não existe coluna/flag própria — se cada tela
--      reescrever a expressão, alguma vai esquecer uma das duas metades.
--   3. dia do Quadro      = previsao_em convertido para America/Sao_Paulo.
--      Agrupar em UTC coloca caso no dia errado: 2026-09-30 00:00+00 é 29/set
--      às 21h em Curitiba. Isso já acontece com dado real no banco local.
--
-- Além disso, prazo_entrega_horas existe porque `interval` chega no PostgREST
-- como texto ('48:00:00' para 48h, mas '7 days' para MASTER). Parsear os dois
-- formatos em TypeScript é um erro esperando acontecer; a conversão para
-- número acontece aqui, uma vez.
--
-- SEGURANÇA — security_invoker = true
-- Sem isso, a view rodaria com os privilégios do dono (postgres) e viraria um
-- bypass silencioso da RLS de casos/caso_etapas. Com invoker, as policies
-- casos_select_compartilhada e caso_etapas_select_compartilhada continuam
-- valendo: quem não tem pessoa ativa vinculada lê zero linha, igual à tabela.
-- Requer PG 15+; este projeto está em 17 (config.toml, major_version).
--
-- ESCOPO: somente leitura. A view não é atualizável e não recebe GRANT de
-- escrita — toda transição continua nas RPCs (seção 4 do CLAUDE.md).
--
-- O QUE NÃO ESTÁ AQUI, DE PROPÓSITO
--   - As etapas de cada caso. Trazer a lista aninhada obrigaria a agregar em
--     jsonb, o que impede o PostgREST de ordenar/filtrar etapa e esconde o
--     custo. O Quadro faz uma segunda query em caso_etapas filtrada pelos ids
--     já carregados — duas queries fixas, não N+1.
--   - Filtro de status. RLS e view decidem O QUE existe; "quais dias aparecem
--     na tela" é decisão da query da tela (invariante 3.5: um dia só sai
--     quando TODOS os seus casos são terminais, nunca por passagem de data).
-- =============================================================================

create view public.quadro_casos
with (security_invoker = true)
as
select
  c.id,
  c.mae_nome,
  c.bebe_nome,
  c.previsao_em,

  -- Eixo de agrupamento do Quadro. NULL quando o caso não tem previsão.
  (c.previsao_em at time zone 'America/Sao_Paulo')::date as dia,

  c.cor_calendar,
  c.observacao,
  c.situacao_clinica,
  c.status_operacional,
  c.status_entrega,
  c.termo_status,

  c.pacote_id,
  p.nome as pacote_nome,
  p.slug as pacote_slug,
  -- numeric, não interval: ver nota sobre PostgREST no topo.
  (extract(epoch from p.prazo_entrega) / 3600)::numeric as prazo_entrega_horas,

  c.maternidade_id,
  m.nome  as maternidade_nome,
  m.sigla as maternidade_sigla,

  -- SLA derivado. Ambos NULL enquanto o nascimento não foi concluído — é o
  -- estado de 100% dos casos hoje, e a tela precisa lidar com isso.
  n.concluido_em                   as nascimento_concluido_em,
  n.concluido_em + p.prazo_entrega as vence_em,

  -- Rascunho pendente: derivado, as duas metades separadas para a barra de
  -- rascunhos poder dizer exatamente o que falta.
  (c.pacote_id is null)                             as falta_pacote,
  (c.maternidade_id is null)                        as falta_maternidade,
  (c.pacote_id is null or c.maternidade_id is null) as eh_rascunho,

  -- Estado terminal (invariante 3.5). Cancelado NÃO é "concluído", mas conta
  -- como resolvido para efeito de tirar o dia da tela.
  (c.status_operacional in ('encerrado', 'cancelado')) as eh_terminal,

  etapas.total::int      as etapas_total,
  etapas.concluidas::int as etapas_concluidas,

  c.created_at,
  c.updated_at
from public.casos c
left join public.pacotes      p on p.id = c.pacote_id
left join public.maternidades m on m.id = c.maternidade_id
-- caso_etapas tem unique (caso_id, tipo), então este join traz no máximo uma
-- linha por caso — não multiplica o resultado.
left join public.caso_etapas  n on n.caso_id = c.id and n.tipo = 'nascimento'
left join lateral (
  select
    count(*)                                          as total,
    count(*) filter (where ce.status = 'concluida')   as concluidas
  from public.caso_etapas ce
  where ce.caso_id = c.id
) etapas on true;

comment on view public.quadro_casos is
  'Leitura do Quadro: casos achatados com pacote/maternidade resolvidos e três derivações canônicas — dia (America/Sao_Paulo), vence_em (SLA) e eh_rascunho. security_invoker = true: respeita a RLS de casos/caso_etapas do usuário logado, não é bypass. Não traz as etapas (segunda query) e não filtra status (decisão da tela).';

comment on column public.quadro_casos.dia is
  'previsao_em convertido para America/Sao_Paulo. É o eixo de agrupamento do Quadro. Agrupar em UTC erra o dia de casos previstos para a madrugada.';
comment on column public.quadro_casos.vence_em is
  'Vencimento do SLA, DERIVADO: concluido_em do nascimento + pacotes.prazo_entrega. NULL enquanto o nascimento não foi concluído. Nunca armazenar este valor.';
comment on column public.quadro_casos.prazo_entrega_horas is
  'pacotes.prazo_entrega em horas. Existe porque interval chega no PostgREST como texto em dois formatos ("48:00:00" e "7 days").';
comment on column public.quadro_casos.eh_rascunho is
  'Rascunho pendente (seção 7 do CLAUDE.md): o sync não mapeou pacote ou maternidade com certeza. Definição canônica — nenhuma tela deve reescrever a expressão.';
comment on column public.quadro_casos.eh_terminal is
  'encerrado OU cancelado. Base da regra de visibilidade do Quadro: um dia só sai da tela quando todos os seus casos são terminais, nunca por passagem de data (invariante 3.5).';


-- auto_expose_new_tables está desligado (ver migration 20260820090536): sem
-- GRANT explícito, authenticated nem chega a ser avaliado pela RLS.
-- Só SELECT: a view é leitura e não deve virar caminho de escrita.
grant select on public.quadro_casos to authenticated;
