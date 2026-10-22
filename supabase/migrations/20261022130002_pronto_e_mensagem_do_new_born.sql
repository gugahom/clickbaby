-- =============================================================================
-- O NEW BORN: PRONTO PARA ENTREGA E A MENSAGEM PARA O CLIENTE (22/10/2026)
-- =============================================================================
--
-- 1. A ESTEIRA GANHA O FIM QUE O FOTO/LIVRO JÁ TINHA. Até aqui "Enviar para
--    escolha" levava o ensaio para Entregáveis e a Morgana o finalizava dali —
--    mas a família ainda não tinha escolhido as fotos. Agora a escolha é
--    espera de fora, na seção, e é PRONTO PARA ENTREGA que vai para Entregáveis
--    (a tela decide a lista). `mover_click_home` muda em duas linhas: o pronto
--    também exige o link da galeria, e finalizar passa a exigir o pronto. A fase
--    nova é espera (pausada), como a escolha.
--    Os ensaios que estavam em "Enviar para escolha" saem de Entregáveis e
--    ficam na coluna deles, que é onde a família de fato está.
--
-- 2. A MENSAGEM PARA O CLIENTE. A galeria (Celpics) gera um texto pronto para
--    mandar à família, com o link, o login e a senha da escolha. A equipe o
--    colava nos "Pedidos do cliente", que não são isso. Agora é um campo próprio
--    da etapa (`caso_etapas.mensagem_click_home`), com botão de copiar na tela.
--    Escrita só por `definir_mensagem_do_click_home`, por qualquer pessoa ativa
--    (quem cria a galeria é quem edita). O texto tem LOGIN E SENHA: não vai para
--    `eventos` — o evento diz só que a mensagem mudou —, como o link de entrega.
-- =============================================================================

alter table public.caso_etapas add column mensagem_click_home text;

alter table public.caso_etapas
  add constraint caso_etapas_mensagem_so_no_click_home
  check (mensagem_click_home is null or tipo = 'click_home');

comment on column public.caso_etapas.mensagem_click_home is
  'A mensagem que a galeria gera para a família escolher as fotos do New Born (link, login, senha). Credencial: fora de eventos e de log. Escrita só por definir_mensagem_do_click_home.';

create function public.definir_mensagem_do_click_home(
  p_caso_etapa_id uuid,
  p_mensagem      text
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
  v_antes     text;
  v_nova      text := nullif(btrim(coalesce(p_mensagem, '')), '');
begin
  select p.id into v_pessoa_id
  from public.pessoas p
  where p.auth_user_id = auth.uid()
    and p.ativo;

  if v_pessoa_id is null then
    raise exception 'Usuário autenticado não corresponde a nenhuma pessoa ativa.';
  end if;

  select ce.caso_id, ce.tipo, ce.mensagem_click_home
    into v_caso_id, v_tipo, v_antes
  from public.caso_etapas ce
  where ce.id = p_caso_etapa_id
  for update;

  if not found then
    raise exception 'caso_etapa % não encontrada.', p_caso_etapa_id;
  end if;

  if v_tipo <> 'click_home' then
    raise exception 'A mensagem para o cliente é do New Born.';
  end if;

  -- Igual ao que já está: nada a gravar, nem evento.
  if v_antes is not distinct from v_nova then
    return;
  end if;

  update public.caso_etapas
     set mensagem_click_home = v_nova
   where id = p_caso_etapa_id;

  insert into public.eventos (caso_id, caso_etapa_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    v_caso_id,
    p_caso_etapa_id,
    v_pessoa_id,
    'mensagem_do_click_home_definida',
    -- Só se há mensagem: o texto tem login e senha da galeria.
    jsonb_build_object('tem_mensagem', v_nova is not null),
    now()
  );
end;
$$;

comment on function public.definir_mensagem_do_click_home(uuid, text) is
  'Grava (ou, em branco, tira) a mensagem da galeria para a família escolher as fotos do New Born. Qualquer pessoa ativa. O texto não vai para eventos.';

revoke all on function public.definir_mensagem_do_click_home(uuid, text) from public, anon;
grant execute on function public.definir_mensagem_do_click_home(uuid, text) to authenticated;


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

  -- A ESCOLHA E O PRONTO só significam alguma coisa com o LINK da galeria: é
  -- ele que a família abre para escolher, e é ele que a Morgana confirma.
  if p_fase in ('enviar_para_escolha', 'pronto_para_entrega') then
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
  'Move o ensaio Click Home na esteira. É a ÚNICA porta de escrita de fase_click_home, e grava o status junto. As fases de antes do ensaio (a_agendar, agendado) deixam a etapa pendente, sem carimbar início; agendado exige a data do ensaio (previsao_em). Editando e criar_galeria viram em_andamento, finalizado vira concluida, e toda espera vira pausada. "Enviar para escolha" e "pronto para entrega" exigem o link da galeria; "finalizado" é do atendimento ou adm, e só a partir do pronto para entrega (22/10/2026). Aceita caso encerrado, nunca cancelado.';
