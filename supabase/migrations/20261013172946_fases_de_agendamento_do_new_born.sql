-- =============================================================================
-- AS FASES DE ANTES DO ENSAIO DO NEW BORN (13/10/2026, pedido do gestor)
-- =============================================================================
--
-- A esteira do New Born começava em "Aguardando edição", e o ensaio — que
-- acontece na casa da família, dias depois — não tinha lugar nela: um New Born
-- vendido e ainda sem data ficava "sem fase", ao lado do que já tinha data. O
-- gestor pediu as duas colunas de antes da edição:
--
--   * A AGENDAR — vendido, sem data de ensaio;
--   * AGENDADO  — com a data marcada (no dia, o ensaio aparece no Quadro).
--
-- Só os valores, nesta migration: um valor de enum novo não pode ser usado na
-- mesma transação que o cria. As funções que os usam estão na seguinte
-- (20261013172953).
-- =============================================================================

alter type public.fase_click_home add value if not exists 'a_agendar' before 'aguardando_edicao';
alter type public.fase_click_home add value if not exists 'agendado' before 'aguardando_edicao';
