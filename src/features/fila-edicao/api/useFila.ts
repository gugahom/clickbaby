import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { normalizarItem, type ItemFila } from '../types'

/**
 * Carga da fila: UMA query.
 *
 * A view `fila_edicao` já traz o caso, a etapa e o nome de quem está com ela —
 * inclusive o `vence_em`, que ela seleciona de `quadro_casos` em vez de
 * recalcular. Nada de segunda ida ao banco para descobrir responsável ou prazo.
 *
 * A ordenação vai no `.order()` e não na view de propósito: a view diz o que
 * EXISTE, a tela diz o que aparece e em que ordem — mesma separação do Quadro.
 *
 * `nullsFirst: false` é a regra da fila em uma linha: caso cujo nascimento não
 * foi concluído não tem prazo correndo e não disputa urgência com quem tem, mas
 * continua visível para a Sarah distribuir com antecedência.
 */
export const chavesFila = {
  todos: ['fila-edicao'] as const,
}

export function useFilaEdicao() {
  return useQuery({
    queryKey: chavesFila.todos,
    queryFn: async (): Promise<ItemFila[]> => {
      const { data, error } = await supabase
        .from('fila_edicao')
        .select('*')
        .order('vence_em', { ascending: true, nullsFirst: false })
      if (error) throw error
      return (data ?? []).map(normalizarItem)
    },
  })
}
