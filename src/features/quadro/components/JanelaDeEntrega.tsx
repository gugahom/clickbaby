import clsx from 'clsx'
import { formatarDataHora } from '@/lib/formato'
import { useRelogioDeMinuto } from '@/lib/useRelogio'
import type { CasoQuadro } from '../types'

interface PropsJanelaDeEntrega {
  caso: CasoQuadro
}

/**
 * A JANELA DE ENTREGA — o tempo do caso desenhado como espaço.
 *
 * POR QUE ISTO EXISTE
 * A empresa vende um prazo ("48h", "10 dias úteis") e quer evidência objetiva
 * de tempo de edição (seção 9 do CLAUDE.md). Até aqui o sistema tinha os dois
 * dados — quando o relógio armou, quanto cada etapa levou — e não mostrava
 * nenhum deles como DURAÇÃO. "Vence em 22h" é um número; não diz se as 26h já
 * gastas foram de trabalho ou de espera, nem onde o trabalho caiu dentro da
 * janela.
 *
 * A régua é a janela inteira: começa quando o nascimento conclui e termina no
 * vencimento. A parte cheia é o que já passou. É uma pergunta que número
 * nenhum respondia — "vence em 22h" não diz se isso é muito ou pouco do que
 * foi prometido, e 22h restantes de 24 é o oposto de 22h restantes de 10 dias.
 *
 * SÓ APARECE COM O RELÓGIO ARMADO. Sem nascimento concluído não há janela —
 * `vence_em` é nulo, e desenhar uma régua sem as duas pontas seria inventar.
 */
export function JanelaDeEntrega({ caso }: PropsJanelaDeEntrega) {
  const agora = useRelogioDeMinuto()

  if (!caso.nascimentoConcluidoEm || !caso.venceEm) return null

  const inicio = new Date(caso.nascimentoConcluidoEm).getTime()
  const fim = new Date(caso.venceEm).getTime()
  const janela = fim - inicio
  if (janela <= 0) return null

  const posicao = (t: number) => ((t - inicio) / janela) * 100
  const limitar = (n: number) => Math.max(0, Math.min(100, n))

  const decorrido = limitar(posicao(agora.getTime()))
  const estourou = agora.getTime() > fim

  return (
    <section aria-label="Janela de entrega">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="rotulo-sobrescrito text-acento">Janela de entrega</span>
        <span
          className={clsx(
            'text-xs font-semibold tabular-nums',
            estourou ? 'text-atrasado' : 'text-muted-foreground',
          )}
        >
          {Math.round(decorrido)}% da janela
        </span>
      </div>

      {/* Sem as barras por cima, a régua deixou de ser pano de fundo e virou o
          assunto — daí 10px em vez de 8. */}
      <div className="relative h-2.5 overflow-hidden rounded-full bg-muted">
        <div
          className={clsx(
            'absolute inset-y-0 left-0 rounded-full transition-[width]',
            estourou ? 'bg-atrasado' : 'bg-acento/35',
          )}
          style={{ width: `${decorrido}%` }}
        />
      </div>

      {/* AS BARRAS POR ETAPA SAÍRAM (29/08, a pedido do gestor).
      
          Elas mostravam cada edição na posição e na largura reais dentro da
          janela. A ideia se sustenta, mas na prática um caso com quatro
          edições virava quatro linhas de rótulo empilhadas logo abaixo de uma
          régua de 8px — mais altura de legenda do que de gráfico, para uma
          leitura que a lista de etapas logo abaixo já dá em texto.
      
          A RÉGUA FICA, que é o que respondia a pergunta de fato nova: quanto da
          janela já passou. Se as barras voltarem um dia, o lugar delas é uma
          tela própria de análise, não o card aberto no corredor. */}

      <div className="mt-1.5 flex justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="tabular-nums">
          nasceu {formatarDataHora(caso.nascimentoConcluidoEm)}
        </span>
        <span className={clsx('tabular-nums', estourou && 'font-semibold text-atrasado')}>
          vence {formatarDataHora(caso.venceEm)}
        </span>
      </div>
    </section>
  )
}
