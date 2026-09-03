-- Foto de perfil: a coluna, o bucket, a PRIMEIRA policy de storage e a RPC.
--
-- =============================================================================
-- LEIA ANTES DE MEXER — esta é a migration que a dívida #7 do CLAUDE.md previa.
--
-- Até aqui `storage.objects` não tinha policy nenhuma. Com RLS ligada isso
-- significa NEGAR TUDO, e era o estado certo enquanto nada subia arquivo. O
-- teste `buckets_privados.test.sql` afirmava essa ausência de propósito, para
-- que a primeira policy não passasse de carona — ele falha com esta migration,
-- e a atualização dele é parte do trabalho, não um efeito colateral.
--
-- O QUE ESTA MIGRATION ABRE, e o quanto:
--
--   * um bucket NOVO (`avatares`), privado, só imagem, teto de 2 MB;
--   * leitura para QUALQUER PESSOA ATIVA — a equipe precisa ver o rosto uma da
--     outra na tela de Equipe;
--   * escrita SÓ NA PRÓPRIA PASTA, e a pasta é o `auth.uid()`.
--
-- Os buckets `midias` e `comprovantes` continuam SEM POLICY, portanto negados.
-- É deliberado: eles guardam foto e vídeo de parto (seção 10 — dado sensível de
-- saúde e de menor), e abrir os três porque um precisava seria exatamente o
-- deslize que o teste existia para impedir. Cada policy nomeia o bucket.
--
-- O QUE ESTA MIGRATION NÃO CONSEGUE FAZER, e é preciso dizer:
--
-- `anon` tem SELECT, INSERT, UPDATE, DELETE e TRUNCATE em `storage.objects`,
-- herança do padrão do Supabase. A intenção era revogar isso aqui — abrir a
-- primeira porta e deixar a chave na fechadura não é uma opção. Mas a tabela
-- pertence a `supabase_storage_admin`, e `postgres` NÃO é membro dele: o
-- REVOKE roda sem erro e não revoga nada, porque só se revoga o que se
-- concedeu. Verificado no local — `set role supabase_storage_admin` devolve
-- "permission denied".
--
-- O que segura o `anon` hoje, então, é a RLS: as quatro policies abaixo são
-- todas `to authenticated`, e sem policy que o alcance ele é negado em tudo.
-- A exceção é TRUNCATE, que RLS não filtra — privilégio latente, não caminho
-- explorável (o PostgREST não expõe o schema `storage` e o storage-api usa
-- papel próprio). A issue #20 CONTINUA ABERTA por este motivo, e agora com o
-- motivo escrito: fechá-la exige rodar o revoke como o dono da tabela, fora do
-- caminho de migration.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Onde o caminho da foto mora
-- -----------------------------------------------------------------------------
-- É o CAMINHO no bucket, não uma URL. O bucket é privado, então a URL só existe
-- assinada e com validade curta (seção 10) — guardar uma aqui seria guardar um
-- segredo que expira, e a coluna passaria a mentir depois de uma hora.
alter table public.pessoas add column foto_path text;

comment on column public.pessoas.foto_path is
  'Caminho do avatar no bucket `avatares`, no formato <auth_user_id>/<arquivo>. '
  'NÃO é URL: o bucket é privado e a URL se assina na hora, com validade curta.';


-- -----------------------------------------------------------------------------
-- 2. O bucket
-- -----------------------------------------------------------------------------
-- 2 MB e só imagem. Não é regra de negócio, é guarda contra upload patológico:
-- o campo existe para um retrato, e um teto baixo é o que impede alguém de usar
-- o avatar como depósito de arquivo.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatares',
  'avatares',
  false,
  2 * 1024 * 1024,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;


-- (Não há bloco de GRANT aqui de propósito — ver a nota do cabeçalho: os
-- privilégios de `storage.objects` pertencem a `supabase_storage_admin` e não
-- se alteram por esta migration. `authenticated` já tem os verbos de que o
-- upload precisa; quem filtra é a policy.)


-- -----------------------------------------------------------------------------
-- 3. As policies — todas nomeando o bucket
-- -----------------------------------------------------------------------------
-- LEITURA: qualquer pessoa ativa vê o avatar de qualquer colega. Não é dado
-- sensível — é o rosto de quem trabalha na empresa, e a tela de Equipe existe
-- para mostrar a equipe. O que continua fechado é `midias`, que não tem policy.
create policy avatares_leitura_equipe
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'avatares' and public.eh_pessoa_ativa());

-- ESCRITA: só na própria pasta, e a pasta é o `auth.uid()`. É o que impede
-- alguém de trocar o retrato de outra pessoa — sem isto, "cada um edita o seu"
-- seria uma convenção da tela, e convenção de tela não é controle de acesso.
create policy avatares_upload_proprio
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'avatares'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and public.eh_pessoa_ativa()
  );

create policy avatares_troca_propria
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'avatares'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  )
  with check (
    bucket_id = 'avatares'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create policy avatares_remocao_propria
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'avatares'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );


-- -----------------------------------------------------------------------------
-- 4. A RPC — porque policy não filtra coluna
-- -----------------------------------------------------------------------------
-- POR QUE NÃO UMA POLICY DE "EDITA A PRÓPRIA LINHA"
-- `pessoas` tem `papel_sistema`. Uma policy de UPDATE não distingue colunas —
-- quem filtra coluna é o GRANT, e ele é por PAPEL, não por policy. Ou seja: a
-- mesma porta que deixaria a Ingrid trocar o próprio retrato a deixaria virar
-- gestão. Uma RPC `SECURITY DEFINER` que toca UMA coluna é o único jeito de dar
-- essa permissão sem dar a outra junto.
--
-- Ela NÃO sobe o arquivo: quem sobe é o cliente, direto no Storage, sob as
-- policies acima. Aqui só se registra qual caminho vale — e é por isso que a
-- função confere que o caminho está na pasta de quem chama. Sem essa conferência
-- daria para apontar o próprio perfil para o arquivo de outra pessoa, que as
-- policies de escrita impedem de sobrescrever mas não de referenciar.
create or replace function public.definir_minha_foto(p_foto_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pessoa_id uuid;
  v_uid       uuid;
begin
  v_uid := auth.uid();

  select p.id into v_pessoa_id
  from public.pessoas p
  where p.auth_user_id = v_uid
    and p.ativo;

  if v_pessoa_id is null then
    raise exception 'Usuário autenticado não corresponde a nenhuma pessoa ativa.';
  end if;

  if p_foto_path is not null
     and split_part(p_foto_path, '/', 1) <> v_uid::text then
    raise exception
      'O caminho da foto tem que estar na sua própria pasta.';
  end if;

  update public.pessoas
     set foto_path = p_foto_path
   where id = v_pessoa_id;

  insert into public.eventos (pessoa_id, tipo, payload, ocorrido_em)
  values (
    v_pessoa_id,
    'perfil_atualizado',
    jsonb_build_object('foto', p_foto_path is not null),
    now()
  );
end;
$$;

comment on function public.definir_minha_foto(text) is
  'Registra (ou limpa, com null) o caminho do avatar da própria pessoa. É RPC e '
  'não policy porque RLS não filtra coluna: uma policy de "edita a própria linha" '
  'em `pessoas` abriria junto o papel_sistema. Não sobe arquivo — o upload vai '
  'direto ao bucket `avatares` sob as policies de storage.objects.';

revoke all on function public.definir_minha_foto(text) from public;
grant execute on function public.definir_minha_foto(text) to authenticated;
