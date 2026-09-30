import { useEffect, useRef, useState, type ReactNode } from 'react'
import clsx from 'clsx'
import { IconeLupa, IconeX } from '@/components/ui/icones'

/**
 * A BUSCA E OS FILTROS DO CALENDÁRIO, no molde do exemplo do gestor
 * (30/09/2026): um campo de busca, três menus de marcar (cores, tipos,
 * maternidades) com o número de marcados no botão, e os filtros ativos em
 * etiquetas com × logo embaixo, com "Limpar".
 *
 * Os filtros SOMAM dentro do menu (HSC ou GNDI) e CORTAM entre menus (HSC e
 * banho) — a mesma regra do relatório externo, para as duas telas não
 * ensinarem lógicas diferentes.
 */
export interface OpcaoDoFiltro {
  valor: string
  rotulo: string
  /** Uma bolinha de cor antes do rótulo, quando a opção É uma cor. */
  cor?: string
}

export interface GrupoDoFiltro {
  id: string
  titulo: string
  opcoes: OpcaoDoFiltro[]
  marcados: string[]
  onMudar: (marcados: string[]) => void
}

export function FiltrosDoCalendario({
  busca,
  onBuscar,
  grupos,
}: {
  busca: string
  onBuscar: (texto: string) => void
  grupos: GrupoDoFiltro[]
}) {
  const ativos = grupos.flatMap((g) =>
    g.marcados.map((v) => ({ grupo: g, opcao: g.opcoes.find((o) => o.valor === v) ?? { valor: v, rotulo: v } })),
  )
  const temFiltro = ativos.length > 0 || busca !== ''

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-sm">
          <IconeLupa className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={busca}
            onChange={(e) => onBuscar(e.target.value)}
            placeholder="Buscar por mãe, bebê, maternidade…"
            aria-label="Buscar no calendário"
            className="h-10 w-full rounded-full border border-border bg-card pr-3 pl-9 text-sm placeholder:text-muted-foreground"
          />
        </div>
        {grupos.map((g) => (
          <MenuDeMarcar key={g.id} grupo={g} />
        ))}
        {temFiltro && (
          <button
            type="button"
            onClick={() => {
              onBuscar('')
              for (const g of grupos) g.onMudar([])
            }}
            className="inline-flex h-10 items-center gap-1 rounded-full px-3 text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <IconeX className="size-4" /> Limpar
          </button>
        )}
      </div>

      {ativos.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Filtros:</span>
          {ativos.map(({ grupo, opcao }) => (
            <span
              key={`${grupo.id}:${opcao.valor}`}
              className="inline-flex items-center gap-1 rounded-full border border-marca/30 bg-marca-suave py-0.5 pr-1 pl-2.5 text-xs font-semibold text-marca"
            >
              {opcao.cor && <span className="size-2 rounded-full" style={{ backgroundColor: opcao.cor }} />}
              {opcao.rotulo}
              <button
                type="button"
                onClick={() => grupo.onMudar(grupo.marcados.filter((v) => v !== opcao.valor))}
                aria-label={`Tirar o filtro ${opcao.rotulo}`}
                className="grid size-5 place-items-center rounded-full hover:bg-marca/15"
              >
                <IconeX className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

/** Um botão que abre uma lista de marcar. Fecha no clique fora e no Esc. */
function MenuDeMarcar({ grupo }: { grupo: GrupoDoFiltro }) {
  const [aberto, setAberto] = useState(false)
  const caixa = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setAberto(false)
    document.addEventListener('mousedown', fora)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', fora)
      document.removeEventListener('keydown', esc)
    }
  }, [aberto])

  const alternar = (v: string) =>
    grupo.onMudar(grupo.marcados.includes(v) ? grupo.marcados.filter((x) => x !== v) : [...grupo.marcados, v])

  return (
    <div ref={caixa} className="relative">
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-expanded={aberto}
        className={clsx(
          'inline-flex h-10 items-center gap-2 rounded-full border px-3.5 text-sm font-semibold transition-colors',
          grupo.marcados.length > 0 ? 'border-marca bg-marca-suave text-marca' : 'border-border bg-card hover:bg-muted',
        )}
      >
        <IconeFiltro />
        {grupo.titulo}
        {grupo.marcados.length > 0 && (
          <span className="rounded-full bg-marca px-1.5 text-[11px] leading-5 text-white tabular-nums">{grupo.marcados.length}</span>
        )}
      </button>
      {aberto && (
        <div
          role="group"
          aria-label={grupo.titulo}
          className="absolute top-full left-0 z-40 mt-1.5 max-h-80 w-64 overflow-y-auto rounded-xl border border-border bg-card p-1 text-foreground shadow-cartao-alto"
        >
          <div className="px-2.5 pt-1.5 pb-1 text-xs font-bold text-muted-foreground">Filtrar por {grupo.titulo.toLowerCase()}</div>
          {grupo.opcoes.length === 0 && <p className="px-2.5 py-2 text-sm text-muted-foreground">Nada neste período.</p>}
          {grupo.opcoes.map((o) => (
            <Linha key={o.valor} marcada={grupo.marcados.includes(o.valor)} onAlternar={() => alternar(o.valor)}>
              {o.cor && <span className="size-3 flex-shrink-0 rounded-full" style={{ backgroundColor: o.cor }} />}
              <span className="truncate">{o.rotulo}</span>
            </Linha>
          ))}
        </div>
      )}
    </div>
  )
}

function Linha({ marcada, onAlternar, children }: { marcada: boolean; onAlternar: () => void; children: ReactNode }) {
  return (
    <label className="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-sm hover:bg-muted">
      <input type="checkbox" checked={marcada} onChange={onAlternar} className="size-4 flex-shrink-0 accent-marca" />
      {children}
    </label>
  )
}

function IconeFiltro() {
  return (
    <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth={1.7} aria-hidden="true">
      <path d="M2 3.5h12L9.5 9v4l-3 1.5V9z" strokeLinejoin="round" />
    </svg>
  )
}
