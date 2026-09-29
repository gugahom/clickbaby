-- =============================================================================
-- O VÍDEO DO MASTER PODE IR PARA OS LINKS QUE O CASO JÁ TEM (29/09/2026, pedido
-- do gestor).
-- =============================================================================
--
-- "Finalizar o master está pedindo links de novo; se já existirem links ele só
-- deve pedir para adicionar o vídeo a esses links." Desde 20260921211604,
-- terminar a edição do vídeo cobrava DOIS links NOVOS (o do vídeo e o
-- WeTransfer do vídeo) — e, medido no remoto no dia, o vídeo MASTER em edição
-- estava num caso que já tinha o álbum do Google e o WeTransfer das fotos. A
-- equipe sobe o vídeo nesses mesmos endereços; o diálogo mandava inventar outros.
--
-- A REGRA NOVA: se o caso já tem link (do vídeo de uma entrega anterior, ou os
-- das fotos), terminar a edição é CONFIRMAR que o vídeo foi adicionado a eles —
-- `enviar_video_nos_links_do_caso`. Sem link nenhum, continua valendo o par
-- novo de `enviar_video_para_entrega`, que não muda de assinatura.
--
-- A ETAPA GUARDA QUE FOI ASSIM (`caso_etapas.video_nos_links_do_caso_em`), por
-- dois motivos: a trava de "Pronto para entrega" em `mover_video_master`
-- precisa de um jeito de aceitar o vídeo sem par novo — e só esse jeito, não
-- "qualquer caso com link" —, e a aba Entregáveis precisa saber que o ADM confere
-- os links do CASO, e não um par do vídeo que não existe.
-- QUEM LIMPA A COLUNA (a lição da 20260909145223): voltar a editar
-- (`mover_video_master` para pendente, editando ou alterações) e mandar um par
-- novo (`enviar_video_para_entrega`). A confirmação da entrega NÃO limpa: ali ela
-- vira o registro de como aquele vídeo foi entregue.
--
-- As três funções são REDEFINIÇÕES de 20260921211604 com a mesma assinatura
-- (`create or replace` mantém os privilégios). A nova recebe os seus.
-- =============================================================================

alter table public.caso_etapas
  add column video_nos_links_do_caso_em timestamptz;

alter table public.caso_etapas
  add constraint caso_etapas_video_nos_links_so_no_video
  check (video_nos_links_do_caso_em is null or tipo = 'edicao_video');

comment on column public.caso_etapas.video_nos_links_do_caso_em is
  'Quando a edição do vídeo do MASTER foi terminada confirmando que o vídeo foi adicionado aos links que o caso já tinha, em vez de um par novo. Limpa ao voltar a editar e ao mandar um par novo.';


-- -----------------------------------------------------------------------------
-- 1. mover_video_master: a trava de "pronto" aceita os links do caso
-- -----------------------------------------------------------------------------

create or replace function public.mover_video_master(
  p_caso_etapa_id uuid,
  p_fase          public.status_etapa
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pessoa_id  uuid;
  v_caso_id    uuid;
  v_tipo       public.etapa_tipo;
  v_status     public.status_etapa;
  v_terminal   public.status_operacional;
  v_pausado    timestamptz;
  v_nos_links  timestamptz;
begin
  select p.id into v_pessoa_id
  from public.pessoas p
  where p.auth_user_id = auth.uid()
    and p.ativo;

  if v_pessoa_id is null then
    raise exception 'Usuário autenticado não corresponde a nenhuma pessoa ativa.';
  end if;

  if p_fase not in ('pendente', 'em_andamento', 'em_alteracao', 'pronto_para_entrega', 'concluida') then
    raise exception
      'Fase "%" não faz parte do fluxo do vídeo do MASTER.', p_fase;
  end if;

  select ce.caso_id, ce.tipo, ce.status, ce.pausado_em, ce.video_nos_links_do_caso_em, c.status_operacional
    into v_caso_id, v_tipo, v_status, v_pausado, v_nos_links, v_terminal
  from public.caso_etapas ce
  join public.casos c on c.id = ce.caso_id
  where ce.id = p_caso_etapa_id
  for update of ce;

  if not found then
    raise exception 'caso_etapa % não encontrada.', p_caso_etapa_id;
  end if;

  if v_tipo <> 'edicao_video' then
    raise exception
      'O fluxo de fases é do vídeo horizontal do MASTER — etapa "%" não passa por ele.',
      v_tipo;
  end if;

  -- CANCELADO trava; ENCERRADO não (20260903153101): o vídeo sobrevive à
  -- entrega das fotos.
  if v_terminal = 'cancelado' then
    raise exception
      'Caso está cancelado — não se mexe no vídeo de um caso que caiu.';
  end if;

  if v_status = p_fase then
    return;
  end if;

  -- PRONTO EXIGE LINK (21/09/2026, revisto em 29/09/2026). Dois caminhos:
  --   * o PAR NOVO ainda não conferido — `enviar_video_para_entrega`;
  --   * o vídeo ADICIONADO AOS LINKS DO CASO — `enviar_video_nos_links_do_caso`,
  --     que carimba `video_nos_links_do_caso_em` antes de chamar aqui. E o caso
  --     tem que ter mesmo algum link: o carimbo sozinho não é endereço.
  if p_fase = 'pronto_para_entrega' and not (
       (    exists (select 1 from public.entregaveis e
                     where e.caso_id = v_caso_id and e.tipo = 'video' and e.confirmado_em is null)
        and exists (select 1 from public.entregaveis e
                     where e.caso_id = v_caso_id and e.tipo = 'video_wetransfer' and e.confirmado_em is null))
    or (    v_nos_links is not null
        and exists (select 1 from public.entregaveis e
                     where e.caso_id = v_caso_id
                       and e.tipo in ('video', 'video_wetransfer', 'google_photos', 'wetransfer')))
  ) then
    raise exception
      'Para ir para “Pronto para entrega” o vídeo precisa do link do vídeo e do WeTransfer.';
  end if;

  -- CONCLUÍDA É CONFIRMAÇÃO, NÃO FASE (21/09/2026): quem entrega é o ADM, em
  -- Entregáveis, e só o que está pronto.
  if p_fase = 'concluida' then
    if not (public.eh_atendimento() or public.eh_adm()) then
      raise exception
        'Quem confirma a entrega do vídeo é o atendimento ou a gestão, na aba Entregáveis.';
    end if;
    if v_status is distinct from 'pronto_para_entrega' then
      raise exception
        'Só se confirma a entrega do vídeo que está em “Pronto para entrega”.';
    end if;
  end if;

  update public.caso_etapas
     set status = p_fase,
         iniciado_em = case
           when p_fase = 'pendente' then iniciado_em
           else coalesce(iniciado_em, now())
         end,
         concluido_em = case when p_fase = 'concluida' then now() else null end,
         pausa_acumulada = pausa_acumulada
           + case when v_pausado is not null then now() - v_pausado
                  else interval '0' end,
         -- PRONTO ABRE A PAUSA (21/09/2026): esperando o ADM não é editando. As
         -- outras fases seguem fechando a janela, como sempre.
         pausado_em = case when p_fase = 'pronto_para_entrega' then now() else null end,
         -- Voltou a editar: a próxima entrega decide de novo onde o vídeo vai.
         video_nos_links_do_caso_em = case
           when p_fase in ('pendente', 'em_andamento', 'em_alteracao') then null
           else video_nos_links_do_caso_em
         end,
         responsavel_id = coalesce(responsavel_id, v_pessoa_id)
   where id = p_caso_etapa_id;

  insert into public.eventos (caso_id, caso_etapa_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    v_caso_id,
    p_caso_etapa_id,
    v_pessoa_id,
    'video_master_movido',
    jsonb_build_object(
      'caso_etapa_id', p_caso_etapa_id,
      'caso_id', v_caso_id,
      'de', v_status,
      'para', p_fase
    ),
    now()
  );
end;
$$;


-- -----------------------------------------------------------------------------
-- 2. enviar_video_para_entrega: o par novo apaga o carimbo
-- -----------------------------------------------------------------------------

create or replace function public.enviar_video_para_entrega(
  p_caso_etapa_id    uuid,
  p_link_video       text,
  p_link_wetransfer  text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pessoa_id  uuid;
  v_caso_id    uuid;
  v_tipo       public.etapa_tipo;
  v_status     public.status_etapa;
  v_video      text := nullif(btrim(coalesce(p_link_video, '')), '');
  v_wetransfer text := nullif(btrim(coalesce(p_link_wetransfer, '')), '');
  v_substituidos integer;
begin
  select p.id into v_pessoa_id
  from public.pessoas p
  where p.auth_user_id = auth.uid()
    and p.ativo;

  if v_pessoa_id is null then
    raise exception 'Usuário autenticado não corresponde a nenhuma pessoa ativa.';
  end if;

  if v_video is null or v_wetransfer is null then
    raise exception 'Para finalizar o vídeo são obrigatórios o link do vídeo e o WeTransfer.';
  end if;

  if v_video !~* '^https?://' or v_wetransfer !~* '^https?://' then
    raise exception 'Os links precisam começar com http:// ou https://.';
  end if;

  select ce.caso_id, ce.tipo, ce.status into v_caso_id, v_tipo, v_status
  from public.caso_etapas ce
  where ce.id = p_caso_etapa_id
  for update;

  if not found then
    raise exception 'caso_etapa % não encontrada.', p_caso_etapa_id;
  end if;

  if v_tipo <> 'edicao_video' then
    raise exception 'Só o vídeo horizontal do MASTER se finaliza por aqui — esta etapa é "%".', v_tipo;
  end if;

  if v_status = 'pronto_para_entrega' then
    raise exception 'Este vídeo já está em Entregáveis, esperando a confirmação da entrega.';
  end if;

  if v_status in ('concluida', 'dispensada') then
    raise exception 'Este vídeo já foi entregue. Para uma nova versão, peça alteração.';
  end if;

  -- Uma versão pendente de conferência de antes (a edição voltou de pronto para
  -- editando sem ninguém confirmar) sai do caminho: o que vale é o par novo.
  -- Só os NÃO confirmados — o que já foi entregue à família é histórico.
  delete from public.entregaveis
   where caso_id = v_caso_id
     and tipo in ('video', 'video_wetransfer')
     and confirmado_em is null;
  get diagnostics v_substituidos = row_count;

  insert into public.entregaveis (caso_id, tipo, url, criado_por)
  values (v_caso_id, 'video', v_video, v_pessoa_id),
         (v_caso_id, 'video_wetransfer', v_wetransfer, v_pessoa_id);

  -- Par novo: esta entrega NÃO é "nos links do caso".
  update public.caso_etapas
     set video_nos_links_do_caso_em = null
   where id = p_caso_etapa_id;

  perform public.mover_video_master(p_caso_etapa_id, 'pronto_para_entrega');

  -- Sem as URLs no payload: são credenciais de acesso da família (seção 10).
  insert into public.eventos (caso_id, caso_etapa_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    v_caso_id, p_caso_etapa_id, v_pessoa_id, 'video_enviado_para_entrega',
    -- `links_substituidos`: quantos links de uma versão anterior, ainda não
    -- conferidos, saíram para dar lugar a estes. É o rastro da troca.
    jsonb_build_object('caso_etapa_id', p_caso_etapa_id, 'status_anterior', v_status,
                       'links_substituidos', v_substituidos),
    now()
  );
end;
$$;


-- -----------------------------------------------------------------------------
-- 3. enviar_video_nos_links_do_caso — a porta nova
-- -----------------------------------------------------------------------------

create function public.enviar_video_nos_links_do_caso(p_caso_etapa_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pessoa_id uuid;
  v_caso_id   uuid;
  v_tipo      public.etapa_tipo;
  v_status    public.status_etapa;
  v_links     integer;
begin
  select p.id into v_pessoa_id
  from public.pessoas p
  where p.auth_user_id = auth.uid()
    and p.ativo;

  if v_pessoa_id is null then
    raise exception 'Usuário autenticado não corresponde a nenhuma pessoa ativa.';
  end if;

  select ce.caso_id, ce.tipo, ce.status into v_caso_id, v_tipo, v_status
  from public.caso_etapas ce
  where ce.id = p_caso_etapa_id
  for update;

  if not found then
    raise exception 'caso_etapa % não encontrada.', p_caso_etapa_id;
  end if;

  if v_tipo <> 'edicao_video' then
    raise exception 'Só o vídeo horizontal do MASTER se finaliza por aqui — esta etapa é "%".', v_tipo;
  end if;

  if v_status = 'pronto_para_entrega' then
    raise exception 'Este vídeo já está em Entregáveis, esperando a confirmação da entrega.';
  end if;

  if v_status in ('concluida', 'dispensada') then
    raise exception 'Este vídeo já foi entregue. Para uma nova versão, peça alteração.';
  end if;

  select count(*) into v_links
  from public.entregaveis e
  where e.caso_id = v_caso_id
    and e.tipo in ('video', 'video_wetransfer', 'google_photos', 'wetransfer');

  if v_links = 0 then
    raise exception 'O caso ainda não tem links — informe o link do vídeo e o WeTransfer.';
  end if;

  update public.caso_etapas
     set video_nos_links_do_caso_em = now()
   where id = p_caso_etapa_id;

  perform public.mover_video_master(p_caso_etapa_id, 'pronto_para_entrega');

  insert into public.eventos (caso_id, caso_etapa_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    v_caso_id, p_caso_etapa_id, v_pessoa_id, 'video_enviado_para_entrega',
    jsonb_build_object('caso_etapa_id', p_caso_etapa_id, 'status_anterior', v_status,
                       'nos_links_do_caso', true, 'links_do_caso', v_links),
    now()
  );
end;
$$;

comment on function public.enviar_video_nos_links_do_caso(uuid) is
  'Termina a edição do vídeo do MASTER confirmando que ele foi adicionado aos links que o caso já tem (do vídeo anterior ou das fotos): leva a "Pronto para entrega" sem par novo de links, e o ADM confere os links do caso em Entregáveis. Recusa caso sem link nenhum. Qualquer pessoa ativa.';

revoke all on function public.enviar_video_nos_links_do_caso(uuid) from public, anon;
grant execute on function public.enviar_video_nos_links_do_caso(uuid) to authenticated;
