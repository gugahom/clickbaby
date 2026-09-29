import { useRef, useState } from 'react'
import clsx from 'clsx'
import { topoRedondo, useTamanho } from '../lib/useTamanho'

/**
 * O GRÁFICO DO KPI ESCOLHIDO — colunas, pedaço a pedaço, com o outro período
 * ao lado (29/09/2026, pedido do gestor: "opções de comparações nesses
 * gráficos de meses, anos e etc").
 *
 * UMA FORMA SÓ PARA OS SEIS KPIs: coluna no número do próprio KPI (taxa, horas,
 * minutos, por dia). Até aqui o prazo era uma pilha "no prazo × atrasado"; com
 * a comparação, a pilha teria que dividir o lugar com um segundo par de cores,
 * e o que se compara entre dois meses é a TAXA, não a contagem. As contagens
 * moram na dica e na tabela.
 *
 * O OUTRO PERÍODO É CINZA e fica À ESQUERDA do atual: o que se lê primeiro é o
 * agora, e o cinza é contexto (ver `--grafico-comparacao`). A legenda existe
 * sempre que há dois; a posição também separa, para ninguém depender da cor.
 *
 * O VALOR VAI EM CIMA DA COLUNA ATUAL, e só dela — com doze meses e dois
 * períodos, rotular as duas seria um número em cada marca. Some quando a faixa
 * fica estreita demais para ele caber.
 */
export interface ColunaDoGrafico {
  /** No eixo: "1–7", "out". */
  rotulo: string
  /** Na dica e na tabela: "1 a 7 de outubro", "Outubro de 2026". */
  rotuloLongo: string
  valor: number | null
  detalhe: string[]
  /** O mês escolhido, na visão do ano. */
  destaque?: boolean | undefined
}

const MARGEM = { topo: 24, direita: 8, base: 28, esquerda: 44 }
const COLUNA_SO = 28
const COLUNA_PAR = 20
const ENTRE_O_PAR = 3
const RAIO = 4
const FAIXA_PARA_ROTULO = 38

export function GraficoDoKpi({
  colunas,
  comparacao,
  nomeAtual,
  nomeComparacao,
  formatar,
  teto,
  descricao,
}: {
  colunas: ColunaDoGrafico[]
  comparacao: ColunaDoGrafico[] | null
  nomeAtual: string
  nomeComparacao: string | null
  formatar: (valor: number) => string
  teto?: number | undefined
  /** Para leitor de tela: o que o gráfico mostra. */
  descricao: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const { largura, altura } = useTamanho(ref)
  const [ativa, setAtiva] = useState<number | null>(null)

  const comPar = comparacao !== null
  const valores = [...colunas, ...(comparacao ?? [])]
    .map((c) => c.valor)
    .filter((v): v is number => v !== null)
  const vazio = valores.length === 0

  const topo = teto ?? topoRedondo(Math.max(0, ...valores))
  const alturaDoPlot = Math.max(80, altura - MARGEM.topo - MARGEM.base)
  const larguraDoPlot = Math.max(0, largura - MARGEM.esquerda - MARGEM.direita)
  const faixa = colunas.length > 0 ? larguraDoPlot / colunas.length : 0
  const coluna = comPar ? Math.min(COLUNA_PAR, faixa * 0.3) : Math.min(COLUNA_SO, faixa * 0.5)
  const y = (valor: number) => (Math.min(valor, topo) / topo) * alturaDoPlot
  const base = MARGEM.topo + alturaDoPlot
  const ticks = [0, topo / 2, topo]
  const mostrarValor = faixa >= FAIXA_PARA_ROTULO

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {comPar && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-[2px] bg-grafico-comparacao" aria-hidden="true" />
            {nomeComparacao}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-[2px] bg-grafico" aria-hidden="true" />
            {nomeAtual}
          </span>
        </div>
      )}

      <div ref={ref} className="relative min-h-60 flex-1">
        {vazio ? (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
            Sem dados neste período.
          </p>
        ) : (
          largura > 0 &&
          altura > 0 && (
            <svg width={largura} height={altura} role="img" aria-label={descricao} className="absolute inset-0">
              {/* Grade: linha fina, sólida, um passo acima da superfície. */}
              {ticks.map((t) => (
                <g key={t}>
                  <line
                    x1={MARGEM.esquerda}
                    x2={MARGEM.esquerda + larguraDoPlot}
                    y1={base - y(t)}
                    y2={base - y(t)}
                    className="stroke-border"
                    strokeWidth={1}
                  />
                  <text
                    x={MARGEM.esquerda - 8}
                    y={base - y(t)}
                    dy="0.32em"
                    textAnchor="end"
                    className="fill-muted-foreground text-[10px] tabular-nums"
                  >
                    {formatar(t)}
                  </text>
                </g>
              ))}

              {colunas.map((c, i) => {
                const centro = MARGEM.esquerda + faixa * (i + 0.5)
                const outra = comparacao?.[i]
                const xAtual = comPar ? centro + ENTRE_O_PAR / 2 : centro - coluna / 2
                const xOutra = centro - ENTRE_O_PAR / 2 - coluna
                const escurecida = ativa !== null && ativa !== i

                return (
                  <g key={`${c.rotulo}-${i}`} opacity={escurecida ? 0.45 : 1} className="transition-opacity">
                    {outra?.valor != null && outra.valor > 0 && (
                      <path
                        d={caminhoDaColuna(xOutra, base - y(outra.valor), coluna, y(outra.valor), RAIO)}
                        className="fill-grafico-comparacao"
                      />
                    )}
                    {c.valor !== null && c.valor > 0 && (
                      <path
                        d={caminhoDaColuna(xAtual, base - y(c.valor), coluna, y(c.valor), RAIO)}
                        className="fill-grafico"
                      />
                    )}
                    {mostrarValor && c.valor !== null && (
                      <text
                        x={xAtual + coluna / 2}
                        y={base - y(c.valor) - 6}
                        textAnchor="middle"
                        className="fill-foreground text-[11px] font-semibold tabular-nums"
                      >
                        {formatar(c.valor)}
                      </text>
                    )}
                    <text
                      x={centro}
                      y={base + 17}
                      textAnchor="middle"
                      className={clsx(
                        'text-[10px] tabular-nums',
                        c.destaque ? 'fill-foreground font-bold' : 'fill-muted-foreground',
                      )}
                    >
                      {c.rotulo}
                    </text>

                    {/* O ALVO É A FAIXA INTEIRA, não a tinta: ninguém mira numa
                        coluna de 20px. Focável pelo teclado, com a mesma dica. */}
                    <rect
                      x={MARGEM.esquerda + faixa * i}
                      y={MARGEM.topo}
                      width={faixa}
                      height={alturaDoPlot}
                      fill="transparent"
                      tabIndex={0}
                      aria-label={`${c.rotuloLongo}: ${c.valor === null ? 'sem dado' : formatar(c.valor)}${
                        outra ? `; ${outra.rotuloLongo}: ${outra.valor === null ? 'sem dado' : formatar(outra.valor)}` : ''
                      }`}
                      onPointerEnter={() => setAtiva(i)}
                      onPointerLeave={() => setAtiva(null)}
                      onFocus={() => setAtiva(i)}
                      onBlur={() => setAtiva(null)}
                      className="cursor-default outline-none focus-visible:stroke-foreground/40"
                    />
                  </g>
                )
              })}
            </svg>
          )
        )}

        {ativa !== null && colunas[ativa] && (
          <Dica
            atual={colunas[ativa]}
            outra={comparacao?.[ativa] ?? null}
            formatar={formatar}
            esquerda={MARGEM.esquerda + faixa * (ativa + 0.5)}
            larguraTotal={largura}
            folga={comPar ? coluna + 14 : coluna / 2 + 12}
          />
        )}
      </div>

      {/* A TABELA É O GÊMEO DO GRÁFICO: todo número da dica também está aqui,
          sem depender de mouse nenhum. */}
      <details className="text-sm">
        <summary className="cursor-pointer text-xs font-semibold text-muted-foreground hover:text-foreground">
          Ver em tabela
        </summary>
        <div className="mt-2 max-h-72 overflow-auto">
          <table className="w-full text-left text-xs tabular-nums">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-1 pr-3 font-semibold">Período</th>
                <th className="py-1 pr-3 font-semibold">{nomeAtual}</th>
                {comPar && <th className="py-1 pr-3 font-semibold">{nomeComparacao}</th>}
                <th className="py-1 font-semibold">Detalhe</th>
              </tr>
            </thead>
            <tbody>
              {colunas.map((c, i) => {
                const outra = comparacao?.[i]
                return (
                  <tr key={`${c.rotulo}-${i}`} className="border-t border-border">
                    <td className="py-1 pr-3">{c.rotuloLongo}</td>
                    <td className="py-1 pr-3 font-semibold">{c.valor === null ? '—' : formatar(c.valor)}</td>
                    {comPar && <td className="py-1 pr-3">{outra?.valor == null ? '—' : formatar(outra.valor)}</td>}
                    <td className="py-1 text-muted-foreground">{c.detalhe.join(' · ') || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  )
}

/** Retângulo com os cantos de CIMA arredondados e a base reta. */
function caminhoDaColuna(x: number, y: number, w: number, h: number, raio: number): string {
  if (h <= 0) return ''
  const r = Math.min(raio, w / 2, h)
  return [
    `M${x},${y + h}`,
    `L${x},${y + r}`,
    `Q${x},${y} ${x + r},${y}`,
    `L${x + w - r},${y}`,
    `Q${x + w},${y} ${x + w},${y + r}`,
    `L${x + w},${y + h}`,
    'Z',
  ].join(' ')
}

/**
 * A dica. O VALOR VEM PRIMEIRO e forte; o outro período embaixo, com o traço
 * cinza da cor dele. AO LADO do par de colunas, e não em cima — centrada, ela
 * cobria justamente o que descreve.
 */
function Dica({
  atual,
  outra,
  formatar,
  esquerda,
  larguraTotal,
  folga,
}: {
  atual: ColunaDoGrafico
  outra: ColunaDoGrafico | null
  formatar: (valor: number) => string
  esquerda: number
  larguraTotal: number
  folga: number
}) {
  const largura = 220
  const x =
    esquerda + folga + largura <= larguraTotal ? esquerda + folga : Math.max(0, esquerda - folga - largura)

  return (
    <div
      role="status"
      className="pointer-events-none absolute top-2 z-10 rounded-xl border border-border bg-card p-3 text-xs shadow-lg"
      style={{ left: x, width: largura }}
    >
      <div className="mb-1 font-semibold text-muted-foreground">{atual.rotuloLongo}</div>
      <div className="flex items-center gap-2">
        <span className="h-0.5 w-3 rounded-full bg-grafico" aria-hidden="true" />
        <span className="text-base font-extrabold text-foreground tabular-nums">
          {atual.valor === null ? 'sem dado' : formatar(atual.valor)}
        </span>
      </div>
      {atual.detalhe.length > 0 && (
        <div className="mt-1 space-y-0.5 text-muted-foreground">
          {atual.detalhe.map((linha) => (
            <div key={linha}>{linha}</div>
          ))}
        </div>
      )}
      {outra && (
        <div className="mt-2 border-t border-border pt-2">
          <div className="flex items-center gap-2">
            <span className="h-0.5 w-3 rounded-full bg-grafico-comparacao" aria-hidden="true" />
            <span className="font-bold text-foreground tabular-nums">
              {outra.valor === null ? 'sem dado' : formatar(outra.valor)}
            </span>
            <span className="text-muted-foreground">{outra.rotuloLongo}</span>
          </div>
          {outra.detalhe[0] && <div className="mt-0.5 pl-5 text-muted-foreground">{outra.detalhe[0]}</div>}
        </div>
      )}
    </div>
  )
}
