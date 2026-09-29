import type { ReactNode } from 'react'
import clsx from 'clsx'

/**
 * Um controle de duas a quatro opções, pequeno: mora no cabeçalho de um cartão
 * ou numa linha de filtros, e as abas grandes da tela (`TrilhoDeAbas`)
 * brigariam com ele. Serve ao gráfico do KPI (janela e forma) e aos filtros da
 * aba Pessoas (período e tipo de trabalho).
 */
export function Segmentado<T extends string>({
  rotulo,
  opcoes,
  ativa,
  onTrocar,
}: {
  rotulo: string
  opcoes: { id: T; conteudo: ReactNode; titulo?: string }[]
  ativa: T
  onTrocar: (id: T) => void
}) {
  return (
    <div role="group" aria-label={rotulo} className="inline-flex rounded-full border border-border bg-background p-0.5">
      {opcoes.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={ativa === o.id}
          aria-label={o.titulo}
          title={o.titulo}
          onClick={() => onTrocar(o.id)}
          className={clsx(
            'inline-flex h-8 min-w-8 items-center justify-center rounded-full px-3 text-xs whitespace-nowrap transition-colors',
            ativa === o.id
              ? 'bg-marca font-bold text-white'
              : 'font-medium text-muted-foreground hover:bg-marca-suave hover:text-marca',
          )}
        >
          {o.conteudo}
        </button>
      ))}
    </div>
  )
}
