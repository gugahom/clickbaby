-- Dados de cadastro para dev — pacotes, pacote_etapas e maternidades,
-- entregues pelo cliente (destrava o item 4 da seção 13 do CLAUDE.md
-- quase inteiro; só pessoas segue pendente). Roda depois de todas as
-- migrations (supabase/config.toml, [db.seed]) — nunca via migration,
-- porque isto é dado, não schema.
--
-- "Vídeo de venda" (BASIC + REELS) vs "vídeo de contrato" (BASIC REELS) é a
-- mesma etapa de trabalho (edicao_video) em pacotes diferentes — seção 2 do
-- CLAUDE.md. slug distingue os dois só para ter uma chave única legível.
--
-- obrigatoria = true em toda etapa por enquanto: o cliente não diferenciou
-- etapas opcionais dentro de um pacote nesta entrega.

-- PRAZO: intervalo fixo OU dias úteis, nunca os dois (constraint
-- pacotes_prazo_exclusivo, migration 20260827135656). MASTER e MASTER + ÁLBUM
-- entregam em 10 DIAS ÚTEIS — confirmado com o gestor em 27/08/2026, no lugar
-- dos 7 dias corridos provisórios. Os demais seguem em intervalo fixo.
--
-- Por que o valor vive AQUI e também numa migration: a migration corrige o
-- REMOTO, onde os pacotes já existiam; este bloco é quem define o valor no
-- local, porque num `db reset` do zero o seed roda DEPOIS das migrations e a
-- tabela ainda está vazia quando elas passam.
insert into public.pacotes (nome, slug, prazo_entrega, prazo_dias_uteis) values
  ('BASIC',          'basic',                 interval '48 hours', null),
  ('BASIC + REELS',  'basic-reels-venda',     interval '48 hours', null),
  ('BASIC REELS',    'basic-reels-contrato',  interval '48 hours', null),
  ('STANDARD',       'standard',              interval '48 hours', null),
  ('BABY REELS',     'baby-reels',            interval '48 hours', null),
  ('MASTER',         'master',                null,                10),
  ('MASTER + ÁLBUM', 'master-album',          null,                10),
  ('BIRTH',          'birth',                 interval '24 hours', null);

-- BIRTH + REELS entra por INSERT idempotente, não na lista acima: também é
-- inserido pela migration 20260821090808 (necessária porque o remoto já
-- tinha os 8 pacotes originais quando este 9º foi adicionado). Nesta ordem
-- (migrations sempre antes do seed), a migration insere primeiro num
-- `db reset` do zero e este bloco vira no-op — sem isso, duplicaria a
-- linha e quebraria o reset por causa da unique em pacotes.slug.
insert into public.pacotes (nome, slug, prazo_entrega)
values ('BIRTH + REELS', 'birth-reels', interval '24 hours')
on conflict (slug) do nothing;

insert into public.pacote_etapas (pacote_id, etapa_tipo, ordem, obrigatoria)
select p.id, e.etapa_tipo, public.ordem_padrao_da_etapa(e.etapa_tipo), true
from public.pacotes p
cross join (
  values
    ('nascimento'::public.etapa_tipo),
    ('edicao_foto'::public.etapa_tipo),
    ('reels'::public.etapa_tipo)
) as e(etapa_tipo)
where p.slug = 'birth-reels'
on conflict (pacote_id, etapa_tipo) do nothing;

-- ETAPAS POR PACOTE — o mapa canônico.
--
-- Três coisas que este bloco codifica, confirmadas com o gestor em 27/08/2026
-- (migration 20260827140400):
--
--   1. `edicao_foto` em TODOS os pacotes. Toda entrega tem foto editada.
--   2. `reels` em TODOS. Mesmo os pacotes que não vendem vídeo ganham reels —
--      a fotógrafa está lá e faz. Antes disto, `reels` existia no enum e não
--      era usado por ninguém.
--   3. `edicao_video` (o HORIZONTAL) só no MASTER e MASTER + ÁLBUM. É o
--      "✓ + horizontal" que a seção 2 do CLAUDE.md descreve. Até aqui, todo
--      pacote usava `edicao_video` para o que na verdade era o reels.
--
-- `ordem` não é digitada: sai de ordem_padrao_da_etapa(), para o mesmo tipo
-- ter o mesmo número em todo pacote. Buraco na sequência é esperado — um
-- BIRTH não tem entrada, então começa no 2.
with etapas(slug, etapa_tipo) as (
  values
    ('basic', 'entrada'::public.etapa_tipo),
    ('basic', 'nascimento'::public.etapa_tipo),
    ('basic', 'edicao_foto'::public.etapa_tipo),
    ('basic', 'reels'::public.etapa_tipo),

    ('basic-reels-venda', 'entrada'::public.etapa_tipo),
    ('basic-reels-venda', 'nascimento'::public.etapa_tipo),
    ('basic-reels-venda', 'edicao_foto'::public.etapa_tipo),
    ('basic-reels-venda', 'reels'::public.etapa_tipo),

    ('basic-reels-contrato', 'entrada'::public.etapa_tipo),
    ('basic-reels-contrato', 'nascimento'::public.etapa_tipo),
    ('basic-reels-contrato', 'edicao_foto'::public.etapa_tipo),
    ('basic-reels-contrato', 'reels'::public.etapa_tipo),

    ('standard', 'entrada'::public.etapa_tipo),
    ('standard', 'nascimento'::public.etapa_tipo),
    ('standard', 'banho'::public.etapa_tipo),
    ('standard', 'fechamento'::public.etapa_tipo),
    ('standard', 'edicao_foto'::public.etapa_tipo),
    ('standard', 'reels'::public.etapa_tipo),

    ('baby-reels', 'entrada'::public.etapa_tipo),
    ('baby-reels', 'nascimento'::public.etapa_tipo),
    ('baby-reels', 'banho'::public.etapa_tipo),
    ('baby-reels', 'fechamento'::public.etapa_tipo),
    ('baby-reels', 'edicao_foto'::public.etapa_tipo),
    ('baby-reels', 'reels'::public.etapa_tipo),

    ('master', 'entrada'::public.etapa_tipo),
    ('master', 'nascimento'::public.etapa_tipo),
    ('master', 'banho'::public.etapa_tipo),
    ('master', 'fechamento'::public.etapa_tipo),
    ('master', 'edicao_foto'::public.etapa_tipo),
    ('master', 'reels'::public.etapa_tipo),
    ('master', 'edicao_video'::public.etapa_tipo),

    ('master-album', 'entrada'::public.etapa_tipo),
    ('master-album', 'nascimento'::public.etapa_tipo),
    ('master-album', 'banho'::public.etapa_tipo),
    ('master-album', 'fechamento'::public.etapa_tipo),
    ('master-album', 'edicao_foto'::public.etapa_tipo),
    ('master-album', 'reels'::public.etapa_tipo),
    ('master-album', 'edicao_video'::public.etapa_tipo),
    ('master-album', 'album'::public.etapa_tipo),

    ('birth', 'nascimento'::public.etapa_tipo),
    ('birth', 'edicao_foto'::public.etapa_tipo),
    ('birth', 'reels'::public.etapa_tipo)
)
insert into public.pacote_etapas (pacote_id, etapa_tipo, ordem, obrigatoria)
select p.id, e.etapa_tipo, public.ordem_padrao_da_etapa(e.etapa_tipo), true
from etapas e
join public.pacotes p on p.slug = e.slug
on conflict (pacote_id, etapa_tipo) do update set ordem = excluded.ordem;


-- =============================================================================
-- Maternidades — lista final confirmada com o cliente. Mesmo padrão
-- idempotente do BIRTH + REELS acima: também inserida pela migration
-- 20260821113040 (fonte de verdade pro remoto), ON CONFLICT DO NOTHING
-- dos dois lados pra um `db reset` do zero não duplicar nem quebrar.
--
-- A sigla precisa casar EXATAMENTE com o que parseEventoCalendar extrai
-- do título do evento do Calendar (maiúscula, sem espaço) — são as mesmas
-- 5 siglas já cadastradas no parser (SIGLAS_MATERNIDADE em
-- supabase/functions/_shared/parse-evento.ts). Ponta do parser e ponta do
-- seed precisam concordar; é isso que
-- supabase/tests/database/seed_maternidades.test.sql prova.
-- =============================================================================

insert into public.maternidades (nome, sigla) values
  ('Brígida', 'GNDI'),
  ('Santa Cruz', 'HSC'),
  ('Nossa Senhora das Graças', 'HNSG'),
  ('Curitiba', 'CWB'),
  ('Fátima', 'HNSF')
on conflict (sigla) do nothing;
