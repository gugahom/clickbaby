import { useState } from 'react'
import clsx from 'clsx'
import { Botao } from '@/components/ui/Botao'
import { hojeNoFuso } from '@/lib/formato'
import {
  useMetricasDaEquipe,
  useMetricasPorEtapa,
  useMetricasPorPessoa,
  usePadroesDeTempo,
  usePrazoDoPeriodo,
  usePrazoPorSemana,
} from './api/useMetricas'
import { FichaDaPessoa } from './components/FichaDaPessoa'
import { PadroesDeTempo } from './components/PadroesDeTempo'
import { PainelDaEquipe } from './components/PainelDaEquipe'
import { RankingPorEtapa } from './components/RankingPorEtapa'
import { TrilhoDeAbas } from './components/TrilhoDeAbas'
import {
  INICIO_DAS_METRICAS,
  MES_INICIAL,
  deslocarMes,
  mesPadrao,
  periodoDoMes,
  rotuloDoMes,
} from './lib/metricas'

type Aba = 'equipe' | 'ranking' | 'individual' | 'padroes'

const PRAZO_VAZIO = { enviados: 0, noPrazo: 0, medianaHorasAteEnvio: null, medianaHorasAteConfirmacao: null }

const ABAS: { id: Aba; rotulo: string }[] = [
  { id: 'equipe', rotulo: 'Equipe' },
  { id: 'ranking', rotulo: 'Ranking' },
  { id: 'individual', rotulo: 'Individual' },
  { id: 'padroes', rotulo: 'Padrões de tempo' },
]

/**
 * RELATÓRIOS — o relatório interno das pessoas (28/09/2026, pedido do gestor).
 *
 * A aba nasceu vazia no mesmo dia, e ganhou o conteúdo depois de um inventário
 * dos dados de produção: o que o banco guarda, e três defeitos que um ranking
 * herdaria (partos creditados a quem não estava na sala, metade das edições
 * sem relógio, e padrões de tempo que nunca foram definidos). O desenho de cada
 * visão responde a um deles — ver a migration 20260929020655.
 *
 * SÓ A GESTÃO vê (decisão do gestor): a rota está atrás da `RotaDeGestao`, e
 * cada função de métrica confere o papel de novo no banco.
 *
 * CONTA A PARTIR DE 01/10/2026 (decisão do gestor): setembro e o passado
 * continuam no banco, e o relatório não os lê. A tela diz isso em voz alta, e
 * o seletor de mês não oferece nada antes.
 *
 * O MÊS ESTÁ ACIMA DE TUDO, numa linha só, e recorta TODAS as visões: os
 * números de uma aba e de outra precisam concordar, e isso só acontece se
 * vierem do mesmo recorte.
 */
export function RelatoriosPage() {
  const hoje = hojeNoFuso()
  const [mes, setMes] = useState(() => mesPadrao(hoje))
  const [aba, setAba] = useState<Aba>('equipe')
  const [pessoaId, setPessoaId] = useState<string | null>(null)

  const periodo = periodoDoMes(mes)
  const porEtapa = useMetricasPorEtapa(periodo)
  const equipe = useMetricasDaEquipe(periodo)
  const pessoas = useMetricasPorPessoa(periodo)
  const semanas = usePrazoPorSemana(periodo)
  const prazo = usePrazoDoPeriodo(periodo)
  const padroes = usePadroesDeTempo()

  const consultas = [porEtapa, equipe, pessoas, semanas, prazo, padroes]
  const erro = consultas.find((c) => c.error)?.error
  const primeiraCarga = consultas.some((c) => c.isPending)
  // Trocando de mês: o quadro anterior fica, esmaecido, até o novo chegar.
  const atualizando = consultas.some((c) => c.isPlaceholderData)

  const ultimoMes = mesPadrao(hoje)

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-3 md:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-extrabold tracking-tight">Relatórios</h1>
        <p className="text-sm text-muted-foreground">
          O trabalho da equipe, pessoa por pessoa. Contando a partir de{' '}
          {INICIO_DAS_METRICAS.split('-').reverse().join('/')}.
        </p>
      </header>

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
            disabled={mes >= ultimoMes}
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
        <p className="py-16 text-center text-sm text-muted-foreground">Carregando o relatório…</p>
      ) : (
        <div className={clsx('transition-opacity', atualizando && 'opacity-60')}>
          {aba === 'equipe' && (
            <PainelDaEquipe
              prazo={prazo.data ?? PRAZO_VAZIO}
              semanas={semanas.data ?? []}
              equipe={equipe.data ?? []}
              porEtapa={porEtapa.data ?? []}
              inicioDoPeriodo={periodo.inicio}
            />
          )}
          {aba === 'ranking' && (
            <RankingPorEtapa
              porEtapa={porEtapa.data ?? []}
              equipe={equipe.data ?? []}
              pessoas={pessoas.data ?? []}
              onAbrirPessoa={(id) => {
                setPessoaId(id)
                setAba('individual')
              }}
            />
          )}
          {aba === 'individual' && (
            <FichaDaPessoa
              pessoaId={pessoaId}
              onTrocarPessoa={setPessoaId}
              pessoas={pessoas.data ?? []}
              porEtapa={porEtapa.data ?? []}
              equipe={equipe.data ?? []}
              padroes={padroes.data ?? []}
            />
          )}
          {aba === 'padroes' && <PadroesDeTempo equipe={equipe.data ?? []} padroes={padroes.data ?? []} />}
        </div>
      )}
    </div>
  )
}
