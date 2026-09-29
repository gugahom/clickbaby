import type { ReactNode } from 'react'
import type { PrazoDaSemana } from '../api/useMetricas'
import type { Kpi } from '../lib/kpis'
import { CartaoKpi } from './CartaoKpi'
import { GraficoDePrazo } from './GraficoDePrazo'

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
 */
export function PainelDaEquipe({
  entrega,
  producao,
  semanas,
  inicioDoPeriodo,
}: {
  entrega: Kpi[]
  producao: Kpi[]
  semanas: PrazoDaSemana[]
  inicioDoPeriodo: string
}) {
  return (
    <div className="space-y-5">
      <Grupo titulo="Entrega">
        {entrega.map((kpi, i) => (
          <CartaoKpi key={kpi.chave} kpi={kpi} destaque={i === 0} />
        ))}
      </Grupo>

      <Grupo titulo="Produção">
        {producao.map((kpi) => (
          <CartaoKpi key={kpi.chave} kpi={kpi} />
        ))}
      </Grupo>

      <Cartao titulo="Prazo semana a semana">
        <GraficoDePrazo semanas={semanas} inicioDoPeriodo={inicioDoPeriodo} />
      </Cartao>
    </div>
  )
}

function Grupo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="rotulo-sobrescrito text-acento">{titulo}</h2>
      <div className="grid gap-3 sm:grid-cols-3">{children}</div>
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
