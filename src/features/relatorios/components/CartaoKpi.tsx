import clsx from 'clsx'
import type { Kpi } from '../lib/kpis'

/**
 * UM KPI: o número, quanto ele andou contra o mês anterior, e para onde vai
 * dentro do mês.
 *
 * A VARIAÇÃO TEM SETA E SINAL, não só cor: quem não distingue verde de
 * vermelho lê "▲ +5 p.p." do mesmo jeito. A cor diz se a mudança é BOA, e por
 * isso vem da regra do KPI (prazo subindo é bom, tempo até o envio subindo é
 * ruim), nunca do sinal sozinho. Volume é neutro.
 *
 * A MINI-LINHA é fraca de propósito — cinza, com só o último ponto na cor do
 * gráfico. Ela conta a direção, não os valores: quem quer o número de um
 * pedaço do mês toca no cartão e lê o gráfico grande.
 *
 * Algarismos proporcionais no número grande: `tabular-nums` deixaria "72%"
 * frouxo no tamanho de título.
 *
 * O CARTÃO DE PRODUÇÃO É UM BOTÃO (29/09/2026): tocar nele troca o gráfico
 * grande do painel, e o escolhido ganha o contorno da marca. Os de ENTREGA são
 * números fixos — sem `onSelecionar` o cartão é só um bloco.
 */
export function CartaoKpi({
  kpi,
  destaque = false,
  selecionado = false,
  onSelecionar,
}: {
  kpi: Kpi
  destaque?: boolean
  selecionado?: boolean
  onSelecionar?: (() => void) | undefined
}) {
  const classes = clsx(
    'flex w-full min-w-0 flex-col gap-2 rounded-painel border bg-card p-4 text-left',
    onSelecionar &&
      'transition-[border-color,box-shadow] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca',
    selecionado
      ? 'border-marca shadow-[0_0_0_1px_var(--marca)]'
      : clsx('border-border', onSelecionar && 'hover:border-marca/40'),
  )
  const conteudo = (
    <>
      <div className="text-sm text-muted-foreground">{kpi.rotulo}</div>

      <div className="flex items-end justify-between gap-3">
        <div
          className={clsx(
            'font-extrabold tracking-tight text-foreground',
            destaque ? 'text-5xl leading-none' : 'text-3xl leading-none',
          )}
        >
          {kpi.valor}
        </div>
        {kpi.tendencia && kpi.tendencia.filter((v) => v !== null).length >= 2 && (
          <MiniLinha valores={kpi.tendencia} />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
        {kpi.variacao && (
          <span
            className={clsx(
              'inline-flex items-center gap-0.5 font-bold',
              kpi.variacao.tom === 'bom' && 'text-concluido-tinta',
              kpi.variacao.tom === 'ruim' && 'text-atrasado',
              kpi.variacao.tom === 'neutro' && 'text-foreground',
            )}
          >
            <span aria-hidden="true">
              {kpi.variacao.direcao === 'sobe' ? '▲' : kpi.variacao.direcao === 'desce' ? '▼' : '='}
            </span>
            {kpi.variacao.texto}
            <span className="font-normal text-muted-foreground">vs mês anterior</span>
          </span>
        )}
        {kpi.detalhe && <span className="text-muted-foreground">{kpi.detalhe}</span>}
      </div>
    </>
  )

  return onSelecionar ? (
    <button type="button" aria-pressed={selecionado} onClick={onSelecionar} className={classes}>
      {conteudo}
    </button>
  ) : (
    <div className={classes}>{conteudo}</div>
  )
}

function MiniLinha({ valores }: { valores: (number | null)[] }) {
  const largura = 72
  const altura = 28
  const validos = valores.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v !== null)
  const min = Math.min(...validos.map((p) => p.v))
  const max = Math.max(...validos.map((p) => p.v))
  const faixa = max - min || 1
  const x = (i: number) => (valores.length === 1 ? largura / 2 : (i / (valores.length - 1)) * (largura - 6) + 3)
  const y = (v: number) => altura - 4 - ((v - min) / faixa) * (altura - 8)
  const ultimo = validos[validos.length - 1]

  return (
    <svg width={largura} height={altura} aria-hidden="true" className="flex-shrink-0">
      <polyline
        points={validos.map((p) => `${x(p.i)},${y(p.v)}`).join(' ')}
        fill="none"
        className="stroke-muted-foreground/45"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {ultimo && <circle cx={x(ultimo.i)} cy={y(ultimo.v)} r={3} className="fill-grafico stroke-card" strokeWidth={2} />}
    </svg>
  )
}
