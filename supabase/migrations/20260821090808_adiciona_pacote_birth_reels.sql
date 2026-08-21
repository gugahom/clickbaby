-- Novo pacote: BIRTH + REELS. Comercialmente distinto do BIRTH (é a
-- tentativa de venda que já sai com o reels incluído), mesmo tendo as
-- mesmas etapas e o mesmo SLA — por isso é um pacote próprio, não uma
-- variação do BIRTH. Mesma estratégia já registrada na seção 2 do
-- CLAUDE.md para produtos novos/combinações recorrentes.
--
-- Esta é uma migration de DADO (pacotes/pacote_etapas), não de schema —
-- foge um pouco da convenção "seed.sql é dado, migration é schema"
-- porque o remoto já tem os 8 pacotes originais inseridos via seed; uma
-- migration é o jeito de acrescentar uma linha nova a um cadastro que já
-- existe no remoto sem reaplicar o seed.sql inteiro (que duplicaria as
-- inserções de conflitaria por slug). ON CONFLICT DO NOTHING dos dois
-- lados porque supabase/seed.sql também ganha esta mesma linha, para
-- quem faz `db reset` do zero — nessa ordem (migrations sempre antes do
-- seed), a migration insere primeiro e o seed vira no-op.

insert into public.pacotes (nome, slug, prazo_entrega)
values ('BIRTH + REELS', 'birth-reels', interval '24 hours')
on conflict (slug) do nothing;

insert into public.pacote_etapas (pacote_id, etapa_tipo, ordem, obrigatoria)
select p.id, e.etapa_tipo, e.ordem, true
from public.pacotes p
cross join (
  values
    ('nascimento'::public.etapa_tipo, 1),
    ('edicao_video'::public.etapa_tipo, 2)
) as e(etapa_tipo, ordem)
where p.slug = 'birth-reels'
on conflict (pacote_id, etapa_tipo) do nothing;
