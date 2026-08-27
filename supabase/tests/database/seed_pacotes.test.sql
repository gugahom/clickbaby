-- pgTAP: valida o seed de pacotes/pacote_etapas (supabase/seed.sql) através
-- da trigger gerar_caso_etapas — cria um caso por pacote e confere que as
-- caso_etapas saem na quantidade e ordem certas. Roda como o papel
-- privilegiado da conexão de teste (sem simulação de papel: aqui o alvo é
-- dado de seed + trigger, não RLS).
--
-- Depende de supabase/seed.sql já ter rodado (é isso que supabase test db
-- faz: reset aplica migrations, depois seed, depois os testes).

begin;
select plan(14);

insert into public.maternidades (nome, sigla)
values ('Maternidade Seed Test', 'SEEDTEST');

select is(
  (select count(*)::int from public.pacotes),
  9,
  'seed cria os 9 pacotes'
);

-- Eram 7 dias corridos, valor que o próprio seed marcava como provisório.
-- Viraram 10 DIAS ÚTEIS em 27/08/2026, confirmado com o gestor (migration
-- 20260827135656). Dia útil não cabe num interval, então estes dois deixaram
-- de ter prazo_entrega — é o que a constraint pacotes_prazo_exclusivo obriga.
select is(
  (select array_agg(slug order by slug) from public.pacotes where prazo_dias_uteis = 10),
  array['master', 'master-album'],
  'MASTER e MASTER + ÁLBUM entregam em 10 dias úteis'
);

select is(
  (select count(*)::int from public.pacotes where prazo_entrega is not null and prazo_dias_uteis is not null),
  0,
  'nenhum pacote tem os dois prazos — um pacote, uma régua'
);

select is(
  (select array_agg(slug order by slug) from public.pacotes where prazo_entrega = interval '24 hours'),
  array['birth', 'birth-reels'],
  'BIRTH e BIRTH + REELS têm prazo de 24h'
);

select is(
  (select array_agg(slug order by slug) from public.pacotes where prazo_entrega = interval '48 hours'),
  array['baby-reels', 'basic', 'basic-reels-contrato', 'basic-reels-venda', 'standard'],
  'os 5 pacotes de intervalo restantes entregam em 48h'
);

-- Um caso por pacote, via slug — a trigger gera as caso_etapas na hora.
insert into public.casos (mae_nome, pacote_id, maternidade_id)
select 'Mãe Seed ' || p.slug, p.id, m.id
from public.pacotes p
cross join (select id from public.maternidades where sigla = 'SEEDTEST') m;

select is(
  (select array_agg(ce.tipo order by ce.ordem) from public.caso_etapas ce join public.casos c on c.id = ce.caso_id where c.mae_nome = 'Mãe Seed basic'),
  array['entrada', 'nascimento', 'edicao_foto', 'reels']::public.etapa_tipo[],
  'BASIC: campo (entrada, nascimento) + edição (foto, reels)'
);

select is(
  (select array_agg(ce.tipo order by ce.ordem) from public.caso_etapas ce join public.casos c on c.id = ce.caso_id where c.mae_nome = 'Mãe Seed basic-reels-venda'),
  array['entrada', 'nascimento', 'edicao_foto', 'reels']::public.etapa_tipo[],
  'BASIC + REELS: mesmas etapas do BASIC — o reels já é de todos, a diferença é comercial'
);

select is(
  (select array_agg(ce.tipo order by ce.ordem) from public.caso_etapas ce join public.casos c on c.id = ce.caso_id where c.mae_nome = 'Mãe Seed basic-reels-contrato'),
  array['entrada', 'nascimento', 'edicao_foto', 'reels']::public.etapa_tipo[],
  'BASIC REELS: idem — os três BASIC convergiram porque reels deixou de ser opcional'
);

select is(
  (select array_agg(ce.tipo order by ce.ordem) from public.caso_etapas ce join public.casos c on c.id = ce.caso_id where c.mae_nome = 'Mãe Seed standard'),
  array['entrada', 'nascimento', 'banho', 'fechamento', 'edicao_foto', 'reels']::public.etapa_tipo[],
  'STANDARD: campo completo + foto e reels'
);

select is(
  (select array_agg(ce.tipo order by ce.ordem) from public.caso_etapas ce join public.casos c on c.id = ce.caso_id where c.mae_nome = 'Mãe Seed baby-reels'),
  array['entrada', 'nascimento', 'banho', 'fechamento', 'edicao_foto', 'reels']::public.etapa_tipo[],
  'BABY REELS: campo completo + foto e reels'
);

select is(
  (select array_agg(ce.tipo order by ce.ordem) from public.caso_etapas ce join public.casos c on c.id = ce.caso_id where c.mae_nome = 'Mãe Seed master'),
  array['entrada', 'nascimento', 'banho', 'fechamento', 'edicao_foto', 'reels', 'edicao_video']::public.etapa_tipo[],
  'MASTER: o único com edicao_video — o horizontal, além do reels que todos têm'
);

select is(
  (select array_agg(ce.tipo order by ce.ordem) from public.caso_etapas ce join public.casos c on c.id = ce.caso_id where c.mae_nome = 'Mãe Seed master-album'),
  array['entrada', 'nascimento', 'banho', 'fechamento', 'edicao_foto', 'reels', 'edicao_video', 'album']::public.etapa_tipo[],
  'MASTER + ÁLBUM: tudo do MASTER mais o álbum'
);

select is(
  (select array_agg(ce.tipo order by ce.ordem) from public.caso_etapas ce join public.casos c on c.id = ce.caso_id where c.mae_nome = 'Mãe Seed birth'),
  array['nascimento', 'edicao_foto', 'reels']::public.etapa_tipo[],
  'BIRTH: sem entrada (venda no pós-parto), mas com foto e reels'
);

select is(
  (select array_agg(ce.tipo order by ce.ordem) from public.caso_etapas ce join public.casos c on c.id = ce.caso_id where c.mae_nome = 'Mãe Seed birth-reels'),
  array['nascimento', 'edicao_foto', 'reels']::public.etapa_tipo[],
  'BIRTH + REELS: idênticas ao BIRTH — pacote comercialmente distinto, mesmo trabalho'
);

select * from finish();
rollback;
