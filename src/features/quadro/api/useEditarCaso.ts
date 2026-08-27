import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { chavesQuadro } from './useQuadro'

export interface EdicaoDoCaso {
  casoId: string
  maeNome: string
  bebeNome: string | null
  pacoteId: string | null
  maternidadeId: string | null
}

/**
 * Completa o cadastro de um caso — tipicamente um rascunho pendente.
 *
 * POR QUE ISTO É `.update()` DIRETO E NÃO UMA RPC
 * A seção 4 do CLAUDE.md exige RPC para TRANSIÇÃO DE ESTADO: status,
 * responsável, timestamp. Nada disso é tocado aqui. Estes cinco campos são
 * DADO de cadastro, e a própria seção 5 descreve o arranjo: `casos` dá a
 * `authenticated` o `UPDATE` de nove colunas de dado, e a policy
 * `casos_update_adm` decide quem pode. `eh_adm()` inclui `gestao`, então os
 * gestores editam; um operador comum não.
 *
 * A prova de que a linha está no lugar certo é o que NÃO dá para fazer por
 * aqui: `status_operacional`, `status_entrega` e `motivo_cancelamento`
 * perderam o privilégio de UPDATE por coluna na migration 20260821065740.
 * Mesmo com adm logado, este `.update()` não alcança a máquina de estado.
 *
 * AS ETAPAS SE GERAM SOZINHAS
 * Preencher `pacote_id` num rascunho dispara `gerar_caso_etapas_on_update`
 * (migration 20260820061127), que existe exatamente para este caso: `WHEN
 * (old.pacote_id IS NULL AND new.pacote_id IS NOT NULL)`. O cliente não cria
 * etapa nenhuma — se criasse, teria duas definições de "quais etapas este
 * pacote tem", e elas divergiriam.
 *
 * Por isso a mutação não faz merge otimista: o servidor devolve mais do que
 * foi enviado (um caso que era rascunho volta com checklist de etapas), e
 * qualquer palpite local estaria errado. Invalida e redesenha.
 */
export function useEditarCaso() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ casoId, maeNome, bebeNome, pacoteId, maternidadeId }: EdicaoDoCaso) => {
      const { error } = await supabase
        .from('casos')
        .update({
          mae_nome: maeNome.trim(),
          bebe_nome: bebeNome?.trim() ? bebeNome.trim() : null,
          pacote_id: pacoteId,
          maternidade_id: maternidadeId,
        })
        .eq('id', casoId)

      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: chavesQuadro.todos })
      void queryClient.invalidateQueries({ queryKey: ['historico'] })
    },
  })
}
