import type { ReactNode } from 'react'
import { Alerta } from '@/components/ui/Alerta'

interface PropsPainelLateral {
  titulo: string
  quantidade: number
  /** Uma linha explicando o critério da seção. */
  criterio: string
  vazio: string
  /** Erro de uma ação disparada de dentro da seção. */
  erro?: string | null
  children: ReactNode
}

/**
 * Moldura das seções da coluna direita.
 *
 * ALTURA FIXA, NÃO CONTEÚDO. O painel ocupa exatamente o slot que o pai deu e
 * rola por dentro. Uma seção NUNCA empurra a outra: numa noite com seis bebês
 * na UTI, a lista de Reels continua no mesmo lugar da tela — quem olha isso na
 * TV da sala de edição precisa que a posição seja previsível, não que a tela se
 * reorganize sozinha.
 *
 * A mecânica: `h-full` + `flex-col` aqui, `min-h-0` + `overflow-y-auto` na
 * lista. O `min-h-0` é o que faz a diferença — sem ele, um filho flex se recusa
 * a encolher abaixo do próprio conteúdo e o scroll nunca aparece; a lista
 * transborda e empurra tudo.
 *
 * O `criterio` não é decoração: UTI e REELS são seções com regras diferentes
 * (uma é estado do caso, a outra é uma visão filtrada) e quem olha a tela na TV
 * precisa saber por que um caso está ali sem abrir nada.
 */
export function PainelLateral({
  titulo,
  quantidade,
  criterio,
  vazio,
  erro = null,
  children,
}: PropsPainelLateral) {
  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-md border border-border bg-card shadow-painel">
      {/* O rosa da marca vive aqui: são os dois pontos da tela que se leem de
          longe, na TV da sala de edição. Usado pouco, é visto. */}
      <header className="flex-shrink-0 border-b border-border bg-acento-suave px-3 py-2.5">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-bold tracking-[0.12em] text-acento-forte uppercase">
            {titulo}
          </h2>
          <span className="text-lg font-bold tabular-nums text-acento-forte">
            {quantidade}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{criterio}</p>
      </header>

      {erro && (
        <div className="flex-shrink-0 p-2">
          <Alerta>{erro}</Alerta>
        </div>
      )}

      {quantidade === 0 ? (
        <p className="px-3 py-6 text-center text-xs text-muted-foreground">{vazio}</p>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto">{children}</ul>
      )}
    </section>
  )
}
