-- =============================================================================
-- "ALTERAÇÕES REALIZADAS" NO FOTO/LIVRO (27/11/2026, pedido do gestor)
-- =============================================================================
--
-- Depois de um pedido de alterações, a prova corrigida precisa de uma coluna
-- própria — "enviar pro cliente, alterações realizadas" —, para o sino chamar
-- quem manda a prova à família. Só o valor, nesta migration: um valor de enum
-- novo não pode ser usado na mesma transação que o cria. O resto está na
-- seguinte (20261127120002).
-- =============================================================================

alter type public.fase_album add value if not exists 'alteracoes_realizadas' after 'pedido_de_alteracoes';
