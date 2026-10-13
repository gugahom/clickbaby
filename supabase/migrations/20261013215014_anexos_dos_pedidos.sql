-- =============================================================================
-- OS ANEXOS DOS PEDIDOS DO CLIENTE (13/10/2026, pedido do gestor)
-- =============================================================================
--
-- "No Trello, quando o cliente pede alteração, a gente consegue colocar anexo —
-- uma música, uma foto (...) normalmente o cliente manda alguma referência,
-- algum vídeo, alguma foto." Aqui, os "Pedidos" do vídeo do MASTER, do
-- Foto/Livro e do New Born eram só texto (a observação da etapa).
--
-- Decisões do gestor, perguntado:
--   * nos TRÊS lugares que têm "Pedidos" (edicao_video, album, click_home);
--   * até 50 MB por arquivo — vídeo maior entra como link no texto;
--   * apaga quem enviou, o atendimento e a gestão.
--
-- O DESENHO
--
-- 1. UM BUCKET PRÓPRIO, `pedidos`, privado, com teto de 50 MB e lista de
--    formatos (foto, vídeo, áudio, PDF). Não é a pasta de um bucket existente:
--    `midias` é foto e vídeo de PARTO, com teto de 1 GiB e sem áudio, e o limite
--    de 50 MB só é imposto pelo servidor de verdade quando é o limite do bucket.
--    O arquivo mora em `<caso_etapa_id>/<carimbo>-<nome>`.
--
-- 2. UMA TABELA, `anexos_da_etapa`, que é a LISTA da tela — nome original,
--    formato, tamanho, quem mandou. Escrita só por RPC. A tabela existe porque o
--    bucket sozinho não diz quem mandou de um jeito que a RLS de `pessoas`
--    entenda, e porque o Quadro conta os anexos de cada etapa numa consulta só.
--
-- 3. DOIS PASSOS, como a capa do fotolivro: o arquivo vai direto do navegador
--    para o bucket (a policy de upload confere a pasta), e
--    `registrar_anexo_da_etapa` grava a linha lendo o tamanho e o formato do
--    PRÓPRIO storage — não do que o cliente diz.
--
-- 4. APAGAR TAMBÉM EM DOIS PASSOS, na ordem inversa: `remover_anexo_da_etapa`
--    confere quem pode, apaga a linha e grava o evento; depois o navegador apaga
--    o arquivo pela API do Storage (o Supabase recusa DELETE direto em
--    `storage.objects`). A policy de remoção só deixa apagar arquivo QUE NÃO
--    ESTÁ MAIS NA LISTA — ninguém some com o anexo de outra pessoa pela porta
--    dos fundos do Storage. A mesma policy deixa quem subiu apagar o próprio
--    arquivo que não chegou a ser registrado (a tela limpa quando o registro
--    falha).
--
-- O NOME DO ARQUIVO vai para `eventos` (o histórico diz "Anexou musica.mp3").
-- `eventos` e a lista são legíveis pela mesma equipe ativa, então não há
-- público novo. O ARQUIVO só sai por URL assinada.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. O bucket
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pedidos',
  'pedidos',
  false,
  52428800, -- 50 MiB, decisão do gestor
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
    'video/mp4', 'video/quicktime', 'video/webm', 'video/3gpp',
    'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/ogg', 'audio/opus',
    'audio/wav', 'audio/x-wav', 'audio/webm',
    'application/pdf'
  ]
)
on conflict (id) do update
   set public             = false,
       file_size_limit    = excluded.file_size_limit,
       allowed_mime_types = excluded.allowed_mime_types;


-- -----------------------------------------------------------------------------
-- 2. A lista
-- -----------------------------------------------------------------------------

create table public.anexos_da_etapa (
  id            uuid primary key default gen_random_uuid(),
  caso_etapa_id uuid not null references public.caso_etapas (id) on delete restrict,
  caminho       text not null unique,
  nome          text not null check (btrim(nome) <> '' and length(nome) <= 200),
  tipo_mime     text not null,
  tamanho       bigint not null check (tamanho > 0),
  enviado_por   uuid not null references public.pessoas (id) on delete restrict,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.anexos_da_etapa is
  'Arquivos de referência dos pedidos do cliente (foto, vídeo, música, PDF) no vídeo do MASTER, no Foto/Livro e no New Born. O arquivo mora no bucket privado pedidos; aqui fica a lista. Escrita só por registrar_anexo_da_etapa e remover_anexo_da_etapa.';

create index anexos_da_etapa_caso_etapa_id_idx on public.anexos_da_etapa (caso_etapa_id);
create index anexos_da_etapa_enviado_por_idx on public.anexos_da_etapa (enviado_por);

create trigger anexos_da_etapa_set_updated_at
  before update on public.anexos_da_etapa
  for each row execute function public.set_updated_at();

alter table public.anexos_da_etapa enable row level security;

create policy anexos_da_etapa_select_equipe
  on public.anexos_da_etapa
  for select
  to authenticated
  using ((select public.eh_pessoa_ativa()));

grant select on public.anexos_da_etapa to authenticated;


-- -----------------------------------------------------------------------------
-- 3. As portas do bucket
-- -----------------------------------------------------------------------------

create policy pedidos_leitura
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'pedidos'
    and (select public.eh_pessoa_ativa())
  );

create policy pedidos_upload
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'pedidos'
    and exists (
      select 1 from public.caso_etapas ce
       where ce.id::text = (storage.foldername(name))[1]
         and ce.tipo in ('edicao_video', 'album', 'click_home')
    )
    and (select public.eh_pessoa_ativa())
  );

create policy pedidos_remocao
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'pedidos'
    and not exists (
      select 1 from public.anexos_da_etapa a where a.caminho = name
    )
    and (
      owner_id = (select auth.uid())::text
      or (select public.eh_atendimento())
      or (select public.eh_adm())
    )
    and (select public.eh_pessoa_ativa())
  );


-- -----------------------------------------------------------------------------
-- 4. Registrar
-- -----------------------------------------------------------------------------

create function public.registrar_anexo_da_etapa(
  p_caso_etapa_id uuid,
  p_caminho       text,
  p_nome          text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pessoa_id uuid;
  v_caso_id   uuid;
  v_tipo      public.etapa_tipo;
  v_status    public.status_operacional;
  v_metadata  jsonb;
  v_tamanho   bigint;
  v_mime      text;
  v_nome      text := btrim(coalesce(p_nome, ''));
  v_id        uuid;
begin
  select p.id into v_pessoa_id
  from public.pessoas p
  where p.auth_user_id = auth.uid()
    and p.ativo;

  if v_pessoa_id is null then
    raise exception 'Usuário autenticado não corresponde a nenhuma pessoa ativa.';
  end if;

  select ce.caso_id, ce.tipo, c.status_operacional
    into v_caso_id, v_tipo, v_status
  from public.caso_etapas ce
  join public.casos c on c.id = ce.caso_id
  where ce.id = p_caso_etapa_id;

  if not found then
    raise exception 'caso_etapa % não encontrada.', p_caso_etapa_id;
  end if;

  if v_tipo not in ('edicao_video', 'album', 'click_home') then
    raise exception 'Anexos ficam nos pedidos do vídeo do MASTER, do Foto/Livro e do New Born.';
  end if;

  if v_status = 'cancelado' then
    raise exception 'Este caso foi cancelado.';
  end if;

  if v_nome = '' then
    raise exception 'Falta o nome do arquivo.';
  end if;

  -- O arquivo tem de estar na pasta DESTA etapa — o outro lado da policy de
  -- upload: ninguém pendura na lista o arquivo de outro pedido.
  if p_caminho is null or p_caminho not like p_caso_etapa_id::text || '/%' then
    raise exception 'O arquivo não é deste pedido.';
  end if;

  -- O tamanho e o formato vêm do Storage, não de quem chama.
  select o.metadata into v_metadata
  from storage.objects o
  where o.bucket_id = 'pedidos'
    and o.name = p_caminho;

  if not found then
    raise exception 'O arquivo não chegou ao servidor. Tente anexar de novo.';
  end if;

  v_tamanho := coalesce((v_metadata ->> 'size')::bigint, 0);
  v_mime    := coalesce(nullif(v_metadata ->> 'mimetype', ''), 'application/octet-stream');

  if v_tamanho <= 0 then
    raise exception 'O arquivo chegou vazio. Tente anexar de novo.';
  end if;

  insert into public.anexos_da_etapa (caso_etapa_id, caminho, nome, tipo_mime, tamanho, enviado_por)
  values (p_caso_etapa_id, p_caminho, left(v_nome, 200), v_mime, v_tamanho, v_pessoa_id)
  returning id into v_id;

  insert into public.eventos (caso_id, caso_etapa_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    v_caso_id, p_caso_etapa_id, v_pessoa_id, 'anexo_adicionado',
    jsonb_build_object('caso_etapa_id', p_caso_etapa_id, 'tipo', v_tipo, 'anexo_id', v_id,
                       'nome', left(v_nome, 200), 'tipo_mime', v_mime, 'tamanho', v_tamanho),
    now()
  );

  return v_id;
end;
$$;

comment on function public.registrar_anexo_da_etapa(uuid, text, text) is
  'Põe na lista um arquivo já enviado ao bucket pedidos, na pasta da etapa (vídeo do MASTER, Foto/Livro ou New Born). Tamanho e formato lidos do Storage. Qualquer pessoa ativa.';

revoke all on function public.registrar_anexo_da_etapa(uuid, text, text) from public;
revoke all on function public.registrar_anexo_da_etapa(uuid, text, text) from anon;
grant execute on function public.registrar_anexo_da_etapa(uuid, text, text) to authenticated;


-- -----------------------------------------------------------------------------
-- 5. Remover
-- -----------------------------------------------------------------------------

create function public.remover_anexo_da_etapa(p_anexo_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pessoa_id uuid;
  v_anexo     public.anexos_da_etapa%rowtype;
  v_caso_id   uuid;
  v_tipo      public.etapa_tipo;
begin
  select p.id into v_pessoa_id
  from public.pessoas p
  where p.auth_user_id = auth.uid()
    and p.ativo;

  if v_pessoa_id is null then
    raise exception 'Usuário autenticado não corresponde a nenhuma pessoa ativa.';
  end if;

  select * into v_anexo
  from public.anexos_da_etapa a
  where a.id = p_anexo_id
  for update;

  if not found then
    raise exception 'Este anexo já foi apagado.';
  end if;

  if v_anexo.enviado_por <> v_pessoa_id
     and not (public.eh_atendimento() or public.eh_adm()) then
    raise exception 'Quem apaga um anexo é quem o enviou, o atendimento ou a gestão.';
  end if;

  select ce.caso_id, ce.tipo into v_caso_id, v_tipo
  from public.caso_etapas ce
  where ce.id = v_anexo.caso_etapa_id;

  delete from public.anexos_da_etapa where id = p_anexo_id;

  insert into public.eventos (caso_id, caso_etapa_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    v_caso_id, v_anexo.caso_etapa_id, v_pessoa_id, 'anexo_removido',
    jsonb_build_object('caso_etapa_id', v_anexo.caso_etapa_id, 'tipo', v_tipo, 'anexo_id', p_anexo_id,
                       'nome', v_anexo.nome, 'enviado_por', v_anexo.enviado_por),
    now()
  );

  -- O caminho volta para a tela apagar o arquivo do bucket — a policy de
  -- remoção só aceita agora que a linha saiu.
  return v_anexo.caminho;
end;
$$;

comment on function public.remover_anexo_da_etapa(uuid) is
  'Tira um anexo da lista dos pedidos e devolve o caminho do arquivo, que a tela apaga do bucket em seguida. Quem enviou, o atendimento ou a gestão.';

revoke all on function public.remover_anexo_da_etapa(uuid) from public;
revoke all on function public.remover_anexo_da_etapa(uuid) from anon;
grant execute on function public.remover_anexo_da_etapa(uuid) to authenticated;
