-- =============================================================================
-- OS LINKS DE ENTREGA DO NEW BORN — os tipos (11/11/2026, pedido do gestor)
-- =============================================================================
--
-- Depois de "Editar seleção", quem editou cola o Google Fotos do New Born e o
-- WeTransfer do New Born. São tipos PRÓPRIOS, e não o `google_photos` e o
-- `wetransfer` do caso: aqueles são os do PARTO, que a conferência do envio do
-- caso exige — um ensaio terminado satisfaria a caixa com o material errado. É
-- o mesmo motivo do `video_wetransfer`.
--
-- Valor de enum novo não se usa na mesma transação em que nasce: a RPC que os
-- grava vem na migration seguinte.
-- =============================================================================

alter type public.tipo_entregavel add value if not exists 'click_home_google';
alter type public.tipo_entregavel add value if not exists 'click_home_wetransfer';
