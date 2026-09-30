-- =============================================================================
-- A ETAPA "ACOMPANHAMENTO" — EVENTO e NEWBORN (30/09/2026, pedido do gestor).
-- Esta migration só ACRESCENTA os valores de enum; o uso (ordem, trilha,
-- pacotes, view) fica na seguinte, de propósito: ADD VALUE não pode ser usado
-- na mesma transação em que é declarado (mesma nota da 20260922212852).
--
-- Uma etapa só, de play e concluir, para o que não é parto: a cobertura de um
-- EVENTO (depois vem a edição de fotos e o reels, como num caso) e o ensaio
-- NEWBORN na casa da família (depois vem a seção New Born). Nenhuma das etapas
-- que existem serve — entrada e nascimento carregam fases de parto, e o
-- nascimento é a régua do prazo e da contagem de partos.
--
-- E o item do ranking por pontos, para a régua ter onde dar peso a ela (nasce
-- sem peso, como o New Born e a revisão, até a gestão decidir).
-- =============================================================================

alter type public.etapa_tipo add value 'acompanhamento';

alter type public.item_de_pontuacao add value 'acompanhamento';
