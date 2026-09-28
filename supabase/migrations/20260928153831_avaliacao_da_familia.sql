-- =============================================================================
-- A AVALIAÇÃO DA FAMÍLIA — a planilha de pós-entrega entra no sistema
-- (28/09/2026, pedido do gestor).
--
-- O QUE A OPERAÇÃO FAZ HOJE: quinze dias depois de entregar um pacote, alguém
-- procura a família caso a caso e pede a avaliação. Isso é controlado numa
-- planilha à parte — e planilha à parte é exatamente o que este sistema existe
-- para acabar (seção 1).
--
-- A ABA CONCLUÍDOS VIRA TRÊS COLUNAS: Entregues · Avaliação interna ·
-- Concluídos. O caso entra na primeira ao ser entregue, passa para a segunda
-- quando completa quinze dias, e vai para a terceira quando alguém marca que a
-- avaliação foi feita.
--
-- A PASSAGEM DOS 15 DIAS NÃO É UM JOB, É UMA CONTA. Nada no banco muda quando o
-- prazo vence: a coluna em que o caso aparece é derivada de `encerrado_em` na
-- hora de desenhar a tela. Um cron para mover casos de coluna criaria um estado
-- guardado que pode discordar do relógio — e é a mesma razão pela qual o sino
-- não tem tabela de notificações (seção 13): o que é derivado não tem como
-- ficar velho.
--
-- DOIS CARIMBOS NOVOS, e o primeiro faltava desde sempre:
--
--   encerrado_em   QUANDO a entrega foi confirmada. O sistema sabia que o caso
--                  encerrou, mas não quando — só dava para descobrir varrendo
--                  `eventos`. É dele que saem os quinze dias.
--   avaliacao_em   quando a avaliação foi registrada, com `avaliacao_por`.
--
-- O QUE FAZER COM O HISTÓRICO, e é uma decisão que aparece na tela no primeiro
-- dia: sem tratar, todos os casos já entregues cairiam de uma vez em "Avaliação
-- interna" — centenas deles —, como se todos precisassem de uma ligação que a
-- planilha já resolveu. Então o backfill fecha o ciclo dos casos que JÁ ERAM
-- terminais: `avaliacao_em` recebe a data do encerramento e `avaliacao_por`
-- fica NULO, que é como se lê "veio do histórico, ninguém marcou isto aqui".
-- A tela diz isso com todas as letras em vez de fingir que alguém ligou.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. As colunas.
-- -----------------------------------------------------------------------------

alter table public.casos
  add column encerrado_em  timestamptz,
  add column avaliacao_em  timestamptz,
  add column avaliacao_por uuid references public.pessoas (id) on delete restrict;

comment on column public.casos.encerrado_em is
  'Quando a entrega foi confirmada e o caso encerrou. Carimbado por confirmar_entrega; é daqui que saem os 15 dias da avaliação da família. Nulo em caso aberto e em cancelado — cancelar não é entregar.';
comment on column public.casos.avaliacao_em is
  'Quando a avaliação da família foi registrada (registrar_avaliacao). NULO com avaliacao_por nulo e caso encerrado = ainda por fazer. Nos casos anteriores a 28/09/2026 ele veio do backfill, com avaliacao_por NULO: o ciclo deles foi controlado na planilha, e o sistema não inventa quem ligou.';
comment on column public.casos.avaliacao_por is
  'Quem marcou a avaliação como feita. NULO quando o registro veio do backfill de 28/09/2026 — ver avaliacao_em.';

create index casos_avaliacao_por_idx on public.casos (avaliacao_por);

-- Os casos que esperam avaliação, que é a pergunta da coluna do meio. Parcial
-- porque a resposta interessa em poucas linhas: as terminais sem avaliação.
create index casos_avaliacao_pendente_idx
  on public.casos (encerrado_em)
  where avaliacao_em is null and encerrado_em is not null;


-- -----------------------------------------------------------------------------
-- 2. Backfill.
--
-- `encerrado_em` sai do EVENTO de confirmação, que é o carimbo de servidor do
-- gesto (invariante 3.4). Quando não há evento — caso encerrado antes de a
-- `entrega_confirmada` existir, ou reaberto e reentregue em cima —, cai para a
-- confirmação mais recente dos links, e só então para `updated_at`, que é
-- aproximado e fica registrado como tal.
-- -----------------------------------------------------------------------------

update public.casos c
   set encerrado_em = coalesce(
         (select max(e.ocorrido_em) from public.eventos e
           where e.caso_id = c.id and e.tipo = 'entrega_confirmada'),
         (select max(en.confirmado_em) from public.entregaveis en
           where en.caso_id = c.id),
         c.updated_at
       )
 where c.status_operacional = 'encerrado'
   and c.encerrado_em is null;

-- O ciclo do que já foi entregue fecha aqui: a planilha cuidou desses.
update public.casos
   set avaliacao_em = encerrado_em
 where status_operacional = 'encerrado'
   and encerrado_em is not null
   and avaliacao_em is null;


-- -----------------------------------------------------------------------------
-- 3. registrar_avaliacao
--
-- ATENDIMENTO OU ADM, o par de sempre: quem liga para a família é o mesmo lado
-- que confirma a entrega e cancela o caso. A fotógrafa nem enxerga a aba
-- (a tela de Concluídos passou a ser deles em 28/09/2026).
--
-- A REGRA DOS 15 DIAS NÃO ESTÁ AQUI, e é deliberado — o arranjo de sempre: a
-- TELA é mais estrita que o banco, nunca o contrário. A coluna do meio só
-- oferece o botão depois do prazo; o banco recusa o que não faz sentido em
-- nenhum prazo (caso aberto, caso cancelado, avaliação repetida).
-- -----------------------------------------------------------------------------

create or replace function public.registrar_avaliacao(p_caso_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pessoa_id uuid;
  v_status    public.status_operacional;
  v_avaliado  timestamptz;
begin
  select p.id into v_pessoa_id
  from public.pessoas p
  where p.auth_user_id = auth.uid()
    and p.ativo;

  if v_pessoa_id is null then
    raise exception 'Usuário autenticado não corresponde a nenhuma pessoa ativa.';
  end if;

  if not (public.eh_atendimento() or public.eh_adm()) then
    raise exception 'Só atendimento ou adm podem registrar a avaliação da família.';
  end if;

  select c.status_operacional, c.avaliacao_em
    into v_status, v_avaliado
  from public.casos c
  where c.id = p_caso_id
  for update;

  if not found then
    raise exception 'Caso % não encontrado.', p_caso_id;
  end if;

  if v_status <> 'encerrado' then
    raise exception
      'Só se registra avaliação de caso entregue — este está em "%".', v_status;
  end if;

  -- Idempotente: dois toques, ou duas pessoas ao mesmo tempo, não reescrevem
  -- quem marcou primeiro.
  if v_avaliado is not null then
    return;
  end if;

  update public.casos
     set avaliacao_em  = now(),
         avaliacao_por = v_pessoa_id
   where id = p_caso_id;

  insert into public.eventos (caso_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    p_caso_id,
    v_pessoa_id,
    'avaliacao_registrada',
    jsonb_build_object('caso_id', p_caso_id),
    now()
  );
end;
$$;

comment on function public.registrar_avaliacao(uuid) is
  'Marca que a avaliação da família foi feita, e com isso o caso sai de "Avaliação interna" para "Concluídos". Atendimento ou adm. Só em caso ENCERRADO — cancelado não tem família para avaliar —, e idempotente. Os 15 dias são regra de tela: aqui não há prazo.';

revoke all on function public.registrar_avaliacao(uuid) from public, anon;
grant execute on function public.registrar_avaliacao(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- 4. confirmar_entrega carimba o encerramento — e reabre o ciclo da avaliação.
--
-- As duas escritas moram AQUI, ao lado do encerramento, e não numa trigger ou
-- numa limpeza em `reabrir_caso`. A lição da 20260909145223 é justamente essa:
-- quando uma coluna nova entra, quem ESCREVE nela é fácil de achar; quem
-- deveria LIMPÁ-LA não. Um caso reaberto e reentregue é uma entrega NOVA, com
-- quinze dias novos — então a confirmação zera a avaliação anterior em vez de
-- deixar o caso pular direto para "Concluídos" com a resposta de outra entrega.
-- -----------------------------------------------------------------------------

create or replace function public.confirmar_entrega(p_caso_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pessoa_id          uuid;
  v_status_operacional public.status_operacional;
  v_status_entrega     public.status_entrega;
  v_tem_entregavel     boolean;
  v_pendentes          text;
begin
  select p.id into v_pessoa_id
  from public.pessoas p
  where p.auth_user_id = auth.uid()
    and p.ativo;

  if v_pessoa_id is null then
    raise exception 'Usuário autenticado não corresponde a nenhuma pessoa ativa.';
  end if;

  if not (public.eh_atendimento() or public.eh_adm()) then
    raise exception 'Só atendimento ou adm podem confirmar entrega.';
  end if;

  select c.status_operacional, c.status_entrega
    into v_status_operacional, v_status_entrega
  from public.casos c
  where c.id = p_caso_id
  for update;

  if not found then
    raise exception 'Caso % não encontrado.', p_caso_id;
  end if;

  if v_status_operacional in ('encerrado', 'cancelado') then
    raise exception
      'Caso % já está em status terminal ("%") — não pode confirmar entrega.',
      p_caso_id, v_status_operacional;
  end if;

  if v_status_entrega = 'confirmado' then
    raise exception 'Caso % já tem entrega confirmada.', p_caso_id;
  end if;

  select string_agg(ce.tipo::text, ', ' order by ce.rodada, ce.ordem)
    into v_pendentes
  from public.caso_etapas ce
  where ce.caso_id = p_caso_id
    and ce.tipo not in ('edicao_video', 'album', 'click_home')
    and ce.status not in ('concluida', 'dispensada');

  if v_pendentes is not null then
    raise exception
      'Caso % tem etapa em aberto (%) — conclua ou dispense antes de encerrar.',
      p_caso_id, v_pendentes;
  end if;

  select exists(
    select 1 from public.entregaveis e where e.caso_id = p_caso_id
  ) into v_tem_entregavel;

  if not v_tem_entregavel then
    raise exception
      'Caso % não tem nenhum entregável registrado — registre ao menos um link antes de confirmar.',
      p_caso_id;
  end if;

  update public.entregaveis
     set confirmado_por = v_pessoa_id,
         confirmado_em  = now()
   where caso_id = p_caso_id
     and confirmado_por is null;

  update public.casos
     set status_entrega     = 'confirmado',
         status_operacional = 'encerrado',
         encerrado_em       = now(),
         -- Entrega nova, ciclo novo: os quinze dias recomeçam e a avaliação da
         -- entrega anterior não vale para esta.
         avaliacao_em       = null,
         avaliacao_por      = null
   where id = p_caso_id;

  insert into public.eventos (caso_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    p_caso_id,
    v_pessoa_id,
    'entrega_confirmada',
    jsonb_build_object(
      'caso_id', p_caso_id,
      'video_master_pendente', exists(
        select 1 from public.caso_etapas ce
        where ce.caso_id = p_caso_id
          and ce.tipo = 'edicao_video'
          and ce.status not in ('concluida', 'dispensada')
      ),
      'fotolivro_pendente', exists(
        select 1 from public.caso_etapas ce
        where ce.caso_id = p_caso_id
          and ce.tipo = 'album'
          and ce.status not in ('concluida', 'dispensada')
      ),
      'click_home_pendente', exists(
        select 1 from public.caso_etapas ce
        where ce.caso_id = p_caso_id
          and ce.tipo = 'click_home'
          and ce.status not in ('concluida', 'dispensada')
      )
    ),
    now()
  );
end;
$$;


-- -----------------------------------------------------------------------------
-- 5. A view leva os dois carimbos para a tela.
--
-- `create or replace view` não aceita mexer em coluna nenhuma — só acrescentar
-- no fim, com a mesma lista do resto. Por isso ela é declarada inteira de novo,
-- e por isso as duas entram onde a ordem as deixa.
--
-- E elas vão para a MESMA view do Quadro, e não para uma consulta própria da
-- aba: quem desenha as três colunas é a aba Concluídos, que já lê o arquivo por
-- esta view. Uma segunda consulta significaria uma segunda definição de "o que
-- é um caso terminal".
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
    c.avaliacao_em
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
