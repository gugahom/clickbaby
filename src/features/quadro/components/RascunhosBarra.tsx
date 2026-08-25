import { useId, useState } from 'react'
import clsx from 'clsx'
import { Chevron } from '@/components/ui/icones'
import { rotularDia } from '@/lib/formato'
import type { CasoQuadro } from '../types'

interface PropsRascunhosBarra {
  rascunhos: CasoQuadro[]
  hoje: string
}

/**
 * Rascunho pendente = o sync não mapeou pacote ou maternidade com certeza
 * (seção 7 do CLAUDE.md). A regra NÃO é reimplementada aqui: `ehRascunho`,
 * `faltaPacote` e `faltaMaternidade` vêm derivados da view `quadro_casos`,
 * definição única compartilhada com a Fila e o Painel.
 *
 * Eles aparecem em DOIS lugares: nesta barra (para a coordenação resolver em
 * lote) e como linha apagada com badge dentro do bloco do dia. "Fora do fluxo
 * operacional" significa sem ações, não invisível — são 39 dos 84 casos, e
 * escondê-los do dia esconderia trabalho que vai acontecer.
 */
export function RascunhosBarra({ rascunhos, hoje }: PropsRascunhosBarra) {
  const [aberto, setAberto] = useState(false)
  const idPainel = useId()

  if (rascunhos.length === 0) return null

  return (
    <div className="border-b border-rascunho-borda bg-rascunho-fundo">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        aria-controls={idPainel}
        className="flex w-full items-center justify-between gap-2 px-3 py-3 text-left transition-colors hover:bg-rascunho/10 md:px-4"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-rascunho">Rascunhos pendentes</span>
          <span className="rounded-full bg-rascunho px-2 py-0.5 text-xs font-bold text-white">
            {rascunhos.length}
          </span>
          <span className="hidden text-xs text-muted-foreground sm:inline">
            sem pacote ou maternidade — fora do fluxo até confirmação
          </span>
        </div>
        <Chevron
          className={clsx(
            'size-4 flex-shrink-0 text-rascunho transition-transform',
            aberto && 'rotate-180',
          )}
        />
      </button>

      <div id={idPainel} hidden={!aberto}>
        {aberto && (
          <ul className="divide-y divide-rascunho-borda border-t border-rascunho-borda">
            {rascunhos.map((caso) => (
              <li
                key={caso.id}
                className="flex items-center justify-between gap-3 px-3 py-2 text-sm md:px-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">
                    {caso.bebeNome ? `${caso.maeNome} · ${caso.bebeNome}` : caso.maeNome}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {caso.dia ? rotularDia(caso.dia, hoje) : 'sem data'} ·{' '}
                    {[
                      caso.faltaPacote ? 'sem pacote' : null,
                      caso.faltaMaternidade ? 'sem maternidade' : null,
                    ]
                      .filter((v) => v !== null)
                      .join(' · ')}
                  </div>
                </div>
                <span className="flex-shrink-0 text-xs text-muted-foreground">
                  completar na próxima fatia
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
