-- =============================================================================
-- Versiona os buckets do Storage como privados.
--
-- O QUE A AUDITORIA ENCONTROU
-- Dois buckets existiam no remoto, criados em 19/08 pelo painel web:
-- `comprovantes` e `midias`. Os dois já estavam PRIVADOS, e nenhum objeto foi
-- enviado ainda — nada está exposto hoje.
--
-- O problema não era o estado, era ele não estar em lugar nenhum. Bucket criado
-- pelo painel é DADO, não schema: um `supabase db reset` local cria zero
-- buckets, e o repositório não tinha registro de que esses dois existem nem de
-- que precisam ser privados. Mesma classe de divergência que a auditoria de
-- privilégios encontrou entre local e remoto — e "privado" virava uma
-- configuração de painel que qualquer pessoa pode inverter com um clique, sem
-- deixar rastro em diff nenhum.
--
-- Depois desta migration, `public = false` é fato versionado, com teste pgTAP
-- que falha se alguém inverter.
--
-- O QUE ESTA MIGRATION NÃO FAZ
--
-- 1. NÃO cria policy em storage.objects. Hoje não existe nenhuma, e com RLS
--    habilitada isso significa negar tudo — que é o estado seguro. Nenhum
--    código do projeto sobe ou baixa arquivo ainda (a única menção a Storage é
--    dependência transitiva do SDK no deno.lock). Escrever policy para um fluxo
--    que não existe seria adivinhar quem pode o quê; ela nasce junto com o
--    primeiro upload, e aí o teste desta migration precisará ser revisto DE
--    PROPÓSITO — que é exatamente o momento de pensar no assunto.
--
-- 2. NÃO mexe nos GRANTs do schema storage. `storage.objects` tem GRANT ALL
--    para anon e authenticated, mesmo padrão que encontramos em public. A
--    diferença é que ali todos os objetos eram nossos; aqui o schema é do
--    Supabase e o próprio serviço de Storage depende desses privilégios para
--    funcionar. Apertar sem entender o que o serviço usa trocaria um risco
--    teórico (a RLS já nega tudo) por uma quebra real. Fica registrado como
--    dívida, não silenciado.
--
-- 3. NÃO remove `comprovantes`. Ver a nota abaixo.
--
-- LIMITES DE TAMANHO E TIPO
-- Os dois buckets estavam sem limite de tamanho e aceitando qualquer MIME. Não
-- é vazamento, mas é a porta por onde um upload errado entope o projeto. Os
-- limites abaixo são folgados de propósito — guarda contra o patológico, não
-- regra de negócio. Acrescentar um formato é uma migration de uma linha.
-- =============================================================================

-- `midias`: fotos e vídeo de parto. Os CEL CLICK gravam vídeo, então o teto
-- precisa caber alguns minutos de captura de celular.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'midias',
  'midias',
  false,
  1073741824, -- 1 GiB
  array['image/jpeg', 'image/png', 'image/heic', 'image/webp',
        'video/mp4', 'video/quicktime']
)
on conflict (id) do update
   set public             = false,
       file_size_limit    = excluded.file_size_limit,
       allowed_mime_types = excluded.allowed_mime_types;

-- `comprovantes`: sobra do módulo financeiro, que foi REMOVIDO do escopo
-- (migrations 20260820041026 e 20260820043748 derrubaram despesas e
-- status_financeiro; o CLAUDE.md diz para não recriar sem instrução explícita).
-- O bucket ficou órfão e está vazio.
--
-- Não é apagado aqui porque apagar é irreversível e a decisão é do cliente, não
-- desta migration. Fica privado e travado num teto pequeno enquanto isso: se
-- alguém enviar algo para um bucket de um módulo que não existe, o estrago é
-- limitado. Quando confirmarem que não volta, `delete from storage.buckets
-- where id = 'comprovantes'` numa migration própria resolve.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'comprovantes',
  'comprovantes',
  false,
  10485760, -- 10 MiB
  array['image/jpeg', 'image/png', 'application/pdf']
)
on conflict (id) do update
   set public             = false,
       file_size_limit    = excluded.file_size_limit,
       allowed_mime_types = excluded.allowed_mime_types;
