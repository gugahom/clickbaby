import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { agendarRecargaDoCaso, agendarRecargaDoQuadro } from './recarga'
import { casoDaEtapa } from './atualizar-por-caso'

/**
 * Mantém o Quadro igual em todos os aparelhos.
 *
 * É o que o plano chama de "substituir o vidro" (seção 8 de docs/plano.md): um
 * quadro branco é compartilhado por construção, uma página não é. Sem isto,
 * duas fotógrafas na mesma maternidade só descobrem o trabalho uma da outra
 * dando refresh — e o risco não é o incômodo, é as duas registrarem a mesma
 * etapa achando que a outra não registrou.
 *
 * O PAYLOAD É IGNORADO DE PROPÓSITO — MENOS O ID (18/09/2026)
 * O evento serve como sinal — "este caso mudou, recarregue-o" — e o hook refaz
 * a query normal, sob RLS, só daquele caso (ver atualizar-por-caso.ts). Do
 * payload sai o `id` do caso, ou o `caso_id` da etapa, e mais nada. As razões
 * para não usar o resto continuam as mesmas:
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
 *
 * DESDE 18/09/2026 A JANELA É COMPARTILHADA com as ações da própria tela
 * (`agendarRecargaDoQuadro`, em recarga.ts). Antes cada lado tinha a sua, e
 * quem agia recarregava o Quadro inteiro duas vezes por toque — uma no sucesso
 * da ação, outra no eco do Realtime. Ver o diagnóstico em recarga.ts.
 */

export interface EstadoRealtime {
  /** Falso enquanto o canal não está escutando: a tela avisa que pode estar velha. */
  conectado: boolean
}

/**
 * O único campo que se lê do payload. `new` traz a linha em INSERT e UPDATE;
 * `old` traz só a chave primária em DELETE (é o padrão do Postgres sem
 * `replica identity full`) — por isso a etapa apagada chega sem `caso_id`.
 */
function lerId(registro: unknown, campo: 'id' | 'caso_id'): string | null {
  if (typeof registro !== 'object' || registro === null) return null
  const valor = (registro as Record<string, unknown>)[campo]
  return typeof valor === 'string' && valor !== '' ? valor : null
}

interface Aviso {
  new: unknown
  old: unknown
}

export function useRealtimeQuadro(): EstadoRealtime {
  const queryClient = useQueryClient()
  const [conectado, setConectado] = useState(false)

  useEffect(() => {
    // Aviso que não diz de que caso se trata vira a recarga completa de antes:
    // é raro, e adivinhar o caso seria pior que recarregar.
    const avisar = (casoId: string | null) => {
      if (casoId) agendarRecargaDoCaso(queryClient, casoId)
      else agendarRecargaDoQuadro(queryClient)
    }

    const canal = supabase
      .channel('quadro')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'casos' },
        (aviso: Aviso) => avisar(lerId(aviso.new, 'id') ?? lerId(aviso.old, 'id')),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'caso_etapas' },
        (aviso: Aviso) =>
          avisar(
            lerId(aviso.new, 'caso_id') ??
              lerId(aviso.old, 'caso_id') ??
              casoDaEtapa(queryClient, lerId(aviso.old, 'id')),
          ),
      )
      .subscribe((status) => {
        setConectado(status === 'SUBSCRIBED')

        // Reconectou: o que passou enquanto estávamos fora não chega como
        // evento, então recarrega TUDO uma vez para não ficar com a tela velha.
        if (status === 'SUBSCRIBED') agendarRecargaDoQuadro(queryClient)
      })

    // A recarga já agendada NÃO é cancelada ao sair: a espera é compartilhada
    // com as ações, e o sino do cabeçalho continua lendo o Quadro em qualquer
    // tela.
    return () => {
      void supabase.removeChannel(canal)
    }
  }, [queryClient])

  return { conectado }
}
