import { formatarMinutos } from '../lib/metricas'

export interface LinhaDaFaixa {
  chave: string
  rotulo: string
  /** A mediana da pessoa; nulo quando nada dela foi medido. */
  pessoa: number | null
  medidas: number
  concluidas: number
  equipeMediana: number | null
  equipeP25: number | null
  equipeP75: number | null
  /** O padrão de tempo em vigor, quando a gestão já definiu um. */
  padrao: number | null
}

/**
 * O TEMPO DA PESSOA CONTRA O NORMAL DA EQUIPE — um ponto sobre uma faixa.
 *
 * A faixa clara é a METADE DO MEIO da equipe (do P25 ao P75); o traço fino é a
 * mediana da equipe; o ponto azul é a pessoa da ficha. A pergunta que o desenho responde é
 * "está dentro do normal?", e não "quem é 3 minutos mais rápida": com um mês de
 * dados, diferença pequena é sorte, e um ranking de velocidade ensinaria a
 * equipe a parar de abrir o relógio (em setembro, 48% das edições já eram
 * play-e-concluir). Por isso tempo não vira posição — vira comparação com a
 * faixa.
 *
 * CADA LINHA TEM SUA ESCALA. Um parto de três horas e um reels de quarenta
 * minutos na mesma régua achatariam o reels num risco; o que se compara é a
 * pessoa com a equipe DENTRO da mesma etapa, nunca etapas entre si.
 *
 * "SEM MEDIÇÃO" É DITO, não escondido: se ela fez 12 e só 3 tinham relógio
 * aberto, a linha mostra "3 de 12 medidas" — o número vale o que vale a
 * amostra.
 */
export function FaixaDaEquipe({
  linhas,
  nome,
}: {
  linhas: LinhaDaFaixa[]
  /** Quem é o ponto azul — a legenda diz o nome, e não um pronome presumido. */
  nome: string
}) {
  if (linhas.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Nada medido neste período.</p>
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-grafico ring-2 ring-card" aria-hidden="true" />
          {nome}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-5 rounded-sm bg-grafico-faixa" aria-hidden="true" />
          Metade do meio da equipe
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-px bg-muted-foreground" aria-hidden="true" />
          Mediana da equipe
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-0.5 bg-atencao" aria-hidden="true" />
          Padrão definido
        </span>
      </div>

      <ul className="space-y-3">
        {linhas.map((l) => {
          const maximo = Math.max(1, l.pessoa ?? 0, l.equipeP75 ?? 0, l.padrao ?? 0, l.equipeMediana ?? 0) * 1.15
          const pos = (v: number) => `${(v / maximo) * 100}%`

          return (
            <li key={l.chave} className="grid grid-cols-[5.5rem_1fr] items-center gap-x-3 gap-y-1 sm:grid-cols-[7rem_1fr_15rem]">
              <span className="truncate text-sm font-semibold text-foreground">{l.rotulo}</span>

              <div className="relative h-6" aria-hidden="true">
                {/* O trilho de fundo: a escala inteira, um fio. */}
                <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border" />
                {l.equipeP25 !== null && l.equipeP75 !== null && (
                  <div
                    className="absolute top-1/2 h-3 -translate-y-1/2 rounded-sm bg-grafico-faixa"
                    style={{ left: pos(l.equipeP25), width: `${((l.equipeP75 - l.equipeP25) / maximo) * 100}%` }}
                  />
                )}
                {l.equipeMediana !== null && (
                  <div
                    className="absolute top-1/2 h-4 w-px -translate-y-1/2 bg-muted-foreground"
                    style={{ left: pos(l.equipeMediana) }}
                  />
                )}
                {l.padrao !== null && (
                  <div
                    className="absolute top-0 h-full w-0.5 bg-atencao"
                    style={{ left: pos(l.padrao) }}
                  />
                )}
                {l.pessoa !== null && (
                  <div
                    className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-grafico ring-2 ring-card"
                    style={{ left: pos(l.pessoa) }}
                  />
                )}
              </div>

              {/* A leitura em texto: o gráfico sem o gráfico. */}
              <div className="col-span-2 text-xs whitespace-nowrap text-muted-foreground sm:col-span-1 sm:text-right">
                {l.pessoa !== null ? (
                  <>
                    <span className="font-bold text-foreground">{formatarMinutos(l.pessoa)}</span> · equipe{' '}
                    {formatarMinutos(l.equipeMediana)}
                  </>
                ) : (
                  <span>sem medição</span>
                )}
                <span className="ml-1.5 tabular-nums">
                  ({l.medidas} de {l.concluidas} medidas)
                </span>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
