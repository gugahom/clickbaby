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
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-painel border border-border bg-card shadow-painel">
      {/* O rosa da marca vive aqui: são os dois pontos da tela que se leem de
          longe, na TV da sala de edição. Usado pouco, é visto.
      
          O CONTADOR virou disco cheio. Era um número solto do mesmo tamanho do
          título, e os dois disputavam a linha; num disco ele vira objeto — se
          lê de longe sem ser lido, que é o que a TV precisa. */}
      <header className="flex-shrink-0 border-b border-border bg-acento-suave px-3.5 py-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="rotulo-sobrescrito text-acento-forte">{titulo}</h2>
          <span className="inline-flex min-w-7 items-center justify-center rounded-full bg-acento-forte px-2 py-0.5 text-sm font-bold tabular-nums text-white">
            {quantidade}
          </span>
        </div>
        <p className="mt-1 text-xs leading-snug text-muted-foreground">{criterio}</p>
      </header>

      {erro && (
        <div className="flex-shrink-0 p-2">
          <Alerta>{erro}</Alerta>
        </div>
      )}

      {quantidade === 0 ? (
        <p className="px-3 py-8 text-center text-xs text-muted-foreground">{vazio}</p>
      ) : (
        <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2.5">{children}</ul>
      )}
    </section>
  )
}
