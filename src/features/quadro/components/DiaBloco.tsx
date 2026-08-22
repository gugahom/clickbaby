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
  const [mostrarResolvidos, setMostrarResolvidos] = useState(false)
  const idPainel = useId()
  const idCabecalho = useId()
  const idResolvidos = useId()

  const rotulo = bloco.dia === null ? 'Sem data prevista' : rotularDia(bloco.dia, hoje)
  const atraso = bloco.dia === null ? 0 : diasAtras(bloco.dia, hoje)
  const emAtraso = atraso > 0

  // Caso terminal sai da lista ativa e vai para a gaveta de resolvidos: o dia
  // segue visível (invariante 3.5 — só sai quando TODOS resolverem), mas o que
  // ainda precisa de ação fica no topo, sem competir com o que já acabou.
  const ativos = bloco.casos.filter((c) => !c.ehTerminal)
  const resolvidos = bloco.casos.filter((c) => c.ehTerminal)

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

            {resolvidos.length > 0 && (
              <div className="border-t border-concluido/25 bg-concluido/8">
                <button
                  type="button"
                  onClick={() => setMostrarResolvidos((v) => !v)}
                  aria-expanded={mostrarResolvidos}
                  aria-controls={idResolvidos}
                  className="flex w-full items-center justify-between px-3 py-2 text-left transition-colors hover:bg-concluido/12 md:px-4"
                >
                  {/*
                    "Resolvidos", não "concluídos": um caso cancelado cai aqui e
                    nunca foi concluído. O contador do cabeçalho usa a palavra
                    "concluídos" por herança da fatia anterior — vale alinhar os
                    dois num passe futuro.
                  */}
                  <span className="text-sm font-medium text-concluido">
                    Resolvidos neste dia ({resolvidos.length})
                  </span>
                  <Chevron
                    className={clsx(
                      'size-4 flex-shrink-0 text-concluido transition-transform',
                      mostrarResolvidos && 'rotate-180',
                    )}
                  />
                </button>

                <div id={idResolvidos} hidden={!mostrarResolvidos}>
                  {mostrarResolvidos &&
                    resolvidos.map((caso) => (
                      <CasoLinha
                        key={caso.id}
                        caso={caso}
                        etapas={etapasPorCaso.get(caso.id) ?? []}
                      />
                    ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}
