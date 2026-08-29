import { useState, type ReactNode } from 'react'
import { AnimatePresence, m, useReducedMotion } from 'motion/react'
import clsx from 'clsx'

interface PropsSanfona {
  aberto: boolean
  /** Casa com o `aria-controls` do gatilho. */
  id: string
  /** Id do cabeçalho que dá nome a esta região. */
  rotuladoPor: string
  children: ReactNode
}

/**
 * O corpo que abre e fecha — bloco do dia, detalhe do caso, seção dobrável.
 *
 * POR QUE EXISTE. Os três já eram sanfona, e os três abriam com um corte seco:
 * o conteúdo aparecia de uma vez e a lista inteira pulava para baixo. Num
 * Quadro com dez blocos empilhados, abrir um dia empurra tudo que está abaixo
 * — sem transição, o olho perde o lugar e precisa reencontrar onde estava.
 *
 * A altura animada resolve isso pelo motivo certo: ela não é enfeite, é o que
 * mostra DE ONDE o conteúdo veio. O chevron já girava; faltava o corpo
 * acompanhar.
 *
 * O `overflow-hidden` SÓ ENQUANTO ANIMA, e isso não é detalhe. Ele é
 * necessário para a altura cortar o conteúdo durante a transição, mas se
 * ficasse permanente clipparia qualquer coisa que precise escapar da caixa —
 * e o painel do Dropdown, que é `fixed`, seria clippado assim que um ancestral
 * ganhasse `transform` (que é o que o motion aplica ao animar). Ligado só no
 * intervalo da animação, ele faz o trabalho e sai.
 *
 * Sem movimento (prefers-reduced-motion), abre e fecha na hora: quem pediu
 * menos animação quer o conteúdo, não uma versão lenta do mesmo efeito.
 */
export function Sanfona({ aberto, id, rotuladoPor, children }: PropsSanfona) {
  const semMovimento = useReducedMotion()
  const [animando, setAnimando] = useState(false)

  return (
    <AnimatePresence initial={false}>
      {aberto && (
        <m.div
          id={id}
          role="region"
          aria-labelledby={rotuladoPor}
          initial={semMovimento ? false : { height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={semMovimento ? { height: 0, opacity: 0 } : { height: 0, opacity: 0 }}
          transition={
            semMovimento
              ? { duration: 0 }
              : {
                  height: { type: 'spring', bounce: 0, duration: 0.32 },
                  // A opacidade corre mais rápido que a altura na entrada e
                  // mais devagar na saída: o conteúdo aparece já legível
                  // enquanto a caixa termina de abrir, e some antes de a caixa
                  // fechar — sem isso o texto fica sendo espremido à vista.
                  opacity: { duration: 0.18 },
                }
          }
          onAnimationStart={() => setAnimando(true)}
          onAnimationComplete={() => setAnimando(false)}
          className={clsx(animando && 'overflow-hidden')}
        >
          {children}
        </m.div>
      )}
    </AnimatePresence>
  )
}
