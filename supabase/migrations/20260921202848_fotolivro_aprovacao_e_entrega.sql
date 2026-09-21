-- O FOTOLIVRO PASSA POR ENTREGÁVEIS DUAS VEZES (21/09/2026, pedido do gestor).
--
-- O FLUXO DELE, nas palavras dele: terminada a diagramação, o fotolivro vai
-- para Entregáveis "sinalizado como foto livro, pois a Morgana irá pegar o link
-- e enviar para o cliente". Na seção ele FICA em "Aguardando aprovação"; quando
-- o cliente aprova, a Morgana volta à seção e segue arrastando — pago, gráfica.
-- Dez dias depois vai para "Pronto para entrega", e "mais uma vez vai para
-- Entregáveis", onde a entrega do livro é confirmada.
--
-- O QUE ACONTECIA: o "concluir" do cartão chamava `concluir_etapa`, e a etapa
-- inteira acabava e saía da seção — "o card simplesmente se move sozinho". E a
-- fase final (`entregue`) também concluía na hora, sem ninguém confirmar.
--
-- O QUE ESTA MIGRATION FAZ:
--
--   1. CAPA E LINK DO FOTOLIVRO, na própria etapa. Para entrar em "Aguardando
--      aprovação" os dois são obrigatórios (decisão do gestor): a imagem da capa
--      — "png simples, podendo até ser um print da tela" — e o link que a
--      Morgana manda ao cliente. A capa vive no bucket privado `midias`, na
--      pasta `fotolivro/<caso_etapa_id>/`; aqui fica só o CAMINHO (a URL
--      assinada expira, e guardá-la seria guardar um segredo com validade).
--      Colunas próprias e não um entregável: o link de aprovação é uma PROVA
--      que vai e volta com o cliente, não o link final da família, e morar em
--      `entregaveis` o misturaria com a conferência de entrega do caso.
--      Nomes com `fotolivro`, e não `album`: "álbum" também é a galeria do
--      Google neste código (ver a armadilha na seção 13 do CLAUDE.md).
--
--   2. `enviar_fotolivro_para_aprovacao` — a porta de entrada da aprovação.
--      Grava capa e link E move a fase, na mesma transação: separados, a rede
--      caindo no meio deixaria um fotolivro "aguardando aprovação" sem nada
--      para a Morgana mandar. A fase é DELEGADA a `mover_album`, como em
--      `pedir_alteracao_da_etapa` — uma segunda definição de "mover" receberia
--      só metade da próxima correção.
--
--   3. `marcar_fotolivro_enviado` — "Enviado ao cliente", em Entregáveis. É o
--      que tira o fotolivro de lá (decisão do gestor): na seção ele continua
--      aguardando a resposta do cliente, mas a aba não acumula livros que já
--      foram mandados. Atendimento ou adm, como a confirmação de entrega do
--      caso — é o mesmo papel na mesma aba.
--
--   4. `mover_album` ganha duas travas:
--      - "Aguardando aprovação" exige capa e link. Quem arrasta passa pelo
--        diálogo; esta trava é para quem não passar.
--      - "Entregue" é CONFIRMAÇÃO, não fase: só atendimento ou adm, e só a
--        partir de "Pronto para entrega". Até aqui qualquer pessoa marcava o
--        fim de qualquer ponto da esteira, e o livro saía da seção sem ninguém
--        ter conferido a entrega.
--      `pronto_para_entrega` VOLTA a ser uma fase de verdade. Ela saiu do
--      seletor em 16/09 porque era redundante com `entregue` — e era, enquanto
--      as duas aconteciam no mesmo minuto. Agora entre elas existe a
--      conferência em Entregáveis. Ela já virava `pausada` (fase de espera), e
--      é o que deixa o livro aberto esperando a confirmação.
--
-- O `concluir_etapa` NÃO muda: a tela deixa de oferecê-lo no fotolivro, e o
-- banco continua aceitando — o mesmo arranjo de sempre, a tela mais estrita que
-- o banco. Mexer nele seria reescrever a RPC mais usada do sistema por um
-- caminho que nenhuma tela chama.


-- -----------------------------------------------------------------------------
-- 1. As colunas
-- -----------------------------------------------------------------------------

alter table public.caso_etapas
  add column fotolivro_link        text,
  add column fotolivro_capa        text,
  add column fotolivro_enviado_em  timestamptz,
  add column fotolivro_enviado_por uuid references public.pessoas(id) on delete restrict;

comment on column public.caso_etapas.fotolivro_link is
  'Link da prova do fotolivro que a Morgana manda ao cliente para aprovação. Só na etapa album.';
comment on column public.caso_etapas.fotolivro_capa is
  'CAMINHO da imagem da capa no bucket privado midias (fotolivro/<caso_etapa_id>/...). Leitura por URL assinada; a URL não se guarda.';
comment on column public.caso_etapas.fotolivro_enviado_em is
  'Quando a prova foi mandada ao cliente ("Enviado ao cliente", em Entregáveis). Nulo = na fila do ADM. Zera a cada nova ida para aprovação.';
comment on column public.caso_etapas.fotolivro_enviado_por is
  'Quem mandou a prova ao cliente.';

create index caso_etapas_fotolivro_enviado_por_idx
  on public.caso_etapas (fotolivro_enviado_por)
  where fotolivro_enviado_por is not null;

alter table public.caso_etapas
  add constraint caso_etapas_fotolivro_so_no_album
  check (
    tipo = 'album'
    or (fotolivro_link is null and fotolivro_capa is null
        and fotolivro_enviado_em is null and fotolivro_enviado_por is null)
  );


-- -----------------------------------------------------------------------------
-- 2. A capa no bucket `midias`
--
-- As PRIMEIRAS policies de `midias`. Até aqui o bucket negava tudo, e o
-- `buckets_privados.test.sql` afirmava isso de propósito — ele muda nesta PR, e
-- a mudança é o ponto de revisão: a porta abre SÓ na pasta `fotolivro/`, SÓ
-- para pessoa ativa, e o upload SÓ para a pasta de uma etapa que é mesmo um
-- fotolivro. Foto e vídeo de parto, no resto do bucket, continuam negados.
--
-- Sem UPDATE e sem DELETE: trocar a capa é subir outra (nome com carimbo de
-- tempo) e apontar a etapa para ela. Sobra o arquivo antigo, que é pequeno — e
-- é o preço de ninguém conseguir apagar a capa que outra pessoa mandou.
-- -----------------------------------------------------------------------------

create policy midias_fotolivro_leitura
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'midias'
    and (storage.foldername(name))[1] = 'fotolivro'
    and (select public.eh_pessoa_ativa())
  );

create policy midias_fotolivro_upload
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'midias'
    and (storage.foldername(name))[1] = 'fotolivro'
    and exists (
      select 1 from public.caso_etapas ce
       where ce.id::text = (storage.foldername(name))[2]
         and ce.tipo = 'album'
    )
    and (select public.eh_pessoa_ativa())
  );


-- -----------------------------------------------------------------------------
-- 3. mover_album, com as duas travas novas
--
-- Repete a definição de 20260910150425 e acrescenta as travas depois da
-- checagem de caso cancelado. `create or replace` com a mesma assinatura mantém
-- os privilégios.
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

  -- A APROVAÇÃO EXIGE O QUE MANDAR (21/09/2026). Quem chega aqui pela tela já
  -- passou por `enviar_fotolivro_para_aprovacao`, que grava os dois antes.
  if p_fase = 'aguardando_aprovacao' and (v_link is null or v_capa is null) then
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

  v_status := case p_fase
    when 'diagramando' then 'em_andamento'::public.status_etapa
    when 'entregue'    then 'concluida'::public.status_etapa
    else 'pausada'::public.status_etapa
  end;

  update public.caso_etapas
     set fase_album  = p_fase,
         status      = v_status,
         -- O relógio começa na primeira fase que alguém declara, e não só na
         -- diagramação: o pagamento já é parte do ciclo do produto, e sem isto
         -- um álbum que ficou um mês esperando pagamento apareceria como se
         -- tivesse nascido no dia em que a diagramação começou.
         iniciado_em = coalesce(iniciado_em, now()),
         concluido_em = case when p_fase = 'entregue' then now() else null end,
         pausa_acumulada = pausa_acumulada
           + case when v_pausado is not null then now() - v_pausado
                  else interval '0' end,
         -- Entrar numa fase de espera reabre a pausa; sair dela fecha. É o que
         -- faz o tempo de ciclo medir diagramação e não calendário.
         pausado_em = case when v_status = 'pausada' then now() else null end,
         responsavel_id = coalesce(responsavel_id, v_pessoa_id)
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
  'Desde 20260921202848: aguardando_aprovacao exige capa e link (entra por '
  'enviar_fotolivro_para_aprovacao), e entregue é confirmação do atendimento ou '
  'adm, só a partir de pronto_para_entrega.';


-- -----------------------------------------------------------------------------
-- 4. enviar_fotolivro_para_aprovacao
-- -----------------------------------------------------------------------------

create or replace function public.enviar_fotolivro_para_aprovacao(
  p_caso_etapa_id uuid,
  p_link          text,
  p_capa          text
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
  -- confere, e aqui fecha o outro lado: ninguém aponta a etapa para a capa de
  -- outro fotolivro.
  if v_capa not like 'fotolivro/' || p_caso_etapa_id::text || '/%' then
    raise exception 'A imagem da capa não é deste Foto/Livro.';
  end if;

  -- A capa e o link ANTES da fase: `mover_album` exige os dois para entrar
  -- em aprovação. O "enviado" zera — é uma prova nova, e ela volta para a fila
  -- do ADM (o caminho de volta depois de um pedido de alterações).
  update public.caso_etapas
     set fotolivro_link        = v_link,
         fotolivro_capa        = v_capa,
         fotolivro_enviado_em  = null,
         fotolivro_enviado_por = null
   where id = p_caso_etapa_id;

  perform public.mover_album(p_caso_etapa_id, 'aguardando_aprovacao');

  -- Sem o link no payload: é credencial de acesso à prova da família (seção 10
  -- do CLAUDE.md), e `eventos` é lido por toda pessoa ativa.
  insert into public.eventos (caso_id, caso_etapa_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    v_caso_id, p_caso_etapa_id, v_pessoa_id, 'fotolivro_para_aprovacao',
    jsonb_build_object('caso_etapa_id', p_caso_etapa_id),
    now()
  );
end;
$$;

comment on function public.enviar_fotolivro_para_aprovacao(uuid, text, text) is
  'Grava capa e link do Foto/Livro e o move para "Aguardando aprovação do cliente", na mesma transação. Zera o "enviado ao cliente": a prova nova volta para a fila do ADM em Entregáveis. Qualquer pessoa ativa — é quem terminou a diagramação.';

revoke all on function public.enviar_fotolivro_para_aprovacao(uuid, text, text) from public, anon;
grant execute on function public.enviar_fotolivro_para_aprovacao(uuid, text, text) to authenticated;


-- -----------------------------------------------------------------------------
-- 5. marcar_fotolivro_enviado
-- -----------------------------------------------------------------------------

create or replace function public.marcar_fotolivro_enviado(p_caso_etapa_id uuid)
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
  v_enviado   timestamptz;
begin
  select p.id into v_pessoa_id
  from public.pessoas p
  where p.auth_user_id = auth.uid()
    and p.ativo;

  if v_pessoa_id is null then
    raise exception 'Usuário autenticado não corresponde a nenhuma pessoa ativa.';
  end if;

  if not (public.eh_atendimento() or public.eh_adm()) then
    raise exception
      'Quem manda o Foto/Livro ao cliente é o atendimento ou a gestão.';
  end if;

  select ce.caso_id, ce.tipo, ce.fase_album, ce.fotolivro_enviado_em
    into v_caso_id, v_tipo, v_fase, v_enviado
  from public.caso_etapas ce
  where ce.id = p_caso_etapa_id
  for update;

  if not found then
    raise exception 'caso_etapa % não encontrada.', p_caso_etapa_id;
  end if;

  if v_tipo <> 'album' then
    raise exception 'Só o Foto/Livro é mandado ao cliente para aprovação.';
  end if;

  if v_fase is distinct from 'aguardando_aprovacao' then
    raise exception 'Este Foto/Livro não está aguardando aprovação do cliente.';
  end if;

  -- Já marcado: não repete o carimbo nem o evento. Duas pessoas tocando o mesmo
  -- botão ao mesmo tempo é o caso real.
  if v_enviado is not null then
    return;
  end if;

  update public.caso_etapas
     set fotolivro_enviado_em  = now(),
         fotolivro_enviado_por = v_pessoa_id
   where id = p_caso_etapa_id;

  insert into public.eventos (caso_id, caso_etapa_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    v_caso_id, p_caso_etapa_id, v_pessoa_id, 'fotolivro_enviado_ao_cliente',
    jsonb_build_object('caso_etapa_id', p_caso_etapa_id),
    now()
  );
end;
$$;

comment on function public.marcar_fotolivro_enviado(uuid) is
  '"Enviado ao cliente": a prova do Foto/Livro foi mandada, e ele sai de Entregáveis. Na seção continua em "Aguardando aprovação". Atendimento ou adm. Idempotente.';

revoke all on function public.marcar_fotolivro_enviado(uuid) from public, anon;
grant execute on function public.marcar_fotolivro_enviado(uuid) to authenticated;
