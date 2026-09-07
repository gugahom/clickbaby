-- pgTAP: trocar o pacote traz as etapas novas (migration 20260907100016).
--
-- O BUG que isto tranca: mudar um caso de BASIC para BABY REELS não
-- acrescentava banho nem fechamento — o card ficava com o checklist do pacote
-- velho e o trabalho novo não existia em lugar nenhum.
--
-- As asserções cobrem os dois lados, e o segundo é o que importa mais: a
-- trigger SÓ ACRESCENTA. Etapa do pacote antigo que o novo não prevê fica onde
-- está, porque pode ter trabalho feito — e apagar histórico para "arrumar" um
-- checklist é o pior negócio possível.

begin;
select plan(11);

-- =============================================================================
-- Fixtures
-- =============================================================================

insert into public.maternidades (nome, sigla) values ('Maternidade Pacote', 'PCTTEST');

insert into public.casos (mae_nome, pacote_id, maternidade_id)
select v.mae, (select id from public.pacotes where slug = v.slug),
       (select id from public.maternidades where sigla = 'PCTTEST')
from (values
  ('Mae Sobe', 'basic'),
  ('Mae Desce', 'baby-reels'),
  ('Mae Trabalhada', 'baby-reels')
) as v(mae, slug);

-- Um rascunho: sem pacote, e portanto sem etapa nenhuma.
insert into public.casos (mae_nome, pacote_id, maternidade_id)
select 'Mae Rascunho', null, (select id from public.maternidades where sigla = 'PCTTEST');

create function pg_temp.tipos(p_mae text) returns text language sql as $$
  select coalesce(string_agg(distinct ce.tipo::text, ', ' order by ce.tipo::text), '')
  from public.caso_etapas ce
  join public.casos c on c.id = ce.caso_id
  where c.mae_nome = p_mae;
$$;

create function pg_temp.quantas(p_mae text) returns integer language sql as $$
  select count(*)::int from public.caso_etapas ce
  join public.casos c on c.id = ce.caso_id
  where c.mae_nome = p_mae;
$$;


-- =============================================================================
-- A. Pacote MAIOR: as etapas que faltam entram.
-- =============================================================================

select is(
  pg_temp.tipos('Mae Sobe'),
  'edicao_foto, entrada, nascimento, reels',
  'TP0: o BASIC nasce sem banho e sem fechamento'
);

update public.casos
   set pacote_id = (select id from public.pacotes where slug = 'baby-reels')
 where mae_nome = 'Mae Sobe';

select is(
  pg_temp.tipos('Mae Sobe'),
  'banho, edicao_foto, entrada, fechamento, nascimento, reels',
  'TP1: virou BABY REELS e ganhou banho e fechamento — o bug que isto conserta'
);

select is(
  (select count(*)::int from public.caso_etapas ce
     join public.casos c on c.id = ce.caso_id
    where c.mae_nome = 'Mae Sobe' and ce.status <> 'pendente'),
  0,
  'TP2: as etapas novas nascem pendentes — é trabalho a fazer'
);

select is(
  (select count(*)::int from public.caso_etapas ce
     join public.casos c on c.id = ce.caso_id
    where c.mae_nome = 'Mae Sobe' and ce.rodada <> 1),
  0,
  'TP3: e na rodada 1 — não é bloco de captura novo'
);

select is(
  (select (e.payload->>'quantidade')::int from public.eventos e
     join public.casos c on c.id = e.caso_id
    where c.mae_nome = 'Mae Sobe' and e.tipo = 'etapas_do_pacote_trocado'),
  2,
  'TP4: o evento conta quantas entraram'
);


-- =============================================================================
-- B. Pacote MENOR: nada some.
--
-- É a metade que protege trabalho feito. Um BABY REELS que vira BASIC não
-- desfaz o banho que já aconteceu.
-- =============================================================================

update public.caso_etapas ce
   set status = 'concluida',
       iniciado_em = now() - interval '2 hours',
       concluido_em = now() - interval '1 hour'
  from public.casos c
 where c.id = ce.caso_id and c.mae_nome = 'Mae Trabalhada' and ce.tipo = 'banho';

update public.casos
   set pacote_id = (select id from public.pacotes where slug = 'basic')
 where mae_nome in ('Mae Desce', 'Mae Trabalhada');

select is(
  pg_temp.tipos('Mae Desce'),
  'banho, edicao_foto, entrada, fechamento, nascimento, reels',
  'TP5: virou BASIC e o banho e o fechamento CONTINUAM — dispensar é o caminho'
);

select is(
  (select ce.status::text from public.caso_etapas ce
     join public.casos c on c.id = ce.caso_id
    where c.mae_nome = 'Mae Trabalhada' and ce.tipo = 'banho'),
  'concluida',
  'TP6: e o banho JÁ CONCLUÍDO segue concluído — nada de apagar trabalho feito'
);

select is(
  (select count(*)::int from public.eventos e
     join public.casos c on c.id = e.caso_id
    where c.mae_nome = 'Mae Desce' and e.tipo = 'etapas_do_pacote_trocado'),
  0,
  'TP7: sem etapa nova, sem evento — não houve o que registrar'
);


-- =============================================================================
-- C. O que a trigger NÃO pode fazer.
-- =============================================================================

-- Trocar para o MESMO pacote não duplica nada: a condição do `when` exige que
-- os dois sejam distintos, e a checagem por tipo é a segunda rede.
select is(pg_temp.quantas('Mae Sobe'), 6, 'TP8: o caso tem seis etapas');

update public.casos
   set pacote_id = (select id from public.pacotes where slug = 'baby-reels')
 where mae_nome = 'Mae Sobe';

select is(pg_temp.quantas('Mae Sobe'), 6, 'TP9: trocar para o mesmo pacote não duplica');

-- Confirmar um RASCUNHO continua sendo da gerar_caso_etapas_on_update: se as
-- duas disparassem, o caso nasceria com as etapas em dobro.
update public.casos
   set pacote_id = (select id from public.pacotes where slug = 'standard')
 where mae_nome = 'Mae Rascunho';

select is(pg_temp.quantas('Mae Rascunho'), 6, 'TP10: o rascunho confirmado ganha as seis do STANDARD, uma vez só');

select * from finish();
rollback;
