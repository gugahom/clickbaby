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
-- A asserção sobre policies é igualmente deliberada. Hoje storage.objects não
-- tem nenhuma, o que com RLS ligada significa negar tudo — o estado seguro
-- enquanto ninguém sobe arquivo. No dia em que existir upload, esta asserção
-- vai falhar, e é para falhar: a policy nova precisa ser lida por alguém antes
-- de entrar, não passar de carona.

begin;
select plan(9);


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

-- Quando o primeiro upload chegar, este teste falha. É o comportamento
-- desejado: a policy que abrir o Storage precisa ser lida por alguém, e a
-- falha aqui força essa leitura em vez de deixar passar em silêncio.
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'storage' and tablename = 'objects'),
  0,
  'nenhuma policy em storage.objects — com RLS ligada, nega tudo (estado seguro sem fluxo de upload)'
);


select * from finish();
rollback;
