import clsx from 'clsx'
import type { ReactNode } from 'react'

/**
 * UM NÚMERO É UM BLOCO, não um gráfico: uma coluna só, ou uma pizza de duas
 * fatias, gasta tinta para dizer o que o próprio número diz.
 *
 * O `destaque` é o número-herói do painel — o único da tela. Algarismos
 * PROPORCIONAIS nos números grandes (sem `tabular-nums`): largura fixa deixa
 * "84%" frouxo no tamanho de título. Os alinhados em coluna ficam nas tabelas.
 */
export function BlocoIndicador({
  rotulo,
  valor,
  detalhe,
  destaque = false,
  alerta = false,
}: {
  rotulo: string
  valor: ReactNode
  detalhe?: ReactNode
  destaque?: boolean
  /** Algo pede atenção — a borda muda, o número não vira vermelho. */
  alerta?: boolean
}) {
  return (
    <div
      className={clsx(
        'flex min-w-0 flex-col justify-between gap-1 rounded-painel border bg-card p-4',
        alerta ? 'border-atrasado/40' : 'border-border',
      )}
    >
      <div className="text-sm text-muted-foreground">{rotulo}</div>
      <div
        className={clsx(
          'font-extrabold tracking-tight text-foreground',
          destaque ? 'text-5xl leading-none' : 'text-2xl leading-tight',
        )}
      >
        {valor}
      </div>
      {detalhe && <div className="text-xs text-muted-foreground">{detalhe}</div>}
    </div>
  )
}
