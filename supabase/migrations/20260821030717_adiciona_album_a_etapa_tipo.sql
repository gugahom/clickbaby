-- Adiciona 'album' ao enum etapa_tipo — etapa do pacote MASTER + ÁLBUM
-- (seed da próxima migration/seed.sql). ADD VALUE não pode ser combinado com
-- uso do valor novo na mesma transação; como migration e seed rodam em
-- passos/conexões separados (seed.sql só depois de todas as migrations —
-- seção 11 do CLAUDE.md), não há conflito.

alter type public.etapa_tipo add value 'album';
