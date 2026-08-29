import { useId, useState, type ReactNode } from 'react'
import { Sanfona } from '@/components/ui/Sanfona'
import clsx from 'clsx'
import { Chevron } from '@/components/ui/icones'
import { Alerta } from '@/components/ui/Alerta'

interface PropsPainelDobravel {
  titulo: string
  quantidade: number
  criterio: string
  vazio: string
  erro?: string | null
  /** Começa aberto quando há algo dentro? Fechado é o padrão. */
  abertoInicialmente?: boolean
  children: ReactNode
}

/**
 * Seção secundária da coluna direita: cabeçalho sempre visível, corpo dobrável.
 *
 * A ALTURA ABERTA TEM TETO, E ESSE É O PONTO
 *
 * O gestor foi específico: abertas, estas seções têm espaço definido e apenas
 * ENCOLHEM o REELS — não se pode ter que rolar a coluna para achá-las. Por isso
 * o corpo é `max-h-48` e não `flex-1` nem altura livre:
 *
 *   - altura livre faria a coluna crescer além da tela, e aí achar a UTI
 *     dependeria de rolar até o fim de uma lista de tamanho variável;
 *   - `flex-1` faria as três seções disputarem a sobra, e o REELS deixaria de
 *     ser a maior só por alguém ter aberto outra.
 *
 * TETO e não altura fixa: com `h-48`, abrir uma UTI com um bebê custaria os
 * mesmos 192px que uma com oito, e o REELS pagaria por espaço vazio. Com teto,
 * o custo acompanha o conteúdo até um limite conhecido — o pior caso continua
 * previsível, que é o que a regra exige, e o caso comum fica barato.
 *
 * Quem tem oito bebês na UTI rola DENTRO da UTI, que é o lugar certo para essa
 * rolagem.
 *
 * O CABEÇALHO NUNCA SOME. Fechada, a seção continua dizendo quantos casos tem —
 * que é a informação pela qual alguém decidiria abri-la. Uma seção dobrada que
 * escondesse o contador exigiria abrir para saber se valia abrir.
 */
export function PainelDobravel({
  titulo,
  quantidade,
  criterio,
  vazio,
  erro = null,
  abertoInicialmente = false,
  children,
}: PropsPainelDobravel) {
  const [aberto, setAberto] = useState(abertoInicialmente)
  const idCorpo = useId()
  const idTitulo = useId()

  return (
    <section className="flex flex-shrink-0 flex-col overflow-hidden rounded-painel border border-border bg-card shadow-painel">
      <h2>
        <button
          type="button"
          id={idTitulo}
          onClick={() => setAberto((v) => !v)}
          aria-expanded={aberto}
          aria-controls={idCorpo}
          className="flex w-full cursor-pointer items-center gap-3 border-b border-transparent bg-acento-suave px-3.5 py-3 text-left transition-colors hover:bg-acento-suave/70"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="rotulo-sobrescrito text-acento-forte">{titulo}</span>
              {/* Mesmo disco do PainelLateral: fechada, a seção é uma linha, e o
                  contador é a única informação dela. */}
              <span className="inline-flex min-w-7 items-center justify-center rounded-full bg-contador px-2 py-0.5 text-sm font-bold tabular-nums text-white">
                {quantidade}
              </span>
            </div>
            {/* O critério só aparece aberta: fechada, a seção é uma linha, e
                explicar o filtro de algo que não se está vendo gasta a altura
                que o REELS ia usar. */}
            {aberto && <p className="mt-1 text-xs leading-snug text-muted-foreground">{criterio}</p>}
          </div>
          <Chevron
            className={clsx(
              'size-5 flex-shrink-0 text-acento-forte transition-transform',
              aberto && 'rotate-180',
            )}
          />
        </button>
      </h2>

      <Sanfona aberto={aberto} id={idCorpo} rotuladoPor={idTitulo}>
        <div className="flex max-h-48 flex-col border-t border-border">
          {erro && (
            <div className="flex-shrink-0 p-2">
              <Alerta>{erro}</Alerta>
            </div>
          )}
          {quantidade === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">{vazio}</p>
          ) : (
            <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">{children}</ul>
          )}
        </div>
      </Sanfona>
    </section>
  )
}
