import { useState } from 'react'
import clsx from 'clsx'
import { m, useReducedMotion } from 'motion/react'
import { useSerieDaEquipe, type BaldeDaSerie, type Grao } from '../api/useMetricas'
import { GRAFICO_DO_KPI, type ChaveKpi } from '../lib/kpis'
import {
  INICIO_DAS_METRICAS,
  deslocarMes,
  diasCorridos,
  periodoDoAno,
  periodoDoMes,
  rotuloCurtoDoPedaco,
  rotuloDoMes,
  rotuloLongoDoPedaco,
} from '../lib/metricas'
import { GraficoDoKpi, type ColunaDoGrafico } from './GraficoDoKpi'

/**
 * O KPI ESCOLHIDO, EM GRANDE (29/09/2026, pedido do gestor).
 *
 * A tela tinha espaço sobrando dos dois lados e mini-linhas pequenas demais
 * para ler. A ideia dele: clicar num cartão e o gráfico daquele KPI aparecer ao
 * lado. Duas mudanças no caminho, as duas combinadas com ele:
 *   * o painel NASCE CHEIO, no prazo cumprido (o número-herói) — um lado
 *     direito que só aparece depois do clique deixaria o vazio lá enquanto
 *     ninguém clica, que é quase sempre;
 *   * o clique NÃO DESLIZA a tela: o cartão escolhido ganha o contorno da marca
 *     e o gráfico troca com um esmaecer. Deslizar tiraria o cartão de baixo do
 *     mouse a cada toque.
 * Continua UM gráfico na visão — o que ele troca é o assunto.
 *
 * AS COMPARAÇÕES ("meses, anos e etc"): MÊS em blocos de 7 dias, contra o mês
 * anterior ou o mesmo mês do ano passado; ANO mês a mês, contra o ano
 * anterior. Uma opção cujo período termina antes de 01/10/2026 não tem o que
 * mostrar, e a tela diz isso em vez de desenhar zeros — o "mesmo mês do ano
 * passado" só acende em outubro de 2027.
 */

type Visao = 'mes' | 'ano'
type Comparacao = 'nada' | 'anterior' | 'ano-passado'

export function DetalheDoKpi({
  chave,
  rotulo,
  mes,
  hoje,
  blocosDoMes,
}: {
  chave: ChaveKpi
  rotulo: string
  /** 'YYYY-MM' escolhido no topo da tela. */
  mes: string
  hoje: string
  /** Os blocos do mês, que a tela já leu para as mini-linhas. */
  blocosDoMes: BaldeDaSerie[]
}) {
  const [visao, setVisao] = useState<Visao>('mes')
  const [escolhida, setEscolhida] = useState<Comparacao>('anterior')
  const semMovimento = useReducedMotion()

  const ano = mes.slice(0, 4)
  const anoAnterior = String(Number(ano) - 1)
  const grao: Grao = visao === 'mes' ? 'bloco' : 'mes'
  // No ano, "ano passado" e "anterior" são a mesma coisa.
  const comparacao: Comparacao = visao === 'ano' && escolhida === 'ano-passado' ? 'anterior' : escolhida

  const mesDaComparacao = comparacao === 'anterior' ? deslocarMes(mes, -1) : deslocarMes(mes, -12)
  const periodoDaComparacao =
    comparacao === 'nada' ? null : visao === 'mes' ? periodoDoMes(mesDaComparacao) : periodoDoAno(anoAnterior)
  const nomeDaComparacao =
    comparacao === 'nada' ? null : visao === 'mes' ? rotuloDoMes(mesDaComparacao) : anoAnterior
  const temDado = (periodo: { fim: string }) => periodo.fim >= INICIO_DAS_METRICAS
  const comparacaoValida = periodoDaComparacao !== null && temDado(periodoDaComparacao)

  const serieDoAno = useSerieDaEquipe(visao === 'ano' ? periodoDoAno(ano) : null, 'mes')
  const serieDaComparacao = useSerieDaEquipe(comparacaoValida ? periodoDaComparacao : null, grao)

  const baldes = visao === 'mes' ? blocosDoMes : (serieDoAno.data ?? [])
  const baldesDaComparacao = comparacaoValida ? (serieDaComparacao.data ?? null) : null
  const carregando = (visao === 'ano' && serieDoAno.isPending) || (comparacaoValida && serieDaComparacao.isPending)
  const atualizando = serieDoAno.isPlaceholderData || serieDaComparacao.isPlaceholderData

  const g = GRAFICO_DO_KPI[chave]
  const colunas = (lista: BaldeDaSerie[]): ColunaDoGrafico[] =>
    lista.map((b) => {
      const dias = diasCorridos(b, hoje)
      return {
        rotulo: rotuloCurtoDoPedaco(b, grao),
        rotuloLongo: rotuloLongoDoPedaco(b, grao),
        valor: g.valor(b, dias),
        detalhe: dias === 0 ? [] : g.detalhe(b, dias),
        destaque: visao === 'ano' && b.inicio.slice(0, 7) === mes,
      }
    })

  const nomeAtual = visao === 'mes' ? rotuloDoMes(mes) : ano
  const subtitulo = [
    visao === 'mes' ? `${rotuloDoMes(mes)}, em blocos de 7 dias` : `${ano}, mês a mês`,
    g.unidade ? `média ${g.unidade}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  const opcoesDeComparacao: { id: Comparacao; rotulo: string; semDado: boolean }[] =
    visao === 'mes'
      ? [
          { id: 'nada', rotulo: 'Nada', semDado: false },
          { id: 'anterior', rotulo: 'Mês anterior', semDado: !temDado(periodoDoMes(deslocarMes(mes, -1))) },
          { id: 'ano-passado', rotulo: 'Ano passado', semDado: !temDado(periodoDoMes(deslocarMes(mes, -12))) },
        ]
      : [
          { id: 'nada', rotulo: 'Nada', semDado: false },
          { id: 'anterior', rotulo: 'Ano anterior', semDado: !temDado(periodoDoAno(anoAnterior)) },
        ]

  return (
    <section className="flex h-full min-h-0 flex-col rounded-painel border border-border bg-card p-4 md:p-5">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold tracking-tight text-foreground">{rotulo}</h2>
          <p className="text-xs text-muted-foreground">{subtitulo}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmentado
            rotulo="Período do gráfico"
            opcoes={[
              { id: 'mes', rotulo: 'Mês' },
              { id: 'ano', rotulo: 'Ano' },
            ]}
            ativa={visao}
            onTrocar={setVisao}
          />
          <Segmentado
            rotulo="Comparar com"
            prefixo="Comparar"
            opcoes={opcoesDeComparacao.map((o) => ({
              id: o.id,
              rotulo: o.rotulo,
              aviso: o.semDado ? `Sem dados — as métricas começam em ${dataCurta(INICIO_DAS_METRICAS)}` : undefined,
            }))}
            ativa={comparacao}
            onTrocar={setEscolhida}
          />
        </div>
      </header>

      {periodoDaComparacao !== null && !comparacaoValida && (
        <p className="mb-3 text-xs text-muted-foreground">
          Sem dados de {nomeDaComparacao?.toLowerCase()} para comparar — as métricas começam em{' '}
          {dataCurta(INICIO_DAS_METRICAS)}.
        </p>
      )}

      {carregando ? (
        <p className="flex min-h-60 flex-1 items-center justify-center text-sm text-muted-foreground">Carregando…</p>
      ) : (
        <m.div
          key={`${chave}-${visao}`}
          initial={semMovimento ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.18 }}
          className={clsx('flex min-h-0 flex-1 flex-col transition-opacity', atualizando && 'opacity-60')}
        >
          <GraficoDoKpi
            colunas={colunas(baldes)}
            comparacao={baldesDaComparacao ? colunas(baldesDaComparacao) : null}
            nomeAtual={nomeAtual}
            nomeComparacao={nomeDaComparacao}
            formatar={g.formatar}
            teto={g.teto}
            descricao={`${rotulo}, ${subtitulo}${nomeDaComparacao && comparacaoValida ? `, comparado com ${nomeDaComparacao}` : ''}`}
          />
        </m.div>
      )}
    </section>
  )
}

const dataCurta = (data: string) => data.split('-').reverse().join('/')

/**
 * Um controle de duas ou três opções, pequeno: mora no cabeçalho de um cartão,
 * ao lado do título, e as abas grandes da tela (`TrilhoDeAbas`) brigariam com
 * elas. Opção sem dado continua clicável — escolhê-la mostra o porquê —, só
 * apagada.
 */
function Segmentado<T extends string>({
  rotulo,
  prefixo,
  opcoes,
  ativa,
  onTrocar,
}: {
  rotulo: string
  prefixo?: string
  opcoes: { id: T; rotulo: string; aviso?: string | undefined }[]
  ativa: T
  onTrocar: (id: T) => void
}) {
  return (
    <div className="inline-flex items-center gap-1">
      {prefixo && <span className="pl-1 text-xs text-muted-foreground">{prefixo}</span>}
      <div role="group" aria-label={rotulo} className="inline-flex rounded-full border border-border bg-background p-0.5">
        {opcoes.map((o) => (
          <button
            key={o.id}
            type="button"
            aria-pressed={ativa === o.id}
            title={o.aviso}
            onClick={() => onTrocar(o.id)}
            className={clsx(
              'inline-flex h-8 items-center rounded-full px-3 text-xs whitespace-nowrap transition-colors',
              ativa === o.id
                ? 'bg-marca font-bold text-white'
                : 'font-medium text-muted-foreground hover:bg-marca-suave hover:text-marca',
              o.aviso && ativa !== o.id && 'opacity-55',
            )}
          >
            {o.rotulo}
          </button>
        ))}
      </div>
    </div>
  )
}
