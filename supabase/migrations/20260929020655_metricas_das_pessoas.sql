-- =============================================================================
-- AS MÉTRICAS DAS PESSOAS — o relatório interno (28/09/2026, pedido do gestor).
--
-- "Vamos começar pelo interno, que deve servir de métrica das fotógrafas:
-- analisar tempo, nascimentos, entradas feitas, TUDO. Tudo o que estamos apenas
-- anotando no front até agora vamos transformar em métricas."
--
-- ANTES DE CONSTRUIR, OS DADOS FORAM MEDIDOS NO REMOTO (28/09), e três defeitos
-- decidiram o desenho desta migration:
--
-- 1. PARTOS CREDITADOS A QUEM NÃO ESTAVA LÁ. Uma conta de gestão tinha 51
--    nascimentos em 33 dias, 47 "pegos para si" (play sem atribuição) e 15 de 48
--    SOBREPOSTOS a outro parto da mesma conta — fisicamente impossível. Quem
--    registrava pela equipe dava o play com o próprio login. Por isso o crédito
--    é do RESPONSÁVEL (`caso_etapas.responsavel_id`, preenchido em 100% das
--    concluídas), e não de quem clicou concluir (`eventos.pessoa_id`, que em 18%
--    das etapas de campo era outra pessoa). E por isso existe `em_paralelo`:
--    etapa de campo que se cruza no tempo com outra do mesmo tipo, da mesma
--    pessoa, em outro caso. É MARCA, não exclusão — duas mães na mesma
--    maternidade existem —, e vale para qualquer papel.
--
-- 2. O RELÓGIO DA EDIÇÃO NÃO MEDIA TRABALHO: 48% das edições de foto e de reels
--    foram concluídas com menos de 5 minutos de relógio (play e concluir
--    juntos). Tratar isso como "rápido" premiaria quem não aperta o play. Aqui
--    ciclo abaixo de 5 minutos é "SEM MEDIÇÃO": a etapa conta no volume e fica
--    fora do tempo. `medidas` separa as duas coisas, e a tela mostra as duas.
--
-- 3. AS MÉTRICAS COMEÇAM EM 01/10/2026 (decisão do gestor, 28/09): "vamos
--    trabalhar apenas com as métricas reais a partir do dia 1 (...) ignorando
--    esse mês e o passado". NADA FOI APAGADO — `eventos` é append-only
--    (invariante 3.3) e o histórico continua no banco. O que existe é um PISO:
--    `inicio_das_metricas()`, aplicado DENTRO de cada função, para nenhuma tela
--    — nem uma chamada direta à API — conseguir pedir setembro. Setembro foi o
--    mês em que os três defeitos acima aconteceram; ele não vira ranking.
--
-- SÓ A GESTÃO LÊ (decisão do gestor, 28/09). Não é `eh_adm()`: ele inclui
-- comercial, coordenação e financeiro. É `papel_sistema = 'gestao'`, o mesmo
-- recorte da `RotaDeGestao`. As funções são SECURITY DEFINER e conferem o papel
-- antes de qualquer consulta; os dados crus (`eventos`, `caso_etapas`)
-- continuam legíveis como sempre foram, pelo sino e pelo histórico.
--
-- NÃO FERE A INVARIANTE 3.1. O ranking é de quem FEZ a etapa, qualquer que seja
-- o papel — a gestão que fotografa entra, e ninguém é filtrado por "tipo de
-- pessoa". A pergunta é "quem fez nascimentos", não "quem é fotógrafa".
--
-- TODA SOMA É DO BANCO, como no relatório de despesas: a tela recebe os números
-- prontos, e nenhuma delas passa de algumas centenas de linhas.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- O PISO. Uma definição só, lida por todas as funções abaixo. A tela tem um
-- espelho (`INICIO_DAS_METRICAS`, em features/relatorios/lib/metricas.ts) só
-- para desenhar o estado vazio antes da data; quem garante é daqui.
-- -----------------------------------------------------------------------------

create function public.inicio_das_metricas()
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select timestamptz '2026-10-01 00:00:00-03'
$$;

comment on function public.inicio_das_metricas() is
  'Quando as métricas das pessoas começam a contar: 01/10/2026, meia-noite de Brasília (decisão do gestor, 28/09/2026). Antes disso os dados continuam no banco — é o relatório que não os lê: setembro teve partos registrados em nome de quem não estava na sala e metade das edições sem relógio.';

revoke all on function public.inicio_das_metricas() from public;


-- -----------------------------------------------------------------------------
-- A PORTA. Levanta exceção para quem não é gestão ativa.
-- -----------------------------------------------------------------------------

create function public.exigir_gestao()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.pessoas p
    where p.auth_user_id = auth.uid()
      and p.ativo
      and p.papel_sistema = 'gestao'
  ) then
    raise exception 'Os relatórios de pessoas são só da gestão.';
  end if;
end;
$$;

comment on function public.exigir_gestao() is
  'Recusa quem não é pessoa ativa com papel_sistema = gestao. Chamada no começo de toda função de métricas das pessoas — não é eh_adm(), que inclui comercial, coordenação e financeiro.';

revoke all on function public.exigir_gestao() from public;


-- -----------------------------------------------------------------------------
-- O PERÍODO. Datas de Brasília, fim INCLUSIVO (o que a tela mostra: "01/10 a
-- 31/10"), convertido para o intervalo meio-aberto que as consultas usam, com
-- o piso aplicado no começo.
-- -----------------------------------------------------------------------------

create function public.periodo_das_metricas(
  p_inicio date,
  p_fim    date,
  out inicio timestamptz,
  out fim    timestamptz
)
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_inicio is null or p_fim is null then
    raise exception 'Informe o começo e o fim do período.';
  end if;

  if p_fim < p_inicio then
    raise exception 'O fim do período (%) vem antes do começo (%).', p_fim, p_inicio;
  end if;

  inicio := greatest(p_inicio::timestamp at time zone 'America/Sao_Paulo', public.inicio_das_metricas());
  fim    := (p_fim + 1)::timestamp at time zone 'America/Sao_Paulo';
end;
$$;

revoke all on function public.periodo_das_metricas(date, date) from public;


-- =============================================================================
-- 1. POR PESSOA E POR TIPO DE ETAPA — o coração do ranking e da ficha.
-- =============================================================================
--
-- Uma linha por (pessoa, tipo). O que cada coluna responde:
--   concluidas            quantas ela fez (crédito do RESPONSÁVEL)
--   medidas               quantas tinham relógio de verdade (ciclo ≥ 5 min)
--   mediana_min, soma_min tempo líquido (sem pausa) SÓ das medidas
--   com_prazo, no_prazo   foto e reels: concluída antes de o caso vencer?
--   concluidas_por_outra  quem clicou concluir foi outra pessoa (registro feito
--                         por alguém no lugar dela — o jeito certo de registrar
--                         por outra pessoa, e ainda assim um hábito a ver)
--   em_paralelo           etapa de campo cruzada no tempo com outra do mesmo
--                         tipo, da mesma pessoa, em outro caso
--
-- O PRAZO É SÓ DE FOTO E REELS: são as peças que o SLA do pacote cobre. Vídeo
-- do MASTER, Foto/Livro e New Born têm prazo próprio, combinado caso a caso
-- (`previsao_em`), e o vencimento do caso não diz nada sobre eles.

create function public.metricas_por_etapa(p_inicio date, p_fim date)
returns table (
  pessoa_id            uuid,
  tipo                 public.etapa_tipo,
  concluidas           integer,
  medidas              integer,
  mediana_min          numeric,
  soma_min             numeric,
  com_prazo            integer,
  no_prazo             integer,
  concluidas_por_outra integer,
  em_paralelo          integer
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
    select ce.id, ce.caso_id, ce.tipo, ce.trilha, ce.responsavel_id,
           ce.iniciado_em, ce.concluido_em,
           extract(epoch from (ce.concluido_em - ce.iniciado_em
                               - coalesce(ce.pausa_acumulada, interval '0'))) / 60.0 as ciclo_min
    from public.caso_etapas ce
    where ce.status = 'concluida'
      and ce.responsavel_id is not null
      and ce.concluido_em >= v_ini
      and ce.concluido_em <  v_fim
  ),
  quem_clicou as (
    select distinct on (e.caso_etapa_id) e.caso_etapa_id, e.pessoa_id
    from public.eventos e
    where e.tipo = 'etapa_concluida'
      and e.caso_etapa_id in (select c.id from conc c)
    order by e.caso_etapa_id, e.ocorrido_em desc
  ),
  paralelas as (
    select distinct a.id
    from conc a
    join conc b
      on b.responsavel_id = a.responsavel_id
     and b.tipo = a.tipo
     and b.caso_id <> a.caso_id
     and a.iniciado_em < b.concluido_em
     and b.iniciado_em < a.concluido_em
    where a.trilha = 'acompanhamento'
  )
  select c.responsavel_id,
         c.tipo,
         count(*)::integer,
         count(*) filter (where c.ciclo_min >= 5)::integer,
         round((percentile_cont(0.5) within group (order by c.ciclo_min)
                  filter (where c.ciclo_min >= 5))::numeric, 1),
         round(coalesce(sum(c.ciclo_min) filter (where c.ciclo_min >= 5), 0)::numeric, 1),
         count(*) filter (where c.tipo in ('edicao_foto', 'reels') and q.vence_em is not null)::integer,
         count(*) filter (where c.tipo in ('edicao_foto', 'reels') and q.vence_em is not null
                            and c.concluido_em <= q.vence_em)::integer,
         count(*) filter (where qc.pessoa_id is not null and qc.pessoa_id <> c.responsavel_id)::integer,
         count(*) filter (where c.id in (select pa.id from paralelas pa))::integer
  from conc c
  left join public.quadro_casos q on q.id = c.caso_id
  left join quem_clicou qc on qc.caso_etapa_id = c.id
  group by c.responsavel_id, c.tipo;
end;
$$;

comment on function public.metricas_por_etapa(date, date) is
  'Métricas por pessoa e tipo de etapa no período (datas de Brasília, fim inclusivo, piso em inicio_das_metricas). Crédito do RESPONSÁVEL. Ciclo abaixo de 5 minutos é "sem medição": conta no volume, fica fora do tempo. Prazo só de foto e reels. Só gestão.';

revoke all on function public.metricas_por_etapa(date, date) from public, anon;
grant execute on function public.metricas_por_etapa(date, date) to authenticated;


-- =============================================================================
-- 2. A EQUIPE POR TIPO DE ETAPA — a régua contra a qual cada pessoa é lida.
-- =============================================================================
--
-- A mediana da equipe NÃO sai das medianas das pessoas (mediana de medianas é
-- outro número), por isso é função própria. P25 e P75 dão a faixa do "normal":
-- a ficha diz "dentro da faixa da equipe" em vez de ranquear diferença de dois
-- minutos, que num mês de dados é quase sempre sorte.

create function public.metricas_da_equipe_por_etapa(p_inicio date, p_fim date)
returns table (
  tipo        public.etapa_tipo,
  concluidas  integer,
  medidas     integer,
  pessoas     integer,
  mediana_min numeric,
  p25_min     numeric,
  p75_min     numeric
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
           extract(epoch from (ce.concluido_em - ce.iniciado_em
                               - coalesce(ce.pausa_acumulada, interval '0'))) / 60.0 as ciclo_min
    from public.caso_etapas ce
    where ce.status = 'concluida'
      and ce.responsavel_id is not null
      and ce.concluido_em >= v_ini
      and ce.concluido_em <  v_fim
  )
  select c.tipo,
         count(*)::integer,
         count(*) filter (where c.ciclo_min >= 5)::integer,
         count(distinct c.responsavel_id)::integer,
         round((percentile_cont(0.5)  within group (order by c.ciclo_min) filter (where c.ciclo_min >= 5))::numeric, 1),
         round((percentile_cont(0.25) within group (order by c.ciclo_min) filter (where c.ciclo_min >= 5))::numeric, 1),
         round((percentile_cont(0.75) within group (order by c.ciclo_min) filter (where c.ciclo_min >= 5))::numeric, 1)
  from conc c
  group by c.tipo;
end;
$$;

comment on function public.metricas_da_equipe_por_etapa(date, date) is
  'A equipe inteira por tipo de etapa: volume, quantas medidas, e mediana/P25/P75 do tempo líquido (só ciclos ≥ 5 min). É a régua das fichas individuais. Só gestão.';

revoke all on function public.metricas_da_equipe_por_etapa(date, date) from public, anon;
grant execute on function public.metricas_da_equipe_por_etapa(date, date) to authenticated;


-- =============================================================================
-- 3. POR PESSOA — o trabalho que não é etapa, e o que voltou.
-- =============================================================================
--
-- "Tudo o que estamos apenas anotando no front" vira número aqui:
--   dias_com_trabalho      dias (de Brasília) com ao menos uma conclusão
--   passagens_dadas/…      handoffs que ela passou e que recebeu
--   material_baixou/subiu  as pílulas BAIXOU e UPLOAD do card — trabalho real
--                          que nunca foi etapa. Conta pelo valor ATUAL da etapa
--                          e pela data do último registro daquele campo.
--   atribuicoes_feitas     quantas etapas ela distribuiu (a coordenação)
--   entregas_confirmadas,
--   termos, avaliacoes     o trabalho do ADM
--   voltou_para_ajuste     o que ela entregou e voltou — ver abaixo
--
-- "VOLTOU PARA AJUSTE" TEM DUAS FONTES, e as duas foram medidas antes:
--   * `caso_reaberto` (reabertura DELIBERADA, com motivo): o crédito vai para
--     quem fez a última rodada concluída de cada tipo reaberto, antes da
--     reabertura — é o trabalho que voltou.
--   * `etapa_reaberta` de uma etapa que estava CONCLUÍDA há mais de 30 minutos.
--     No remoto, 116 das 180 reaberturas foram desfeitas em menos de 30 min:
--     clique errado corrigido, não retrabalho. Contá-las triplicaria o número.
--     Aqui o crédito é do responsável atual da etapa — aproximação: se ela
--     mudou de mão depois, vai para quem a tem hoje.
-- O nome é "voltou para ajuste", e não "erro", de propósito: a maior parte das
-- reaberturas nasce de pedido da família, não de falha de quem editou.
--
-- ENTRA TODA PESSOA ATIVA, mesmo sem nada no período, e quem já saiu mas teve
-- trabalho nele: a ficha com zeros diz "esteve na equipe e não registrou nada",
-- que é informação.

create function public.metricas_por_pessoa(p_inicio date, p_fim date)
returns table (
  pessoa_id            uuid,
  nome                 text,
  papel_sistema        text,
  ativo                boolean,
  dias_com_trabalho    integer,
  passagens_dadas      integer,
  passagens_recebidas  integer,
  material_baixou      integer,
  material_subiu       integer,
  atribuicoes_feitas   integer,
  entregas_confirmadas integer,
  termos_registrados   integer,
  avaliacoes_feitas    integer,
  voltou_para_ajuste   integer
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
  with
  dias as (
    select ce.responsavel_id as pid,
           count(distinct (ce.concluido_em at time zone 'America/Sao_Paulo')::date) as n
    from public.caso_etapas ce
    where ce.status = 'concluida' and ce.responsavel_id is not null
      and ce.concluido_em >= v_ini and ce.concluido_em < v_fim
    group by ce.responsavel_id
  ),
  dadas as (
    select h.de_pessoa_id as pid, count(*) as n
    from public.handoffs h
    where h.ocorrido_em >= v_ini and h.ocorrido_em < v_fim
    group by h.de_pessoa_id
  ),
  recebidas as (
    select h.para_pessoa_id as pid, count(*) as n
    from public.handoffs h
    where h.ocorrido_em >= v_ini and h.ocorrido_em < v_fim
    group by h.para_pessoa_id
  ),
  -- A data que conta é a do ÚLTIMO registro daquele campo naquela etapa; a
  -- pessoa é a que está lá AGORA. Corrigir "baixou" de fulana para ciclana
  -- move o crédito, como deve.
  ultimo_material as (
    select distinct on (e.caso_etapa_id, e.payload->>'campo')
           e.caso_etapa_id, e.payload->>'campo' as campo, e.ocorrido_em
    from public.eventos e
    where e.tipo = 'material_registrado'
      and e.payload->>'campo' in ('baixou', 'upload')
    order by e.caso_etapa_id, e.payload->>'campo', e.ocorrido_em desc
  ),
  baixou as (
    select ce.baixou_por as pid, count(*) as n
    from ultimo_material um
    join public.caso_etapas ce on ce.id = um.caso_etapa_id
    where um.campo = 'baixou' and ce.baixou_por is not null
      and um.ocorrido_em >= v_ini and um.ocorrido_em < v_fim
    group by ce.baixou_por
  ),
  subiu as (
    select ce.subiu_por as pid, count(*) as n
    from ultimo_material um
    join public.caso_etapas ce on ce.id = um.caso_etapa_id
    where um.campo = 'upload' and ce.subiu_por is not null
      and um.ocorrido_em >= v_ini and um.ocorrido_em < v_fim
    group by ce.subiu_por
  ),
  por_evento as (
    select e.pessoa_id as pid,
           count(*) filter (where e.tipo = 'etapa_atribuida')      as atribuicoes,
           count(*) filter (where e.tipo = 'entrega_confirmada')   as confirmacoes,
           count(*) filter (where e.tipo = 'termo_registrado')     as termos,
           count(*) filter (where e.tipo = 'avaliacao_registrada') as avaliacoes
    from public.eventos e
    where e.pessoa_id is not null
      and e.ocorrido_em >= v_ini and e.ocorrido_em < v_fim
      and e.tipo in ('etapa_atribuida', 'entrega_confirmada', 'termo_registrado', 'avaliacao_registrada')
    group by e.pessoa_id
  ),
  voltou_caso as (
    select ult.responsavel_id as pid, count(*) as n
    from public.eventos e
    cross join lateral jsonb_array_elements_text(coalesce(e.payload->'etapas', '[]'::jsonb)) as t(tipo)
    cross join lateral (
      select ce.responsavel_id
      from public.caso_etapas ce
      where ce.caso_id = e.caso_id
        and ce.tipo::text = t.tipo
        and ce.status = 'concluida'
        and ce.concluido_em < e.ocorrido_em
      order by ce.rodada desc, ce.concluido_em desc
      limit 1
    ) as ult
    where e.tipo = 'caso_reaberto'
      and e.ocorrido_em >= v_ini and e.ocorrido_em < v_fim
      and ult.responsavel_id is not null
    group by ult.responsavel_id
  ),
  voltou_etapa as (
    select ce.responsavel_id as pid, count(*) as n
    from public.eventos e
    join public.caso_etapas ce on ce.id = e.caso_etapa_id
    where e.tipo = 'etapa_reaberta'
      and e.payload->>'status_anterior' = 'concluida'
      and e.payload ? 'concluido_em_anterior'
      and e.ocorrido_em - (e.payload->>'concluido_em_anterior')::timestamptz > interval '30 minutes'
      and e.ocorrido_em >= v_ini and e.ocorrido_em < v_fim
      and ce.responsavel_id is not null
    group by ce.responsavel_id
  ),
  quem as (
    select p.id from public.pessoas p where p.ativo
    union select pid from dias
    union select pid from dadas
    union select pid from recebidas
    union select pid from baixou
    union select pid from subiu
    union select pid from por_evento
    union select pid from voltou_caso
    union select pid from voltou_etapa
  )
  select p.id,
         p.nome,
         p.papel_sistema::text,
         p.ativo,
         coalesce(d.n, 0)::integer,
         coalesce(da.n, 0)::integer,
         coalesce(re.n, 0)::integer,
         coalesce(b.n, 0)::integer,
         coalesce(s.n, 0)::integer,
         coalesce(pe.atribuicoes, 0)::integer,
         coalesce(pe.confirmacoes, 0)::integer,
         coalesce(pe.termos, 0)::integer,
         coalesce(pe.avaliacoes, 0)::integer,
         (coalesce(vc.n, 0) + coalesce(ve.n, 0))::integer
  from quem q
  join public.pessoas p on p.id = q.id
  left join dias d         on d.pid  = p.id
  left join dadas da       on da.pid = p.id
  left join recebidas re   on re.pid = p.id
  left join baixou b       on b.pid  = p.id
  left join subiu s        on s.pid  = p.id
  left join por_evento pe  on pe.pid = p.id
  left join voltou_caso vc on vc.pid = p.id
  left join voltou_etapa ve on ve.pid = p.id;
end;
$$;

comment on function public.metricas_por_pessoa(date, date) is
  'Uma linha por pessoa (toda ativa, e quem teve trabalho no período): dias com trabalho, passagens, material baixado/subido, atribuições, confirmações, termos, avaliações e o que voltou para ajuste (caso reaberto + etapa reaberta mais de 30 min depois de concluída). Só gestão.';

revoke all on function public.metricas_por_pessoa(date, date) from public, anon;
grant execute on function public.metricas_por_pessoa(date, date) to authenticated;


-- =============================================================================
-- 4. A EQUIPE POR SEMANA — o painel e seus gráficos.
-- =============================================================================
--
-- O PRAZO É CONTADO NO ENVIO para Entregáveis, e não na confirmação do ADM: o
-- envio é o fim do trabalho da equipe. A espera pelo ADM vem numa coluna à
-- parte, para uma não esconder a outra (no remoto em 28/09: 29,5h do
-- nascimento ao envio, e mais 9,5h até a confirmação).
--
-- A semana começa na segunda, em Brasília.

create function public.metricas_prazo_por_semana(p_inicio date, p_fim date)
returns table (
  semana                   date,
  enviados                 integer,
  no_prazo                 integer,
  mediana_horas_ate_envio  numeric,
  mediana_horas_ate_confirmacao numeric
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
  select date_trunc('week', q.liberado_para_entrega_em at time zone 'America/Sao_Paulo')::date,
         count(*)::integer,
         count(*) filter (where q.liberado_para_entrega_em <= q.vence_em)::integer,
         round((percentile_cont(0.5) within group (
           order by extract(epoch from (q.liberado_para_entrega_em - q.nascimento_concluido_em)) / 3600.0
         ))::numeric, 1),
         round((percentile_cont(0.5) within group (
           order by extract(epoch from (q.encerrado_em - q.liberado_para_entrega_em)) / 3600.0
         ) filter (where q.encerrado_em is not null))::numeric, 1)
  from public.quadro_casos q
  where q.liberado_para_entrega_em >= v_ini
    and q.liberado_para_entrega_em <  v_fim
    and q.vence_em is not null
    and q.nascimento_concluido_em is not null
    and q.status_operacional <> 'cancelado'
  group by 1
  order by 1;
end;
$$;

comment on function public.metricas_prazo_por_semana(date, date) is
  'Casos enviados para Entregáveis por semana (segunda-feira, Brasília): quantos, quantos antes de vencer, mediana de horas do nascimento ao envio e do envio à confirmação do ADM. Só gestão.';

revoke all on function public.metricas_prazo_por_semana(date, date) from public, anon;
grant execute on function public.metricas_prazo_por_semana(date, date) to authenticated;


-- O MESMO NÚMERO PARA O PERÍODO INTEIRO, e não a soma das semanas: contagem se
-- soma, MEDIANA NÃO. A mediana do mês não é a mediana das medianas semanais, e
-- o bloco "do parto ao envio" do painel precisa da verdadeira.
create function public.metricas_prazo_do_periodo(p_inicio date, p_fim date)
returns table (
  enviados                 integer,
  no_prazo                 integer,
  mediana_horas_ate_envio  numeric,
  mediana_horas_ate_confirmacao numeric
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
  select count(*)::integer,
         count(*) filter (where q.liberado_para_entrega_em <= q.vence_em)::integer,
         round((percentile_cont(0.5) within group (
           order by extract(epoch from (q.liberado_para_entrega_em - q.nascimento_concluido_em)) / 3600.0
         ))::numeric, 1),
         round((percentile_cont(0.5) within group (
           order by extract(epoch from (q.encerrado_em - q.liberado_para_entrega_em)) / 3600.0
         ) filter (where q.encerrado_em is not null))::numeric, 1)
  from public.quadro_casos q
  where q.liberado_para_entrega_em >= v_ini
    and q.liberado_para_entrega_em <  v_fim
    and q.vence_em is not null
    and q.nascimento_concluido_em is not null
    and q.status_operacional <> 'cancelado';
end;
$$;

comment on function public.metricas_prazo_do_periodo(date, date) is
  'O prazo do período inteiro numa linha: enviados, no prazo, e as medianas verdadeiras de horas até o envio e até a confirmação (mediana não se compõe das semanas). Só gestão.';

revoke all on function public.metricas_prazo_do_periodo(date, date) from public, anon;
grant execute on function public.metricas_prazo_do_periodo(date, date) to authenticated;


create function public.metricas_volume_por_semana(p_inicio date, p_fim date)
returns table (
  semana     date,
  tipo       public.etapa_tipo,
  concluidas integer
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
  select date_trunc('week', ce.concluido_em at time zone 'America/Sao_Paulo')::date,
         ce.tipo,
         count(*)::integer
  from public.caso_etapas ce
  where ce.status = 'concluida'
    and ce.concluido_em >= v_ini
    and ce.concluido_em <  v_fim
  group by 1, 2
  order by 1, 2;
end;
$$;

comment on function public.metricas_volume_por_semana(date, date) is
  'Etapas concluídas por semana (segunda-feira, Brasília) e tipo. Só gestão.';

revoke all on function public.metricas_volume_por_semana(date, date) from public, anon;
grant execute on function public.metricas_volume_por_semana(date, date) to authenticated;


-- =============================================================================
-- 5. OS PADRÕES DE TEMPO — o "conhecido por todas" que o plano prometia.
-- =============================================================================
--
-- A tabela `padroes_tempo` existe desde o schema inicial e nunca teve linha: o
-- plano (seção 6) combinou "padrões de tempo conhecidos por todas" e ninguém
-- os definiu. O comentário da tabela já diz como: "calibrados com 30 a 60 dias
-- de dados reais — nunca chutados no código", e "uma nova régua é uma linha
-- nova, jamais um UPDATE na anterior". A tela mostra a mediana medida como
-- SUGESTÃO; quem decide o número é a gestão.
--
-- Ela não tinha GRANT nem policy — nada lia nem escrevia. Continua assim: a
-- leitura e a escrita passam por estas duas funções, que conferem a gestão.
--
-- MESMO DIA SUBSTITUI. A régua definida hoje ainda não valeu um dia inteiro, e
-- corrigir um número digitado errado não é "mudar a régua anterior". Um dia
-- depois, definir de novo é linha nova — e a de ontem fica no histórico.
-- O PADRÃO É GERAL POR TIPO (`pacote_id` nulo): a coluna de pacote existe na
-- tabela, e esta primeira versão não a usa — vídeo só existe no MASTER, e o
-- resto ainda não mostrou diferença entre pacotes que valha uma régua própria.

create function public.padroes_de_tempo()
returns table (
  etapa_tipo        public.etapa_tipo,
  minutos_esperados integer,
  vigente_desde     date
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
  select distinct on (pt.etapa_tipo) pt.etapa_tipo, pt.minutos_esperados, pt.vigente_desde
  from public.padroes_tempo pt
  where pt.pacote_id is null
    and pt.vigente_desde <= (now() at time zone 'America/Sao_Paulo')::date
  order by pt.etapa_tipo, pt.vigente_desde desc;
end;
$$;

comment on function public.padroes_de_tempo() is
  'O padrão de tempo em vigor hoje para cada tipo de etapa (o geral, sem pacote). Só gestão.';

revoke all on function public.padroes_de_tempo() from public, anon;
grant execute on function public.padroes_de_tempo() to authenticated;


create function public.definir_padrao_de_tempo(
  p_etapa_tipo public.etapa_tipo,
  p_minutos    integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pessoa_id uuid;
  v_hoje      date := (now() at time zone 'America/Sao_Paulo')::date;
  v_anterior  integer;
begin
  perform public.exigir_gestao();

  select p.id into v_pessoa_id
  from public.pessoas p
  where p.auth_user_id = auth.uid() and p.ativo;

  if p_etapa_tipo is null then
    raise exception 'Escolha a etapa do padrão.';
  end if;

  if p_minutos is null or p_minutos <= 0 then
    raise exception 'O padrão precisa ser um tempo maior que zero.';
  end if;

  select distinct on (pt.etapa_tipo) pt.minutos_esperados into v_anterior
  from public.padroes_tempo pt
  where pt.etapa_tipo = p_etapa_tipo and pt.pacote_id is null
    and pt.vigente_desde <= v_hoje
  order by pt.etapa_tipo, pt.vigente_desde desc;

  if v_anterior is not distinct from p_minutos then
    return;  -- a régua já é esta; nada muda, nada a registrar
  end if;

  insert into public.padroes_tempo (etapa_tipo, pacote_id, minutos_esperados, vigente_desde)
  values (p_etapa_tipo, null, p_minutos, v_hoje)
  on conflict on constraint padroes_tempo_vigencia_unica
  do update set minutos_esperados = excluded.minutos_esperados;

  insert into public.eventos (caso_id, caso_etapa_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    null, null, v_pessoa_id, 'padrao_de_tempo_definido',
    jsonb_build_object(
      'etapa', p_etapa_tipo,
      'minutos', p_minutos,
      'minutos_anterior', v_anterior,
      'vigente_desde', v_hoje
    ),
    now()
  );
end;
$$;

comment on function public.definir_padrao_de_tempo(public.etapa_tipo, integer) is
  'Define o padrão de tempo geral de um tipo de etapa, valendo a partir de hoje (Brasília). Régua nova é linha nova; no mesmo dia, substitui (é correção, a régua ainda não valeu). Grava padrao_de_tempo_definido em eventos. Só gestão.';

revoke all on function public.definir_padrao_de_tempo(public.etapa_tipo, integer) from public, anon;
grant execute on function public.definir_padrao_de_tempo(public.etapa_tipo, integer) to authenticated;
