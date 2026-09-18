import type { QueryClient } from '@tanstack/react-query'
import type { DadosQuadro } from '../types'
import { DOS_CONCLUIDOS, DO_QUADRO, remendar } from '../lib/remendo'
import { carregarCasos, chavesQuadro } from './useQuadro'

/**
 * ATUALIZAR SÓ O QUE MUDOU (18/09/2026, correção 4 da lentidão).
 *
 * O aviso do Realtime diz QUAL caso mudou, e até aqui essa informação era
 * jogada fora: todo aviso, de qualquer pessoa, fazia toda tela aberta baixar o
 * Quadro inteiro de novo. Agora o aviso vira uma busca DAQUELE caso — pela mesma
 * view, sob a mesma RLS, com as mesmas derivações — e o resultado é costurado na
 * lista que já está em memória.
 *
 * O PAYLOAD CONTINUA IGNORADO, menos o id. Os dados do caso vêm da consulta, e
 * não do aviso: as duas razões de useRealtimeQuadro (privacidade e derivações
 * que só a view sabe fazer) valem do mesmo jeito.
 *
 * NA DÚVIDA, RECARREGA TUDO — a lista inteira, como antes desta correção. Em
 * três situações:
 *
 *   1. UM CASO QUE MEXE EM OUTROS — decidido em lib/remendo.ts, sem rede.
 *
 *   2. A LISTA MUDOU ENQUANTO A BUSCA VIAJAVA. Uma recarga completa que leu o
 *      banco ANTES da mudança e chega DEPOIS do remendo apagaria o remendo; um
 *      remendo que chega depois de uma recarga mais nova a desfaria. Não dá para
 *      saber qual leitura é mais nova, então nos dois casos a lista recarrega.
 *
 *   3. A BUSCA FALHOU. Recarrega — e se a recarga também falhar, é o mesmo
 *      tratamento de erro de sempre.
 */

/**
 * Acima disto, recarregar tudo sai mais barato que uma consulta com a lista de
 * ids — é o caso do sync do Calendar criando uma leva de casos de uma vez.
 */
export const TETO_DE_CASOS = 20

const COLECOES = [
  { chave: chavesQuadro.lista(), colecao: DO_QUADRO },
  { chave: chavesQuadro.concluidos(), colecao: DOS_CONCLUIDOS },
]

/**
 * Busca os casos que mudaram e remenda o Quadro e a aba Concluídos — a que
 * estiver em memória.
 */
export async function atualizarCasos(queryClient: QueryClient, ids: string[]): Promise<void> {
  // Só remenda o que existe: lista que nunca foi carregada (Concluídos fechada
  // desde o login) nasce certa na primeira vez que alguém a abrir.
  const alvos = COLECOES.filter(({ chave }) => queryClient.getQueryData(chave) !== undefined)
  if (alvos.length === 0) return

  // O carimbo de ANTES da busca — item 2 do cabeçalho.
  const carimbos = alvos.map(({ chave }) => queryClient.getQueryState(chave)?.dataUpdatedAt)

  let novos: DadosQuadro
  try {
    novos = await carregarCasos(ids)
  } catch {
    for (const { chave } of alvos) {
      void queryClient.invalidateQueries({ queryKey: chave, exact: true })
    }
    return
  }

  alvos.forEach(({ chave, colecao }, i) => {
    const estado = queryClient.getQueryState<DadosQuadro>(chave)
    const atual = estado?.data
    if (!estado || !atual) return

    const mexeram = estado.dataUpdatedAt !== carimbos[i] || estado.fetchStatus === 'fetching'
    const remendada = mexeram ? null : remendar(atual, ids, novos, colecao)

    if (remendada) queryClient.setQueryData(chave, remendada)
    else void queryClient.invalidateQueries({ queryKey: chave, exact: true })
  })
}

/**
 * De que caso é esta etapa, pelo que já está em memória. É o que deixa uma ação
 * sobre uma ETAPA (dar play, pausar) atualizar só o caso dela — e o aviso de uma
 * etapa apagada, que chega sem o `caso_id`.
 */
export function casoDaEtapa(queryClient: QueryClient, etapaId: string | null): string | null {
  if (etapaId === null) return null
  for (const { chave } of COLECOES) {
    const dados = queryClient.getQueryData<DadosQuadro>(chave)
    if (!dados) continue
    for (const [casoId, etapas] of dados.etapasPorCaso) {
      if (etapas.some((e) => e.id === etapaId)) return casoId
    }
  }
  return null
}
