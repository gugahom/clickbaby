import { useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { topoRedondo, useTamanho } from '../lib/useTamanho'

/**
 * O GRÁFICO DO KPI ESCOLHIDO — área com brilho, ou barras (29/09/2026, pedido
 * do gestor, a partir de um exemplo de shadcn/recharts que ele mandou).
 *
 * O VISUAL É O DO EXEMPLO, AS PEÇAS SÃO DA CASA. O exemplo trazia recharts,
 * lucide, cva e três componentes do shadcn; nenhum entrou — é o mesmo arranjo
 * do sino (18/09) e da barra lateral (28/09). O recharts sozinho somaria mais
 * de 100kB ao carregamento de todo mundo, no 4G do corredor, para desenhar um
 * gráfico que só a gestão abre. Do exemplo ficou o que se vê: a área com
 * degradê que some no chão, a linha e os pontos com brilho, a grade tracejada
 * sem eixo, e a dica em cartão.
 *
 * A CURVA É MONÓTONA, não a "natural" do exemplo: a spline natural passa do
 * ponto entre dois valores, e um prazo de 100% desenharia uma barriga acima de
 * 100% — o gráfico afirmando um número que não existe.
 *
 * DIA SEM DADO É BURACO, não zero: a linha para e recomeça. Um pedaço no futuro
 * ou antes de 01/10/2026 não é "zero partos".
 *
 * BARRAS são a outra forma do mesmo dado ("ver gráfico em barras como está
 * agora"), no mesmo desenho: degradê, topo arredondado, a ativa acesa.
 *
 * SEM TABELA (pedido do gestor). O que ela garantia continua de outro jeito: o
 * gráfico é focável, as setas andam de pedaço em pedaço, e a dica é lida pelo
 * leitor de tela.
 */
export interface PontoDoGrafico {
  /** No eixo: "15/12", "out". */
  rotulo: string
  /** Na dica: "ter, 15 de dezembro", "Outubro de 2026". */
  rotuloLongo: string
  valor: number | null
  detalhe: string[]
}

export type TipoDeGrafico = 'linha' | 'barras'

const MARGEM = { topo: 18, direita: 14, base: 30, esquerda: 44 }
const BARRA_MAX = 28
const RAIO = 4
/** Abaixo disto de espaço entre pontos, só o ativo ganha bolinha. */
const PONTOS_A_PARTIR_DE = 16
/** Espaço mínimo entre dois rótulos do eixo. */
const ROTULO_MIN = 52

export function GraficoDoKpi({
  pontos,
  tipo,
  nomeDaSerie,
  formatar,
  teto,
  descricao,
}: {
  pontos: PontoDoGrafico[]
  tipo: TipoDeGrafico
  /** O KPI, na linha da dica. */
  nomeDaSerie: string
  formatar: (valor: number) => string
  teto?: number | undefined
  /** Para leitor de tela: o que o gráfico mostra. */
  descricao: string
}) {
  const id = useId().replace(/:/g, '')
  const ref = useRef<HTMLDivElement>(null)
  const { largura, altura } = useTamanho(ref)
  const [ativo, setAtivo] = useState<number | null>(null)

  const valores = pontos.map((p) => p.valor).filter((v): v is number => v !== null)
  const vazio = valores.length === 0

  const topo = teto ?? topoRedondo(Math.max(0, ...valores))
  const alturaDoPlot = Math.max(80, altura - MARGEM.topo - MARGEM.base)
  const larguraDoPlot = Math.max(0, largura - MARGEM.esquerda - MARGEM.direita)
  const faixa = pontos.length > 0 ? larguraDoPlot / pontos.length : 0
  const base = MARGEM.topo + alturaDoPlot
  const x = (i: number) => MARGEM.esquerda + faixa * (i + 0.5)
  const y = (v: number) => base - (Math.min(v, topo) / topo) * alturaDoPlot
  const ticks = [0, topo / 2, topo]
  const passoDoRotulo = Math.max(1, Math.ceil(ROTULO_MIN / Math.max(faixa, 1)))
  const comPontos = faixa >= PONTOS_A_PARTIR_DE
  const barra = Math.min(BARRA_MAX, faixa * 0.6)

  const trechos = trechosSemBuraco(pontos.map((p, i) => (p.valor === null ? null : { x: x(i), y: y(p.valor) })))

  function apontar(e: PointerEvent<SVGRectElement>) {
    const caixa = e.currentTarget.getBoundingClientRect()
    const i = Math.floor((e.clientX - caixa.left) / Math.max(faixa, 1))
    setAtivo(Math.max(0, Math.min(pontos.length - 1, i)))
  }

  function andar(e: KeyboardEvent<SVGRectElement>) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return
    e.preventDefault()
    setAtivo((atual) => {
      const agora = atual ?? pontos.length - 1
      if (e.key === 'Home') return 0
      if (e.key === 'End') return pontos.length - 1
      return Math.max(0, Math.min(pontos.length - 1, agora + (e.key === 'ArrowRight' ? 1 : -1)))
    })
  }

  const pontoAtivo = ativo === null ? null : pontos[ativo]

  return (
    <div ref={ref} className="relative min-h-64 flex-1">
      {vazio ? (
        <p className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          Sem dados neste período.
        </p>
      ) : (
        largura > 0 &&
        altura > 0 && (
          <svg width={largura} height={altura} role="img" aria-label={descricao} className="absolute inset-0 overflow-visible">
            <defs>
              <linearGradient id={`${id}-area`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--grafico)" stopOpacity={0.35} />
                <stop offset="95%" stopColor="var(--grafico)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id={`${id}-barra`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--grafico)" stopOpacity={0.95} />
                <stop offset="100%" stopColor="var(--grafico)" stopOpacity={0.35} />
              </linearGradient>
              <filter id={`${id}-brilho-linha`} x="-10%" y="-20%" width="120%" height="140%">
                <feGaussianBlur stdDeviation="8" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
              <filter id={`${id}-brilho-ponto`} x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            {/* Grade tracejada, sem linha de eixo — a do exemplo. */}
            {ticks.map((t) => (
              <g key={t}>
                <line
                  x1={MARGEM.esquerda}
                  x2={MARGEM.esquerda + larguraDoPlot}
                  y1={y(t)}
                  y2={y(t)}
                  className="stroke-border"
                  strokeDasharray="3 3"
                  strokeWidth={1}
                />
                <text
                  x={MARGEM.esquerda - 10}
                  y={y(t)}
                  dy="0.32em"
                  textAnchor="end"
                  className="fill-muted-foreground text-[10px] tabular-nums"
                >
                  {formatar(t)}
                </text>
              </g>
            ))}

            {pontos.map(
              (p, i) =>
                (i % passoDoRotulo === (pontos.length - 1) % passoDoRotulo) && (
                  <text
                    key={`r-${i}`}
                    x={x(i)}
                    y={base + 20}
                    textAnchor="middle"
                    className={
                      i === ativo ? 'fill-foreground text-[11px] font-semibold' : 'fill-muted-foreground text-[11px]'
                    }
                  >
                    {p.rotulo}
                  </text>
                ),
            )}

            {tipo === 'linha' ? (
              <g>
                {trechos.map((t, n) => (
                  <g key={n}>
                    <path d={`${curva(t)} L${t[t.length - 1]!.x},${base} L${t[0]!.x},${base} Z`} fill={`url(#${id}-area)`} />
                    <path
                      d={curva(t)}
                      fill="none"
                      stroke="var(--grafico)"
                      strokeWidth={2}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      filter={`url(#${id}-brilho-linha)`}
                    />
                  </g>
                ))}
                {pontos.map((p, i) => {
                  if (p.valor === null) return null
                  const eAtivo = i === ativo
                  if (!comPontos && !eAtivo) return null
                  return (
                    <circle
                      key={`p-${i}`}
                      cx={x(i)}
                      cy={y(p.valor)}
                      r={eAtivo ? 6 : 4}
                      fill="var(--grafico)"
                      stroke="var(--card)"
                      strokeWidth={eAtivo ? 3 : 2}
                      filter={eAtivo ? undefined : `url(#${id}-brilho-ponto)`}
                    />
                  )
                })}
              </g>
            ) : (
              <g>
                {pontos.map((p, i) => {
                  if (p.valor === null || p.valor <= 0) return null
                  const topoDaBarra = y(p.valor)
                  return (
                    <path
                      key={`b-${i}`}
                      d={caminhoDaBarra(x(i) - barra / 2, topoDaBarra, barra, base - topoDaBarra)}
                      fill={`url(#${id}-barra)`}
                      opacity={ativo === null || ativo === i ? 1 : 0.45}
                      className="transition-opacity"
                    />
                  )
                })}
              </g>
            )}

            {/* O ALVO É O GRÁFICO INTEIRO: o ponteiro escolhe a faixa em que
                está, e o teclado anda com as setas. */}
            <rect
              x={MARGEM.esquerda}
              y={MARGEM.topo}
              width={larguraDoPlot}
              height={alturaDoPlot}
              fill="transparent"
              tabIndex={0}
              aria-label={`${descricao}. Use as setas para percorrer.`}
              onPointerMove={apontar}
              onPointerLeave={() => setAtivo(null)}
              onFocus={() => setAtivo((a) => a ?? pontos.length - 1)}
              onBlur={() => setAtivo(null)}
              onKeyDown={andar}
              className="cursor-crosshair outline-none focus-visible:stroke-foreground/30"
            />
          </svg>
        )
      )}

      {pontoAtivo && ativo !== null && (
        <Dica
          ponto={pontoAtivo}
          nomeDaSerie={nomeDaSerie}
          formatar={formatar}
          x={x(ativo)}
          y={pontoAtivo.valor === null ? MARGEM.topo : y(pontoAtivo.valor)}
          larguraTotal={largura}
          alturaTotal={altura}
        />
      )}
    </div>
  )
}

type Ponto = { x: number; y: number }

/** Os trechos contínuos da série: um dia sem dado corta a linha em dois. */
function trechosSemBuraco(pontos: (Ponto | null)[]): Ponto[][] {
  const trechos: Ponto[][] = []
  let atual: Ponto[] = []
  for (const p of pontos) {
    if (p) atual.push(p)
    else if (atual.length) {
      trechos.push(atual)
      atual = []
    }
  }
  if (atual.length) trechos.push(atual)
  return trechos
}

/**
 * Curva cúbica MONÓTONA (Fritsch–Carlson): suave como a do exemplo, mas nunca
 * passa acima nem abaixo dos pontos que liga.
 */
function curva(p: Ponto[]): string {
  if (p.length === 1) return `M${p[0]!.x - 3},${p[0]!.y} L${p[0]!.x + 3},${p[0]!.y}`
  const n = p.length
  const dx: number[] = []
  const inc: number[] = []
  for (let i = 0; i < n - 1; i++) {
    dx.push(p[i + 1]!.x - p[i]!.x)
    inc.push((p[i + 1]!.y - p[i]!.y) / dx[i]!)
  }
  const m: number[] = [inc[0]!]
  for (let i = 1; i < n - 1; i++) {
    const a = inc[i - 1]!
    const b = inc[i]!
    m.push(a * b <= 0 ? 0 : (3 * (dx[i - 1]! + dx[i]!)) / ((2 * dx[i]! + dx[i - 1]!) / a + (dx[i]! + 2 * dx[i - 1]!) / b))
  }
  m.push(inc[n - 2]!)
  let d = `M${p[0]!.x},${p[0]!.y}`
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i]! / 3
    d += ` C${p[i]!.x + h},${p[i]!.y + m[i]! * h} ${p[i + 1]!.x - h},${p[i + 1]!.y - m[i + 1]! * h} ${p[i + 1]!.x},${p[i + 1]!.y}`
  }
  return d
}

/** Retângulo com os cantos de CIMA arredondados e a base reta. */
function caminhoDaBarra(x: number, y: number, w: number, h: number): string {
  if (h <= 0) return ''
  const r = Math.min(RAIO, w / 2, h)
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
 * A dica, em cartão como a do exemplo: o pedaço em cima, e a linha do KPI com
 * o quadradinho da cor, o nome e o valor à direita. Embaixo, as contagens que o
 * número resume. AO LADO do ponto, e não em cima — centrada, ela cobria
 * justamente o que descreve.
 */
function Dica({
  ponto,
  nomeDaSerie,
  formatar,
  x,
  y,
  larguraTotal,
  alturaTotal,
}: {
  ponto: PontoDoGrafico
  nomeDaSerie: string
  formatar: (valor: number) => string
  x: number
  y: number
  larguraTotal: number
  alturaTotal: number
}) {
  const largura = 216
  const folga = 16
  const esquerda = x + folga + largura <= larguraTotal ? x + folga : Math.max(0, x - folga - largura)
  const topo = Math.max(0, Math.min(y - 36, alturaTotal - 120))

  return (
    <div
      role="status"
      className="pointer-events-none absolute z-10 grid gap-2 rounded-lg border border-border/60 bg-card px-3 py-2 text-xs shadow-xl"
      style={{ left: esquerda, top: topo, width: largura }}
    >
      <div className="font-medium text-foreground">{ponto.rotuloLongo}</div>
      <div className="flex w-full items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="size-2.5 shrink-0 rounded-[2px] bg-grafico" aria-hidden="true" />
          <span className="text-muted-foreground">{nomeDaSerie}</span>
        </div>
        <span className="font-semibold text-foreground tabular-nums">
          {ponto.valor === null ? 'sem dado' : formatar(ponto.valor)}
        </span>
      </div>
      {ponto.detalhe.length > 0 && (
        <div className="space-y-0.5 border-t border-border/60 pt-1.5 text-muted-foreground">
          {ponto.detalhe.map((linha) => (
            <div key={linha}>{linha}</div>
          ))}
        </div>
      )}
    </div>
  )
}
