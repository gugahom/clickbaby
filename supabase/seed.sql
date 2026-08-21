-- Dados de cadastro para dev — pacotes e pacote_etapas, entregues pelo
-- cliente (destrava parcialmente o item 4 da seção 13 do CLAUDE.md: só
-- pacotes/pacote_etapas por enquanto, pessoas e maternidades continuam
-- pendentes). Roda depois de todas as migrations (supabase/config.toml,
-- [db.seed]) — nunca via migration, porque isto é dado, não schema.
--
-- "Vídeo de venda" (BASIC + REELS) vs "vídeo de contrato" (BASIC REELS) é a
-- mesma etapa de trabalho (edicao_video) em pacotes diferentes — seção 2 do
-- CLAUDE.md. slug distingue os dois só para ter uma chave única legível.
--
-- obrigatoria = true em toda etapa por enquanto: o cliente não diferenciou
-- etapas opcionais dentro de um pacote nesta entrega.

insert into public.pacotes (nome, slug, prazo_entrega) values
  ('BASIC',          'basic',                 interval '48 hours'),
  ('BASIC + REELS',  'basic-reels-venda',     interval '48 hours'),
  ('BASIC REELS',    'basic-reels-contrato',  interval '48 hours'),
  ('STANDARD',       'standard',              interval '48 hours'),
  ('BABY REELS',     'baby-reels',            interval '48 hours'),
  ('MASTER',         'master',                interval '7 days'),
  ('MASTER + ÁLBUM', 'master-album',          interval '7 days'),
  ('BIRTH',          'birth',                 interval '24 hours');

with etapas(slug, etapa_tipo, ordem) as (
  values
    ('basic', 'entrada'::public.etapa_tipo, 1),
    ('basic', 'nascimento'::public.etapa_tipo, 2),

    ('basic-reels-venda', 'entrada'::public.etapa_tipo, 1),
    ('basic-reels-venda', 'nascimento'::public.etapa_tipo, 2),
    ('basic-reels-venda', 'edicao_video'::public.etapa_tipo, 3),

    ('basic-reels-contrato', 'entrada'::public.etapa_tipo, 1),
    ('basic-reels-contrato', 'nascimento'::public.etapa_tipo, 2),
    ('basic-reels-contrato', 'edicao_video'::public.etapa_tipo, 3),

    ('standard', 'entrada'::public.etapa_tipo, 1),
    ('standard', 'nascimento'::public.etapa_tipo, 2),
    ('standard', 'banho'::public.etapa_tipo, 3),
    ('standard', 'fechamento'::public.etapa_tipo, 4),

    ('baby-reels', 'entrada'::public.etapa_tipo, 1),
    ('baby-reels', 'nascimento'::public.etapa_tipo, 2),
    ('baby-reels', 'banho'::public.etapa_tipo, 3),
    ('baby-reels', 'fechamento'::public.etapa_tipo, 4),
    ('baby-reels', 'edicao_video'::public.etapa_tipo, 5),

    ('master', 'entrada'::public.etapa_tipo, 1),
    ('master', 'nascimento'::public.etapa_tipo, 2),
    ('master', 'banho'::public.etapa_tipo, 3),
    ('master', 'fechamento'::public.etapa_tipo, 4),
    ('master', 'edicao_video'::public.etapa_tipo, 5),

    ('master-album', 'entrada'::public.etapa_tipo, 1),
    ('master-album', 'nascimento'::public.etapa_tipo, 2),
    ('master-album', 'banho'::public.etapa_tipo, 3),
    ('master-album', 'fechamento'::public.etapa_tipo, 4),
    ('master-album', 'edicao_video'::public.etapa_tipo, 5),
    ('master-album', 'album'::public.etapa_tipo, 6),

    ('birth', 'nascimento'::public.etapa_tipo, 1),
    ('birth', 'edicao_video'::public.etapa_tipo, 2)
)
insert into public.pacote_etapas (pacote_id, etapa_tipo, ordem, obrigatoria)
select p.id, e.etapa_tipo, e.ordem, true
from etapas e
join public.pacotes p on p.slug = e.slug;
