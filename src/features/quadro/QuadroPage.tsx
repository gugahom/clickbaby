import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { Botao } from '@/components/ui/Botao'
import { IconeKanban, IconeLista } from '@/components/ui/icones'
import { hojeNoFuso } from '@/lib/formato'
import { useQuadro } from './api/useQuadro'
import {
  DIAS_INICIAIS,
  DIAS_POR_PAGINA,
  agruparPorDia,
  blocosAbertos,
} from './lib/agrupar-por-dia'
import { DiaBloco } from './components/DiaBloco'
import { QuadroKanban } from './components/QuadroKanban'
import { RascunhosBarra } from './components/RascunhosBarra'

type Visao = 'lista' | 'kanban'

export function QuadroPage() {
  const [visao, setVisao] = useState<Visao>('lista')
  const [diasVisiveis, setDiasVisiveis] = useState(DIAS_INICIAIS)
  const { data, isPending, error } = useQuadro()

  const hoje = hojeNoFuso()

  const { blocos, rascunhos, totalAbertos } = useMemo(() => {
    const casos = data?.casos ?? []
    const todos = agruparPorDia(casos)
    const abertos = blocosAbertos(todos)
    return {
      blocos: abertos,
      rascunhos: casos.filter((c) => c.ehRascunho && !c.ehTerminal),
      totalAbertos: abertos.reduce((soma, b) => soma + b.total, 0),
    }
  }, [data])

  if (error) {
    return (
      <Aviso titulo="Não foi possível carregar o Quadro">
        {error instanceof Error ? error.message : 'Erro desconhecido.'}
      </Aviso>
    )
  }

  const mostrados = blocos.slice(0, diasVisiveis)
  const restantes = blocos.length - mostrados.length

  return (
    <div className="flex h-full flex-col">
      <header className="sticky top-0 z-10 border-b border-border bg-card px-3 py-3 md:px-4">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-lg font-bold md:text-2xl">Quadro</h1>
            <p className="mt-0.5 text-xs text-muted-foreground md:text-sm">
              {isPending
                ? 'Carregando…'
                : `${totalAbertos} ${totalAbertos === 1 ? 'caso' : 'casos'} em ${blocos.length} ${blocos.length === 1 ? 'dia' : 'dias'}`}
            </p>
          </div>

          <div
            className="flex flex-shrink-0 gap-1"
            role="group"
            aria-label="Modo de visualização"
          >
            <Botao
              variante={visao === 'lista' ? 'primario' : 'contorno'}
              aria-pressed={visao === 'lista'}
              onClick={() => setVisao('lista')}
            >
              <IconeLista className="size-4" />
              <span className="hidden md:inline">Lista</span>
            </Botao>
            <Botao
              variante={visao === 'kanban' ? 'primario' : 'contorno'}
              aria-pressed={visao === 'kanban'}
              onClick={() => setVisao('kanban')}
            >
              <IconeKanban className="size-4" />
              <span className="hidden md:inline">Kanban</span>
            </Botao>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        {isPending ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            Carregando casos…
          </p>
        ) : visao === 'kanban' ? (
          <QuadroKanban
            casos={blocos.flatMap((b) => b.casos)}
            etapasPorCaso={data?.etapasPorCaso ?? new Map()}
          />
        ) : (
          <>
            <RascunhosBarra rascunhos={rascunhos} hoje={hoje} />

            {blocos.length === 0 ? (
              <Aviso titulo="Nenhum dia aberto">
                Todos os casos estão em estado terminal. Um dia só sai do Quadro quando
                todos os seus casos estão encerrados ou cancelados — nunca por passagem
                de data.
              </Aviso>
            ) : (
              <>
                {mostrados.map((bloco, i) => (
                  <DiaBloco
                    key={bloco.dia ?? 'sem-data'}
                    bloco={bloco}
                    hoje={hoje}
                    etapasPorCaso={data?.etapasPorCaso ?? new Map()}
                    // Os dois primeiros dias abrem; o resto começa fechado, para
                    // a tela não virar uma parede de 84 casos.
                    abertoInicialmente={i < 2}
                  />
                ))}

                {restantes > 0 && (
                  <div className="p-4 text-center">
                    <Botao
                      onClick={() => setDiasVisiveis((n) => n + DIAS_POR_PAGINA)}
                      className={clsx('w-full sm:w-auto')}
                    >
                      Carregar mais dias ({restantes} restantes)
                    </Botao>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function Aviso({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-lg p-8 text-center">
      <h2 className="font-semibold">{titulo}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{children}</p>
    </div>
  )
}
