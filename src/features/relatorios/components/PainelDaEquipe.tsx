import { useRef, useState, type ReactNode } from 'react'
import type { BaldeDaSerie } from '../api/useMetricas'
import type { ChaveKpi, Kpi } from '../lib/kpis'
import { CartaoKpi } from './CartaoKpi'
import { DetalheDoKpi } from './DetalheDoKpi'

/**
 * O PAINEL DA EQUIPE — seis KPIs e um gráfico.
 *
 * Refeito no mesmo dia (28/09) a pedido do gestor: a primeira versão tinha
 * barras por tipo, medidores com parágrafos e avisos, e ele leu como "muita
 * informação". Um painel de KPI responde "estamos bem?" num olhar; o resto
 * mora na aba Pessoas.
 *
 * DOIS GRUPOS, e o prazo abre o primeiro como o único número-herói da tela —
 * é o que a empresa vende, e o dado mais confiável do banco.
 *
 * LISTA À ESQUERDA, GRÁFICO À DIREITA (29/09/2026, pedido do gestor: "espaço
 * em branco demais"). No computador os cartões viram uma coluna e o gráfico do
 * KPI escolhido ocupa o resto da largura, na altura da lista — é ela que manda,
 * e o gráfico se mede pelo espaço que recebe. Abaixo de 1280px volta a ser
 * cartões em cima e gráfico embaixo, e o toque num cartão rola até ele.
 */
const TELA_LARGA = '(min-width: 1280px)'

export function PainelDaEquipe({
  entrega,
  producao,
  mes,
  hoje,
  blocosDoMes,
}: {
  entrega: Kpi[]
  producao: Kpi[]
  mes: string
  hoje: string
  blocosDoMes: BaldeDaSerie[]
}) {
  const [escolhido, setEscolhido] = useState<ChaveKpi>('prazo')
  const detalhe = useRef<HTMLDivElement>(null)
  const kpi = [...entrega, ...producao].find((k) => k.chave === escolhido)

  function escolher(chave: ChaveKpi) {
    setEscolhido(chave)
    // Lado a lado o gráfico já está à vista; empilhado, ele fica lá embaixo.
    if (!window.matchMedia(TELA_LARGA).matches) {
      const suave = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
      detalhe.current?.scrollIntoView({ behavior: suave ? 'smooth' : 'auto', block: 'start' })
    }
  }

  const cartoes = (lista: Kpi[], comHeroi: boolean) =>
    lista.map((k, i) => (
      <CartaoKpi
        key={k.chave}
        kpi={k}
        destaque={comHeroi && i === 0}
        selecionado={k.chave === escolhido}
        onSelecionar={() => escolher(k.chave)}
      />
    ))

  return (
    <div className="grid gap-5 xl:grid-cols-[22rem_minmax(0,1fr)]">
      <div className="space-y-5">
        <Grupo titulo="Entrega">{cartoes(entrega, true)}</Grupo>
        <Grupo titulo="Produção">{cartoes(producao, false)}</Grupo>
      </div>

      <div ref={detalhe} className="min-w-0 scroll-mt-4">
        <DetalheDoKpi
          chave={escolhido}
          rotulo={kpi?.rotulo ?? ''}
          mes={mes}
          hoje={hoje}
          blocosDoMes={blocosDoMes}
        />
      </div>
    </div>
  )
}

function Grupo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="rotulo-sobrescrito text-acento">{titulo}</h2>
      <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">{children}</div>
    </section>
  )
}

export function Cartao({
  titulo,
  acao,
  children,
}: {
  titulo: string
  acao?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="rounded-painel border border-border bg-card p-4">
      <header className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-bold tracking-tight text-foreground">{titulo}</h2>
        {acao}
      </header>
      {children}
    </section>
  )
}
