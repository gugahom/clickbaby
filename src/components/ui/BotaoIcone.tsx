import clsx from 'clsx'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Tom = 'neutro' | 'acao' | 'positivo'

interface PropsBotaoIcone extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'title'> {
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
}

/**
 * Botão só de ícone, para o grupo de ações que vive na própria linha da etapa.
 *
 * 44px de alvo mesmo com ícone de 18px: a pessoa está de pé, com uma mão, num
 * aparelho compartilhado (seção 6 do CLAUDE.md). O ícone encolhe, o alvo não.
 *
 * Desabilitado continua focável (`aria-disabled` em vez de `disabled`) para o
 * motivo poder ser lido por teclado e leitor de tela — um `disabled` real some
 * da ordem de tabulação e leva a explicação junto.
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
  return (
    <button
      type="button"
      aria-label={motivo ? `${rotulo} — ${motivo}` : rotulo}
      title={motivo ? `${rotulo} — ${motivo}` : rotulo}
      aria-disabled={disabled || undefined}
      onClick={disabled ? undefined : onClick}
      className={clsx(
        'inline-flex size-11 flex-shrink-0 items-center justify-center rounded-md transition-colors',
        disabled
          ? 'cursor-not-allowed text-muted-foreground/35'
          : clsx('cursor-pointer', TONS[tom]),
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}
