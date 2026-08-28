-- =============================================================================
-- Três maternidades novas, pedidas pelo gestor em 28/08/2026.
--
-- Duas pontas precisam concordar, e é o que o teste
-- supabase/tests/database/seed_maternidades.test.sql cobra: a sigla aqui e a
-- sigla que o parser devolve (MATERNIDADES em
-- supabase/functions/_shared/parse-evento.ts). Se divergirem, o sync acha a
-- maternidade no título, não acha no banco, e o caso vira rascunho pendente
-- sem que nada na tela explique por quê.
--
-- SOBRE AS SIGLAS. As cinco antigas são siglas de verdade (GNDI, HSC…). Estas
-- três o gestor entregou por NOME, então a sigla é uma escolha nossa: ROCIO e
-- MACKENZIE saem do próprio nome, e "Luiza de Marilac" virou MARILAC porque é
-- a palavra que distingue. O parser aceita as duas formas escritas
-- ("MACK"/"MACKENZIE", "LUIZA DE MARILAC"/"MARILAC"), então mudar o rótulo do
-- chip depois é um UPDATE de uma linha, não uma remodelagem.
--
-- Idempotente dos dois lados, como a 20260821113040: esta migration é a fonte
-- de verdade do REMOTO, e o seed repete a lista porque num `db reset` do zero
-- ele roda depois das migrations, com a tabela ainda vazia.
-- =============================================================================

insert into public.maternidades (nome, sigla) values
  ('Rocio', 'ROCIO'),
  ('Mackenzie', 'MACKENZIE'),
  ('Luiza de Marilac', 'MARILAC')
on conflict (sigla) do nothing;
