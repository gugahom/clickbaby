-- =============================================================================
-- O SINO DO FOTO/LIVRO (27/11/2026, pedido do gestor)
-- =============================================================================
--
-- O fluxo, nas palavras dele, coluna a coluna:
--   Aguardando diagramação    → o sino chama quem DIAGRAMA (o André)
--   Realizando diagramação    → ninguém
--   Enviar para aprovação     → o sino chama quem MANDA A PROVA (a Rafinha)
--   Pedido de alterações      → quem diagrama, de novo
--   Alterações realizadas     → quem manda a prova, de novo (coluna nova)
--   Aprovado pelo cliente     → quem PAGA E MANDA PARA A GRÁFICA (a Amanda)
--   Pago e enviado à gráfica  → ninguém
--
-- 1. QUEM O SINO CHAMA é marca na pessoa, como no New Born (20261105120002):
--    três colunas em `pessoas`, ligadas pela gestão na Equipe. Nenhum nome no
--    código. A lista do sino continua derivada na tela.
--
-- 2. A PROVA NÃO PASSA MAIS POR ENTREGÁVEIS (decisão do gestor: quem manda a
--    prova ao cliente é quem o sino chama, e não o ADM). Até aqui, terminar a
--    diagramação levava o livro direto para "Aguardando aprovação do cliente" e
--    o punha na fila do ADM, que marcava "Enviado ao cliente". Agora:
--      - terminar a diagramação leva a "Enviar para aprovação" (com capa e
--        link, como sempre), e a prova corrigida a "Alterações realizadas";
--      - quem mandou a prova move o card para "Aguardando aprovação do
--        cliente", e É ESSE GESTO que carimba `fotolivro_enviado_em/_por`.
--    `marcar_fotolivro_enviado` fica no banco, sem uso na tela.
--
-- 3. A CAPA E O LINK passam a ser exigidos já em "Enviar para aprovação" e em
--    "Alterações realizadas": quem chega ali é quem vai mandar a prova, e sem
--    as duas não há o que mandar. Na coluna nova o diálogo abre com a capa e o
--    link da rodada anterior, e dá para manter ou trocar (decisão do gestor).
--
-- 4. OS LIVROS QUE ESTAVAM NA FILA DO ADM (em aprovação e ainda não enviados)
--    vão para "Enviar para aprovação": era onde eles estavam de fato — com a
--    prova pronta, esperando alguém mandar. Sem isto sairiam de Entregáveis e
--    ficariam numa coluna que diz "o cliente já recebeu".
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. As marcas na pessoa
-- -----------------------------------------------------------------------------

alter table public.pessoas
  add column avisa_diagramacao_fotolivro boolean not null default false,
  add column avisa_envio_fotolivro       boolean not null default false,
  add column avisa_grafica_fotolivro     boolean not null default false;

comment on column public.pessoas.avisa_diagramacao_fotolivro is
  'O sino chama esta pessoa quando há Foto/Livro em "Aguardando diagramação" ou em "Pedido de alterações".';
comment on column public.pessoas.avisa_envio_fotolivro is
  'O sino chama esta pessoa quando há prova de Foto/Livro para mandar ao cliente: "Enviar para aprovação" ou "Alterações realizadas".';
comment on column public.pessoas.avisa_grafica_fotolivro is
  'O sino chama esta pessoa quando há Foto/Livro "Aprovado pelo cliente", para pagar e mandar à gráfica.';


-- -----------------------------------------------------------------------------
-- 2. mover_album: a prova antes de mandar, e o carimbo do envio
--
-- Repete a definição de 20260921202848. Mudam duas coisas: a exigência de capa
-- e link vale também para as duas colunas de "mandar a prova", e entrar em
-- "Aguardando aprovação do cliente" carimba quem mandou.
-- -----------------------------------------------------------------------------

create or replace function public.mover_album(
  p_caso_etapa_id uuid,
  p_fase          public.fase_album
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
  v_fase      public.fase_album;
  v_terminal  public.status_operacional;
  v_pausado   timestamptz;
  v_status    public.status_etapa;
  v_link      text;
  v_capa      text;
  v_mandou    boolean;
begin
  select p.id into v_pessoa_id
  from public.pessoas p
  where p.auth_user_id = auth.uid()
    and p.ativo;

  if v_pessoa_id is null then
    raise exception 'Usuário autenticado não corresponde a nenhuma pessoa ativa.';
  end if;

  select ce.caso_id, ce.tipo, ce.fase_album, ce.pausado_em, c.status_operacional,
         ce.fotolivro_link, ce.fotolivro_capa
    into v_caso_id, v_tipo, v_fase, v_pausado, v_terminal, v_link, v_capa
  from public.caso_etapas ce
  join public.casos c on c.id = ce.caso_id
  where ce.id = p_caso_etapa_id
  for update of ce;

  if not found then
    raise exception 'caso_etapa % não encontrada.', p_caso_etapa_id;
  end if;

  if v_tipo <> 'album' then
    raise exception
      'A esteira do fotolivro é da etapa de álbum — etapa "%" não passa por ela.',
      v_tipo;
  end if;

  if v_terminal = 'cancelado' then
    raise exception
      'Caso cancelado — não se mexe no fotolivro de um contrato que caiu.';
  end if;

  if v_fase is not distinct from p_fase then
    return;
  end if;

  -- A PROVA ANTES DE MANDAR (21/09/2026; as duas primeiras desde 27/11/2026).
  -- Quem chega aqui pela tela já passou por `enviar_fotolivro_para_aprovacao`,
  -- que grava as duas antes.
  if p_fase in ('enviar_para_aprovacao', 'alteracoes_realizadas', 'aguardando_aprovacao')
     and (v_link is null or v_capa is null) then
    raise exception
      'Para ir para aprovação o Foto/Livro precisa da imagem da capa e do link para o cliente.';
  end if;

  -- ENTREGUE É CONFIRMAÇÃO, NÃO FASE (21/09/2026): quem entrega é o ADM, em
  -- Entregáveis, e só o que já está pronto.
  if p_fase = 'entregue' then
    if not (public.eh_atendimento() or public.eh_adm()) then
      raise exception
        'Quem confirma a entrega do Foto/Livro é o atendimento ou a gestão, na aba Entregáveis.';
    end if;
    if v_fase is distinct from 'pronto_para_entrega' then
      raise exception
        'Só se confirma a entrega do Foto/Livro que está em "Pronto para entrega".';
    end if;
  end if;

  -- MOVER PARA "AGUARDANDO APROVAÇÃO" É DIZER QUE A PROVA FOI MANDADA
  -- (27/11/2026): quem move é quem mandou, e o carimbo é dele.
  v_mandou := p_fase = 'aguardando_aprovacao';

  v_status := case p_fase
    when 'diagramando' then 'em_andamento'::public.status_etapa
    when 'entregue'    then 'concluida'::public.status_etapa
    else 'pausada'::public.status_etapa
  end;

  update public.caso_etapas
     set fase_album  = p_fase,
         status      = v_status,
         -- O relógio começa na primeira fase que alguém declara, e não só na
         -- diagramação: o pagamento já é parte do ciclo do produto.
         iniciado_em = coalesce(iniciado_em, now()),
         concluido_em = case when p_fase = 'entregue' then now() else null end,
         pausa_acumulada = pausa_acumulada
           + case when v_pausado is not null then now() - v_pausado
                  else interval '0' end,
         -- Entrar numa fase de espera reabre a pausa; sair dela fecha. É o que
         -- faz o tempo de ciclo medir diagramação e não calendário.
         pausado_em = case when v_status = 'pausada' then now() else null end,
         responsavel_id = coalesce(responsavel_id, v_pessoa_id),
         fotolivro_enviado_em  = case when v_mandou then now() else fotolivro_enviado_em end,
         fotolivro_enviado_por = case when v_mandou then v_pessoa_id else fotolivro_enviado_por end
   where id = p_caso_etapa_id;

  insert into public.eventos (caso_id, caso_etapa_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    v_caso_id,
    p_caso_etapa_id,
    v_pessoa_id,
    'fase_do_album_movida',
    jsonb_build_object(
      'de', v_fase,
      'para', p_fase,
      'status', v_status
    ),
    now()
  );
end;
$$;

comment on function public.mover_album(uuid, public.fase_album) is
  'Move o fotolivro na esteira de produção. É a ÚNICA porta de escrita de '
  'fase_album, e escreve o status junto na mesma transação — diagramando vira '
  'em_andamento, entregue vira concluida, e toda fase de espera vira pausada. '
  'Recusa etapa que não seja `album` e caso CANCELADO; aceita caso ENCERRADO. '
  'Enviar para aprovação, alterações realizadas e aguardando aprovação exigem '
  'capa e link (entram por enviar_fotolivro_para_aprovacao); entrar em '
  'aguardando aprovação carimba quem mandou a prova (27/11/2026). Entregue é '
  'confirmação do atendimento ou adm, só a partir de pronto_para_entrega.';


-- -----------------------------------------------------------------------------
-- 3. enviar_fotolivro_para_aprovacao: para qual das duas colunas
--
-- DROP + CREATE porque a assinatura ganha `p_fase`, com padrão: a tela antiga
-- em cache continua chamando com três argumentos e cai em "Enviar para
-- aprovação". Os privilégios são repetidos — o CREATE novo nasce com os padrões.
-- -----------------------------------------------------------------------------

drop function public.enviar_fotolivro_para_aprovacao(uuid, text, text);

create function public.enviar_fotolivro_para_aprovacao(
  p_caso_etapa_id uuid,
  p_link          text,
  p_capa          text,
  p_fase          public.fase_album default 'enviar_para_aprovacao'
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
  v_link      text := nullif(btrim(coalesce(p_link, '')), '');
  v_capa      text := nullif(btrim(coalesce(p_capa, '')), '');
begin
  select p.id into v_pessoa_id
  from public.pessoas p
  where p.auth_user_id = auth.uid()
    and p.ativo;

  if v_pessoa_id is null then
    raise exception 'Usuário autenticado não corresponde a nenhuma pessoa ativa.';
  end if;

  if p_fase is null or p_fase not in ('enviar_para_aprovacao', 'alteracoes_realizadas') then
    raise exception
      'A prova do Foto/Livro vai para "Enviar para aprovação" ou para "Alterações realizadas".';
  end if;

  select ce.caso_id, ce.tipo into v_caso_id, v_tipo
  from public.caso_etapas ce
  where ce.id = p_caso_etapa_id;

  if not found then
    raise exception 'caso_etapa % não encontrada.', p_caso_etapa_id;
  end if;

  if v_tipo <> 'album' then
    raise exception 'Só o Foto/Livro vai para aprovação do cliente.';
  end if;

  if v_link is null then
    raise exception 'Falta o link do Foto/Livro para mandar ao cliente.';
  end if;

  if v_link !~* '^https?://' then
    raise exception 'O link do Foto/Livro precisa começar com http:// ou https://.';
  end if;

  if v_capa is null then
    raise exception 'Falta a imagem da capa do Foto/Livro.';
  end if;

  -- A capa tem de estar na pasta DESTA etapa — é o que a policy de upload
  -- confere, e aqui fecha o outro lado.
  if v_capa not like 'fotolivro/' || p_caso_etapa_id::text || '/%' then
    raise exception 'A imagem da capa não é deste Foto/Livro.';
  end if;

  -- A capa e o link ANTES da fase: `mover_album` exige os dois. O "enviado"
  -- zera — é uma prova que ainda não foi mandada.
  update public.caso_etapas
     set fotolivro_link        = v_link,
         fotolivro_capa        = v_capa,
         fotolivro_enviado_em  = null,
         fotolivro_enviado_por = null
   where id = p_caso_etapa_id;

  perform public.mover_album(p_caso_etapa_id, p_fase);

  -- Sem o link no payload: é credencial de acesso à prova da família (seção 10
  -- do CLAUDE.md), e `eventos` é lido por toda pessoa ativa.
  insert into public.eventos (caso_id, caso_etapa_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    v_caso_id, p_caso_etapa_id, v_pessoa_id, 'fotolivro_para_aprovacao',
    jsonb_build_object('caso_etapa_id', p_caso_etapa_id, 'fase', p_fase),
    now()
  );
end;
$$;

comment on function public.enviar_fotolivro_para_aprovacao(uuid, text, text, public.fase_album) is
  'Grava capa e link do Foto/Livro e o move para "Enviar para aprovação" (o padrão) ou "Alterações realizadas", na mesma transação, zerando o "enviado ao cliente": é uma prova que ainda não foi mandada. Quem a manda move o livro para "Aguardando aprovação do cliente" (mover_album), e é isso que carimba o envio. Qualquer pessoa ativa — é quem terminou a diagramação.';

revoke all on function public.enviar_fotolivro_para_aprovacao(uuid, text, text, public.fase_album) from public, anon;
grant execute on function public.enviar_fotolivro_para_aprovacao(uuid, text, text, public.fase_album) to authenticated;


-- -----------------------------------------------------------------------------
-- 4. Os livros que esperavam o ADM mandar a prova
--
-- Sem passar por `mover_album`, que exige um usuário logado: o UPDATE é direto,
-- e o evento é gravado sem pessoa — a mudança é desta migration, não de alguém.
-- -----------------------------------------------------------------------------

with movidos as (
  update public.caso_etapas
     set fase_album = 'enviar_para_aprovacao'
   where tipo = 'album'
     and fase_album = 'aguardando_aprovacao'
     and fotolivro_enviado_em is null
  returning id, caso_id, status
)
insert into public.eventos (caso_id, caso_etapa_id, pessoa_id, tipo, payload, ocorrido_em)
select caso_id, id, null, 'fase_do_album_movida',
       jsonb_build_object(
         'de', 'aguardando_aprovacao',
         'para', 'enviar_para_aprovacao',
         'status', status,
         'migracao', '20261127120002'
       ),
       now()
  from movidos;
