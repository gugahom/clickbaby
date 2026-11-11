-- =============================================================================
-- OS LINKS DE ENTREGA DO NEW BORN (11/11/2026, pedido do gestor)
-- =============================================================================
--
-- "Depois de editar a seleção tem um espaço para a gente colocar o link do
-- New Born: o do Google Fotos e o do WeTransfer." A galeria de escolha é onde a
-- família ESCOLHE; estes dois são o que ela RECEBE, depois que a Sara edita o
-- que foi escolhido.
--
-- OBRIGATÓRIOS PARA O "PRONTO PARA ENTREGA" (decisão do gestor), como os dois
-- links do vídeo do MASTER:
--   * `enviar_click_home_para_entrega` grava os dois e leva o ensaio a pronto
--     NA MESMA TRANSAÇÃO — meio caminho deixaria um ensaio em Entregáveis sem o
--     que entregar;
--   * `mover_click_home` recusa entrar em pronto sem os dois, para o caminho que
--     não passa pelo diálogo;
--   * `confirmar_entrega_do_click_home` confirma os dois junto com a galeria.
--
-- O que já está em pronto hoje não muda: a trava é na ENTRADA da fase.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. mover_click_home — pronto exige os dois links
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

  -- A ESCOLHA, A SELEÇÃO E O PRONTO só significam alguma coisa com o LINK da
  -- galeria: é nele que a família escolhe, e é ele que a Morgana confirma.
  if p_fase in ('enviar_para_escolha', 'editar_selecao', 'pronto_para_entrega') then
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

  -- O PRONTO EXIGE OS DOIS LINKS DE ENTREGA (11/11/2026): o Google Fotos e o
  -- WeTransfer do New Born, ainda não conferidos. Quem passa pelo diálogo já os
  -- gravou em `enviar_click_home_para_entrega`; esta guarda é para o resto.
  if p_fase = 'pronto_para_entrega' then
    if (select count(distinct e.tipo) from public.entregaveis e
         where e.caso_id = v_caso_id
           and e.tipo in ('click_home_google', 'click_home_wetransfer')
           and e.confirmado_em is null) < 2 then
      raise exception
        'Para o New Born ficar pronto para entrega são obrigatórios o link do Google Fotos e o WeTransfer.';
    end if;
  end if;

  -- O FIM É DA MORGANA, na aba Entregáveis — e só a partir do PRONTO PARA
  -- ENTREGA (22/10/2026): na escolha a família ainda está escolhendo.
  if p_fase = 'finalizado' then
    if not (public.eh_atendimento() or public.eh_adm()) then
      raise exception
        'Quem finaliza o Click Home é o atendimento ou a gestão, na aba Entregáveis.';
    end if;

    if v_fase is distinct from 'pronto_para_entrega' then
      raise exception
        'Só se finaliza o Click Home que está pronto para entrega.';
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
  'Move o ensaio Click Home na esteira. É a ÚNICA porta de escrita de fase_click_home, e grava o status junto. As fases de antes do ensaio (a_agendar, agendado) deixam a etapa pendente, sem carimbar início; agendado exige a data do ensaio (previsao_em). Editando e criar_galeria viram em_andamento, finalizado vira concluida, e toda espera vira pausada — editar_selecao também: chega pausada, e o relógio corre no play. "Enviar para escolha", "editar seleção" e "pronto para entrega" exigem o link da galeria; "pronto para entrega" exige também o Google Fotos e o WeTransfer do New Born; "finalizado" é do atendimento ou adm, e só a partir do pronto para entrega. Aceita caso encerrado, nunca cancelado.';


-- -----------------------------------------------------------------------------
-- 2. enviar_click_home_para_entrega — os dois links + pronto, juntos
-- -----------------------------------------------------------------------------

create function public.enviar_click_home_para_entrega(
  p_caso_etapa_id   uuid,
  p_link_google     text,
  p_link_wetransfer text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pessoa_id    uuid;
  v_caso_id      uuid;
  v_tipo         public.etapa_tipo;
  v_fase         public.fase_click_home;
  v_google       text := nullif(btrim(coalesce(p_link_google, '')), '');
  v_wetransfer   text := nullif(btrim(coalesce(p_link_wetransfer, '')), '');
  v_substituidos integer;
begin
  select p.id into v_pessoa_id
  from public.pessoas p
  where p.auth_user_id = auth.uid()
    and p.ativo;

  if v_pessoa_id is null then
    raise exception 'Usuário autenticado não corresponde a nenhuma pessoa ativa.';
  end if;

  if v_google is null or v_wetransfer is null then
    raise exception 'São obrigatórios o link do Google Fotos e o WeTransfer do New Born.';
  end if;

  if v_google !~* '^https?://' or v_wetransfer !~* '^https?://' then
    raise exception 'Os links precisam começar com http:// ou https://.';
  end if;

  select ce.caso_id, ce.tipo, ce.fase_click_home into v_caso_id, v_tipo, v_fase
  from public.caso_etapas ce
  where ce.id = p_caso_etapa_id
  for update;

  if not found then
    raise exception 'caso_etapa % não encontrada.', p_caso_etapa_id;
  end if;

  if v_tipo <> 'click_home' then
    raise exception 'Só o New Born vai para entrega por aqui — esta etapa é "%".', v_tipo;
  end if;

  if v_fase = 'finalizado' then
    raise exception 'Este New Born já foi finalizado.';
  end if;

  -- Um par anterior que ninguém conferiu (o ensaio voltou de pronto para a
  -- seleção) sai do caminho: vale o par novo. O que já foi entregue fica.
  delete from public.entregaveis
   where caso_id = v_caso_id
     and tipo in ('click_home_google', 'click_home_wetransfer')
     and confirmado_em is null;
  get diagnostics v_substituidos = row_count;

  insert into public.entregaveis (caso_id, tipo, url, criado_por)
  values (v_caso_id, 'click_home_google', v_google, v_pessoa_id),
         (v_caso_id, 'click_home_wetransfer', v_wetransfer, v_pessoa_id);

  -- A fase e as outras travas (a galeria, o caso cancelado) moram em
  -- `mover_click_home`. Com o ensaio já em pronto, ela sai sem escrever: é só a
  -- troca dos links.
  perform public.mover_click_home(p_caso_etapa_id, 'pronto_para_entrega');

  -- Sem as URLs: link de entrega é credencial da família (seção 10).
  insert into public.eventos (caso_id, caso_etapa_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    v_caso_id, p_caso_etapa_id, v_pessoa_id, 'click_home_enviado_para_entrega',
    jsonb_build_object('fase_anterior', v_fase, 'links_substituidos', v_substituidos),
    now()
  );
end;
$$;

comment on function public.enviar_click_home_para_entrega(uuid, text, text) is
  'Termina a edição da seleção do New Born: grava o Google Fotos e o WeTransfer do New Born e leva o ensaio a "Pronto para entrega", na mesma transação. Um par anterior ainda não conferido é trocado. Qualquer pessoa ativa.';

revoke all on function public.enviar_click_home_para_entrega(uuid, text, text) from public, anon;
grant execute on function public.enviar_click_home_para_entrega(uuid, text, text) to authenticated;


-- -----------------------------------------------------------------------------
-- 3. confirmar_entrega_do_click_home — confirma os três links
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

  -- A galeria e, desde 11/11/2026, os dois links de entrega do New Born.
  update public.entregaveis
     set confirmado_por = v_pessoa_id,
         confirmado_em  = now()
   where caso_id = v_caso_id
     and tipo in ('click_home', 'click_home_google', 'click_home_wetransfer')
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
