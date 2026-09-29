import { useState } from 'react'
import clsx from 'clsx'

export interface Barra {
  chave: string
  rotulo: string
  valor: number
  /** O que a dica acrescenta ao número — "12 com relógio". */
  detalhe?: string
}

/**
 * QUANTO DE CADA COISA — uma série só, e por isso UMA COR SÓ.
 *
 * Pintar cada tipo de etapa de uma cor gastaria o único canal livre repetindo
 * o que o comprimento da barra já diz, e sugeriria uma ordem que os tipos não
 * têm. Sem legenda: o título do cartão diz o que está desenhado.
 *
 * Barra de no máximo 24px (aqui, 14), ponta arredondada onde o dado termina e
 * base reta. O VALOR fica na ponta, fora da barra — dentro, um número de três
 * dígitos não caberia numa barra curta, e cortado é pior que ausente.
 */
export function BarrasHorizontais({
  barras,
  vazio = 'Nada neste período.',
}: {
  barras: Barra[]
  vazio?: string
}) {
  const [ativa, setAtiva] = useState<string | null>(null)
  const maximo = Math.max(1, ...barras.map((b) => b.valor))

  if (barras.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{vazio}</p>
  }

  return (
    <ul className="space-y-1.5">
      {barras.map((b) => (
        <li
          key={b.chave}
          tabIndex={b.detalhe ? 0 : -1}
          onPointerEnter={() => setAtiva(b.chave)}
          onPointerLeave={() => setAtiva(null)}
          onFocus={() => setAtiva(b.chave)}
          onBlur={() => setAtiva(null)}
          // RÓTULO DE LARGURA FIXA: cada linha é uma grade própria, e com
          // largura pelo conteúdo "Nascimento" roubava mais barra que "Banho" —
          // as barras deixavam de estar na mesma régua.
          className="grid grid-cols-[6.5rem_1fr] items-center gap-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-marca/40"
        >
          <span className="truncate text-sm text-foreground">{b.rotulo}</span>
          <span className="relative flex min-w-0 items-center gap-2">
            <span
              className={clsx(
                'h-3.5 flex-shrink-0 rounded-r-[4px] bg-grafico transition-opacity',
                ativa !== null && ativa !== b.chave && 'opacity-45',
              )}
              // O espaço do número é reservado: sem isso a MAIOR barra
              // encolheria para caber o rótulo e só ela sairia de escala.
              style={{ width: `calc((100% - 3rem) * ${b.valor / maximo})`, minWidth: b.valor > 0 ? 2 : 0 }}
            />
            <span className="flex-shrink-0 text-sm font-bold text-foreground tabular-nums">{b.valor}</span>
            {/* O detalhe FLUTUA, fora do fluxo: se entrasse na linha, empurraria
                o número e a barra mudaria de tamanho sob o mouse. */}
            {ativa === b.chave && b.detalhe && (
              <span className="absolute right-0 bottom-full z-10 mb-1 rounded-lg border border-border bg-card px-2 py-1 text-xs whitespace-nowrap text-muted-foreground shadow-md">
                {b.detalhe}
              </span>
            )}
          </span>
        </li>
      ))}
    </ul>
  )
}
