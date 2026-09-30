-- =============================================================================
-- EVENTO E NEWBORN VIRAM CASO (30/09/2026, pedido do gestor)
-- =============================================================================
--
-- Os dois já estavam na agenda do Google e o sync os lia errado: "EVENTO/MKT -
-- BASIC - HSC" virava um BASIC com entrada, nascimento e tudo; "NEWBORN/ANA/
-- JOSÉ - BABY REELS - HSC" virava um parto de uma mãe chamada "NEWBORN". Medido
-- no remoto: 19 eventos, todos como BASIC, e 7 newborns — cada um com o caso do
-- parto da mesma família, nenhum deles com o New Born marcado. Ou seja: o
-- evento NEWBORN é o ensaio de um parto que já existe, marcado à parte.
--
-- A decisão do gestor, para os dois: são lidos como qualquer caso, mas com as
-- etapas deles.
--   * EVENTO  — acompanhamento (play e concluir), e depois edição de fotos e
--               reels, como num caso. Prazo de 48h, como a maioria; ele conta
--               do ACOMPANHAMENTO, já que não há nascimento.
--   * NEWBORN — acompanhamento (o ensaio na casa), e o New Born (`click_home`),
--               que vive na seção. Concluído o ensaio, o caso SAI DO QUADRO e
--               fica na seção; encerra quando a galeria é entregue. Sem prazo de
--               pacote — a esteira do New Born tem o prazo dela.
--
-- DOIS PACOTES NO CADASTRO, e não um tipo de caso novo: o pacote é o que define
-- as etapas (seção 2 do CLAUDE.md), e é por ele que o resto do sistema já
-- pergunta. O parser os reconhece pelo começo do título (ver parse-evento.ts).
-- Os casos que já existem com esses títulos NÃO mudam: o sync nunca troca um
-- pacote preenchido, e trocar só acrescenta etapas.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. A etapa: ordem, trilha e pontos
-- -----------------------------------------------------------------------------

create or replace function public.ordem_padrao_da_etapa(p_tipo public.etapa_tipo)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_tipo
    when 'entrada'         then 1
    when 'nascimento'      then 2
    when 'banho'           then 3
    when 'fechamento'      then 4
    when 'edicao_foto'     then 5
    when 'reels'           then 6
    when 'edicao_video'    then 7
    when 'album'           then 8
    when 'encontro_irmaos' then 9
    when 'saida_uti'       then 10
    when 'alta'            then 11
    when 'click_home'      then 12
    -- Primeiro de tudo: no EVENTO e no NEWBORN é o trabalho de campo, e o card
    -- lê de cima para baixo (30/09/2026).
    when 'acompanhamento'  then 0
  end;
$$;


-- A trilha é coluna gerada; no Postgres 17 a expressão muda sem recriar a
-- coluna (a 20260831133153 precisou derrubá-la e às views que a usavam).
alter table public.caso_etapas
  alter column trilha set expression as (
    case
      when tipo = any (array['entrada', 'nascimento', 'banho', 'fechamento', 'encontro_irmaos', 'saida_uti', 'alta', 'acompanhamento']::public.etapa_tipo[])
        then 'acompanhamento'
      else 'edicao'
    end
  );

create or replace function public.item_de_pontuacao(
  p_tipo        public.etapa_tipo,
  p_rodada      integer,
  p_pacote_slug text
)
returns public.item_de_pontuacao
language sql
immutable
set search_path = ''
as $$
  select case p_tipo
    -- "Quando o pacote contratado for da linha Birth." O prefixo é o mesmo
    -- critério da tela (`termo.ts`, `DialogoConfirmarEntrega`): birth e
    -- birth-reels.
    when 'nascimento'      then case when coalesce(p_pacote_slug, '') like 'birth%'
                                     then 'nascimento_birth' else 'nascimento' end
    when 'entrada'         then 'entrada'
    when 'banho'           then 'banho'
    when 'fechamento'      then 'fechamento'
    when 'encontro_irmaos' then 'encontro_irmaos'
    when 'saida_uti'       then 'saida_uti'
    when 'alta'            then 'alta'
    -- A rodada é o BLOCO de captura (seção 2 do CLAUDE.md): 1 é o parto, 2 é o
    -- banho + fechamento, e daí em diante é revisão (ou o encontro de irmãos de
    -- antes de 16/09, no reels).
    when 'edicao_foto'     then case p_rodada when 1 then 'foto_parto' when 2 then 'foto_bf' else 'foto_revisao' end
    when 'reels'           then case p_rodada when 1 then 'reels_parto' when 2 then 'reels_bf' else 'reels_revisao' end
    when 'edicao_video'    then 'video_master'
    when 'album'           then 'fotolivro'
    when 'click_home'      then 'new_born'
    when 'acompanhamento'  then 'acompanhamento'
  end::public.item_de_pontuacao
$$;


revoke all on function public.item_de_pontuacao(public.etapa_tipo, integer, text) from public;


-- -----------------------------------------------------------------------------
-- 2. Os pacotes
-- -----------------------------------------------------------------------------

insert into public.pacotes (nome, slug, prazo_entrega)
values ('EVENTO', 'evento', interval '48 hours'),
       ('NEWBORN', 'newborn', null)
on conflict (slug) do nothing;

insert into public.pacote_etapas (pacote_id, etapa_tipo, ordem)
select p.id, e.tipo::public.etapa_tipo, public.ordem_padrao_da_etapa(e.tipo::public.etapa_tipo)
from public.pacotes p
join (values
  ('evento', 'acompanhamento'), ('evento', 'edicao_foto'), ('evento', 'reels'),
  ('newborn', 'acompanhamento'), ('newborn', 'click_home')
) as e(slug, tipo) on e.slug = p.slug
on conflict (pacote_id, etapa_tipo) do nothing;


-- -----------------------------------------------------------------------------
-- 3. A view: o prazo do EVENTO e o NEWBORN que já está só na seção
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
        then public.somar_dias_uteis(coalesce(c.reaberto_em, n.concluido_em, ac.concluido_em), p.prazo_dias_uteis)
      else coalesce(c.reaberto_em, n.concluido_em, ac.concluido_em) + p.prazo_entrega
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
          then public.somar_dias_uteis(coalesce(c.reaberto_em, n.concluido_em, ac.concluido_em), p.prazo_dias_uteis)
        else coalesce(c.reaberto_em, n.concluido_em, ac.concluido_em) + p.prazo_entrega
      end - coalesce(c.reaberto_em, n.concluido_em, ac.concluido_em)
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
           where s.tipo in ('edicao_video', 'album', 'click_home')
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
    ) as arquivado,
    -- NO FIM, e não ao lado das outras colunas de caso: `create or replace
    -- view` recusa qualquer mudança na lista que já existe — acrescentar no
    -- meio RENOMEIA a coluna seguinte, e o Postgres para com
    -- "cannot change name of view column".
    c.encerrado_em,
    c.avaliacao_em,
    c.previsao_sem_hora,
    -- NA SEÇÃO (30/09/2026): o NEWBORN cujo ensaio já foi feito. Ele sai do
    -- Quadro e passa a viver na seção New Born, onde está o trabalho que
    -- sobrou; encerra quando a entrega da galeria é confirmada.
    (
      p.slug = 'newborn'
      and c.status_operacional <> all (array['encerrado'::status_operacional, 'cancelado'::status_operacional])
      and not exists (
        select 1 from public.caso_etapas s
         where s.caso_id = c.id
           and s.tipo <> 'click_home'
           and s.status not in ('concluida', 'dispensada')
      )
    ) as na_secao
  from public.casos c
    left join public.pacotes p on p.id = c.pacote_id
    left join public.maternidades m on m.id = c.maternidade_id
    left join public.pessoas lib on lib.id = c.liberado_para_entrega_por
    left join public.caso_etapas n on n.caso_id = c.id and n.tipo = 'nascimento'
    left join public.caso_etapas ac on ac.caso_id = c.id and ac.tipo = 'acompanhamento' and ac.rodada = 1
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


-- -----------------------------------------------------------------------------
-- 4. A galeria do NEWBORN entregue encerra o caso
-- -----------------------------------------------------------------------------

create or replace function public.confirmar_entrega_do_click_home(p_caso_etapa_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pessoa_id uuid;
  v_caso_id   uuid;
begin
  select p.id into v_pessoa_id
  from public.pessoas p
  where p.auth_user_id = auth.uid()
    and p.ativo;

  if v_pessoa_id is null then
    raise exception 'Usuário autenticado não corresponde a nenhuma pessoa ativa.';
  end if;

  select ce.caso_id into v_caso_id
  from public.caso_etapas ce
  where ce.id = p_caso_etapa_id;

  if not found then
    raise exception 'caso_etapa % não encontrada.', p_caso_etapa_id;
  end if;

  -- A checagem de papel e a de fase moram na mover_click_home, e é ela quem
  -- conclui a etapa — uma segunda definição de "finalizar" receberia só metade
  -- da próxima correção.
  perform public.mover_click_home(p_caso_etapa_id, 'finalizado');

  update public.entregaveis
     set confirmado_por = v_pessoa_id,
         confirmado_em  = now()
   where caso_id = v_caso_id
     and tipo = 'click_home'
     and confirmado_em is null;

  insert into public.eventos (caso_id, caso_etapa_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    v_caso_id,
    p_caso_etapa_id,
    v_pessoa_id,
    'click_home_entregue',
    jsonb_build_object('caso_etapa_id', p_caso_etapa_id),
    now()
  );

  -- O NEWBORN ENCERRA AQUI (30/09/2026). O caso dele é o ensaio e a galeria, e
  -- mais nada: com a galeria entregue, não sobra trabalho. É a MESMA
  -- confirmação de sempre (`confirmar_entrega`), com as travas dela — o gesto
  -- humano que a invariante 3.5 pede é este clique.
  if exists (
    select 1 from public.casos c join public.pacotes p on p.id = c.pacote_id
     where c.id = v_caso_id and p.slug = 'newborn'
       and c.status_operacional <> all (array['encerrado'::public.status_operacional, 'cancelado'::public.status_operacional])
  ) then
    perform public.confirmar_entrega(v_caso_id);
  end if;
end;
$$;

