import { useState, type ReactNode } from 'react'
import clsx from 'clsx'
import { m, useReducedMotion } from 'motion/react'
import { useSerieDaEquipe } from '../api/useMetricas'
import { GRAFICO_DO_KPI, type ChaveKpi, type Variacao } from '../lib/kpis'
import {
  INICIO_DAS_METRICAS,
  dataCurta,
  diasCorridos,
  janelaDoGrafico,
  periodoDoMes,
  rotuloCurtoDoPedaco,
  rotuloLongoDoPedaco,
  type Janela,
} from '../lib/metricas'
import { GraficoDoKpi, type TipoDeGrafico } from './GraficoDoKpi'

/**
 * O KPI ESCOLHIDO, EM GRANDE (29/09/2026, pedido do gestor).
 *
 * A tela tinha espaço sobrando dos dois lados e mini-linhas pequenas demais
 * para ler. A ideia dele: clicar num cartão e o gráfico daquele KPI aparecer ao
 * lado. O painel NASCE CHEIO, no prazo cumprido, e o clique NÃO DESLIZA a tela
 * — o cartão escolhido ganha o contorno e o gráfico troca com um esmaecer.
 *
 * AS JANELAS (segunda volta, no mesmo dia): a primeira versão comparava mês com
 * mês e ano com ano, e o gestor achou "meio esquisito". Ficaram três janelas
 * que terminam hoje — ÚLTIMA SEMANA e ÚLTIMOS 30 DIAS, dia a dia, e ÚLTIMO ANO,
 * mês a mês —, e a comparação virou o SELO do título: a janela contra a de
 * mesmo tamanho logo antes, com seta e sinal, e a cor dizendo se foi para o
 * lado bom. Quando o mês escolhido no topo já passou, as janelas terminam no
 * último dia dele, para o gráfico continuar falando do mês que está na tela.
 */

type EstadoDoSelo = { variacao: Variacao; contra: string } | null

const NOME_DA_JANELA: Record<Janela, { rotulo: string; titulo: string; anterior: string }> = {
  semana: { rotulo: 'Semana', titulo: 'Últimos 7 dias', anterior: 'os 7 dias anteriores' },
  '30dias': { rotulo: '30 dias', titulo: 'Últimos 30 dias', anterior: 'os 30 dias anteriores' },
  ano: { rotulo: 'Ano', titulo: 'Últimos 12 meses', anterior: 'os 12 meses anteriores' },
}

export function DetalheDoKpi({
  chave,
  rotulo,
  mes,
  hoje,
}: {
  chave: ChaveKpi
  rotulo: string
  /** 'YYYY-MM' escolhido no topo da tela. */
  mes: string
  hoje: string
}) {
  const [janela, setJanela] = useState<Janela>('30dias')
  const [tipo, setTipo] = useState<TipoDeGrafico>('linha')
  const semMovimento = useReducedMotion()

  const fimDoMes = periodoDoMes(mes).fim
  const ancora = fimDoMes < hoje ? fimDoMes : hoje
  const { atual, anterior, grao } = janelaDoGrafico(janela, ancora)
  const anteriorTemDado = anterior.fim >= INICIO_DAS_METRICAS

  const serie = useSerieDaEquipe(atual, grao)
  const totalAtual = useSerieDaEquipe(atual, 'periodo')
  const totalAnterior = useSerieDaEquipe(anteriorTemDado ? anterior : null, 'periodo')

  const g = GRAFICO_DO_KPI[chave]
  const pontos = (serie.data ?? []).map((b) => {
    const dias = diasCorridos(b, hoje)
    return {
      rotulo: rotuloCurtoDoPedaco(b, grao),
      rotuloLongo: rotuloLongoDoPedaco(b, grao),
      valor: g.valor(b, dias),
      detalhe: dias === 0 ? [] : g.detalhe(b, dias),
    }
  })

  // O selo: o valor da janela inteira contra o da anterior. Da janela INTEIRA,
  // e não da soma dos pontos — mediana não se compõe.
  const a = totalAtual.data?.[0]
  const b = anteriorTemDado ? totalAnterior.data?.[0] : undefined
  const va = a ? g.valor(a, diasCorridos(a, hoje)) : null
  const vb = b ? g.valor(b, diasCorridos(b, hoje)) : null
  const variacao = va !== null && vb !== null ? g.comparar(va, vb) : undefined
  const selo: EstadoDoSelo = variacao ? { variacao, contra: NOME_DA_JANELA[janela].anterior } : null

  const descricao = [
    `${NOME_DA_JANELA[janela].titulo}, até ${dataCurta(ancora)}`,
    g.unidade ? `média ${g.unidade}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <section className="flex h-full min-h-0 flex-col rounded-painel border border-border bg-card p-4 shadow-sm md:p-6">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0 space-y-1.5">
          <h2 className="flex flex-wrap items-center gap-2 text-lg leading-none font-semibold tracking-tight text-foreground">
            {rotulo}
            {selo && <Selo {...selo} />}
          </h2>
          <p className="text-sm text-muted-foreground">
            {descricao}
            {selo && <span className="text-muted-foreground/80"> · selo contra {selo.contra}</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmentado
            rotulo="Período do gráfico"
            opcoes={(['semana', '30dias', 'ano'] as const).map((j) => ({ id: j, conteudo: NOME_DA_JANELA[j].rotulo }))}
            ativa={janela}
            onTrocar={setJanela}
          />
          <Segmentado
            rotulo="Forma do gráfico"
            opcoes={[
              { id: 'linha', conteudo: <IconeLinha />, titulo: 'Linha' },
              { id: 'barras', conteudo: <IconeBarras />, titulo: 'Barras' },
            ]}
            ativa={tipo}
            onTrocar={setTipo}
          />
        </div>
      </header>

      {serie.isPending ? (
        <p className="flex min-h-64 flex-1 items-center justify-center text-sm text-muted-foreground">Carregando…</p>
      ) : (
        <m.div
          key={`${chave}-${janela}-${tipo}`}
          initial={semMovimento ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.18 }}
          className={clsx('flex min-h-0 flex-1 flex-col transition-opacity', serie.isPlaceholderData && 'opacity-60')}
        >
          <GraficoDoKpi
            pontos={pontos}
            tipo={tipo}
            nomeDaSerie={rotulo}
            formatar={g.formatar}
            teto={g.teto}
            descricao={`${rotulo}: ${descricao}`}
          />
        </m.div>
      )}
    </section>
  )
}

/**
 * O selo do título, no lugar do "+144%" do exemplo. Seta e sinal sempre — a
 * cor sozinha não diz a direção para quem não distingue verde de vermelho — e
 * a cor vem de "subir é bom?", como na variação dos cartões.
 */
function Selo({ variacao, contra }: { variacao: Variacao; contra: string }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums',
        variacao.tom === 'bom' && 'bg-concluido/12 text-concluido-tinta',
        variacao.tom === 'ruim' && 'bg-atrasado/10 text-atrasado',
        variacao.tom === 'neutro' && 'bg-foreground/6 text-foreground',
      )}
      title={`Contra ${contra}`}
    >
      <span aria-hidden="true">
        {variacao.direcao === 'sobe' ? '▲' : variacao.direcao === 'desce' ? '▼' : '='}
      </span>
      {variacao.texto}
      <span className="sr-only"> contra {contra}</span>
    </span>
  )
}

/**
 * Um controle de duas ou três opções, pequeno: mora no cabeçalho de um cartão,
 * ao lado do título, e as abas grandes da tela (`TrilhoDeAbas`) brigariam com
 * elas.
 */
function Segmentado<T extends string>({
  rotulo,
  opcoes,
  ativa,
  onTrocar,
}: {
  rotulo: string
  opcoes: { id: T; conteudo: ReactNode; titulo?: string }[]
  ativa: T
  onTrocar: (id: T) => void
}) {
  return (
    <div role="group" aria-label={rotulo} className="inline-flex rounded-full border border-border bg-background p-0.5">
      {opcoes.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={ativa === o.id}
          aria-label={o.titulo}
          title={o.titulo}
          onClick={() => onTrocar(o.id)}
          className={clsx(
            'inline-flex h-8 min-w-8 items-center justify-center rounded-full px-3 text-xs whitespace-nowrap transition-colors',
            ativa === o.id
              ? 'bg-marca font-bold text-white'
              : 'font-medium text-muted-foreground hover:bg-marca-suave hover:text-marca',
          )}
        >
          {o.conteudo}
        </button>
      ))}
    </div>
  )
}

function IconeLinha() {
  return (
    <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path d="M1.5 12.5 5.5 7.5 8.5 10 14.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconeBarras() {
  return (
    <svg viewBox="0 0 16 16" className="size-4" fill="currentColor" aria-hidden="true">
      <rect x="2" y="8" width="3" height="6" rx="1" />
      <rect x="6.5" y="4" width="3" height="10" rx="1" />
      <rect x="11" y="6" width="3" height="8" rx="1" />
    </svg>
  )
}
