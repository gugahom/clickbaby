import { useRef, useState } from 'react'
import type { PrazoDaSemana } from '../api/useMetricas'
import { formatarHoras, formatarPercentual, rotuloDaSemana } from '../lib/metricas'
import { topoRedondo, useLargura } from '../lib/useLargura'

/**
 * O PRAZO, SEMANA A SEMANA — casos enviados para Entregáveis, empilhados em
 * "no prazo" e "atrasados".
 *
 * AS DUAS CORES FORAM VALIDADAS, não escolhidas no olho. "No prazo" em verde
 * seria o óbvio, e reprova: verde × vermelho dá ΔE 4,1 para deuteranopia —
 * metade de quem é daltônico leria as duas pilhas como uma. É por isso que o
 * "no prazo" é o AZUL dos gráficos, e só o atraso fala a língua do status.
 * A legenda existe sempre: a cor não é o único jeito de saber qual é qual.
 *
 * A PORCENTAGEM VAI EM CIMA DE CADA COLUNA, e é o único rótulo direto: é a
 * leitura que a gestão procura ("qual semana foi ruim"). As contagens moram na
 * dica e na tabela logo abaixo.
 *
 * Colunas com teto de 24px e o topo arredondado só onde o dado termina — a base
 * é reta, porque é de onde a coluna cresce. As duas partes se separam por 2px
 * da cor do fundo, e não por um contorno: contorno é tinta que não é dado.
 */
const ALTURA_DO_PLOT = 170
const MARGEM = { topo: 22, direita: 8, base: 26, esquerda: 30 }
const COLUNA_MAX = 24
const INTERVALO = 2
const RAIO = 4

export function GraficoDePrazo({
  semanas,
  inicioDoPeriodo,
}: {
  semanas: PrazoDaSemana[]
  inicioDoPeriodo: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const largura = useLargura(ref)
  const [ativa, setAtiva] = useState<number | null>(null)

  if (semanas.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Nenhum caso enviado para Entregáveis neste período.
      </p>
    )
  }

  const maximo = topoRedondo(Math.max(...semanas.map((s) => s.enviados)))
  const larguraDoPlot = Math.max(0, largura - MARGEM.esquerda - MARGEM.direita)
  const faixa = semanas.length > 0 ? larguraDoPlot / semanas.length : 0
  const coluna = Math.min(COLUNA_MAX, faixa * 0.55)
  const y = (valor: number) => (valor / maximo) * ALTURA_DO_PLOT
  const base = MARGEM.topo + ALTURA_DO_PLOT
  // O tick do meio só quando cai num inteiro: contamos casos, e "8" escrito
  // sobre uma linha que está em 7,5 é o eixo mentindo por meio caso.
  const ticks = Number.isInteger(maximo / 2) ? [0, maximo / 2, maximo] : [0, maximo]

  const selecionada = ativa === null ? null : semanas[ativa]

  return (
    <div className="space-y-3">
      {/* Legenda ANTES do gráfico: com duas séries ela é obrigatória, e o
          olho a encontra antes de precisar dela. Marca retangular, como a
          marca que ela representa. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-[2px] bg-grafico" aria-hidden="true" />
          Enviados no prazo
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-[2px] bg-grafico-atrasado" aria-hidden="true" />
          Enviados depois de vencer
        </span>
      </div>

      <div ref={ref} className="relative">
        {largura > 0 && (
          <svg
            width={largura}
            height={MARGEM.topo + ALTURA_DO_PLOT + MARGEM.base}
            role="img"
            aria-label="Casos enviados por semana, separados entre no prazo e depois de vencer"
          >
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
                  x={MARGEM.esquerda - 6}
                  y={base - y(t)}
                  dy="0.32em"
                  textAnchor="end"
                  className="fill-muted-foreground text-[10px] tabular-nums"
                >
                  {Math.round(t)}
                </text>
              </g>
            ))}

            {semanas.map((s, i) => {
              const centro = MARGEM.esquerda + faixa * (i + 0.5)
              const x = centro - coluna / 2
              const atrasados = s.enviados - s.noPrazo
              const hPrazo = y(s.noPrazo)
              const hAtraso = y(atrasados)
              const temOsDois = s.noPrazo > 0 && atrasados > 0
              // Com as duas partes, o intervalo sai da parte de cima: a
              // altura total continua proporcional ao total de enviados.
              const hAtrasoVisivel = temOsDois ? Math.max(0, hAtraso - INTERVALO) : hAtraso
              const topoPrazo = base - hPrazo
              const topoTotal = base - hPrazo - hAtraso
              const escurecida = ativa !== null && ativa !== i

              return (
                <g key={s.semana} opacity={escurecida ? 0.45 : 1} className="transition-opacity">
                  {s.noPrazo > 0 && (
                    <path
                      d={caminhoDaColuna(x, topoPrazo, coluna, hPrazo, atrasados > 0 ? 0 : RAIO)}
                      className="fill-grafico"
                    />
                  )}
                  {atrasados > 0 && (
                    <path
                      d={caminhoDaColuna(x, topoTotal, coluna, hAtrasoVisivel, RAIO)}
                      className="fill-grafico-atrasado"
                    />
                  )}
                  <text
                    x={centro}
                    y={topoTotal - 6}
                    textAnchor="middle"
                    className="fill-foreground text-[11px] font-semibold"
                  >
                    {formatarPercentual(s.noPrazo, s.enviados)}
                  </text>
                  <text
                    x={centro}
                    y={base + 16}
                    textAnchor="middle"
                    className="fill-muted-foreground text-[10px] tabular-nums"
                  >
                    {rotuloDaSemana(s.semana, inicioDoPeriodo)}
                  </text>

                  {/* O ALVO É A FAIXA INTEIRA, não a tinta: ninguém mira numa
                      coluna de 24px. Focável pelo teclado, com a mesma dica. */}
                  <rect
                    x={MARGEM.esquerda + faixa * i}
                    y={MARGEM.topo}
                    width={faixa}
                    height={ALTURA_DO_PLOT}
                    fill="transparent"
                    tabIndex={0}
                    aria-label={`Semana de ${rotuloDaSemana(s.semana, inicioDoPeriodo)}: ${s.noPrazo} de ${s.enviados} no prazo`}
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
        )}

        {selecionada && ativa !== null && (
          <DicaDaSemana
            semana={selecionada}
            inicioDoPeriodo={inicioDoPeriodo}
            esquerda={MARGEM.esquerda + faixa * (ativa + 0.5)}
            larguraTotal={largura}
          />
        )}
      </div>

      {/* A TABELA É O GÊMEO DO GRÁFICO: todo número da dica também está aqui,
          sem depender de mouse nenhum. */}
      <details className="text-sm">
        <summary className="cursor-pointer text-xs font-semibold text-muted-foreground hover:text-foreground">
          Ver em tabela
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-xs tabular-nums">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-1 pr-3 font-semibold">Semana</th>
                <th className="py-1 pr-3 font-semibold">Enviados</th>
                <th className="py-1 pr-3 font-semibold">No prazo</th>
                <th className="py-1 pr-3 font-semibold">Parto → envio</th>
                <th className="py-1 font-semibold">Envio → confirmação</th>
              </tr>
            </thead>
            <tbody>
              {semanas.map((s) => (
                <tr key={s.semana} className="border-t border-border">
                  <td className="py-1 pr-3">{rotuloDaSemana(s.semana, inicioDoPeriodo)}</td>
                  <td className="py-1 pr-3">{s.enviados}</td>
                  <td className="py-1 pr-3">
                    {s.noPrazo} ({formatarPercentual(s.noPrazo, s.enviados)})
                  </td>
                  <td className="py-1 pr-3">{formatarHoras(s.medianaHorasAteEnvio)}</td>
                  <td className="py-1">{formatarHoras(s.medianaHorasAteConfirmacao)}</td>
                </tr>
              ))}
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
 * A dica da semana. O VALOR VEM PRIMEIRO e forte, o nome da série depois e
 * fraco — quem abre a dica já sabe de que série está falando e quer o número.
 * As séries são marcadas com um traço curto da cor, não com um quadrado.
 */
function DicaDaSemana({
  semana,
  inicioDoPeriodo,
  esquerda,
  larguraTotal,
}: {
  semana: PrazoDaSemana
  inicioDoPeriodo: string
  esquerda: number
  larguraTotal: number
}) {
  const atrasados = semana.enviados - semana.noPrazo
  // AO LADO da coluna, e não em cima dela: centrada, a dica cobria justamente
  // a coluna que descreve. À direita por padrão; à esquerda quando não cabe.
  const largura = 208
  const folga = COLUNA_MAX / 2 + 12
  const x =
    esquerda + folga + largura <= larguraTotal
      ? esquerda + folga
      : Math.max(0, esquerda - folga - largura)

  return (
    <div
      role="status"
      className="pointer-events-none absolute top-2 z-10 rounded-xl border border-border bg-card p-3 text-xs shadow-lg"
      style={{ left: x, width: largura }}
    >
      <div className="mb-1.5 font-semibold text-muted-foreground">
        Semana de {rotuloDaSemana(semana.semana, inicioDoPeriodo)}
      </div>
      <div className="mb-2 text-base font-extrabold text-foreground">
        {formatarPercentual(semana.noPrazo, semana.enviados)}
        <span className="ml-1 text-xs font-normal text-muted-foreground">no prazo</span>
      </div>
      <Linha cor="bg-grafico" valor={semana.noPrazo} rotulo="no prazo" />
      <Linha cor="bg-grafico-atrasado" valor={atrasados} rotulo="depois de vencer" />
      <div className="mt-2 space-y-0.5 border-t border-border pt-2 text-muted-foreground">
        <div>
          <span className="font-semibold text-foreground">{formatarHoras(semana.medianaHorasAteEnvio)}</span>{' '}
          do parto ao envio
        </div>
        <div>
          <span className="font-semibold text-foreground">
            {formatarHoras(semana.medianaHorasAteConfirmacao)}
          </span>{' '}
          esperando o ADM
        </div>
      </div>
    </div>
  )
}

function Linha({ cor, valor, rotulo }: { cor: string; valor: number; rotulo: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`h-0.5 w-3 rounded-full ${cor}`} aria-hidden="true" />
      <span className="font-bold text-foreground tabular-nums">{valor}</span>
      <span className="text-muted-foreground">{rotulo}</span>
    </div>
  )
}
