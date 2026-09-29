import { useState } from 'react'
import clsx from 'clsx'
import type { EtapaTipo } from '@/features/quadro/types'
import type { MetricaDaEquipe, MetricaPorEtapa, MetricaPorPessoa } from '../api/useMetricas'
import {
  AMOSTRA_MINIMA,
  ETAPAS_COM_PRAZO,
  ORDEM_DAS_ETAPAS,
  formatarMinutos,
  formatarPercentual,
  primeiroNome,
  rotuloDaEtapa,
  taxa,
} from '../lib/metricas'
import { Cartao } from './PainelDaEquipe'

type Criterio = 'volume' | 'prazo'

/**
 * O RANKING — por tipo de etapa, nunca somando tipos.
 *
 * UM TIPO POR VEZ: um parto e um reels não se somam, e quem fotografa entraria
 * no mesmo placar de quem edita com números que não se comparam. A pergunta é
 * sempre "quem fez mais PARTOS", "quem entregou mais FOTOS no prazo".
 *
 * DOIS CRITÉRIOS, E TEMPO NÃO É UM DELES (decisão de 28/09). Volume e prazo
 * são difíceis de manipular e são o que a empresa vende. Velocidade virou
 * alvo antes de virar métrica: em setembro, metade das edições foi
 * play-e-concluir, e um ranking de tempo premiaria justamente quem não abre o
 * relógio. O tempo aparece na linha, ao lado da mediana da equipe, como
 * informação — e mora na ficha, comparado com a faixa da equipe.
 *
 * O RANKING É DE QUEM FEZ, qualquer que seja o papel (invariante 3.1): a
 * gestão que fotografa entra. As marcas dizem o resto — "em paralelo" e
 * "registrado por outra pessoa" não tiram ninguém da lista, mostram o que olhar.
 *
 * PRAZO PEDE AMOSTRA: abaixo de 5 edições a taxa não entra na ordem. 3 de 3 não
 * é melhor que 18 de 20; é só menos.
 */
export function RankingPorEtapa({
  porEtapa,
  equipe,
  pessoas,
  onAbrirPessoa,
}: {
  porEtapa: MetricaPorEtapa[]
  equipe: MetricaDaEquipe[]
  pessoas: MetricaPorPessoa[]
  onAbrirPessoa: (pessoaId: string) => void
}) {
  const tiposComDado = ORDEM_DAS_ETAPAS.filter((t) => porEtapa.some((m) => m.tipo === t))
  const [tipoEscolhido, setTipo] = useState<EtapaTipo | null>(null)
  const [criterioEscolhido, setCriterio] = useState<Criterio>('volume')

  const tipo = tipoEscolhido && tiposComDado.includes(tipoEscolhido) ? tipoEscolhido : tiposComDado[0]
  if (!tipo) {
    return (
      <Cartao titulo="Ranking">
        <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma etapa concluída neste período.</p>
      </Cartao>
    )
  }

  const temPrazo = ETAPAS_COM_PRAZO.has(tipo)
  const criterio: Criterio = temPrazo ? criterioEscolhido : 'volume'
  const daEquipe = equipe.find((e) => e.tipo === tipo)
  const nomeDe = new Map(pessoas.map((p) => [p.pessoaId, p.nome]))

  const linhas = porEtapa
    .filter((m) => m.tipo === tipo)
    .map((m) => ({ ...m, nome: nomeDe.get(m.pessoaId) ?? 'Sem nome', taxaPrazo: taxa(m.noPrazo, m.comPrazo) }))

  const ordenadas = [...linhas].sort((a, b) => {
    if (criterio === 'prazo') {
      const aConta = a.comPrazo >= AMOSTRA_MINIMA
      const bConta = b.comPrazo >= AMOSTRA_MINIMA
      if (aConta !== bConta) return aConta ? -1 : 1
      const diferenca = (b.taxaPrazo ?? -1) - (a.taxaPrazo ?? -1)
      if (diferenca !== 0) return diferenca
      return b.comPrazo - a.comPrazo
    }
    return b.concluidas - a.concluidas || a.nome.localeCompare(b.nome)
  })

  // Empate divide a posição (1, 2, 2, 4): dizer que alguém é o 3º quando tem
  // exatamente o número do 2º inventa uma diferença.
  const chaveDoCriterio = (l: (typeof ordenadas)[number]) =>
    criterio === 'prazo' ? (l.comPrazo >= AMOSTRA_MINIMA ? l.taxaPrazo : null) : l.concluidas
  const posicoes: (number | null)[] = []
  ordenadas.forEach((l, i) => {
    const anterior = ordenadas[i - 1]
    if (criterio === 'prazo' && chaveDoCriterio(l) === null) posicoes.push(null)
    else if (i > 0 && anterior && chaveDoCriterio(anterior) === chaveDoCriterio(l)) posicoes.push(posicoes[i - 1] ?? i + 1)
    else posicoes.push(i + 1)
  })

  const maximo = Math.max(1, ...linhas.map((l) => l.concluidas))

  return (
    <Cartao
      titulo={`Ranking · ${rotuloDaEtapa(tipo)}`}
      subtitulo={
        daEquipe
          ? `${daEquipe.concluidas} no período, por ${daEquipe.pessoas} ${daEquipe.pessoas === 1 ? 'pessoa' : 'pessoas'} · mediana da equipe ${formatarMinutos(daEquipe.medianaMin)}`
          : undefined
      }
    >
      {/* Os filtros da visão numa linha só, acima do que eles recortam. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {tiposComDado.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTipo(t)}
            aria-pressed={t === tipo}
            className={clsx(
              'min-h-9 rounded-full border px-3 text-sm transition-colors',
              t === tipo
                ? 'border-marca bg-marca font-bold text-white'
                : 'border-border text-muted-foreground hover:border-marca hover:text-marca',
            )}
          >
            {rotuloDaEtapa(t)}
          </button>
        ))}
      </div>

      {temPrazo && (
        <div className="mb-3 flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Ordenar por</span>
          {(['volume', 'prazo'] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCriterio(c)}
              aria-pressed={criterio === c}
              className={clsx(
                'rounded-full px-2.5 py-1 font-semibold transition-colors',
                criterio === c ? 'bg-marca-suave text-marca' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {c === 'volume' ? 'Quantidade' : 'Prazo'}
            </button>
          ))}
        </div>
      )}

      <ol className="divide-y divide-border">
        {ordenadas.map((l, i) => (
          <li key={l.pessoaId}>
            <button
              type="button"
              onClick={() => onAbrirPessoa(l.pessoaId)}
              className="grid w-full grid-cols-[2rem_1fr] items-center gap-x-3 gap-y-1 py-2.5 text-left hover:bg-muted/50 sm:grid-cols-[2rem_8rem_1fr_19rem]"
              title={`Abrir a ficha de ${l.nome}`}
            >
              <span className="text-center text-sm font-bold text-muted-foreground tabular-nums">
                {posicoes[i] ?? '–'}
              </span>
              <span className="truncate text-sm font-semibold text-foreground">{primeiroNome(l.nome)}</span>

              {/* A barra do volume, e o número na ponta.

                  AS BARRAS SÓ SE COMPARAM COM A MESMA RÉGUA. Cada linha é uma
                  grade própria, então a coluna das métricas tem largura FIXA
                  (com `auto`, ela variava de linha para linha e três "17"
                  saíam com três comprimentos). E a barra reserva o espaço do
                  número: sem isso a maior encolhia para caber o rótulo, e só
                  ela ficava fora de escala. */}
              <span className="col-start-2 flex min-w-0 items-center gap-2 sm:col-start-auto">
                <span
                  className="h-3 flex-shrink-0 rounded-r-[4px] bg-grafico"
                  style={{ width: `calc((100% - 3rem) * ${l.concluidas / maximo})`, minWidth: 2 }}
                />
                <span className="flex-shrink-0 text-sm font-bold text-foreground tabular-nums">{l.concluidas}</span>
              </span>

              <span className="col-start-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground sm:col-start-auto sm:justify-end">
                {temPrazo && (
                  <span className={clsx(l.comPrazo < AMOSTRA_MINIMA && 'opacity-60')}>
                    <span className="font-semibold text-foreground">{formatarPercentual(l.noPrazo, l.comPrazo)}</span>{' '}
                    no prazo{l.comPrazo < AMOSTRA_MINIMA && ' · poucos casos'}
                  </span>
                )}
                <span>
                  {l.medianaMin !== null ? (
                    <>
                      <span className="font-semibold text-foreground">{formatarMinutos(l.medianaMin)}</span> mediana
                    </>
                  ) : (
                    'sem medição'
                  )}{' '}
                  <span className="tabular-nums">
                    ({l.medidas}/{l.concluidas})
                  </span>
                </span>
                {l.emParalelo > 0 && (
                  <span className="rounded-full bg-atencao/15 px-2 py-0.5 font-semibold text-atencao-tinta">
                    {l.emParalelo} em paralelo
                  </span>
                )}
                {l.concluidasPorOutra > 0 && (
                  <span className="rounded-full bg-muted px-2 py-0.5 font-semibold">
                    {l.concluidasPorOutra} por outra conta
                  </span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ol>

      <p className="mt-3 text-xs text-muted-foreground">
        Tempo não ordena o ranking: aparece como mediana das etapas com relógio aberto
        (medidas / feitas). Toque em alguém para abrir a ficha.
      </p>
    </Cartao>
  )
}
