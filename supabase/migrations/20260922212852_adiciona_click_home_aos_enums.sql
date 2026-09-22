-- =============================================================================
-- CLICK HOME — o ensaio newborn na casa da família (22/09/2026, pedido do
-- gestor). Esta migration só ACRESCENTA os dois valores de enum; o uso real
-- (ordem, fases, RPCs, trigger) fica na próxima, de propósito.
--
-- ADD VALUE não pode ser usado na mesma transação em que é declarado — mesma
-- nota das migrations 20260821030717 (o 'album') e 20260831133139 (as três de
-- acompanhamento).
--
-- O NOME É O DA AGENDA. Na agenda do Calendar ele aparece como sufixo de um
-- pacote — "STANDARD + CLICK HOME" —, e é assim que a equipe o chama. A
-- empresa também diz "newborn" quando fala do produto; na tela fica CLICK HOME,
-- que é a palavra que está escrita no título do evento que a equipe digita
-- (seção 2: o vocabulário da operação).
--
-- POR QUE ETAPA, E NÃO PACOTE (decisão do gestor). "STANDARD + CLICK HOME" é o
-- pacote STANDARD com um adicional, e o adicional combina com qualquer pacote.
-- Como PACOTE, cada combinação vendida viraria uma linha nova no cadastro
-- ("BABY REELS + CLICK HOME", "MASTER + CLICK HOME", …) e a mesma família
-- ficaria com dois casos ou com o pacote errado. Como ETAPA, é o que ela é: um
-- trabalho a mais dentro do MESMO caso, com seção própria, como o vídeo do
-- MASTER e o Foto/Livro.
--
-- O ENTREGÁVEL é a galeria de escolha — o link que a família abre para escolher
-- as fotos do ensaio. Tipo próprio, pela regra de sempre: a lista de links
-- precisa dizer O QUE é aquele endereço, e ele não é o álbum do parto.
-- =============================================================================

alter type public.etapa_tipo add value 'click_home';

alter type public.tipo_entregavel add value 'click_home';
