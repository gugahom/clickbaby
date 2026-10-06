import { useState, type CSSProperties } from 'react'
import clsx from 'clsx'
import type { ItemDoCalendario } from '../api/useCalendario'
import { largar, pegar } from '../lib/arrasto'
import { aparencia } from '../lib/estilos'

/**
 * UM ITEM DO CALENDÁRIO, em três densidades — a do mês (uma linha), a da
 * semana (hora e tipo em cima, nome embaixo) e a do dia (o cartão inteiro). É o
 * `EventCard` do exemplo que o gestor mandou (30/09/2026), feito com as peças
 * da casa.
 *
 * A COR segue `aparencia`: cheia no que vem pela frente, fundo branco com a
 * bolinha no que já passou, vermelho no prazo vencido.
 *
 * PASSAR O MOUSE abre o cartão de detalhes (onde, pacote, com quem), como no
 * exemplo; TOCAR abre o detalhe completo (`onAbrir`). No celular não há hover:
 * o toque é o caminho, e é o mesmo.
 *
 * `arrastavel` liga o arrastar (só no mouse; ver lib/arrasto.ts) — quem decide
 * é a página, pelo papel de quem está vendo e pelo tipo do item.
 */
export type Densidade = 'compacto' | 'normal' | 'detalhado'

export function CartaoDoItem({
  item,
  densidade,
  onAbrir,
  arrastavel = false,
}: {
  item: ItemDoCalendario
  densidade: Densidade
  onAbrir: (item: ItemDoCalendario) => void
  arrastavel?: boolean
}) {
  const a = aparencia(item)
  // Onde abrir o cartão de detalhes: medido no hover, em coordenadas da janela
  // (position: fixed) — assim ele não é cortado pela célula nem pela rolagem
  // da grade de horas.
  const [caixa, setCaixa] = useState<DOMRect | null>(null)

  const estilo: CSSProperties = a.cheio ? { backgroundColor: a.hex, color: a.texto } : {}
  const bolinha = !a.cheio && (
    <span className="size-2 flex-shrink-0 rounded-full" style={{ backgroundColor: a.hex }} aria-hidden="true" />
  )
  const comum = {
    type: 'button' as const,
    onClick: (e: React.MouseEvent) => {
      e.stopPropagation()
      onAbrir(item)
    },
    onMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => setCaixa(e.currentTarget.getBoundingClientRect()),
    onMouseLeave: () => setCaixa(null),
    onFocus: (e: React.FocusEvent<HTMLButtonElement>) => setCaixa(e.currentTarget.getBoundingClientRect()),
    onBlur: () => setCaixa(null),
    'aria-label': `${item.titulo}${item.hora ? ` às ${item.hora}` : ''}: ${item.nome}`,
    style: estilo,
    ...(arrastavel && {
      draggable: true,
      onDragStart: (e: React.DragEvent) => {
        setCaixa(null)
        pegar(item, e)
      },
      onDragEnd: largar,
    }),
  }
  const vazado = clsx(!a.cheio && 'text-foreground hover:bg-muted', arrastavel && 'cursor-grab active:cursor-grabbing')

  let corpo
  if (densidade === 'compacto') {
    corpo = (
      <button
        {...comum}
        className={clsx(
          'flex w-full min-w-0 items-center gap-1 rounded px-1.5 py-0.5 text-left text-[11px] leading-tight font-semibold transition-shadow hover:shadow-md',
          vazado,
        )}
      >
        {bolinha}
        <span className="truncate">
          {item.hora && <span className="tabular-nums">{item.hora} </span>}
          {item.nome}
        </span>
      </button>
    )
  } else if (densidade === 'normal') {
    corpo = (
      <button
        {...comum}
        className={clsx(
          'flex w-full min-w-0 gap-1 rounded-md px-1.5 py-1 text-left text-[11px] leading-tight transition-shadow hover:shadow-md',
          vazado,
        )}
      >
        {bolinha && <span className="mt-[3px] flex">{bolinha}</span>}
        <span className="min-w-0">
          <span className="block truncate opacity-90">
            {item.hora && <span className="font-bold tabular-nums">{item.hora} · </span>}
            {item.titulo}
          </span>
          <span className="line-clamp-2 font-semibold break-words">{item.nome}</span>
        </span>
      </button>
    )
  } else {
    corpo = (
      <button
        {...comum}
        className={clsx(
          'flex w-full min-w-0 gap-2 rounded-xl px-3 py-2 text-left transition-shadow hover:shadow-lg',
          vazado,
          !a.cheio && 'border border-border',
        )}
      >
        {bolinha && <span className="mt-1.5 flex">{bolinha}</span>}
        <span className="min-w-0">
          <span className="block text-xs opacity-90">
            {item.hora && <span className="font-bold tabular-nums">{item.hora} · </span>}
            {item.titulo}
            {item.vencido && ' · vencido'}
          </span>
          <span className="block truncate font-bold">{item.nome}</span>
          <span className="block truncate text-xs opacity-85">
            {[item.maternidade, item.pacote, item.responsavel && `com ${item.responsavel}`].filter(Boolean).join(' · ')}
          </span>
        </span>
      </button>
    )
  }

  return (
    <>
      {corpo}
      {caixa && densidade !== 'detalhado' && <CartaoDeDetalhes item={item} caixa={caixa} />}
    </>
  )
}

/** O cartão que aparece no hover — o do exemplo, com o que importa aqui. */
function CartaoDeDetalhes({ item, caixa }: { item: ItemDoCalendario; caixa: DOMRect }) {
  const a = aparencia(item)
  const largura = 272
  // Embaixo do item, e para dentro da tela quando ele está perto da borda.
  const esquerda = Math.min(Math.max(8, caixa.left), window.innerWidth - largura - 8)
  const abaixo = caixa.bottom + 6
  const cabeEmbaixo = abaixo + 140 < window.innerHeight
  return (
    <div
      role="tooltip"
      className="pointer-events-none fixed z-50 rounded-xl border border-border bg-card p-3 text-foreground shadow-cartao-alto"
      style={{
        left: esquerda,
        width: largura,
        ...(cabeEmbaixo ? { top: abaixo } : { bottom: window.innerHeight - caixa.top + 6 }),
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm leading-tight font-bold">{item.nome}</span>
        <span className="mt-0.5 size-3 flex-shrink-0 rounded-full" style={{ backgroundColor: a.hex }} />
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        {item.titulo}
        {item.hora ? ` · ${item.hora}` : ' · dia todo'}
        {item.vencido && ' · vencido'}
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {[item.maternidade, item.pacote].filter(Boolean).map((t) => (
          <span key={t} className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold">
            {t}
          </span>
        ))}
        {item.responsavel && (
          <span className="rounded-full border border-border px-2 py-0.5 text-[11px]">com {item.responsavel}</span>
        )}
      </div>
      {(item.google === 'enviando' || item.google === 'atualizando') && (
        <div className="mt-2 text-[11px] text-muted-foreground">
          {item.google === 'enviando' ? 'Indo para o Google' : 'Atualizando no Google'}
        </div>
      )}
    </div>
  )
}
