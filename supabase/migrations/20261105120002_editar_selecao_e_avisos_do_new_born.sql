-- =============================================================================
-- O NEW BORN: EDITAR SELEÇÃO, "ENVIADO À FAMÍLIA" E QUEM O SINO CHAMA (05/11/2026)
-- =============================================================================
--
-- 1. A COLUNA "EDITAR SELEÇÃO", entre a escolha da família e o Pronto para
--    entrega. Ela é a edição de verdade, mas CHEGA PAUSADA: quem move o card é
--    quem fala com a família, e o relógio só corre quando a editora der play.
--    Por isso `mover_click_home` não ganha regra de status: a fase cai no "toda
--    espera vira pausada". Muda só a trava do link da galeria.
--
-- 2. "ENVIADO À FAMÍLIA". Na coluna da escolha o card fica parado dias, e a fase
--    sozinha não separa "falta mandar" de "a família está escolhendo". O carimbo
--    separa, como `fotolivro_enviado_em` no Foto/Livro. Qualquer pessoa ativa
--    marca, como a mensagem: quem faz esse meio de campo não tem papel próprio.
--    Quem o LIMPA é `enviar_click_home_para_escolha`: galeria nova é envio novo.
--
-- 3. QUEM O SINO CHAMA. O sino só toca para quem tem o nome no card, e quem
--    manda a galeria à família não tem. Duas marcas na pessoa, ligadas pela
--    gestão na Equipe (decisão do gestor), para não haver nome cravado no
--    código. É cadastro: vai pelo UPDATE direto da policy de `pessoas`, como as
--    telas, e a lista do sino continua derivada na tela.
-- =============================================================================

alter table public.caso_etapas
  add column click_home_enviado_em  timestamptz,
  add column click_home_enviado_por uuid references public.pessoas(id) on delete restrict;

comment on column public.caso_etapas.click_home_enviado_em is
  'Quando a galeria do New Born foi mandada à família para escolher. Nulo com a fase em "enviar_para_escolha" = falta mandar, e o sino chama. Zera a cada galeria nova.';
comment on column public.caso_etapas.click_home_enviado_por is
  'Quem mandou a galeria à família.';

create index caso_etapas_click_home_enviado_por_idx
  on public.caso_etapas (click_home_enviado_por)
  where click_home_enviado_por is not null;

alter table public.caso_etapas
  add constraint caso_etapas_envio_so_no_click_home
  check (tipo = 'click_home' or (click_home_enviado_em is null and click_home_enviado_por is null));

alter table public.pessoas
  add column avisa_escolha_new_born boolean not null default false,
  add column avisa_edicao_new_born  boolean not null default false;

comment on column public.pessoas.avisa_escolha_new_born is
  'O sino chama esta pessoa quando há galeria do New Born para mandar à família.';
comment on column public.pessoas.avisa_edicao_new_born is
  'O sino chama esta pessoa quando há New Born esperando edição: a primeira, depois do ensaio, e a da seleção da família.';


create function public.marcar_click_home_enviado(p_caso_etapa_id uuid)
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
  v_enviado   timestamptz;
begin
  select p.id into v_pessoa_id
  from public.pessoas p
  where p.auth_user_id = auth.uid()
    and p.ativo;

  if v_pessoa_id is null then
    raise exception 'Usuário autenticado não corresponde a nenhuma pessoa ativa.';
  end if;

  select ce.caso_id, ce.tipo, ce.fase_click_home, ce.click_home_enviado_em
    into v_caso_id, v_tipo, v_fase, v_enviado
  from public.caso_etapas ce
  where ce.id = p_caso_etapa_id
  for update;

  if not found then
    raise exception 'caso_etapa % não encontrada.', p_caso_etapa_id;
  end if;

  if v_tipo <> 'click_home' then
    raise exception 'Só a galeria do New Born é enviada à família por aqui.';
  end if;

  if v_fase is distinct from 'enviar_para_escolha' then
    raise exception 'Só se marca o envio do New Born que está em "Enviar para escolha".';
  end if;

  -- Já enviada: nada a gravar, nem evento.
  if v_enviado is not null then
    return;
  end if;

  update public.caso_etapas
     set click_home_enviado_em = now(),
         click_home_enviado_por = v_pessoa_id
   where id = p_caso_etapa_id;

  insert into public.eventos (caso_id, caso_etapa_id, pessoa_id, tipo, payload, ocorrido_em)
  values (v_caso_id, p_caso_etapa_id, v_pessoa_id, 'click_home_enviado_a_familia', '{}'::jsonb, now());
end;
$$;

comment on function public.marcar_click_home_enviado(uuid) is
  'A galeria do New Born foi mandada à família: carimba o envio e apaga o chamado do sino. O ensaio continua em "Enviar para escolha" até a família escolher. Qualquer pessoa ativa; idempotente.';

revoke all on function public.marcar_click_home_enviado(uuid) from public, anon;
grant execute on function public.marcar_click_home_enviado(uuid) to authenticated;


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
  'Move o ensaio Click Home na esteira. É a ÚNICA porta de escrita de fase_click_home, e grava o status junto. As fases de antes do ensaio (a_agendar, agendado) deixam a etapa pendente, sem carimbar início; agendado exige a data do ensaio (previsao_em). Editando e criar_galeria viram em_andamento, finalizado vira concluida, e toda espera vira pausada — editar_selecao também: chega pausada, e o relógio corre no play. "Enviar para escolha", "editar seleção" e "pronto para entrega" exigem o link da galeria; "finalizado" é do atendimento ou adm, e só a partir do pronto para entrega. Aceita caso encerrado, nunca cancelado.';


create or replace function public.enviar_click_home_para_escolha(
  p_caso_etapa_id uuid,
  p_link          text
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
  v_link         text := btrim(coalesce(p_link, ''));
  v_substituidos integer;
begin
  select p.id into v_pessoa_id
  from public.pessoas p
  where p.auth_user_id = auth.uid()
    and p.ativo;

  if v_pessoa_id is null then
    raise exception 'Usuário autenticado não corresponde a nenhuma pessoa ativa.';
  end if;

  if v_link = '' then
    raise exception 'O link da galeria de escolha é obrigatório.';
  end if;

  if v_link !~* '^https?://' then
    raise exception 'O link precisa começar com http:// ou https://.';
  end if;

  select ce.caso_id, ce.tipo, ce.fase_click_home into v_caso_id, v_tipo, v_fase
  from public.caso_etapas ce
  where ce.id = p_caso_etapa_id
  for update;

  if not found then
    raise exception 'caso_etapa % não encontrada.', p_caso_etapa_id;
  end if;

  if v_tipo <> 'click_home' then
    raise exception 'Só o ensaio Click Home vai para escolha por aqui — esta etapa é "%".', v_tipo;
  end if;

  if v_fase = 'finalizado' then
    raise exception 'Este Click Home já foi finalizado. Para uma galeria nova, mova a fase de volta.';
  end if;

  -- Uma galeria anterior que ninguém conferiu sai do caminho; o que já foi
  -- entregue à família fica, porque é histórico da entrega que aconteceu.
  delete from public.entregaveis
   where caso_id = v_caso_id
     and tipo = 'click_home'
     and confirmado_em is null;
  get diagnostics v_substituidos = row_count;

  insert into public.entregaveis (caso_id, tipo, url, criado_por)
  values (v_caso_id, 'click_home', v_link, v_pessoa_id);

  -- GALERIA NOVA É ENVIO NOVO: a família ainda não recebeu esta, e o sino volta
  -- a chamar. Aqui, e não em `mover_click_home`, porque trocar a galeria com o
  -- ensaio já na escolha não muda a fase e a mover sai sem escrever nada.
  update public.caso_etapas
     set click_home_enviado_em = null,
         click_home_enviado_por = null
   where id = p_caso_etapa_id;

  perform public.mover_click_home(p_caso_etapa_id, 'enviar_para_escolha');

  insert into public.eventos (caso_id, caso_etapa_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    v_caso_id,
    p_caso_etapa_id,
    v_pessoa_id,
    'click_home_para_escolha',
    -- Sem a URL: link de entrega é credencial de acesso da família e não entra
    -- em eventos (seção 10). O que fica é a CONTAGEM do que foi substituído.
    jsonb_build_object('links_substituidos', v_substituidos),
    now()
  );
end;
$$;

comment on function public.enviar_click_home_para_escolha(uuid, text) is
  'Grava o link da galeria de escolha e leva o ensaio para a fase "Enviar para escolha", na mesma transação, zerando o carimbo de envio à família: galeria nova é envio novo. Quem marca o envio é marcar_click_home_enviado. Qualquer pessoa ativa — quem acabou de montar a galeria é quem sabe que acabou.';
