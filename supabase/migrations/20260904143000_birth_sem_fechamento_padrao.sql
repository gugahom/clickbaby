-- =============================================================================
-- O FECHAMENTO SAI DO PADRÃO DO BIRTH E DO BIRTH + REELS.
--
-- Decisão do gestor em 04/09/2026: nos pacotes BASIC e BIRTH o fechamento é
-- OPCIONAL — entra por `adicionar_etapa` no caso em que acontecer, não vem de
-- fábrica no checklist.
--
-- A FAMÍLIA BASIC JÁ ESTAVA ASSIM: `basic`, `basic-reels-venda` e
-- `basic-reels-contrato` nunca tiveram fechamento em `pacote_etapas`,
-- conferido no remoto antes de escrever isto. Esta migration mexe só nos dois
-- BIRTH, que ganharam a etapa na 20260827190426.
--
-- ISTO REVERTE A 20260827190426, e a reversão é o ponto. Aquela migration
-- acrescentou o fechamento porque "na prática há fechamento e ele não estava
-- sendo registrado" — verdade em 27/08. A prática de sete dias mostrou o
-- contrário: no BIRTH ele é exceção, e uma etapa que quase sempre precisa ser
-- dispensada é ruído no checklist, não registro. Fato do domínio muda por
-- decisão de quem opera; a migration antiga continua no histórico dizendo o que
-- se sabia naquele dia.
--
-- A CONSEQUÊNCIA QUE A 20260827190426 AVISOU se desfaz junto: fechamento é o
-- gatilho da rodada 2 de edição (20260827172830), então um BIRTH volta a não
-- ter segunda rodada de fábrica. Quem acrescentar o fechamento pela tela e
-- concluí-lo continua ganhando a rodada 2 — a trigger não mudou.
--
-- O QUE ESTA MIGRATION NÃO FAZ: tocar em caso que já existe. Mesma escolha da
-- 20260903193219, um dia atrás, pelo mesmo motivo. No remoto há 19 fechamentos
-- CONCLUÍDOS em casos BIRTH encerrados — trabalho que aconteceu de verdade — e
-- apenas 1 pendente num caso aberto. Apagar por dedução reescreveria histórico
-- para poupar um clique; o pendente se resolve com "dispensar", que é o gesto
-- da operação para "não vai acontecer".
-- =============================================================================

delete from public.pacote_etapas pe
 using public.pacotes p
 where p.id = pe.pacote_id
   and pe.etapa_tipo = 'fechamento'
   and p.slug in ('birth', 'birth-reels');
