-- =============================================================================
-- A TELA COMERCIAL (30/09/2026, pedido do gestor)
-- =============================================================================
--
-- Só o valor do enum. O uso (o padrão dos papéis, as ofertas, o modo comercial
-- do relatório externo) vem na migration seguinte, de propósito: um valor novo
-- de enum não pode ser usado na mesma transação em que é declarado.
-- =============================================================================

alter type public.tela add value 'comercial';
