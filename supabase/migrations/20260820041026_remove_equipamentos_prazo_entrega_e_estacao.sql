-- =============================================================================
-- Remove o módulo de equipamentos, adiciona prazo de entrega ao pacote e um
-- rótulo livre de estação em caso_etapas.
--
-- Equipamento saiu do escopo: era controle da planilha, não do sistema.
-- Consequências documentais pendentes (CLAUDE.md e docs/plano.md ainda não
-- refletem esta remoção): o indicador de ocupação de estação, a constraint de
-- exclusividade de estação e o login por PIN validado contra
-- equipamentos.device_token deixam de existir.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. caso_etapas — remove as três colunas de equipamento
--
-- Dropar estacao_id derruba junto o índice único parcial que garantia
-- exclusividade da estação de edição. Explícito aqui para que a remoção fique
-- legível no histórico, e não como efeito colateral de um DROP COLUMN.
-- -----------------------------------------------------------------------------

drop index if exists public.caso_etapas_estacao_exclusiva;

alter table public.caso_etapas
  drop column if exists equipamento_captura_id,
  drop column if exists cartao_id,
  drop column if exists estacao_id;

-- Os índices idx_caso_etapas_equipamento, idx_caso_etapas_cartao e
-- idx_caso_etapas_estacao caem automaticamente com suas colunas.


-- -----------------------------------------------------------------------------
-- 1b. caso_etapas — rótulo de estação para continuidade de trabalho
--
-- NÃO é a métrica de ocupação de estação, que foi removida de propósito no
-- bloco acima e não volta por aqui. Não existe cadastro de estações, então não
-- há denominador: nada neste schema permite calcular "% do turno com as
-- máquinas em uso". Isto é um rótulo, e só.
--
-- Problema que resolve: uma editora deixa o trabalho pela metade num PC, o
-- turno vira, e a próxima precisa saber em qual PC continuar.
--
-- Texto livre de propósito: sem FK, sem enum, sem tabela. Os valores são os
-- rótulos que a equipe já usa no dia a dia ('PC2', 'PC VÍDEO', 'PC-6') e vão
-- variar de grafia. Normalizar exigiria o cadastro que acabou de sair.
--
-- Comportamento esperado na UI — DOCUMENTADO, NÃO IMPLEMENTADO AQUI:
--   1. O Quadro exibe o rótulo no card da etapa de edição: 'EDITAR — PC2'.
--   2. Ao iniciar uma etapa de edição, o valor pode ser herdado da etapa de
--      edição anterior do mesmo caso, quando houver. É sugestão de
--      preenchimento, não regra de banco: a operadora pode trocar de máquina.
-- -----------------------------------------------------------------------------

alter table public.caso_etapas
  add column estacao text;

alter table public.caso_etapas
  add constraint caso_etapas_estacao_nao_vazia
    check (estacao is null or length(btrim(estacao)) > 0);

comment on column public.caso_etapas.estacao is
  'Rótulo livre do PC de edição, para a próxima operadora saber onde continuar um trabalho pela metade. Não é medição: sem cadastro de estações não há como derivar ocupação. Herdável da etapa de edição anterior do mesmo caso.';


-- -----------------------------------------------------------------------------
-- 2. eventos — solta o vínculo com equipamentos, preserva o dado
--
-- device_id não estava na lista de remoção e continua útil: identifica qual
-- aparelho emitiu o evento, que é dado de auditoria independente de existir um
-- cadastro de equipamentos. Some apenas a integridade referencial.
-- -----------------------------------------------------------------------------

alter table public.eventos
  drop constraint if exists eventos_device_id_fkey;

comment on column public.eventos.device_id is
  'Identificador do aparelho que emitiu o evento. Sem FK desde a remoção do cadastro de equipamentos — é um identificador opaco, não uma referência resolvível.';


-- -----------------------------------------------------------------------------
-- 3. Remove a tabela e o enum de equipamentos
--
-- O DROP TABLE derruba junto o índice idx_equipamentos_maternidade, a trigger
-- set_updated_at e a configuração de RLS da tabela.
-- -----------------------------------------------------------------------------

drop table if exists public.equipamentos;

drop type if exists public.tipo_equipamento;


-- -----------------------------------------------------------------------------
-- 4. pacotes — prazo de entrega (SLA do produto)
--
-- Nullable por enquanto: os valores reais entram no seed.
-- -----------------------------------------------------------------------------

alter table public.pacotes
  add column prazo_entrega interval;

alter table public.pacotes
  add constraint pacotes_prazo_entrega_positivo
    check (prazo_entrega is null or prazo_entrega > interval '0');

comment on column public.pacotes.prazo_entrega is
  'SLA de entrega do pacote. O vencimento de um caso é DERIVADO, nunca armazenado: concluido_em da caso_etapa de tipo nascimento, somado a este intervalo. Guardar o vencimento calculado congelaria o SLA antigo — derivando, mudar o prazo do pacote recalcula todos os casos sozinho.';


-- -----------------------------------------------------------------------------
-- 5. etapa_tipo — nenhuma alteração
--
-- Conferido: o enum já cobre entrada, nascimento, banho, fechamento,
-- edicao_foto, edicao_video e reels. Nada a fazer.
-- -----------------------------------------------------------------------------
