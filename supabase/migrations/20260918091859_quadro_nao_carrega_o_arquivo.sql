-- O QUADRO PARA DE CARREGAR O ARQUIVO (18/09/2026, correção 4 da lentidão).
--
-- O QUE ESTAVA ACONTECENDO. A tela do Quadro buscava TODOS os casos do sistema
-- e TODAS as etapas deles a cada recarga — 266 casos e 1.431 etapas no dia do
-- diagnóstico, dos quais 239 casos já encerrados ou cancelados. Toda tela aberta
-- fazia isso a cada mudança de qualquer pessoa, e a conta cresce ~135 casos por
-- mês, para sempre. Medido no remoto: em 30 dias, 13,7 das 20,2 horas de
-- trabalho do banco foram essa consulta.
--
-- O QUE O QUADRO PRECISA DE UM CASO TERMINADO é pouco, e cabe numa regra. Fora
-- da aba Concluídos, um caso encerrado ou cancelado só aparece em dois lugares:
--
--   1. Nas seções MASTER e FOTO/LIVRO, quando o caso ENCERROU com o vídeo ou o
--      fotolivro ainda aberto — as duas etapas não seguram o encerramento
--      (20260903153101 e 20260910150425), e o trabalho continua na seção.
--      SÓ ENCERRADO: a seção esconde cancelado (a RPC recusa mover a fase), e
--      no remoto há 12 cancelados com vídeo ou fotolivro pendente para sempre.
--      Contá-los aqui os carregaria em toda recarga até o fim dos tempos.
--
--   2. No CONTADOR do dia ("3 de 10 concluídos"), enquanto o dia ainda tem
--      trabalho aberto. O cartão do caso terminado não aparece no bloco, mas ele
--      conta — cancelado resolve o dia (invariante 3.5). Sem esta metade, o
--      bloco de hoje diria "0 de 7" onde hoje diz "3 de 10".
--
-- Todo o resto é ARQUIVO: a aba Concluídos passa a buscá-lo quando é aberta, e
-- ninguém mais o baixa.
--
-- POR QUE UMA COLUNA DA VIEW, e não um filtro montado no cliente. A regra 2
-- depende de OUTROS casos (o dia está vivo?), e no cliente ela custaria três
-- consultas encadeadas — cada uma esperando a anterior, no 4G do corredor. Aqui
-- é uma consulta só, e a definição mora ao lado de `dia` e de `eh_terminal`, que
-- são as duas coisas que ela combina. Por ser coluna de uma view que já existe,
-- não há objeto novo, GRANT novo nem superfície nova para o `anon`.
--
-- O CUSTO. As duas subconsultas não dependem da linha — são "que casos têm
-- vídeo ou fotolivro aberto" e "que dias têm caso em aberto" —, então o
-- Postgres as calcula UMA vez por consulta (hashed SubPlan) e cada linha só
-- consulta o resultado. Filtrada por `arquivado = false`, a condição desce até
-- a leitura de `casos`, e os joins laterais da view (contagem de etapas, soma de
-- despesas) rodam só para o que sobrou.
--
-- A DEFINIÇÃO DE DIA É A MESMA DA COLUNA `dia`: `previsao_em` no fuso de
-- Curitiba. Um caso das 23h30 e outro das 15h do mesmo dia local caem no mesmo
-- bloco, mesmo com datas UTC diferentes — e precisam cair na mesma conta aqui.
-- Caso SEM previsão forma o bloco "Sem data prevista", e segue a mesma regra
-- entre si.
--
-- O QUE NÃO MUDA: nenhuma linha que alguém enxergava deixa de ser enxergável.
-- A coluna só DIZ quais casos o Quadro precisa; a RLS continua decidindo quem
-- lê o quê, e a aba Concluídos lê o arquivo pela mesma view.
--
-- Coluna nova no FIM — `create or replace view` não aceita reordenar. Repete a
-- definição da 20260915030822 e acrescenta a coluna. O GRANT de SELECT para
-- `authenticated` sobrevive ao `create or replace` (é o mesmo objeto).

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
    coalesce(gasto.total, 0) as total_despesas,
    c.motivo_cancelamento,
    -- ARQUIVADO: terminal, e nada que o Quadro mostre depende dele. Ver o
    -- cabeçalho desta migration.
    (
      c.status_operacional = any (array['encerrado'::status_operacional, 'cancelado'::status_operacional])
      -- 1. Encerrado com vídeo ou fotolivro aberto continua na seção.
      and not (
        c.status_operacional = 'encerrado'
        and c.id in (
          select s.caso_id
            from public.caso_etapas s
           where s.tipo in ('edicao_video', 'album')
             and s.status not in ('concluida', 'dispensada')
        )
      )
      -- 2. Dia que ainda tem caso em aberto: este caso entra na conta dele.
      --    `coalesce` porque `x in (...)` com x nulo dá nulo, e o nulo tem a
      --    própria regra logo abaixo.
      and not coalesce(
        (c.previsao_em at time zone 'America/Sao_Paulo')::date in (
          select (o.previsao_em at time zone 'America/Sao_Paulo')::date
            from public.casos o
           where o.status_operacional <> all (array['encerrado'::status_operacional, 'cancelado'::status_operacional])
             and o.previsao_em is not null
        ),
        false
      )
      -- 2b. O mesmo para o bloco "Sem data prevista".
      and not (
        c.previsao_em is null
        and exists (
          select 1
            from public.casos o
           where o.previsao_em is null
             and o.status_operacional <> all (array['encerrado'::status_operacional, 'cancelado'::status_operacional])
        )
      )
    ) as arquivado
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

comment on column public.quadro_casos.arquivado is
  'Terminal e sem nada que o Quadro principal mostre: nem vídeo/fotolivro aberto (só encerrado), nem dia com caso em aberto (conta no "x de y"). O Quadro carrega arquivado = false; a aba Concluídos lê eh_terminal = true.';
