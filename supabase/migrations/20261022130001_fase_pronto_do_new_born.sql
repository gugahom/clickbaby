-- =============================================================================
-- "PRONTO PARA ENTREGA" NO NEW BORN (22/10/2026, pedido do gestor)
-- =============================================================================
--
-- "Quando ele chega em enviar para escolha, ele já vem para Entregáveis — só
-- que o cliente ainda não escolheu as fotos." Falta a última coluna que o
-- Foto/Livro já tem: Pronto para entrega. Só o valor, nesta migration: um valor
-- de enum novo não pode ser usado na mesma transação que o cria. As funções que
-- o usam estão na seguinte (20261022130002).
-- =============================================================================

alter type public.fase_click_home add value if not exists 'pronto_para_entrega' before 'finalizado';
