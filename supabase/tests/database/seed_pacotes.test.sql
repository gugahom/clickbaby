-- pgTAP: valida o seed de pacotes/pacote_etapas (supabase/seed.sql) através
-- da trigger gerar_caso_etapas — cria um caso por pacote e confere que as
-- caso_etapas saem na quantidade e ordem certas. Roda como o papel
-- privilegiado da conexão de teste (sem simulação de papel: aqui o alvo é
-- dado de seed + trigger, não RLS).
--
-- Depende de supabase/seed.sql já ter rodado (é isso que supabase test db
-- faz: reset aplica migrations, depois seed, depois os testes).

begin;
select plan(12);

insert into public.maternidades (nome, sigla)
values ('Maternidade Seed Test', 'SEEDTEST');

select is(
  (select count(*)::int from public.pacotes),
  8,
  'seed cria os 8 pacotes'
);

select is(
  (select array_agg(slug order by slug) from public.pacotes where prazo_entrega = interval '7 days'),
  array['master', 'master-album'],
  'MASTER e MASTER + ÁLBUM têm prazo de 7 dias'
);

select is(
  (select array_agg(slug order by slug) from public.pacotes where prazo_entrega = interval '24 hours'),
  array['birth'],
  'BIRTH tem prazo de 24h'
);

select is(
  (select array_agg(slug order by slug) from public.pacotes where prazo_entrega = interval '48 hours'),
  array['baby-reels', 'basic', 'basic-reels-contrato', 'basic-reels-venda', 'standard'],
  'os demais 5 pacotes têm prazo de 48h'
);

-- Um caso por pacote, via slug — a trigger gera as caso_etapas na hora.
insert into public.casos (mae_nome, pacote_id, maternidade_id)
select 'Mãe Seed ' || p.slug, p.id, m.id
from public.pacotes p
cross join (select id from public.maternidades where sigla = 'SEEDTEST') m;

select is(
  (select array_agg(ce.tipo order by ce.ordem) from public.caso_etapas ce join public.casos c on c.id = ce.caso_id where c.mae_nome = 'Mãe Seed basic'),
  array['entrada', 'nascimento']::public.etapa_tipo[],
  'BASIC gera 2 etapas: entrada, nascimento'
);

select is(
  (select array_agg(ce.tipo order by ce.ordem) from public.caso_etapas ce join public.casos c on c.id = ce.caso_id where c.mae_nome = 'Mãe Seed basic-reels-venda'),
  array['entrada', 'nascimento', 'edicao_video']::public.etapa_tipo[],
  'BASIC + REELS gera 3 etapas: entrada, nascimento, edicao_video'
);

select is(
  (select array_agg(ce.tipo order by ce.ordem) from public.caso_etapas ce join public.casos c on c.id = ce.caso_id where c.mae_nome = 'Mãe Seed basic-reels-contrato'),
  array['entrada', 'nascimento', 'edicao_video']::public.etapa_tipo[],
  'BASIC REELS gera 3 etapas: entrada, nascimento, edicao_video'
);

select is(
  (select array_agg(ce.tipo order by ce.ordem) from public.caso_etapas ce join public.casos c on c.id = ce.caso_id where c.mae_nome = 'Mãe Seed standard'),
  array['entrada', 'nascimento', 'banho', 'fechamento']::public.etapa_tipo[],
  'STANDARD gera 4 etapas: entrada, nascimento, banho, fechamento'
);

select is(
  (select array_agg(ce.tipo order by ce.ordem) from public.caso_etapas ce join public.casos c on c.id = ce.caso_id where c.mae_nome = 'Mãe Seed baby-reels'),
  array['entrada', 'nascimento', 'banho', 'fechamento', 'edicao_video']::public.etapa_tipo[],
  'BABY REELS gera 5 etapas: entrada, nascimento, banho, fechamento, edicao_video'
);

select is(
  (select array_agg(ce.tipo order by ce.ordem) from public.caso_etapas ce join public.casos c on c.id = ce.caso_id where c.mae_nome = 'Mãe Seed master'),
  array['entrada', 'nascimento', 'banho', 'fechamento', 'edicao_video']::public.etapa_tipo[],
  'MASTER gera 5 etapas: entrada, nascimento, banho, fechamento, edicao_video'
);

select is(
  (select array_agg(ce.tipo order by ce.ordem) from public.caso_etapas ce join public.casos c on c.id = ce.caso_id where c.mae_nome = 'Mãe Seed master-album'),
  array['entrada', 'nascimento', 'banho', 'fechamento', 'edicao_video', 'album']::public.etapa_tipo[],
  'MASTER + ÁLBUM gera 6 etapas: entrada, nascimento, banho, fechamento, edicao_video, album'
);

select is(
  (select array_agg(ce.tipo order by ce.ordem) from public.caso_etapas ce join public.casos c on c.id = ce.caso_id where c.mae_nome = 'Mãe Seed birth'),
  array['nascimento', 'edicao_video']::public.etapa_tipo[],
  'BIRTH gera 2 etapas sem entrada: nascimento, edicao_video'
);

select * from finish();
rollback;
