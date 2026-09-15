-- =============================================================================
-- RELATÓRIO DE DESPESAS — o financeiro recolhe o que as funcionárias lançaram.
--
-- O PEDIDO (gestor, 14/09/2026): quem LANÇA o gasto são as funcionárias, no
-- card (20260913022926); quem RECOLHE é o financeiro, caso a caso, para virar
-- relatório. Faltava o lado de quem recolhe — até aqui o gasto só existia
-- dentro de cada card, e somar um mês exigia abrir cada caso.
--
-- DUAS PEÇAS, E AS DUAS SOMAM NO BANCO.
--   1. `despesas_por_caso` — uma linha por caso com gasto, já somada e quebrada
--      por tipo. É a base da tela do financeiro, do CSV e do relatório futuro.
--   2. `quadro_casos.total_despesas` — o total do caso na view que o Quadro já
--      busca, para o card mostrar o gasto sem uma consulta a mais.
--
-- POR QUE A SOMA NÃO É DO CLIENTE. A tela do caso soma no cliente e isso é
-- seguro lá: a lista inteira de UM caso cabe na tela. Um mês inteiro não cabe
-- num `select` — o PostgREST corta em mil linhas e não erra (seção 5 do
-- CLAUDE.md). Somar no navegador o que o servidor paginou é o jeito de perder
-- dinheiro sem aviso nenhum. Aqui cada linha da view JÁ É uma soma.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. despesas_por_caso
--
-- SÓ CASOS COM GASTO (join interno). O financeiro recolhe despesa; um caso sem
-- nenhuma não tem o que recolher, e listá-lo encheria o relatório de zeros.
--
-- O DIA É O DO CASO, não o do lançamento. A planilha deles é por mês de
-- ATENDIMENTO — a aba de setembro tem os partos de setembro, mesmo que a
-- corrida tenha sido lançada em outubro, quando a fatura chegou. Filtrar pelo
-- dia do lançamento espalharia o gasto de um parto por dois meses.
--
-- CANCELADOS ENTRAM, pelo mesmo motivo que aceitam despesa: a corrida de um
-- parto que não aconteceu é exatamente o gasto que a empresa precisa ver.
--
-- `security_invoker = true`, como `quadro_casos`: sem isso a view rodaria com o
-- privilégio do dono e passaria por cima da RLS de `despesas` e de `casos`.
-- -----------------------------------------------------------------------------

create view public.despesas_por_caso
with (security_invoker = true) as
  select
    c.id                                                       as caso_id,
    (c.previsao_em at time zone 'America/Sao_Paulo')::date     as dia,
    c.mae_nome,
    c.bebe_nome,
    p.nome                                                     as pacote_nome,
    m.sigla                                                    as maternidade_sigla,
    c.status_operacional,
    sum(d.valor)                                               as total,
    coalesce(sum(d.valor) filter (where d.tipo = 'uber_ida'), 0)   as total_uber_ida,
    coalesce(sum(d.valor) filter (where d.tipo = 'uber_volta'), 0) as total_uber_volta,
    coalesce(sum(d.valor) filter (where d.tipo = 'refeicao'), 0)   as total_refeicao,
    coalesce(sum(d.valor) filter (where d.tipo = 'outro'), 0)      as total_outro,
    count(d.id)::integer                                       as lancamentos,
    max(d.registrado_em)                                       as ultimo_lancamento_em
  from public.despesas d
    join public.casos c on c.id = d.caso_id
    left join public.pacotes p on p.id = c.pacote_id
    left join public.maternidades m on m.id = c.maternidade_id
  group by c.id, p.nome, m.sigla;

comment on view public.despesas_por_caso is
  'Uma linha por caso com despesa, já somada e quebrada por tipo. Base do recolhimento do financeiro e do CSV. O dia é o do CASO (mês de atendimento, como a planilha), não o do lançamento.';

-- Só leitura, como toda view deste schema. Nada para anon.
grant select on public.despesas_por_caso to authenticated;


-- -----------------------------------------------------------------------------
-- 2. quadro_casos.total_despesas
--
-- `create or replace view` só aceita colunas NOVAS NO FIM, na mesma ordem das
-- que já existem — por isso a definição abaixo repete a da 20260906151515 linha
-- por linha e acrescenta uma coluna só, depois de liberado_para_entrega_por_nome.
-- Reordenar qualquer coisa aqui faria o replace falhar no push.
--
-- ZERO, NÃO NULO, quando não há gasto. O card precisa distinguir "sem despesa"
-- de "não carregou", e um nulo obrigaria cada leitor a lembrar do coalesce.
-- -----------------------------------------------------------------------------

create or replace view public.quadro_casos
with (security_invoker = true) as
  select
    c.id,
    c.mae_nome,
    c.bebe_nome,
    c.previsao_em,
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
    extract(epoch from p.prazo_entrega) / 3600::numeric as prazo_entrega_horas,
    c.maternidade_id,
    m.nome as maternidade_nome,
    m.sigla as maternidade_sigla,
    n.concluido_em as nascimento_concluido_em,
    case
      when p.prazo_dias_uteis is not null
        then public.somar_dias_uteis(coalesce(c.reaberto_em, n.concluido_em), p.prazo_dias_uteis)
      else coalesce(c.reaberto_em, n.concluido_em) + p.prazo_entrega
    end
      + c.uti_acumulada
      + case when c.uti_desde is not null then now() - c.uti_desde
             else '00:00:00'::interval end
      as vence_em,
    c.uti_desde,
    c.uti_desde is not null as na_uti,
    c.uti_desde is not null as sla_pausado,
    extract(epoch from c.uti_acumulada +
      case when c.uti_desde is not null then now() - c.uti_desde
           else '00:00:00'::interval end) / 3600::numeric as uti_horas_total,
    c.pacote_id is null as falta_pacote,
    c.maternidade_id is null as falta_maternidade,
    c.pacote_id is null or c.maternidade_id is null as eh_rascunho,
    c.status_operacional = any (array['encerrado'::status_operacional, 'cancelado'::status_operacional]) as eh_terminal,
    etapas.total::integer as etapas_total,
    etapas.concluidas::integer as etapas_concluidas,
    c.created_at,
    c.updated_at,
    p.prazo_dias_uteis,
    extract(epoch from (
      case
        when p.prazo_dias_uteis is not null
          then public.somar_dias_uteis(coalesce(c.reaberto_em, n.concluido_em), p.prazo_dias_uteis)
        else coalesce(c.reaberto_em, n.concluido_em) + p.prazo_entrega
      end - coalesce(c.reaberto_em, n.concluido_em)
    )) / 3600::numeric as prazo_total_horas,
    c.reaberto_em,
    c.liberado_para_entrega_em,
    lib.nome as liberado_para_entrega_por_nome,
    coalesce(gasto.total, 0) as total_despesas
  from public.casos c
    left join public.pacotes p on p.id = c.pacote_id
    left join public.maternidades m on m.id = c.maternidade_id
    left join public.pessoas lib on lib.id = c.liberado_para_entrega_por
    left join public.caso_etapas n on n.caso_id = c.id and n.tipo = 'nascimento'
    left join lateral (
      select count(*) as total,
             count(*) filter (where ce.status = 'concluida') as concluidas
      from public.caso_etapas ce
      where ce.caso_id = c.id
    ) etapas on true
    left join lateral (
      select sum(d.valor) as total
      from public.despesas d
      where d.caso_id = c.id
    ) gasto on true;
