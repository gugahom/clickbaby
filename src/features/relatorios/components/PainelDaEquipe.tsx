import { useRef, useState, type ReactNode } from 'react'
import clsx from 'clsx'
import { Dropdown } from '@/components/ui/Dropdown'
import type { ChaveKpi, Kpi } from '../lib/kpis'
import { CartaoKpi } from './CartaoKpi'
import { DetalheDoKpi } from './DetalheDoKpi'

/**
 * O PAINEL DA EQUIPE.
 *
 * Refeito no mesmo dia (28/09) a pedido do gestor: a primeira versão tinha
 * barras por tipo, medidores com parágrafos e avisos, e ele leu como "muita
 * informação". Um painel de KPI responde "estamos bem?" num olhar; o resto
 * mora na aba Pessoas.
 *
 * SÓ A PRODUÇÃO VIRA GRÁFICO (29/09/2026, terceira volta do gestor: "apenas o
 * que está nomeado de produção é importante virar gráfico"). Partos, edições e
 * tempo de edição ficam à esquerda, clicáveis, com o gráfico do escolhido ao
 * lado; a ENTREGA — prazo, do parto ao envio, voltou para ajuste — desce para
 * uma faixa de NÚMEROS FIXOS embaixo ("esses números fixos são mais
 * importantes"): sem mini-linha, sem clique, só o número, a variação e o
 * detalhe.
 *
 * O FILTRO POR PESSOA mora no título da Produção, porque é ela que ele filtra:
 * os três cartões e o gráfico passam a ser da produção daquela pessoa ("assim
 * que selecionar uma pessoa ele deve filtrar os partos realizados por esse
 * funcionário naquele período"). A Entrega continua da EQUIPE, e diz isso: o
 * prazo é do caso, que passa por várias mãos.
 *
 * No computador (≥1280px) cartões à esquerda e gráfico ao lado; abaixo disso,
 * empilhado, e o toque num cartão rola até o gráfico.
 */
const TELA_LARGA = '(min-width: 1280px)'

export function PainelDaEquipe({
  entrega,
  producao,
  mes,
  hoje,
  pessoas,
  pessoaId,
  onTrocarPessoa,
}: {
  entrega: Kpi[]
  producao: Kpi[]
  mes: string
  hoje: string
  /** Quem pode ser escolhido no filtro, já em ordem. */
  pessoas: { id: string; nome: string }[]
  pessoaId: string | null
  onTrocarPessoa: (pessoaId: string | null) => void
}) {
  const [escolhido, setEscolhido] = useState<ChaveKpi>('partos')
  const detalhe = useRef<HTMLDivElement>(null)
  const kpi = producao.find((k) => k.chave === escolhido) ?? producao[0]
  const nomeDaPessoa = pessoas.find((p) => p.id === pessoaId)?.nome ?? null

  function escolher(chave: ChaveKpi) {
    setEscolhido(chave)
    // Lado a lado o gráfico já está à vista; empilhado, ele fica lá embaixo.
    if (!window.matchMedia(TELA_LARGA).matches) {
      const suave = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
      detalhe.current?.scrollIntoView({ behavior: suave ? 'smooth' : 'auto', block: 'start' })
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-5 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <section className="space-y-2">
          <div className="flex min-h-11 flex-wrap items-center justify-between gap-2">
            <h2 className="rotulo-sobrescrito text-acento">Produção</h2>
            <Dropdown
              buscavel
              alinhamento="direita"
              placeholderBusca="Buscar pessoa"
              rotulo="Toda a equipe"
              selecionado={pessoaId ?? 'equipe'}
              onEscolher={(item) => onTrocarPessoa(item.id === 'equipe' ? null : item.id)}
              itens={[{ id: 'equipe', rotulo: 'Toda a equipe' }, ...pessoas.map((p) => ({ id: p.id, rotulo: p.nome }))]}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
            {producao.map((k) => (
              <CartaoKpi
                key={k.chave}
                kpi={k}
                selecionado={k.chave === kpi?.chave}
                onSelecionar={() => escolher(k.chave)}
              />
            ))}
          </div>
        </section>

        <div ref={detalhe} className="min-w-0 scroll-mt-4">
          {kpi && (
            <DetalheDoKpi
              chave={kpi.chave}
              rotulo={kpi.rotulo}
              mes={mes}
              hoje={hoje}
              pessoaId={pessoaId}
              nomeDaPessoa={nomeDaPessoa}
            />
          )}
        </div>
      </div>

      <Grupo titulo="Entrega" nota="da equipe">
        {entrega.map((k, i) => (
          <CartaoKpi key={k.chave} kpi={{ ...k, tendencia: undefined }} destaque={i === 0} />
        ))}
      </Grupo>
    </div>
  )
}

function Grupo({ titulo, nota, children }: { titulo: string; nota?: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="rotulo-sobrescrito text-acento">
        {titulo}
        {nota && <span className="ml-2 font-normal tracking-normal text-muted-foreground normal-case">{nota}</span>}
      </h2>
      <div className="grid gap-3 sm:grid-cols-3">{children}</div>
    </section>
  )
}

export function Cartao({
  titulo,
  acao,
  className,
  children,
}: {
  titulo: string
  acao?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <section className={clsx('rounded-painel border border-border bg-card p-4', className)}>
      <header className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-bold tracking-tight text-foreground">{titulo}</h2>
        {acao}
      </header>
      {children}
    </section>
  )
}
