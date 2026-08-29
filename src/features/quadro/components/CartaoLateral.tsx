import clsx from 'clsx'
import type { ReactNode } from 'react'
import { rotularDia } from '@/lib/formato'
import { corDoCaso } from '../lib/cores-calendar'
import type { CasoQuadro } from '../types'

interface PropsCartaoLateral {
  caso: CasoQuadro
  hoje: string
  /** Linha de contexto da seção: "na UTI há 4h", "Vídeo em andamento". */
  detalhe: string
  destaque?: 'uti' | 'reels'
  /**
   * Ação da própria seção. Sem ela o caso na UTI vira beco sem saída: ele saiu
   * do bloco do dia, então não há linha expansível em lugar nenhum para trazê-lo
   * de volta. Numa coluna de 22rem, o botão no cartão é melhor que expandir.
   */
  acao?: ReactNode
}

/**
 * Cartão compacto das seções laterais.
 *
 * Deliberadamente NÃO é a CasoLinha: ali a linha expande com todas as ações,
 * aqui a coluna é estreita e o cartão responde uma pergunta só — "quem está
 * neste estado, e há quanto tempo". Reaproveitar a linha grande espremeria o
 * card expandido numa coluna de 20rem.
 *
 * O cartão mostra de que dia o caso era: um caso na UTI saiu do bloco do dia, e
 * sem essa âncora a coordenação perde a referência de quando ele deveria ter
 * acontecido.
 */
export function CartaoLateral({
  caso,
  hoje,
  detalhe,
  destaque = 'uti',
  acao,
}: PropsCartaoLateral) {
  const titulo = caso.bebeNome ? `${caso.maeNome} · ${caso.bebeNome}` : caso.maeNome

  return (
    <li className="flex items-stretch gap-2.5 rounded-cartao border border-border bg-card px-3 py-3 shadow-cartao transition-shadow hover:shadow-cartao-alto">
      <div
        className="w-1 flex-shrink-0 rounded-sm"
        style={{ backgroundColor: corDoCaso(caso.corCalendar) }}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-bold tracking-tight">{titulo}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          {caso.maternidadeSigla && (
            <span className="font-mono">{caso.maternidadeSigla}</span>
          )}
          {caso.dia && <span>· {rotularDia(caso.dia, hoje)}</span>}
        </div>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
          <span
            className={clsx(
              'text-xs font-medium',
              destaque === 'uti' ? 'text-andamento' : 'text-concluido',
            )}
          >
            {detalhe}
          </span>
          {acao}
        </div>
      </div>
    </li>
  )
}
