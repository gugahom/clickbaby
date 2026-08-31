-- Três etapas novas para "adicionar etapa" (pedido do gestor, 31/08/2026):
-- ENCONTRO DE IRMÃOS, SAÍDA DE UTI, ALTA. Nenhum pacote as inclui de
-- fábrica — só existem via adicionar_etapa (migration 20260830063452), para
-- casos em que a família vive esses momentos e a equipe quer registrar o
-- trabalho e o tempo.
--
-- ADD VALUE não pode ser combinado com uso do valor novo na mesma
-- transação — mesma nota da migration 20260821030717 (o 'album'). O uso
-- real (ordem_padrao_da_etapa, trilha) fica na PRÓXIMA migration, de
-- propósito.
alter type public.etapa_tipo add value 'encontro_irmaos';
alter type public.etapa_tipo add value 'saida_uti';
alter type public.etapa_tipo add value 'alta';
