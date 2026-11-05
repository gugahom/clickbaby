-- =============================================================================
-- "EDITAR SELEÇÃO" NO NEW BORN (05/11/2026, pedido do gestor)
-- =============================================================================
--
-- "Naquela primeira edição ela faz só uma pré-seleção. E aqui é a edição de
-- verdade para entregar para o cliente." Falta a coluna entre a escolha da
-- família e o Pronto para entrega. Só o valor, nesta migration: um valor de enum
-- novo não pode ser usado na mesma transação que o cria. O resto está na
-- seguinte (20261105120002).
-- =============================================================================

alter type public.fase_click_home add value if not exists 'editar_selecao' before 'pronto_para_entrega';
