-- pgTAP: valida o seed de maternidades (supabase/seed.sql) — lista final
-- confirmada com o cliente. A sigla precisa casar EXATAMENTE com o que o
-- parser (_shared/parse-evento.ts) extrai do título do evento do
-- Calendar; ver supabase/functions/sync-calendar/logica.test.ts para o
-- teste ponta a ponta com o parser de verdade (pgTAP não consegue chamar
-- TypeScript, então esta metade só confere o lado do banco).

begin;
select plan(7);

select is(
  (select count(*)::int from public.maternidades where sigla in ('GNDI', 'HSC', 'HNSG', 'HNSF', 'CWB')),
  5,
  'as 5 maternidades da lista final confirmada estão cadastradas'
);

select is((select nome from public.maternidades where sigla = 'GNDI'), 'Brígida', 'GNDI -> Brígida');
select is((select nome from public.maternidades where sigla = 'HSC'), 'Santa Cruz', 'HSC -> Santa Cruz');
select is((select nome from public.maternidades where sigla = 'HNSG'), 'Nossa Senhora das Graças', 'HNSG -> Nossa Senhora das Graças');
select is((select nome from public.maternidades where sigla = 'CWB'), 'Curitiba', 'CWB -> Curitiba');
select is((select nome from public.maternidades where sigla = 'HNSF'), 'Fátima', 'HNSF -> Fátima');

-- Ponta do banco do teste ponta a ponta: para o título
-- "MARIA/JOÃO BASIC HNSG", o parser extrai maternidade_sigla = 'HNSG'
-- (provado com o parser de verdade em
-- supabase/functions/sync-calendar/logica.test.ts). Aqui confirmamos que
-- essa sigla resolve para uma maternidade real no banco, do mesmo jeito
-- que resolverMaternidadeId faria (comparação case-insensitive).
select ok(
  exists(select 1 from public.maternidades where upper(sigla) = upper('HNSG')),
  'sigla extraída do título "MARIA/JOÃO BASIC HNSG" (HNSG) encontra a maternidade no banco'
);

select * from finish();
rollback;
