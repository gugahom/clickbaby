import { useId, useState } from 'react'
import clsx from 'clsx'
import { Chevron } from '@/components/ui/icones'
import { diasAtras, rotularDia } from '@/lib/formato'
import type { BlocoDia, EtapaQuadro } from '../types'
import { CasoLinha } from './CasoLinha'

interface PropsDiaBloco {
  bloco: BlocoDia
  hoje: string
  etapasPorCaso: Map<string, EtapaQuadro[]>
  abertoInicialmente: boolean
}

export function DiaBloco({
  bloco,
  hoje,
  etapasPorCaso,
  abertoInicialmente,
}: PropsDiaBloco) {
  const [aberto, setAberto] = useState(abertoInicialmente)
  const idPainel = useId()
  const idCabecalho = useId()
  const rotulo = bloco.dia === null ? 'Sem data prevista' : rotularDia(bloco.dia, hoje)
  const atraso = bloco.dia === null ? 0 : diasAtras(bloco.dia, hoje)
  const emAtraso = atraso > 0

  // Casos terminais não aparecem aqui: vão para a aba Concluídos. O bloco do
  // dia continua existindo enquanto sobrar caso aberto (invariante 3.5) — quem
  // some é o caso resolvido, não o dia.
  //
  // Casos na UTI também não: eles saem do dia e vivem na seção UTI, que guarda
  // de que dia eram.
  const ativos = bloco.casos.filter((c) => !c.ehTerminal && !c.naUti)

  return (
    <section className="border-b border-border last:border-b-0">
      <h2>
        <button
          type="button"
          id={idCabecalho}
          onClick={() => setAberto((v) => !v)}
          aria-expanded={aberto}
          aria-controls={idPainel}
          className={clsx(
            'flex w-full items-center justify-between gap-3 px-3 py-3 text-left transition-colors md:px-4 md:py-4',
            emAtraso ? 'bg-atrasado/12 hover:bg-atrasado/18' : 'bg-muted/40 hover:bg-muted/60',
          )}
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {/* first-letter, não `capitalize`: o Intl devolve
                  "terça-feira, 18 de agosto" e `capitalize` viraria
                  "Terça-Feira, 18 De Agosto". */}
              <span className="text-base font-semibold first-letter:uppercase md:text-lg">
                {rotulo}
              </span>
              {emAtraso && (
                <span className="rounded bg-atrasado/20 px-1.5 py-0.5 text-xs font-medium text-atrasado">
                  {atraso === 1 ? 'há 1 dia' : `há ${atraso} dias`}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {/*
                Denominador honesto: "resolvidos" conta casos em estado
                TERMINAL (encerrado OU cancelado), não casos com todas as
                etapas feitas. Cancelado resolve o dia sem nunca ter sido
                concluído — invariante 3.5.
              */}
              {bloco.resolvidos} de {bloco.total}{' '}
              {bloco.total === 1 ? 'concluído' : 'concluídos'}
            </p>
          </div>

          <Chevron
            className={clsx(
              'size-5 flex-shrink-0 text-muted-foreground transition-transform',
              aberto && 'rotate-180',
            )}
          />
        </button>
      </h2>

      <div id={idPainel} role="region" aria-labelledby={idCabecalho} hidden={!aberto}>
        {aberto && (
          <>
            {ativos.map((caso) => (
              <CasoLinha
                key={caso.id}
                caso={caso}
                etapas={etapasPorCaso.get(caso.id) ?? []}
              />
            ))}
          </>
        )}
      </div>
    </section>
  )
}
