import clsx from 'clsx'
import { IconeAdicionar, IconeLupa, IconeMenu } from '@/components/ui/icones'
import { ehAmbienteLocal } from '@/lib/supabase'
import { Segmentado } from '@/features/relatorios/components/Segmentado'
import type { Escopo } from './contexto'

/** "⌘ K" no Mac, "Ctrl K" no resto — o atalho que a pessoa vai de fato apertar. */
const ATALHO_DA_BUSCA =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘ K' : 'Ctrl K'

/**
 * O CABEÇALHO DO CRM: onde se está, a busca rápida, de quem são os leads
 * mostrados e o "Novo lead". Branco e quieto, ao contrário da faixa da marca
 * do Quadro — o peso da marca fica na barra lateral, e o conteúdo respira.
 *
 * A BUSCA PARECE UM CAMPO mas abre a busca rápida (a paleta do Ctrl K): um
 * campo de verdade aqui e outro na paleta seriam duas buscas com dois
 * comportamentos.
 */
export function CabecalhoDoCrm({
  titulo,
  escopo,
  mostrarEscopo,
  onEscopo,
  onMenu,
  onBuscar,
  onNovoLead,
}: {
  titulo: string
  escopo: Escopo
  mostrarEscopo: boolean
  onEscopo: (e: Escopo) => void
  onMenu: () => void
  onBuscar: () => void
  onNovoLead: () => void
}) {
  return (
    <header className="flex h-14 flex-shrink-0 items-center gap-2 border-b border-border bg-card px-2 md:gap-3 md:px-5">
      <button
        type="button"
        onClick={onMenu}
        aria-label="Abrir o menu do CRM"
        className="grid size-11 flex-shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"
      >
        <IconeMenu className="size-5" />
      </button>

      <nav aria-label="Onde você está" className="min-w-0">
        <ol className="flex min-w-0 items-center gap-1.5 text-sm">
          <li className="hidden text-muted-foreground sm:block">Comercial</li>
          <li aria-hidden="true" className="hidden text-muted-foreground/50 sm:block">
            /
          </li>
          <li aria-current="page" className="truncate font-bold">
            {titulo}
          </li>
        </ol>
      </nav>

      {/* Ambiente: o mesmo selo do Quadro, para ninguém demonstrar contra o
          banco de verdade por engano. */}
      <span
        className={clsx(
          'hidden rounded-full px-2 py-0.5 font-mono text-[10px] tracking-wide sm:inline',
          ehAmbienteLocal ? 'bg-muted text-muted-foreground' : 'bg-atrasado text-white',
        )}
      >
        {ehAmbienteLocal ? 'LOCAL' : 'REMOTO'}
      </span>

      <div className="ml-auto flex items-center gap-1.5 md:gap-2.5">
        <button
          type="button"
          onClick={onBuscar}
          aria-label="Buscar leads e páginas"
          aria-keyshortcuts="Control+K Meta+K /"
          className={clsx(
            'flex items-center gap-2 rounded-full text-sm text-muted-foreground transition-colors',
            'size-11 justify-center hover:bg-muted md:size-auto md:h-9 md:w-64 md:justify-start md:border md:border-border md:bg-background md:pr-2 md:pl-3 md:hover:border-marca/30 lg:w-72',
          )}
        >
          <IconeLupa className="size-[18px] flex-shrink-0 md:size-4" />
          <span className="hidden flex-1 text-left md:inline">Buscar leads e páginas</span>
          <kbd className="hidden rounded-md border border-border bg-card px-1.5 py-px font-mono text-[11px] text-muted-foreground md:inline">
            {ATALHO_DA_BUSCA}
          </kbd>
        </button>

        {mostrarEscopo && (
          <span className="hidden sm:inline-flex">
            <Segmentado
              rotulo="De quem são os leads mostrados"
              opcoes={[
                { id: 'meus', conteudo: 'Meus', titulo: 'Os leads da minha carteira' },
                { id: 'equipe', conteudo: 'Equipe', titulo: 'Os leads de todo mundo' },
              ]}
              ativa={escopo}
              onTrocar={onEscopo}
            />
          </span>
        )}

        <button
          type="button"
          onClick={onNovoLead}
          className="inline-flex size-11 items-center justify-center gap-1.5 rounded-full bg-marca text-sm font-bold text-white shadow-cartao transition-colors hover:bg-marca-forte md:h-9 md:w-auto md:px-4"
        >
          <IconeAdicionar className="size-4" />
          <span className="sr-only md:not-sr-only">Novo lead</span>
        </button>
      </div>
    </header>
  )
}
