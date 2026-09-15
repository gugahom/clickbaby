-- =============================================================================
-- O SYNC PARA DE CANCELAR ATENDIMENTO QUE JÁ ACONTECEU.
--
-- O QUE ESTAVA ACONTECENDO (investigado em produção em 15/09/2026)
-- O sync cancelou 45 casos até hoje, e nenhum cancelamento foi inventado: todo
-- evento estava de fato apagado (ou cinza) no Google Calendar. O defeito é a
-- REGRA que transformava isso em cancelamento. Três casos tinham trabalho feito
-- — nascimento concluído, edições, links de entrega — e foram cancelados porque
-- o evento sumiu da agenda DEPOIS do parto:
--   - um tinha as etapas concluídas às 14:01; o evento sumiu às 14:02;
--   - um estava reaberto para revisão de reels; o evento sumiu 3h depois;
--   - um já estava em Entregáveis esperando o ADM.
-- Para a equipe o parto acabou e o evento sai da agenda (o gestor acredita que
-- ele é apagado sozinho pelo horário). Com o caso já ENCERRADO o sync ignora e
-- nada acontece; com qualquer coisa ainda pendente — reels, revisão, a
-- confirmação da entrega —, o caso era cancelado. E não tinha volta:
-- `reabrir_caso` recusa cancelado, e recriar o evento só gera um caso novo.
--
-- "O EVENTO SUMIU" NÃO É "O CONTRATO CAIU". Um contrato que cai é avisado ANTES
-- do parto e sem trabalho feito. Por isso duas travas, e as duas no BANCO —
-- a Edge Function continua a mesma e não precisa de deploy:
--
--   DELEÇÃO (sync_cancelar_caso): não cancela se o caso TEM TRABALHO, nem se a
--   PREVISÃO JÁ PASSOU. A de horário existe por causa da seção 9: campo aceita
--   registro retroativo, e um evento que some horas depois do parto encontraria
--   o caso ainda "sem trabalho" só porque a fotógrafa não tocou no aparelho.
--   Conferido contra o histórico: nenhum dos 42 cancelamentos legítimos seria
--   bloqueado — eram todos de datas futuras, sem trabalho.
--
--   CARD CINZA (sync_upsert_caso): só a trava de TRABALHO. Cinza é o gesto
--   explícito de cancelamento da equipe, e um cinza marcado no próprio dia do
--   evento, legítimo, existe no histórico — a trava de horário o bloquearia.
--
-- NÃO CANCELAR NÃO É ESQUECER. O sync grava um evento de auditoria (uma vez só
-- por caso — o cron roda a cada 25s e o evento continua sumido) e o caso segue
-- aberto. Cancelar um atendimento que aconteceu continua possível, pelo gesto
-- humano de sempre: `cancelar_caso`, atendimento ou adm (invariante 3.5).
--
-- E PARA O QUE JÁ FOI CANCELADO ERRADO: `restaurar_caso_cancelado_pelo_sync`,
-- e os dois casos que se perderam restaurados aqui mesmo (seção 4, no fim).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. caso_tem_trabalho — a definição única de "este atendimento aconteceu"
--
-- Qualquer UMA destas basta:
--   - etapa que saiu de pendente/atribuída (iniciada, pausada, concluída, nas
--     fases do vídeo) ou tem início carimbado;
--   - link de entrega registrado;
--   - caso enviado para Entregáveis;
--   - QUALQUER ação de uma pessoa em `eventos`. É a mais larga e é de
--     propósito: anotação, atribuição, despesa, restauração — se alguém da
--     equipe já mexeu no caso, o sumiço do evento não é decisão comercial.
--     Eventos do próprio sync têm pessoa_id nulo e não contam.
--
-- `dispensada` fica de fora da primeira regra porque dispensar já grava evento
-- com pessoa, e a quarta regra a pega.
-- -----------------------------------------------------------------------------

create or replace function public.caso_tem_trabalho(p_caso_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select
    exists (
      select 1 from public.caso_etapas ce
      where ce.caso_id = p_caso_id
        and (ce.status not in ('pendente', 'atribuida', 'dispensada') or ce.iniciado_em is not null)
    )
    or exists (select 1 from public.entregaveis e where e.caso_id = p_caso_id)
    or exists (
      select 1 from public.casos c
      where c.id = p_caso_id and c.liberado_para_entrega_em is not null
    )
    or exists (
      select 1 from public.eventos ev
      where ev.caso_id = p_caso_id and ev.pessoa_id is not null
    );
$$;

comment on function public.caso_tem_trabalho(uuid) is
  'O atendimento já aconteceu? Etapa iniciada/concluída, link, envio para Entregáveis ou qualquer ação humana em eventos. Usada pelas travas do sync: evento que some do Calendar não cancela caso com trabalho.';

-- Só as funções SECURITY DEFINER do sync e da restauração a chamam, e elas
-- rodam como o dono. Nada para authenticated nem anon.
revoke all on function public.caso_tem_trabalho(uuid) from public;


-- -----------------------------------------------------------------------------
-- 2. sync_cancelar_caso — evento DELETADO
-- -----------------------------------------------------------------------------

create or replace function public.sync_cancelar_caso(
  p_google_event_id text,
  p_motivo          text default 'Evento removido do Google Calendar (sem correspondência na sincronização)'
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caso_id  uuid;
  v_status   public.status_operacional;
  v_previsao timestamptz;
  v_razao    text;
begin
  select c.id, c.status_operacional, c.previsao_em
    into v_caso_id, v_status, v_previsao
  from public.casos c
  where c.google_calendar_event_id = p_google_event_id
  for update;

  if not found then
    return 'sem_efeito';
  end if;

  if v_status in ('encerrado', 'cancelado') then
    -- Terminal: o caso seguiu seu curso antes ou depois do evento sumir.
    return 'sem_efeito';
  end if;

  -- As duas travas, nesta ordem: trabalho é o sinal mais forte e o que
  -- responde "por quê" com mais clareza no evento de auditoria.
  if public.caso_tem_trabalho(v_caso_id) then
    v_razao := 'caso_com_trabalho';
  elsif v_previsao is not null and v_previsao <= now() then
    v_razao := 'horario_ja_passou';
  end if;

  if v_razao is not null then
    -- UMA VEZ POR CASO. O evento continua sumido e o cron roda a cada 25s:
    -- sem esta guarda seriam milhares de linhas por dia em `eventos`, que é
    -- append-only e não se limpa depois.
    if not exists (
      select 1 from public.eventos e
      where e.caso_id = v_caso_id
        and e.tipo = 'evento_calendar_removido'
        and e.payload ->> 'google_event_id' = p_google_event_id
    ) then
      insert into public.eventos (caso_id, pessoa_id, tipo, payload, ocorrido_em)
      values (
        v_caso_id,
        null,
        'evento_calendar_removido',
        jsonb_build_object(
          'caso_id', v_caso_id,
          'google_event_id', p_google_event_id,
          'preservado_por', v_razao
        ),
        now()
      );
    end if;
    return 'preservado';
  end if;

  update public.casos
     set status_operacional  = 'cancelado',
         motivo_cancelamento = p_motivo
   where id = v_caso_id;

  insert into public.eventos (caso_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    v_caso_id,
    null,
    'caso_cancelado_via_sync',
    jsonb_build_object(
      'caso_id', v_caso_id,
      'google_event_id', p_google_event_id,
      'motivo', p_motivo
    ),
    now()
  );

  return 'caso_cancelado';
end;
$$;

comment on function public.sync_cancelar_caso(text, text) is
  'Cancela o caso cujo evento sumiu do Calendar — EXCETO se o caso tem trabalho ou a previsão já passou: aí grava evento_calendar_removido (uma vez) e devolve preservado. Só service_role (Edge Function do sync).';

-- `create or replace` com a mesma assinatura mantém os privilégios; reafirmar
-- é o cinto de segurança da lição das migrations 20260821100857/102004.
revoke all on function public.sync_cancelar_caso(text, text) from public;
grant execute on function public.sync_cancelar_caso(text, text) to service_role;


-- -----------------------------------------------------------------------------
-- 3. sync_upsert_caso — CARD CINZA
--
-- Corpo idêntico ao da 20260821102004, com duas mudanças:
--   - `found` vira `v_existe`, capturado logo após o SELECT. O ramo novo grava
--     em `eventos` antes de chegar ao "caso novo?", e um INSERT reescreve FOUND
--     — ler FOUND ali daria a resposta do INSERT, não a do SELECT.
--   - card cinza num caso COM TRABALHO não cancela: grava o evento de
--     auditoria (uma vez) e segue para o UPDATE normal, que continua trazendo
--     data, nome e cor do Calendar.
-- -----------------------------------------------------------------------------

create or replace function public.sync_upsert_caso(
  p_google_event_id text,
  p_mae_nome text,
  p_bebe_nome text,
  p_pacote_id uuid,
  p_maternidade_id uuid,
  p_previsao_em timestamptz,
  p_cor_calendar text,
  p_cancelado boolean
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caso_id            uuid;
  v_existe             boolean;
  v_status_operacional public.status_operacional;
  v_mae_atual          text;
  v_bebe_atual         text;
  v_pacote_atual       uuid;
  v_maternidade_atual  uuid;
  v_previsao_atual     timestamptz;
  v_cor_atual          text;
  v_pacote_novo        uuid;
  v_maternidade_novo   uuid;
  v_algo_mudou         boolean;
begin
  select c.id, c.status_operacional, c.mae_nome, c.bebe_nome,
         c.pacote_id, c.maternidade_id, c.previsao_em, c.cor_calendar
    into v_caso_id, v_status_operacional, v_mae_atual, v_bebe_atual,
         v_pacote_atual, v_maternidade_atual, v_previsao_atual, v_cor_atual
  from public.casos c
  where c.google_calendar_event_id = p_google_event_id
  for update;

  v_existe := found;

  -- ---------------------------------------------------------------------
  -- 1. Cancelamento tem prioridade — menos sobre um atendimento que aconteceu.
  -- ---------------------------------------------------------------------
  if p_cancelado then
    if not v_existe then
      return 'sem_efeito';
    end if;

    if v_status_operacional in ('encerrado', 'cancelado') then
      return 'sem_efeito';
    end if;

    if not public.caso_tem_trabalho(v_caso_id) then
      update public.casos
         set status_operacional  = 'cancelado',
             motivo_cancelamento = 'Cancelado via Google Calendar (card cinza)'
       where id = v_caso_id;

      insert into public.eventos (caso_id, pessoa_id, tipo, payload, ocorrido_em)
      values (
        v_caso_id,
        null,
        'caso_cancelado_via_sync',
        jsonb_build_object('caso_id', v_caso_id, 'google_event_id', p_google_event_id),
        now()
      );

      return 'caso_cancelado';
    end if;

    -- Cinza num caso com trabalho: registra uma vez e cai no UPDATE abaixo.
    if not exists (
      select 1 from public.eventos e
      where e.caso_id = v_caso_id and e.tipo = 'card_cinza_ignorado'
    ) then
      insert into public.eventos (caso_id, pessoa_id, tipo, payload, ocorrido_em)
      values (
        v_caso_id,
        null,
        'card_cinza_ignorado',
        jsonb_build_object(
          'caso_id', v_caso_id,
          'google_event_id', p_google_event_id,
          'preservado_por', 'caso_com_trabalho'
        ),
        now()
      );
    end if;
  end if;

  -- ---------------------------------------------------------------------
  -- 2a. Caso novo — INSERT.
  -- ---------------------------------------------------------------------
  if not v_existe then
    insert into public.casos (
      mae_nome, bebe_nome, pacote_id, maternidade_id,
      previsao_em, cor_calendar, google_calendar_event_id
    )
    values (
      p_mae_nome, p_bebe_nome, p_pacote_id, p_maternidade_id,
      p_previsao_em, p_cor_calendar, p_google_event_id
    )
    returning id into v_caso_id;

    insert into public.eventos (caso_id, pessoa_id, tipo, payload, ocorrido_em)
    values (
      v_caso_id,
      null,
      case
        when p_pacote_id is null or p_maternidade_id is null
          then 'rascunho_pendente_criado'
        else 'caso_criado_via_sync'
      end,
      jsonb_build_object(
        'caso_id', v_caso_id,
        'google_event_id', p_google_event_id,
        'rascunho_pendente', (p_pacote_id is null or p_maternidade_id is null)
      ),
      now()
    );

    if p_pacote_id is null or p_maternidade_id is null then
      return 'rascunho_criado';
    else
      return 'caso_criado';
    end if;
  end if;

  -- ---------------------------------------------------------------------
  -- 2b. Caso já existe — UPDATE só dos campos de dado. status_operacional
  -- NUNCA é tocado aqui.
  -- ---------------------------------------------------------------------
  v_pacote_novo      := coalesce(v_pacote_atual, p_pacote_id);
  v_maternidade_novo := coalesce(v_maternidade_atual, p_maternidade_id);

  v_algo_mudou :=
    v_mae_atual is distinct from p_mae_nome
    or v_bebe_atual is distinct from p_bebe_nome
    or v_previsao_atual is distinct from p_previsao_em
    or v_cor_atual is distinct from p_cor_calendar
    or v_pacote_atual is distinct from v_pacote_novo
    or v_maternidade_atual is distinct from v_maternidade_novo;

  if not v_algo_mudou then
    return 'sem_efeito';
  end if;

  update public.casos
     set mae_nome     = p_mae_nome,
         bebe_nome    = p_bebe_nome,
         previsao_em  = p_previsao_em,
         cor_calendar = p_cor_calendar,
         pacote_id    = v_pacote_novo,
         maternidade_id = v_maternidade_novo
   where id = v_caso_id;

  insert into public.eventos (caso_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    v_caso_id,
    null,
    'caso_atualizado_via_sync',
    jsonb_build_object(
      'caso_id', v_caso_id,
      'google_event_id', p_google_event_id,
      'rascunho_resolvido',
        (v_pacote_atual is null and v_pacote_novo is not null)
        or (v_maternidade_atual is null and v_maternidade_novo is not null)
    ),
    now()
  );

  return 'caso_atualizado';
end;
$$;

revoke all on function public.sync_upsert_caso(text, text, text, uuid, uuid, timestamptz, text, boolean) from public;
grant execute on function public.sync_upsert_caso(text, text, text, uuid, uuid, timestamptz, text, boolean) to service_role;


-- -----------------------------------------------------------------------------
-- 4. restaurar_caso_cancelado_pelo_sync
--
-- SÓ O QUE O SYNC CANCELOU. Cancelamento humano (`cancelar_caso`) é decisão
-- comercial sobre o contrato e não se desfaz por aqui — pela mesma razão que
-- `reabrir_caso` recusa cancelado. O que distingue os dois é o motivo gravado:
-- o sync só escreve os dois textos fixos abaixo.
--
-- ATENDIMENTO OU ADM, o mesmo par que cancela e confirma entrega (3.5).
--
-- O STATUS DE VOLTA É DERIVADO DAS ETAPAS, não guardado: nascimento concluído
-- é edição; alguma etapa em andamento é atendimento; nada feito é agendado.
--
-- NÃO É CANCELADO DE NOVO no ciclo seguinte do sync: o evento de restauração
-- tem pessoa, e `caso_tem_trabalho` conta qualquer ação humana.
-- -----------------------------------------------------------------------------

create or replace function public.restaurar_caso_cancelado_pelo_sync(
  p_caso_id uuid,
  p_motivo  text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pessoa_id       uuid;
  v_status          public.status_operacional;
  v_motivo_anterior text;
  v_novo_status     public.status_operacional;
begin
  select p.id into v_pessoa_id
  from public.pessoas p
  where p.auth_user_id = auth.uid() and p.ativo;

  if v_pessoa_id is null then
    raise exception 'Usuário autenticado não corresponde a nenhuma pessoa ativa.';
  end if;

  if not (public.eh_atendimento() or public.eh_adm()) then
    raise exception 'Só atendimento ou adm restauram um caso cancelado.';
  end if;

  if p_motivo is null or length(btrim(p_motivo)) = 0 then
    raise exception 'Diga por que o caso está sendo restaurado.';
  end if;

  select c.status_operacional, c.motivo_cancelamento
    into v_status, v_motivo_anterior
  from public.casos c
  where c.id = p_caso_id
  for update;

  if not found then
    raise exception 'Caso % não encontrado.', p_caso_id;
  end if;

  if v_status <> 'cancelado' then
    raise exception 'Só um caso CANCELADO se restaura — este está "%".', v_status;
  end if;

  if not (
    v_motivo_anterior like 'Evento removido do Google Calendar%'
    or v_motivo_anterior = 'Cancelado via Google Calendar (card cinza)'
  ) then
    raise exception
      'Este caso foi cancelado pela equipe, não pelo sync. Cancelamento humano é decisão comercial e não se desfaz por aqui.';
  end if;

  v_novo_status := case
    when exists (
      select 1 from public.caso_etapas ce
      where ce.caso_id = p_caso_id and ce.tipo = 'nascimento' and ce.status = 'concluida'
    ) then 'em_edicao'::public.status_operacional
    when exists (
      select 1 from public.caso_etapas ce
      where ce.caso_id = p_caso_id
        and (ce.status not in ('pendente', 'atribuida', 'dispensada') or ce.iniciado_em is not null)
    ) then 'em_atendimento'::public.status_operacional
    else 'agendado'::public.status_operacional
  end;

  update public.casos
     set status_operacional  = v_novo_status,
         motivo_cancelamento = null
   where id = p_caso_id;

  insert into public.eventos (caso_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    p_caso_id,
    v_pessoa_id,
    'caso_restaurado',
    jsonb_build_object(
      'caso_id', p_caso_id,
      'motivo', btrim(p_motivo),
      'motivo_cancelamento_anterior', v_motivo_anterior,
      'status_restaurado', v_novo_status
    ),
    now()
  );
end;
$$;

comment on function public.restaurar_caso_cancelado_pelo_sync(uuid, text) is
  'Desfaz um cancelamento feito pelo SYNC (evento removido ou card cinza). Atendimento ou adm, motivo obrigatório. Status volta derivado das etapas. Cancelamento humano é recusado.';

revoke all on function public.restaurar_caso_cancelado_pelo_sync(uuid, text) from public, anon;
grant execute on function public.restaurar_caso_cancelado_pelo_sync(uuid, text) to authenticated;


-- -----------------------------------------------------------------------------
-- 5. quadro_casos.motivo_cancelamento
--
-- A tela precisa saber QUEM cancelou para oferecer "Restaurar" só no que o
-- sync cancelou. Coluna nova no FIM — `create or replace view` não aceita
-- reordenar. Repete a definição da 20260914195059 e acrescenta uma linha.
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
    c.motivo_cancelamento
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


-- -----------------------------------------------------------------------------
-- 6. Os dois atendimentos que se perderam (aprovado pelo gestor, 15/09/2026)
--
-- Ids EXATOS, e com as condições que provam que ainda são o que foi
-- investigado: cancelado, e pelo sync, por evento removido. Num banco novo
-- (local, testes) nenhuma linha casa e isto é no-op.
--
-- Os dois tinham nascimento concluído e o reels pendente — voltam para edição.
--
-- O TERCEIRO CASO AFETADO (3255ee54…) FICA CANCELADO de propósito: o evento
-- dele foi recriado e o caso gêmeo já está encerrado. Restaurá-lo duplicaria
-- o atendimento.
--
-- O evento de restauração vai com pessoa_id nulo — não houve pessoa logada —
-- e o motivo diz de onde veio. Estes dois não voltam a ser cancelados: têm
-- trabalho, e a trava do item 2 os preserva.
-- -----------------------------------------------------------------------------

with restaurados as (
  update public.casos c
     set status_operacional  = 'em_edicao',
         motivo_cancelamento = null
   where c.id in (
           '80531a52-28e8-453b-b4a9-bd6cf7d4d7ac',
           'ce69e593-3baf-4c23-9041-808eb36056d8'
         )
     and c.status_operacional = 'cancelado'
     and c.motivo_cancelamento like 'Evento removido do Google Calendar%'
  returning c.id
)
insert into public.eventos (caso_id, pessoa_id, tipo, payload, ocorrido_em)
select
  r.id,
  null,
  'caso_restaurado',
  jsonb_build_object(
    'caso_id', r.id,
    'motivo', 'Cancelado por engano pelo sync: o evento sumiu do Calendar depois do parto, com trabalho feito. Restaurado pela migration 20260915030822.',
    'motivo_cancelamento_anterior', 'Evento removido do Google Calendar (sem correspondência na sincronização)',
    'status_restaurado', 'em_edicao'
  ),
  now()
from restaurados r;
