import { AnimatePresence, m, useReducedMotion, type HTMLMotionProps } from 'motion/react'
import { useCallback, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { cn, MOLA_TOQUE, useTemHover } from '@/lib/movimento'

type Variante = 'primario' | 'contorno' | 'fantasma' | 'destrutivo'
type Tamanho = 'md' | 'lg'

interface PropsBotao extends Omit<HTMLMotionProps<'button'>, 'children'> {
  variante?: Variante
  tamanho?: Tamanho
  /** Onda a partir do ponto tocado. Só nas ações que mudam estado. */
  onda?: boolean
  children?: ReactNode
}

const VARIANTES: Record<Variante, string> = {
  primario: 'bg-marca text-white hover:bg-marca-forte',
  contorno: 'border border-border bg-card text-foreground hover:bg-muted',
  fantasma: 'text-muted-foreground hover:bg-muted hover:text-foreground',
  // Só para o que encerra o caso sem desfazer: confirmar entrega e cancelar.
  destrutivo: 'bg-atrasado text-white hover:opacity-90',
}

/**
 * 44px no `md`, não os 40px do padrão de origem.
 *
 * O componente de referência usa h-10 no médio, h-8 no pequeno e h-8 no de
 * ícone. Os três reprovam na seção 6 do CLAUDE.md, que exige 44px de alvo: a
 * tela é usada de pé, com uma mão, num aparelho que troca de turno. Mantive a
 * forma (pílula, mola, onda) e subi os tamanhos; por isso também não existe um
 * tamanho `sm` aqui — ele só poderia ser pequeno demais.
 */
const TAMANHOS: Record<Tamanho, string> = {
  md: 'min-h-11 gap-2 rounded-full px-5 text-sm',
  lg: 'min-h-12 gap-2 rounded-full px-6 text-base',
}

interface Onda {
  id: number
  x: number
  y: number
  tamanho: number
}

/**
 * Botão da aplicação inteira, do login às ações do caso.
 *
 * O toque responde em três camadas, e cada uma tem uma razão:
 *
 *   1. A mola de escala confirma o toque no próprio dedo. Num corredor de
 *      maternidade, com sinal caindo, a resposta da rede pode demorar — o
 *      encolhimento é a única confirmação imediata de que o toque pegou.
 *   2. O crescimento no hover só existe onde há mouse de verdade
 *      (`useTemHover`). Em celular, `whileHover` gruda depois do toque e o
 *      botão não volta ao tamanho.
 *   3. A onda é opcional e sai do ponto tocado, não do centro — em botão
 *      largo, a onda central não parece resposta ao que a pessoa fez.
 *
 * Tudo isso desliga sozinho em `prefers-reduced-motion`, inclusive a onda.
 */
export function Botao({
  variante = 'contorno',
  tamanho = 'md',
  onda = false,
  className,
  children,
  onPointerDown,
  ...props
}: PropsBotao) {
  const semMovimento = useReducedMotion()
  const temHover = useTemHover()
  const [ondas, setOndas] = useState<Onda[]>([])
  const proximoId = useRef(0)

  const aoApertar = useCallback(
    (evento: PointerEvent<HTMLButtonElement>) => {
      if (onda && !semMovimento) {
        const caixa = evento.currentTarget.getBoundingClientRect()
        setOndas((antes) => [
          ...antes,
          {
            id: proximoId.current++,
            x: evento.clientX - caixa.left,
            y: evento.clientY - caixa.top,
            tamanho: Math.max(caixa.width, caixa.height) * 2,
          },
        ])
      }
      onPointerDown?.(evento)
    },
    [onda, semMovimento, onPointerDown],
  )

  // Spread condicional em vez de `whileTap={cond ? x : undefined}`: o projeto
  // roda com `exactOptionalPropertyTypes`, que recusa `undefined` explícito em
  // prop opcional. A prop tem que não existir, não existir valendo undefined.
  const animacao: HTMLMotionProps<'button'> = semMovimento
    ? {}
    : {
        whileTap: { scale: 0.95 },
        ...(temHover ? { whileHover: { scale: 1.02 } } : {}),
      }

  return (
    <m.button
      type="button"
      {...animacao}
      transition={MOLA_TOQUE}
      onPointerDown={aoApertar}
      className={cn(
        'inline-flex items-center justify-center font-semibold transition-colors select-none',
        'disabled:pointer-events-none disabled:opacity-50',
        onda && 'relative overflow-hidden',
        VARIANTES[variante],
        TAMANHOS[tamanho],
        className,
      )}
      {...props}
    >
      {onda && !semMovimento && (
        <span className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
          <AnimatePresence>
            {ondas.map((o) => (
              <m.span
                key={o.id}
                className="absolute rounded-full bg-current"
                style={{
                  left: o.x,
                  top: o.y,
                  width: o.tamanho,
                  height: o.tamanho,
                  x: '-50%',
                  y: '-50%',
                }}
                initial={{ scale: 0, opacity: 0.28 }}
                animate={{ scale: 1, opacity: 0 }}
                exit={{ opacity: 0 }}
                // 0.9s, não os 1.6s do padrão de origem: numa fila de ações
                // rápidas, ondas de 1.6s se empilham e a última ainda está
                // desenhando quando a pessoa já tocou outras duas.
                transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
                onAnimationComplete={() =>
                  setOndas((antes) => antes.filter((x) => x.id !== o.id))
                }
              />
            ))}
          </AnimatePresence>
        </span>
      )}

      {children}
    </m.button>
  )
}
