-- =============================================================================
-- Fecha a dívida registrada na seção 13 do CLAUDE.md: agora que as 4 RPCs de
-- transição existem (iniciar_etapa, concluir_etapa, transferir_etapa,
-- confirmar_entrega, cancelar_caso — 5, na prática), o UPDATE direto de
-- casos nas colunas de máquina de estado é REVOGADO, não afrouxado.
--
-- POR QUE PRIVILÉGIO DE COLUNA, NÃO RLS PURA
-- RLS decide QUAIS LINHAS uma role pode tocar, não QUAIS COLUNAS. Um
-- WITH CHECK não tem acesso nativo ao valor ANTIGO da mesma linha dentro do
-- mesmo UPDATE — não é um trigger, é avaliado como um CHECK sobre a linha
-- resultante. Tentar expressar "esta coluna não pode mudar de valor" via
-- RLS pura é exatamente o tipo de policy que parece restringir mas não
-- restringe. GRANT/REVOKE UPDATE por coluna é a ferramenta certa: um UPDATE
-- que referencia no SET qualquer coluna sem privilégio falha por inteiro
-- (42501), antes da RLS ser avaliada — não é um bypass parcial silencioso.
--
-- POR QUE AS RPCs CONTINUAM FUNCIONANDO SEM EXCEÇÃO
-- SECURITY DEFINER roda como o DONO da tabela (quem aplicou as migrations),
-- que tem privilégio total sobre toda coluna independente de qualquer
-- REVOKE mirado em authenticated. As RPCs nunca passam pela parede que
-- estamos erguendo aqui.
--
-- CLASSIFICAÇÃO DAS COLUNAS DE casos
--   Máquina de estado (revogado, só RPC):
--     status_operacional, status_entrega, motivo_cancelamento
--   Dado/cadastro (adm continua editando direto):
--     mae_nome, bebe_nome, pacote_id, maternidade_id, previsao_em,
--     cor_calendar, observacao
--   PENDÊNCIA — deixadas editáveis por falta de RPC própria, não por
--   decisão de que são "dado": situacao_clinica (a seção 4 já prevê
--   atualizar_situacao_clinica, que não existe ainda) e termo_status
--   (rastreia consentimento, também sem RPC prevista). Bloquear agora
--   deixaria ninguém conseguindo atualizar esses campos.
--
-- casos_update_atendimento_confirma_entrega É DERRUBADA INTEIRA — existia
-- só como ponte manual até confirmar_entrega existir. Atendimento passa a
-- ter zero UPDATE direto em casos, igual operador; seu caminho real agora é
-- 100% via RPC (confirmar_entrega, cancelar_caso).
-- =============================================================================

revoke update on public.casos from authenticated;

grant update (
  mae_nome,
  bebe_nome,
  pacote_id,
  maternidade_id,
  previsao_em,
  cor_calendar,
  observacao,
  situacao_clinica,
  termo_status
) on public.casos to authenticated;

drop policy if exists casos_update_atendimento_confirma_entrega on public.casos;

comment on policy casos_update_adm on public.casos is
  'Correção administrativa direta, só adm. Restrita de fato pelo GRANT UPDATE por coluna acima — máquina de estado (status_operacional, status_entrega, motivo_cancelamento) não tem privilégio de coluna para authenticated, então nem adm consegue mudar por aqui, só pelas RPCs. Dívida da seção 13 do CLAUDE.md fechada por esta migration.';
