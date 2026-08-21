-- pgTAP: trigger de geração automática de caso_etapas (gerar_caso_etapas).
-- Rodar com `supabase test db` (requer ambiente local com Docker — este
-- projeto não tem um hoje; ver seção 11 do CLAUDE.md). Tudo dentro de uma
-- transação revertida no final: não deixa dado de teste no banco.

begin;
select plan(6);

-- ---------------------------------------------------------------------------
-- Fixtures: maternidade e pacote de teste com 3 etapas fora de ordem de
-- inserção, para a asserção de ordem não passar por acidente.
-- ---------------------------------------------------------------------------

insert into public.maternidades (nome, sigla)
values ('Maternidade Teste Trigger', 'MATTRIG');

insert into public.pacotes (nome, slug)
values ('Pacote Teste Trigger', 'pacote-teste-trigger');

insert into public.pacote_etapas (pacote_id, etapa_tipo, ordem)
select id, 'fechamento', 3 from public.pacotes where slug = 'pacote-teste-trigger';
insert into public.pacote_etapas (pacote_id, etapa_tipo, ordem)
select id, 'entrada', 1 from public.pacotes where slug = 'pacote-teste-trigger';
insert into public.pacote_etapas (pacote_id, etapa_tipo, ordem)
select id, 'nascimento', 2 from public.pacotes where slug = 'pacote-teste-trigger';


-- ---------------------------------------------------------------------------
-- Caso COM pacote: a trigger AFTER INSERT gera as 3 etapas.
-- ---------------------------------------------------------------------------

insert into public.casos (mae_nome, pacote_id, maternidade_id)
select 'Mãe Teste Trigger',
       (select id from public.pacotes where slug = 'pacote-teste-trigger'),
       (select id from public.maternidades where sigla = 'MATTRIG');

select is(
  (select count(*)::int
     from public.caso_etapas ce
     join public.casos c on c.id = ce.caso_id
    where c.mae_nome = 'Mãe Teste Trigger'),
  3,
  'gera 3 caso_etapas para um pacote de teste com 3 etapas'
);

select is(
  (select array_agg(ce.tipo order by ce.ordem)::text
     from public.caso_etapas ce
     join public.casos c on c.id = ce.caso_id
    where c.mae_nome = 'Mãe Teste Trigger'),
  '{entrada,nascimento,fechamento}',
  'gera as etapas na ordem de pacote_etapas.ordem, não na ordem de inserção'
);

select is(
  (select count(*)::int
     from public.eventos e
     join public.casos c on c.id = e.caso_id
    where c.mae_nome = 'Mãe Teste Trigger' and e.tipo = 'etapas_geradas'),
  1,
  'registra exatamente um evento etapas_geradas'
);

select is(
  (select (e.payload->>'quantidade')::int
     from public.eventos e
     join public.casos c on c.id = e.caso_id
    where c.mae_nome = 'Mãe Teste Trigger' and e.tipo = 'etapas_geradas'),
  3,
  'payload do evento registra a quantidade de etapas geradas'
);


-- ---------------------------------------------------------------------------
-- Caso SEM pacote (rascunho pendente): nasce sem etapas, sem erro. Depois,
-- confirmar o pacote (UPDATE NULL -> preenchido) gera as etapas.
-- ---------------------------------------------------------------------------

insert into public.casos (mae_nome, pacote_id, maternidade_id)
select 'Mãe Teste Rascunho',
       null,
       (select id from public.maternidades where sigla = 'MATTRIG');

select is(
  (select count(*)::int
     from public.caso_etapas ce
     join public.casos c on c.id = ce.caso_id
    where c.mae_nome = 'Mãe Teste Rascunho'),
  0,
  'caso sem pacote_id (rascunho pendente) nasce sem caso_etapas, sem erro'
);

update public.casos
   set pacote_id = (select id from public.pacotes where slug = 'pacote-teste-trigger')
 where mae_nome = 'Mãe Teste Rascunho';

select is(
  (select count(*)::int
     from public.caso_etapas ce
     join public.casos c on c.id = ce.caso_id
    where c.mae_nome = 'Mãe Teste Rascunho'),
  3,
  'confirmar o pacote de um rascunho pendente (UPDATE NULL -> preenchido) gera as etapas'
);

select * from finish();
rollback;
