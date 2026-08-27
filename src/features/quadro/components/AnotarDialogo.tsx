import { useState } from 'react'
import { Dialogo } from '@/components/ui/Dialogo'
import { ROTULO_ETAPA, type EtapaQuadro } from '../types'

interface PropsAnotarDialogo {
  etapa: EtapaQuadro
  ocupado: boolean
  erro: string | null
  onCancelar: () => void
  onConfirmar: (observacao: string) => void
}

/**
 * Escrever o aviso da etapa.
 *
 * O texto é livre porque não há de onde escolher — "quarto 115 às 14h" não sai
 * de lista nenhuma. É a exceção que a seção 6 do CLAUDE.md já previa: seleção
 * em tudo que puder ser lista, texto livre só em observação.
 */
export function AnotarDialogo({
  etapa,
  ocupado,
  erro,
  onCancelar,
  onConfirmar,
}: PropsAnotarDialogo) {
  const [texto, setTexto] = useState(etapa.observacao ?? '')
  const tinha = (etapa.observacao ?? '').trim() !== ''
  const vazio = texto.trim() === ''

  return (
    <Dialogo
      titulo={`Aviso sobre ${ROTULO_ETAPA[etapa.tipo]}`}
      rotuloConfirmar={tinha && vazio ? 'Apagar aviso' : 'Salvar'}
      confirmarDestrutivo={tinha && vazio}
      ocupado={ocupado}
      erro={erro}
      onConfirmar={() => onConfirmar(texto)}
      onCancelar={onCancelar}
    >
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Aparece numa faixa no card, no Quadro, sem precisar abrir o caso —
          inclusive antes da etapa começar.
        </p>

        <label className="block">
          <span className="text-sm font-medium">Aviso</span>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={3}
            placeholder="QUARTO 115 - 14H"
            className="mt-1.5 w-full rounded-md border border-border bg-background/60 px-3 py-2 text-base transition-colors focus:border-marca focus:bg-card"
          />
        </label>

        {tinha && vazio && (
          <p className="text-sm text-atrasado">
            Salvar em branco apaga o aviso atual.
          </p>
        )}
      </div>
    </Dialogo>
  )
}
