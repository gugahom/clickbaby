-- =============================================================================
-- A OFERTA "BIRTH" DO COMERCIAL (01/10/2026, pedido do gestor)
-- =============================================================================
--
-- Só o valor do enum. O uso vem na migration seguinte: um valor novo de enum
-- não pode ser usado na mesma transação em que é declarado.
-- =============================================================================

alter type public.oferta_comercial add value 'birth' before 'reels';
