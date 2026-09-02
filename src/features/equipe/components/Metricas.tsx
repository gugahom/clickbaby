import clsx from 'clsx'
import type { ReactNode } from 'react'
import type { Lugar } from '../api/useEquipe'
import { COR_LUGAR, ROTULO_LUGAR } from '../lib/apresentacao'

/**
 * As peças de número que a Equipe e a Conta compartilham.
 *
 * Elas existem separadas porque as duas telas mostram a MESMA coisa com donos
 * diferentes: a gestão olha os números de alguém, a pessoa olha os próprios.
 * Se cada tela desenhasse os seus, "12 concluídas" teria dois pesos visuais e
 * a segunda leitura pareceria outra métrica.
 */

/** Um número grande com o rótulo embaixo. O rótulo diz a unidade, não o dado. */
export function Numero({
  valor,
  rotulo,
  nota,
  tom = 'neutro',
}: {
  valor: ReactNode
  rotulo: string
  nota?: string
  tom?: 'neutro' | 'ativo' | 'apagado'
}) {
  return (
    <div className="min-w-0">
      <p
        className={clsx(
          'text-2xl leading-none font-extrabold tracking-tight tabular-nums',
          tom === 'ativo' && 'text-andamento-tinta',
          tom === 'apagado' && 'text-muted-foreground',
        )}
      >
        {valor}
      </p>
      <p className="rotulo-sobrescrito mt-1.5 text-[10px] text-muted-foreground">
        {rotulo}
      </p>
      {nota && <p className="mt-0.5 text-[11px] text-muted-foreground">{nota}</p>}
    </div>
  )
}

/**
 * Campo × ilha numa barra só.
 *
 * Uma barra empilhada e não duas: a pergunta é a PROPORÇÃO entre os dois
 * lugares — "essa pessoa é de campo ou de edição?" —, e duas barras separadas
 * fazem o olho comparar comprimentos em vez de ler uma divisão.
 */
export function DivisaoDeLugar({
  porLugar,
  total,
}: {
  porLugar: Record<Lugar, number>
  total: number
}) {
  if (total === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Sem etapa concluída na janela — não dá para dizer onde ela trabalha.
      </p>
    )
  }

  const pct = (n: number) => Math.round((n / total) * 100)

  return (
    <div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
        {(['campo', 'ilha'] as const).map((lugar) =>
          porLugar[lugar] === 0 ? null : (
            <div
              key={lugar}
              className={COR_LUGAR[lugar].barra}
              style={{ width: `${pct(porLugar[lugar])}%` }}
            />
          ),
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {(['campo', 'ilha'] as const).map((lugar) => (
          <span key={lugar} className="inline-flex items-center gap-1.5 text-sm">
            <span
              className={clsx('size-2 rounded-full', COR_LUGAR[lugar].barra)}
              aria-hidden="true"
            />
            <span className="font-semibold">{ROTULO_LUGAR[lugar]}</span>
            <span className="tabular-nums text-muted-foreground">
              {porLugar[lugar]}
            </span>
          </span>
        ))}
      </div>
    </div>
  )
}

