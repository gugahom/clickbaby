-- =============================================================================
-- O AGENDAMENTO E O PAGAMENTO DO NEW BORN (13/10/2026, pedido do gestor)
-- =============================================================================
--
-- 1. AGENDAR. "Eu tenho um botãozinho para eu agendar ela (...) aí sim ela
--    viria pro agendado e no dia do agendamento ela apareceria no painel para
--    mim novamente." A data do ensaio é o `previsao_em` da etapa click_home —
--    o que o Calendário já mostra como "Ensaio New Born" desde 30/09 e o cartão
--    chamava de "Prazo". `agendar_click_home` grava a data E leva a fase a
--    "agendado" NA MESMA TRANSAÇÃO, delegando às duas funções que já existem
--    (`agendar_etapa` e `mover_click_home`) — uma segunda definição de
--    "agendar" ou de "mover" receberia só metade da próxima correção.
--    Depois do ensaio, QUEM FEZ move para "Aguardando edição" (decisão do
--    gestor, perguntado): nada passa de fase sozinho pela data.
--
-- 2. AS FASES DE ANTES DO ENSAIO NÃO SÃO TRABALHO COMEÇADO. "a_agendar" e
--    "agendado" deixam a etapa PENDENTE e não carimbam `iniciado_em`: o relógio
--    de ciclo do New Born mede a edição, e começar a contar no dia da venda
--    poria a espera pela família dentro dele. Quem volta a uma delas depois de
--    ter começado (raro: um ensaio desmarcado) fica PAUSADA, com a pausa
--    aberta, como toda espera da esteira.
--    "agendado" exige a data — quem passa por `agendar_click_home` já a tem;
--    a guarda é para quem arrastar o cartão para a coluna sem ela.
--
-- 3. O PAGAMENTO. "Na hora da contratação algumas famílias pagam junto com o
--    pacote do parto, e existe uma ou outra situação em que o New Born é pago
--    depois (...) eu preciso saber se tem que cobrar esse cliente ou não." Uma
--    coluna na etapa, `pagamento_click_home`: 'pago' ou 'a_cobrar', e NULO é
--    "ninguém informou ainda" — o mesmo arranjo do termo de imagem. Quem
--    informa é atendimento ou adm (quem entrega o pacote e quem cobra), por
--    `registrar_pagamento_do_click_home`, com o antes e o depois em `eventos`.
--    NÃO TRAVA a entrega (decisão do gestor, perguntado): "A cobrar" aparece em
--    vermelho na confirmação, e a confirmação continua.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. O pagamento
-- -----------------------------------------------------------------------------

create type public.pagamento_click_home as enum ('pago', 'a_cobrar');

comment on type public.pagamento_click_home is
  'Se o New Born já foi pago (junto com o pacote do parto ou depois) ou ainda é preciso cobrar a família.';

alter table public.caso_etapas
  add column pagamento_click_home public.pagamento_click_home,
  add constraint caso_etapas_pagamento_so_no_click_home
    check (pagamento_click_home is null or tipo = 'click_home');

comment on column public.caso_etapas.pagamento_click_home is
  'O pagamento do New Born: pago ou a_cobrar; NULO é "ninguém informou ainda". Só na etapa click_home, e escrito só por registrar_pagamento_do_click_home.';


create function public.registrar_pagamento_do_click_home(
  p_caso_etapa_id uuid,
  p_pagamento     public.pagamento_click_home
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pessoa_id uuid;
  v_caso_id   uuid;
  v_tipo      public.etapa_tipo;
  v_antes     public.pagamento_click_home;
begin
  select p.id into v_pessoa_id
  from public.pessoas p
  where p.auth_user_id = auth.uid()
    and p.ativo;

  if v_pessoa_id is null then
    raise exception 'Usuário autenticado não corresponde a nenhuma pessoa ativa.';
  end if;

  if not (public.eh_atendimento() or public.eh_adm()) then
    raise exception 'Quem informa o pagamento do New Born é o atendimento ou a gestão.';
  end if;

  select ce.caso_id, ce.tipo, ce.pagamento_click_home
    into v_caso_id, v_tipo, v_antes
  from public.caso_etapas ce
  where ce.id = p_caso_etapa_id
  for update;

  if not found then
    raise exception 'caso_etapa % não encontrada.', p_caso_etapa_id;
  end if;

  if v_tipo <> 'click_home' then
    raise exception 'O pagamento é do New Born — etapa "%" não tem.', v_tipo;
  end if;

  if v_antes is not distinct from p_pagamento then
    return;
  end if;

  update public.caso_etapas
     set pagamento_click_home = p_pagamento
   where id = p_caso_etapa_id;

  insert into public.eventos (caso_id, caso_etapa_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    v_caso_id,
    p_caso_etapa_id,
    v_pessoa_id,
    'pagamento_do_click_home_registrado',
    jsonb_build_object('de', v_antes, 'para', p_pagamento),
    now()
  );
end;
$$;

comment on function public.registrar_pagamento_do_click_home(uuid, public.pagamento_click_home) is
  'Informa se o New Born já foi pago ou é preciso cobrar (nulo apaga). Atendimento ou adm; aceita caso em qualquer estado, como o termo — a resposta pode ser corrigida depois. Valor igual ao gravado não gera evento.';

revoke all on function public.registrar_pagamento_do_click_home(uuid, public.pagamento_click_home) from public, anon;
grant execute on function public.registrar_pagamento_do_click_home(uuid, public.pagamento_click_home) to authenticated;


-- -----------------------------------------------------------------------------
-- 2. mover_click_home conhece as duas fases de antes do ensaio
-- -----------------------------------------------------------------------------

create or replace function public.mover_click_home(
  p_caso_etapa_id uuid,
  p_fase          public.fase_click_home
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pessoa_id uuid;
  v_caso_id   uuid;
  v_tipo      public.etapa_tipo;
  v_fase      public.fase_click_home;
  v_terminal  public.status_operacional;
  v_pausado   timestamptz;
  v_iniciado  timestamptz;
  v_previsao  timestamptz;
  v_status    public.status_etapa;
  v_tem_link  boolean;
  v_antes_do_ensaio boolean;
begin
  select p.id into v_pessoa_id
  from public.pessoas p
  where p.auth_user_id = auth.uid()
    and p.ativo;

  if v_pessoa_id is null then
    raise exception 'Usuário autenticado não corresponde a nenhuma pessoa ativa.';
  end if;

  select ce.caso_id, ce.tipo, ce.fase_click_home, ce.pausado_em, ce.iniciado_em, ce.previsao_em,
         c.status_operacional
    into v_caso_id, v_tipo, v_fase, v_pausado, v_iniciado, v_previsao, v_terminal
  from public.caso_etapas ce
  join public.casos c on c.id = ce.caso_id
  where ce.id = p_caso_etapa_id
  for update of ce;

  if not found then
    raise exception 'caso_etapa % não encontrada.', p_caso_etapa_id;
  end if;

  if v_tipo <> 'click_home' then
    raise exception
      'A esteira do Click Home é da etapa do ensaio — etapa "%" não passa por ela.',
      v_tipo;
  end if;

  -- Caso ENCERRADO segue operável, como o vídeo e o fotolivro: o ensaio
  -- acontece depois da entrega, então ele quase sempre roda com o caso
  -- fechado. Cancelado, não: contrato que caiu não tem ensaio.
  if v_terminal = 'cancelado' then
    raise exception
      'Caso cancelado — não se mexe no Click Home de um contrato que caiu.';
  end if;

  if v_fase is not distinct from p_fase then
    return;
  end if;

  -- AGENDADO SEM DATA não é agendado (13/10/2026). Quem agenda pelo botão já
  -- gravou a data em agendar_click_home; esta guarda é para o arrastar.
  if p_fase = 'agendado' and v_previsao is null then
    raise exception 'Para agendar o New Born é preciso a data do ensaio.';
  end if;

  -- "Enviar para escolha" é o que leva o ensaio para Entregáveis, e ele só
  -- significa alguma coisa com o LINK da galeria: é ele que a família abre.
  if p_fase = 'enviar_para_escolha' then
    select exists(
      select 1 from public.entregaveis e
      where e.caso_id = v_caso_id
        and e.tipo = 'click_home'
        and e.confirmado_em is null
    ) into v_tem_link;

    if not v_tem_link then
      raise exception
        'Para mandar o Click Home para escolha é preciso o link da galeria.';
    end if;
  end if;

  -- O FIM É DA MORGANA, na aba Entregáveis — e só a partir da escolha.
  if p_fase = 'finalizado' then
    if not (public.eh_atendimento() or public.eh_adm()) then
      raise exception
        'Quem finaliza o Click Home é o atendimento ou a gestão, na aba Entregáveis.';
    end if;

    if v_fase is distinct from 'enviar_para_escolha' then
      raise exception
        'Só se finaliza o Click Home que já foi mandado para a escolha da família.';
    end if;
  end if;

  -- ANTES DO ENSAIO não há trabalho começado (13/10/2026): pendente e sem
  -- carimbo de início. Quem já tinha começado e volta para cá fica pausada.
  v_antes_do_ensaio := p_fase in ('a_agendar', 'agendado');

  v_status := case
    when v_antes_do_ensaio and v_iniciado is null then 'pendente'::public.status_etapa
    -- As duas fases em que alguém está sentado na estação.
    when p_fase in ('editando', 'criar_galeria') then 'em_andamento'::public.status_etapa
    when p_fase = 'finalizado' then 'concluida'::public.status_etapa
    else 'pausada'::public.status_etapa
  end;

  update public.caso_etapas
     set fase_click_home = p_fase,
         status      = v_status,
         iniciado_em = case when v_antes_do_ensaio then iniciado_em else coalesce(iniciado_em, now()) end,
         concluido_em = case when p_fase = 'finalizado' then now() else null end,
         pausa_acumulada = pausa_acumulada
           + case when v_pausado is not null then now() - v_pausado
                  else interval '0' end,
         -- Esperar a família escolher não é tempo de edição: a pausa abre em
         -- toda fase de espera e fecha quando o trabalho volta.
         pausado_em = case when v_status = 'pausada' then now() else null end,
         responsavel_id = case when v_antes_do_ensaio then responsavel_id
                               else coalesce(responsavel_id, v_pessoa_id) end
   where id = p_caso_etapa_id;

  insert into public.eventos (caso_id, caso_etapa_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    v_caso_id,
    p_caso_etapa_id,
    v_pessoa_id,
    'fase_do_click_home_movida',
    jsonb_build_object('de', v_fase, 'para', p_fase, 'status', v_status),
    now()
  );
end;
$$;

comment on function public.mover_click_home(uuid, public.fase_click_home) is
  'Move o ensaio Click Home na esteira. É a ÚNICA porta de escrita de fase_click_home, e grava o status junto. As fases de antes do ensaio (a_agendar, agendado) deixam a etapa pendente, sem carimbar início; agendado exige a data do ensaio (previsao_em). Editando e criar_galeria viram em_andamento, finalizado vira concluida, e toda espera vira pausada. "Enviar para escolha" exige o link da galeria; "finalizado" é do atendimento ou adm, e só a partir da escolha. Aceita caso encerrado, nunca cancelado.';


-- -----------------------------------------------------------------------------
-- 3. agendar_click_home — a data e a fase, juntas
-- -----------------------------------------------------------------------------

create function public.agendar_click_home(
  p_caso_etapa_id uuid,
  p_quando        timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tipo public.etapa_tipo;
  v_fase public.fase_click_home;
begin
  if p_quando is null then
    raise exception 'Escolha o dia e a hora do ensaio.';
  end if;

  select ce.tipo, ce.fase_click_home into v_tipo, v_fase
  from public.caso_etapas ce
  where ce.id = p_caso_etapa_id;

  if not found then
    raise exception 'caso_etapa % não encontrada.', p_caso_etapa_id;
  end if;

  if v_tipo <> 'click_home' then
    raise exception 'Só o New Born se agenda por aqui — etapa "%".', v_tipo;
  end if;

  -- Depois que a edição começou, o ensaio já aconteceu: reagendar não faz
  -- sentido, e mover a fase para trás apagaria onde o trabalho está.
  if v_fase is not null and v_fase not in ('a_agendar', 'agendado', 'aguardando_edicao') then
    raise exception 'O ensaio deste New Born já aconteceu — a edição está em andamento.';
  end if;

  -- As duas portas que já existem, na mesma transação: a data (com o evento
  -- `etapa_agendada`, que guarda a anterior) e a fase.
  perform public.agendar_etapa(p_caso_etapa_id, p_quando);
  perform public.mover_click_home(p_caso_etapa_id, 'agendado');
end;
$$;

comment on function public.agendar_click_home(uuid, timestamptz) is
  'Marca (ou remarca) o dia e a hora do ensaio New Born e leva a etapa a "agendado", na mesma transação. Delega a agendar_etapa e mover_click_home. Recusa New Born cuja edição já começou.';

revoke all on function public.agendar_click_home(uuid, timestamptz) from public, anon;
grant execute on function public.agendar_click_home(uuid, timestamptz) to authenticated;
