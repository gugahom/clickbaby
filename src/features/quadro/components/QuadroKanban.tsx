import { corDoCaso } from '../lib/cores-calendar'
import { ROTULO_ETAPA, type CasoQuadro, type EtapaQuadro, type EtapaTipo } from '../types'

interface PropsQuadroKanban {
  casos: CasoQuadro[]
  etapasPorCaso: Map<string, EtapaQuadro[]>
}

/**
 * Visão secundária. O plano é explícito que o Quadro é por DATA, não kanban por
 * status (seção 7 de docs/plano.md) — isto existe como alternativa, não como
 * a tela principal.
 *
 * As colunas saem das etapas que os casos carregados realmente têm, não de uma
 * lista fixa: a v0 hardcodava cinco nomes e sumia com edicao_foto, reels e
 * album, além de assumir que todo caso tem todas as etapas (BIRTH tem 2,
 * MASTER + ÁLBUM tem 6).
 */
export function QuadroKanban({ casos, etapasPorCaso }: PropsQuadroKanban) {
  const colunas = derivarColunas(casos, etapasPorCaso)

  if (colunas.length === 0) {
    return (
      <p className="p-8 text-center text-sm text-muted-foreground">
        Nenhuma etapa nos casos carregados.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-full gap-3 p-3 md:p-4">
        {colunas.map(({ tipo, casos: doTipo }) => (
          <div
            key={tipo}
            className="w-64 flex-shrink-0 rounded-md border border-border bg-muted/25"
          >
            <div className="border-b border-border px-3 py-2">
              <h3 className="text-sm font-semibold">{ROTULO_ETAPA[tipo]}</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {doTipo.length} {doTipo.length === 1 ? 'caso' : 'casos'}
              </p>
            </div>
            <ul className="max-h-[26rem] space-y-2 overflow-y-auto p-2">
              {doTipo.length === 0 ? (
                <li className="py-6 text-center text-xs text-muted-foreground">
                  Nenhum caso
                </li>
              ) : (
                doTipo.map((caso) => (
                  <li
                    key={caso.id}
                    className="rounded border border-border bg-card p-2 text-xs"
                    style={{ borderLeftColor: corDoCaso(caso.corCalendar), borderLeftWidth: 3 }}
                  >
                    <div className="truncate font-medium">
                      {caso.bebeNome ? `${caso.maeNome} · ${caso.bebeNome}` : caso.maeNome}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-muted-foreground">
                      <span className="font-mono">{caso.maternidadeSigla ?? '—'}</span>
                      <span className="truncate">{caso.pacoteNome ?? 'sem pacote'}</span>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}

interface Coluna {
  tipo: EtapaTipo
  ordem: number
  casos: CasoQuadro[]
}

function derivarColunas(
  casos: CasoQuadro[],
  etapasPorCaso: Map<string, EtapaQuadro[]>,
): Coluna[] {
  const porTipo = new Map<EtapaTipo, Coluna>()

  for (const caso of casos) {
    for (const etapa of etapasPorCaso.get(caso.id) ?? []) {
      if (etapa.status === 'concluida' || etapa.status === 'dispensada') continue
      const coluna = porTipo.get(etapa.tipo)
      if (coluna) {
        coluna.casos.push(caso)
        coluna.ordem = Math.min(coluna.ordem, etapa.ordem)
      } else {
        porTipo.set(etapa.tipo, { tipo: etapa.tipo, ordem: etapa.ordem, casos: [caso] })
      }
    }
  }

  return [...porTipo.values()].sort((a, b) => a.ordem - b.ordem)
}
