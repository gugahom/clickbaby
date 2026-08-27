import { m, useReducedMotion, type HTMLMotionProps } from 'motion/react'
import type { ReactNode } from 'react'
import { cn, MOLA_TOQUE, useTemHover } from '@/lib/movimento'

type Tom = 'neutro' | 'acao' | 'positivo' | 'pendencia'

interface PropsBotaoIcone extends Omit<HTMLMotionProps<'button'>, 'title' | 'children'> {
  /** Nome acessível. Obrigatório: o ícone sozinho não diz nada a um leitor de tela. */
  rotulo: string
  /**
   * Por que está desabilitado. Vira o title, então a explicação aparece no
   * hover em vez de deixar a pessoa tentando clicar num botão morto.
   */
  motivo?: string | undefined
  tom?: Tom
  children: ReactNode
}

const TONS: Record<Tom, string> = {
  neutro: 'text-muted-foreground hover:bg-muted hover:text-foreground',
  acao: 'text-andamento hover:bg-andamento/10',
  positivo: 'text-concluido hover:bg-concluido/10',
  // Cadastro incompleto: o gesto que tira o caso do limbo.
  pendencia: 'border border-rascunho-borda bg-card text-rascunho hover:bg-rascunho-fundo',
}

/**
 * Botão só de ícone, para o grupo de ações que vive na própria linha da etapa.
 *
 * 44px de alvo mesmo com ícone de 18px: a pessoa está de pé, com uma mão, num
 * aparelho compartilhado (seção 6 do CLAUDE.md). O ícone encolhe, o alvo não.
 * O padrão de origem usa 32px no botão de ícone — aqui não serve.
 *
 * Desabilitado continua focável (`aria-disabled` em vez de `disabled`) para o
 * motivo poder ser lido por teclado e leitor de tela — um `disabled` real some
 * da ordem de tabulação e leva a explicação junto. Por isso o movimento é
 * suprimido à mão quando desabilitado: sem `disabled` real, o `whileTap`
 * dispararia num botão que não faz nada, prometendo uma ação que não vem.
 */
export function BotaoIcone({
  rotulo,
  motivo,
  tom = 'neutro',
  disabled = false,
  className,
  children,
  onClick,
  ...props
}: PropsBotaoIcone) {
  const semMovimento = useReducedMotion()
  const temHover = useTemHover()
  const inerte = disabled || semMovimento

  const descricao = motivo ? `${rotulo} — ${motivo}` : rotulo

  // Ver a nota em Botao.tsx: `exactOptionalPropertyTypes` recusa `undefined`
  // explícito em prop opcional.
  const animacao: HTMLMotionProps<'button'> = inerte
    ? {}
    : {
        whileTap: { scale: 0.9 },
        ...(temHover ? { whileHover: { scale: 1.06 } } : {}),
      }

  return (
    <m.button
      type="button"
      aria-label={descricao}
      title={descricao}
      {...(disabled ? { 'aria-disabled': true } : {})}
      {...(disabled ? {} : onClick ? { onClick } : {})}
      {...animacao}
      transition={MOLA_TOQUE}
      className={cn(
        'inline-flex size-11 flex-shrink-0 items-center justify-center rounded-full transition-colors',
        disabled ? 'cursor-not-allowed text-muted-foreground/35' : `cursor-pointer ${TONS[tom]}`,
        className,
      )}
      {...props}
    >
      {children}
    </m.button>
  )
}
