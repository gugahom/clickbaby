import clsx from 'clsx'
import type { ButtonHTMLAttributes } from 'react'

type Variante = 'primario' | 'contorno' | 'fantasma' | 'destrutivo'

interface PropsBotao extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante
}

const VARIANTES: Record<Variante, string> = {
  primario: 'bg-primary text-primary-foreground hover:opacity-90',
  contorno: 'border border-border text-foreground hover:bg-muted',
  fantasma: 'text-muted-foreground hover:bg-muted hover:text-foreground',
  // Só para o que encerra o caso sem desfazer: confirmar entrega e cancelar.
  destrutivo: 'bg-atrasado text-background hover:opacity-90',
}

/**
 * Substitui o Button do shadcn da referência, que arrastava @base-ui/react +
 * class-variance-authority + tailwind-merge para cinco usos.
 *
 * min-h-11 = 44px: alvo de toque mínimo da seção 6 do CLAUDE.md.
 */
export function Botao({ variante = 'contorno', className, ...props }: PropsBotao) {
  return (
    <button
      type="button"
      className={clsx(
        'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium',
        'transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTES[variante],
        className,
      )}
      {...props}
    />
  )
}
