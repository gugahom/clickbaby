-- pgTAP: valida o seed de pacotes/pacote_etapas (supabase/seed.sql) através
-- da trigger gerar_caso_etapas — cria um caso por pacote e confere que as
-- caso_etapas saem na quantidade e ordem certas. Roda como o papel
-- privilegiado da conexão de teste (sem simulação de papel: aqui o alvo é
-- dado de seed + trigger, não RLS).
--
-- Depende de supabase/seed.sql já ter rodado (é isso que supabase test db
-- faz: reset aplica migrations, depois seed, depois os testes).

begin;
select plan(15);

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
  array['entrada', 'nascimento', 'banho', 'fechamento', 'edicao_foto', 'edicao_video']::public.etapa_tipo[],
  -- SEM REELS desde 20260903193219. O gestor tirou o vertical do padrão do
  -- MASTER; quando ele for vendido, entra por `adicionar_etapa`. Esta asserção
  -- dizia "além do reels que todos têm" e era verdade até aquele dia.
  'MASTER: campo completo, foto e o horizontal — sem reels de fábrica'
);

select is(
  (select array_agg(ce.tipo order by ce.ordem) from public.caso_etapas ce join public.casos c on c.id = ce.caso_id where c.mae_nome = 'Mãe Seed master-album'),
  array['entrada', 'nascimento', 'banho', 'fechamento', 'edicao_foto', 'edicao_video', 'album']::public.etapa_tipo[],
  'MASTER + ÁLBUM: tudo do MASTER mais o álbum'
);

select is(
  (select array_agg(ce.tipo order by ce.ordem) from public.caso_etapas ce join public.casos c on c.id = ce.caso_id where c.mae_nome = 'Mãe Seed birth'),
  array['nascimento', 'edicao_foto', 'reels']::public.etapa_tipo[],
  -- SEM FECHAMENTO desde 20260904143000. Ele entrou em 27/08 e saiu em 04/09:
  -- na prática é exceção no BIRTH, e etapa que quase sempre precisa ser
  -- dispensada é ruído no checklist. Entra por `adicionar_etapa` quando
  -- acontecer. Esta asserção dizia "COM fechamento" e era verdade até lá.
  'BIRTH: só nascimento e as edições — sem entrada, banho ou fechamento de fábrica'
);

select is(
  (select array_agg(ce.tipo order by ce.ordem) from public.caso_etapas ce join public.casos c on c.id = ce.caso_id where c.mae_nome = 'Mãe Seed birth-reels'),
  array['nascimento', 'edicao_foto', 'reels']::public.etapa_tipo[],
  'BIRTH + REELS: idênticas ao BIRTH — pacote comercialmente distinto, mesmo trabalho'
);

-- A REGRA, num lugar em que ela tem nome.
--
-- As asserções acima trancam a lista de cada pacote e já cobrem isto de
-- passagem; esta existe para que a regra do gestor (04/09/2026) seja
-- ENCONTRÁVEL. Quem for reintroduzir o fechamento no BASIC ou no BIRTH lê a
-- frase, não precisa deduzi-la comparando cinco arrays.
select is(
  (select array_agg(distinct p.slug order by p.slug)
     from public.pacote_etapas pe
     join public.pacotes p on p.id = pe.pacote_id
    where pe.etapa_tipo = 'fechamento'),
  array['baby-reels', 'master', 'master-album', 'standard'],
  'fechamento é de fábrica só nos 4 pacotes com acompanhamento completo — no BASIC e no BIRTH ele é opcional'
);

select * from finish();
rollback;
