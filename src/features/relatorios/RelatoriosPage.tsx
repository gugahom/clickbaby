import { useState } from 'react'
import clsx from 'clsx'
import { Botao } from '@/components/ui/Botao'
import {
  useMetricasDaEquipe,
  useMetricasPorPessoa,
  usePadroesDeTempo,
  useSerieDaEquipe,
} from './api/useMetricas'
import { PadroesDeTempo } from './components/PadroesDeTempo'
import { TabelaDePontuacao } from './components/TabelaDePontuacao'
import { PainelDaEquipe } from './components/PainelDaEquipe'
import { AbaPessoas } from './components/AbaPessoas'
import { TrilhoDeAbas } from './components/TrilhoDeAbas'
import { kpisDaEquipe } from './lib/kpis'
import {
  INICIO_DAS_METRICAS,
  MES_INICIAL,
  hojeDoRelatorio,
  deslocarMes,
  mesPadrao,
  periodoDoMes,
  rotuloDoMes,
} from './lib/metricas'

type Aba = 'equipe' | 'pessoas' | 'pontuacao' | 'padroes'

const ABAS: { id: Aba; rotulo: string }[] = [
  { id: 'equipe', rotulo: 'Equipe' },
  { id: 'pessoas', rotulo: 'Pessoas' },
  { id: 'pontuacao', rotulo: 'Pontuação' },
  { id: 'padroes', rotulo: 'Padrões de tempo' },
]

/**
 * RELATÓRIOS — os KPIs da equipe (28/09/2026, pedido do gestor).
 *
 * SEGUNDA VERSÃO, do mesmo dia. A primeira tinha quatro abas e mostrava tudo o
 * que o banco sabe; o gestor a recusou — "ficou muita informação (…) foco em
 * KPI e métricas". Esta tem três: EQUIPE (seis KPIs com variação e tendência,
 * e um gráfico), PESSOAS (três destaques e uma tabela de KPIs que é o ranking)
 * e PADRÕES DE TEMPO (a régua). O que saiu, e por quê, está nos componentes.
 *
 * SÓ A GESTÃO vê — a rota está atrás da `RotaDeGestao`, e cada função confere o
 * papel de novo no banco. CONTA A PARTIR DE 01/10/2026: o seletor não oferece
 * nada antes, e o banco não devolve.
 *
 * O MÊS ANTERIOR É LIDO JUNTO, só para a variação dos KPIs: uma chamada da
 * série em grão de mês cobrindo os dois devolve os dois números. Em outubro de
 * 2026 o anterior é setembro — antes do piso —, vem zerado, e a variação não
 * aparece.
 *
 * A PÁGINA É LARGA (29/09/2026): o painel da equipe põe o gráfico ao lado da
 * lista de KPIs, e na largura antiga (72rem) ele sobraria espremido com a tela
 * vazia dos dois lados — o incômodo que motivou a mudança.
 */
export function RelatoriosPage() {
  const [{ hoje, simulado }] = useState(hojeDoRelatorio)
  const [mes, setMes] = useState(() => mesPadrao(hoje))
  const [aba, setAba] = useState<Aba>('equipe')
  // O filtro da Produção. Nula = a equipe inteira.
  const [pessoaId, setPessoaId] = useState<string | null>(null)

  const periodo = periodoDoMes(mes)
  const anterior = periodoDoMes(deslocarMes(mes, -1))

  const equipe = useMetricasDaEquipe(periodo)
  const pessoas = useMetricasPorPessoa(periodo)
  const padroes = usePadroesDeTempo()
  const doisMeses = useSerieDaEquipe({ inicio: anterior.inicio, fim: periodo.fim }, 'mes')
  // A Produção segue o filtro de pessoa; sem pessoa, estas são as mesmas
  // consultas de cima (mesma chave, mesmo cache).
  const doisMesesDaProducao = useSerieDaEquipe({ inicio: anterior.inicio, fim: periodo.fim }, 'mes', pessoaId)
  const blocos = useSerieDaEquipe(periodo, 'bloco', pessoaId)

  // A aba Pessoas lê as dela, com o período dos filtros dela (`AbaPessoas`).
  const consultas = [equipe, pessoas, padroes, doisMeses, doisMesesDaProducao, blocos]
  const erro = consultas.find((c) => c.error)?.error
  const primeiraCarga = consultas.some((c) => c.isPending)
  // Trocando de mês: o quadro anterior fica, esmaecido, até o novo chegar.
  const atualizando = consultas.some((c) => c.isPlaceholderData)

  const meses = doisMeses.data ?? []
  const { entrega } = kpisDaEquipe(
    meses.find((b) => b.inicio === periodo.inicio),
    meses.find((b) => b.inicio === anterior.inicio),
    [],
    hoje,
  )
  const mesesDaProducao = doisMesesDaProducao.data ?? []
  const { producao } = kpisDaEquipe(
    mesesDaProducao.find((b) => b.inicio === periodo.inicio),
    mesesDaProducao.find((b) => b.inicio === anterior.inicio),
    blocos.data ?? [],
    hoje,
  )
  const quemPodeSerFiltrado = (pessoas.data ?? [])
    .map((p) => ({ id: p.pessoaId, nome: p.nome }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

  return (
    <div className="mx-auto w-full max-w-[100rem] space-y-5 p-3 md:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-extrabold tracking-tight">Relatório interno</h1>
        <p className="text-sm text-muted-foreground">
          KPIs da equipe, contando a partir de {INICIO_DAS_METRICAS.split('-').reverse().join('/')}.
          {simulado && (
            <span className="ml-2 rounded-full bg-atencao/15 px-2 py-0.5 text-xs font-semibold text-atencao-tinta">
              Data simulada: {hoje.split('-').reverse().join('/')} · só no local ·{' '}
              <a href="?hoje=real" className="underline underline-offset-2">
                usar a data real
              </a>
            </span>
          )}
        </p>
      </header>

      {/* Os filtros numa linha só, acima de tudo o que eles recortam. */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-painel border border-border bg-card p-1">
          <Botao
            variante="fantasma"
            onClick={() => setMes((m) => deslocarMes(m, -1))}
            disabled={mes <= MES_INICIAL}
            aria-label="Mês anterior"
          >
            ‹
          </Botao>
          <span className="min-w-[10rem] text-center text-base font-bold">{rotuloDoMes(mes)}</span>
          <Botao
            variante="fantasma"
            onClick={() => setMes((m) => deslocarMes(m, 1))}
            disabled={mes >= mesPadrao(hoje)}
            aria-label="Próximo mês"
          >
            ›
          </Botao>
        </div>
        <TrilhoDeAbas abas={ABAS} ativa={aba} onTrocar={setAba} />
      </div>

      {erro ? (
        <p className="rounded-painel border border-atrasado/40 bg-card p-4 text-sm text-atrasado">
          Não deu para carregar o relatório: {erro.message}
        </p>
      ) : primeiraCarga ? (
        <p className="py-16 text-center text-sm text-muted-foreground">Carregando…</p>
      ) : (
        <div className={clsx('transition-opacity', atualizando && 'opacity-60')}>
          {aba === 'equipe' && (
            <PainelDaEquipe
              entrega={entrega}
              producao={producao}
              mes={mes}
              hoje={hoje}
              pessoas={quemPodeSerFiltrado}
              pessoaId={pessoaId}
              onTrocarPessoa={setPessoaId}
            />
          )}
          {aba === 'pessoas' && (
            <AbaPessoas mes={mes} periodoDoMes={periodo} hoje={hoje} />
          )}
          {aba === 'pontuacao' && <TabelaDePontuacao />}
          {aba === 'padroes' && (
            <PadroesDeTempo
              equipe={equipe.data ?? []}
              padroes={padroes.data ?? []}
              periodo={periodo}
              rotuloDoPeriodo={`em ${rotuloDoMes(mes).toLowerCase()}`}
            />
          )}
        </div>
      )}
    </div>
  )
}
