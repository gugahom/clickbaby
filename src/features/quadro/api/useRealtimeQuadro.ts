import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { chavesQuadro } from './useQuadro'

/**
 * Mantém o Quadro igual em todos os aparelhos.
 *
 * É o que o plano chama de "substituir o vidro" (seção 8 de docs/plano.md): um
 * quadro branco é compartilhado por construção, uma página não é. Sem isto,
 * duas fotógrafas na mesma maternidade só descobrem o trabalho uma da outra
 * dando refresh — e o risco não é o incômodo, é as duas registrarem a mesma
 * etapa achando que a outra não registrou.
 *
 * O PAYLOAD É IGNORADO DE PROPÓSITO
 * O evento serve como sinal — "algo mudou, recarregue" — e o hook refaz a query
 * normal, sob RLS. Duas razões:
 *
 *   1. Privacidade. A linha transmitida carrega nome de mãe, nome de bebê e
 *      situação clínica (seção 10 do CLAUDE.md). O Realtime já filtra por RLS,
 *      mas não ler o payload é uma segunda camada que não depende disso.
 *   2. Correção. Metade do que o Quadro mostra é DERIVADO — vence_em sai da
 *      view, o agrupamento por dia sai do fuso, o contador sai das etapas.
 *      Aplicar um payload cru de `casos` no estado local reconstruiria essas
 *      derivações no cliente, que é exatamente o erro que a view existe para
 *      evitar. Recarregar é mais barato que manter duas verdades.
 *
 * A ESPERA ANTES DE RECARREGAR
 * O sync do Calendar insere dezenas de casos numa tacada. Sem espera, seriam
 * dezenas de refetch do Quadro inteiro em sequência. A janela agrupa a rajada
 * numa recarga só, e o custo é a tela ficar até meio segundo atrás — invisível
 * para quem está do outro lado do corredor.
 */
const ESPERA_MS = 400

export interface EstadoRealtime {
  /** Falso enquanto o canal não está escutando: a tela avisa que pode estar velha. */
  conectado: boolean
}

export function useRealtimeQuadro(): EstadoRealtime {
  const queryClient = useQueryClient()
  const [conectado, setConectado] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    function agendarRecarga() {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: chavesQuadro.todos })
      }, ESPERA_MS)
    }

    const canal = supabase
      .channel('quadro')
      // Um handler só para as duas tabelas: o Quadro não reage de formas
      // diferentes a um caso ou a uma etapa — ele recarrega.
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'casos' },
        agendarRecarga,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'caso_etapas' },
        agendarRecarga,
      )
      .subscribe((status) => {
        setConectado(status === 'SUBSCRIBED')

        // Reconectou: o que passou enquanto estávamos fora não chega como
        // evento, então recarrega uma vez para não ficar com a tela velha.
        if (status === 'SUBSCRIBED') agendarRecarga()
      })

    return () => {
      if (timer.current) clearTimeout(timer.current)
      void supabase.removeChannel(canal)
    }
  }, [queryClient])

  return { conectado }
}
