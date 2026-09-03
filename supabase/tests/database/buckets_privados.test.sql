-- pgTAP: buckets do Storage privados (migration 20260825062852).
--
-- Este arquivo existe para uma coisa: um bucket virar público é um clique no
-- painel web, não deixa rastro em diff nenhum, e o efeito é a galeria de parto
-- de uma família ficar acessível por URL adivinhável. A seção 10 do CLAUDE.md
-- trata isso como dado sensível de saúde e de menor.
--
-- Por isso a asserção é dupla, como foi na auditoria de privilégios: os buckets
-- que devem existir são privados, E não existe nenhum outro bucket público que
-- alguém tenha criado no caminho.
--
-- A ASSERÇÃO SOBRE POLICIES FOI CUMPRIDA E TROCADA (03/09/2026). Ela dizia que
-- `storage.objects` não tinha policy nenhuma — o estado seguro enquanto ninguém
-- subia arquivo — e existia para falhar no dia do primeiro upload, forçando
-- alguém a ler a policy nova em vez de deixá-la passar de carona. A foto de
-- perfil chegou (migration 20260903161526), o teste falhou como planejado, e o
-- que entrou no lugar é mais estreito que "existe alguma policy": as quatro
-- policies são NOMEADAS, todas presas ao bucket `avatares`, e `midias` e
-- `comprovantes` continuam sem nenhuma — portanto negados.

begin;
select plan(13);


-- =============================================================================
-- 1. Os buckets existem e estão versionados
-- =============================================================================

select ok(
  exists (select 1 from storage.buckets where id = 'midias'),
  'bucket midias existe — antes só existia no remoto, criado pelo painel'
);

select ok(
  exists (select 1 from storage.buckets where id = 'comprovantes'),
  'bucket comprovantes existe'
);


-- =============================================================================
-- 2. Privados — o ponto do arquivo
-- =============================================================================

select ok(
  not (select public from storage.buckets where id = 'midias'),
  'midias é PRIVADO: foto e vídeo de parto não se serve por URL adivinhável'
);

select ok(
  not (select public from storage.buckets where id = 'comprovantes'),
  'comprovantes é PRIVADO'
);

-- A rede de segurança: pega bucket novo criado pelo painel e já nascido
-- público, que é o modo de falha mais provável daqui pra frente.
select is(
  (select count(*)::int from storage.buckets where public),
  0,
  'NENHUM bucket público no projeto — vale para os que existem e para os que alguém criar'
);


-- =============================================================================
-- 3. Limites — guarda contra upload patológico, não regra de negócio
-- =============================================================================

select ok(
  (select file_size_limit from storage.buckets where id = 'midias') is not null,
  'midias tem teto de tamanho'
);

select ok(
  (select allowed_mime_types from storage.buckets where id = 'midias')
    @> array['video/mp4'],
  'midias aceita vídeo — os CEL CLICK gravam, e um teto que barrasse isso quebraria o uso real'
);


-- =============================================================================
-- 4. O estado das policies, afirmado de propósito
-- =============================================================================

select ok(
  (select relrowsecurity from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'storage' and c.relname = 'objects'),
  'storage.objects tem RLS habilitada'
);

select ok(
  not (select public from storage.buckets where id = 'avatares'),
  'avatares é PRIVADO — o retrato também só sai por URL assinada'
);

-- SÓ QUATRO, e todas nomeadas. Uma policy a mais aqui é uma porta que ninguém
-- discutiu; contar sem nomear deixaria trocar uma pela outra em silêncio.
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'storage' and tablename = 'objects'),
  4,
  'exatamente quatro policies em storage.objects — as do avatar, e nada além'
);

select set_eq(
  $$ select policyname::text from pg_policies
      where schemaname = 'storage' and tablename = 'objects' $$,
  array[
    'avatares_leitura_equipe',
    'avatares_upload_proprio',
    'avatares_troca_propria',
    'avatares_remocao_propria'
  ],
  'as quatro são as do avatar, pelo nome'
);

-- O ponto do arquivo, na forma que importa agora: `midias` e `comprovantes`
-- continuam sem policy, e portanto negados. Foto e vídeo de parto não foram
-- abertos de carona com o retrato.
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and (qual::text like '%midias%' or with_check::text like '%midias%'
        or qual::text like '%comprovantes%' or with_check::text like '%comprovantes%')),
  0,
  'NENHUMA policy menciona midias ou comprovantes — os dois seguem negando tudo'
);


-- =============================================================================
-- 5. Quem as policies alcançam
--
-- `anon` mantém privilégio de TABELA em storage.objects — a tabela pertence a
-- `supabase_storage_admin` e uma migration rodando como `postgres` não consegue
-- revogar (verificado: `set role` é negado). O que o segura é a RLS, e é por
-- isso que a asserção é sobre os PAPÉIS DAS POLICIES e não sobre o grant: nenhuma
-- das quatro alcança `anon`, então ele continua negado em tudo o que a RLS
-- filtra. A issue #20 segue aberta para o resto — ver o cabeçalho da migration
-- 20260903161526.
-- =============================================================================

select is(
  (select count(*)::int from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and 'anon' = any(roles)),
  0,
  'NENHUMA policy de storage.objects alcança anon — as quatro são só para authenticated'
);


select * from finish();
rollback;
