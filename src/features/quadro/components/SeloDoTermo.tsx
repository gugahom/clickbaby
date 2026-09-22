import { CLASSE_TERMO, ROTULO_TERMO } from '../lib/termo'
import type { TermoStatus } from '../types'

/**
 * O TERMO NO CARTÃO DOS CONCLUÍDOS (22/09/2026, pedido do gestor), para a
 * mídia saber de longe se pode usar aquelas imagens — e, depois, para filtrar
 * por isso.
 *
 * SEM RESPOSTA NÃO DESENHA NADA (decisão do gestor). Os casos que encerraram
 * antes desta pergunta existir não têm resposta, e um selo dizendo "ass
 * pendente" neles afirmaria algo sobre contratos que ninguém leu. Quem quiser
 * preencher usa "Termo de imagem" no menu do cartão.
 */
export function SeloDoTermo({ termo }: { termo: TermoStatus | null }) {
  if (termo === null) return null

  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${CLASSE_TERMO[termo]}`}
      title="Termo de uso de imagem"
    >
      {ROTULO_TERMO[termo]}
    </span>
  )
}
