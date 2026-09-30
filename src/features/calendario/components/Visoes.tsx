import { useEffect, useRef, type ReactNode } from 'react'
import clsx from 'clsx'
import type { Feriado, ItemDoCalendario } from '../api/useCalendario'
import { NOMES_DOS_DIAS, diaDaSemanaCurto, rotuloDoDia, rotuloDoDiaCompleto } from '../lib/datas'
import { aparencia } from '../lib/estilos'
import { CartaoDoItem } from './CartaoDoItem'

/**
 * AS QUATRO VISÕES do calendário — mês, semana, dia e lista —, o arranjo do
 * exemplo que o gestor mandou (30/09/2026). Todas recebem os itens JÁ
 * FILTRADOS pela busca e pelos filtros do alto, e todas levam ao mesmo detalhe
 * ao tocar num item.
 *
 * SEMANA E DIA SÃO GRADES DE HORA, como no Google: o parto das 3h fica às 3h,
 * e o que não tem hora (dia todo) mora numa faixa própria em cima. A grade abre
 * rolada nas 6h — a madrugada existe (há parto às 3h), mas abrir na meia-noite
 * esconderia a manhã, que é onde a maior parte do dia acontece.
 */

interface PropsComuns {
  hoje: string
  porDia: Map<string, ItemDoCalendario[]>
  feriados: Map<string, Feriado>
  onAbrir: (item: ItemDoCalendario) => void
  onIrParaDia: (dia: string) => void
}

const VISIVEIS_NO_MES = 3
const HORAS = Array.from({ length: 24 }, (_, h) => h)
const ALTURA_DA_HORA = 56 // px — a mesma em semana e dia, para a rolagem inicial

const doDia = (porDia: Map<string, ItemDoCalendario[]>, dia: string) => porDia.get(dia) ?? []
const naHora = (itens: ItemDoCalendario[], h: number) => itens.filter((i) => i.hora !== null && Number(i.hora.slice(0, 2)) === h)
const semHora = (itens: ItemDoCalendario[]) => itens.filter((i) => i.hora === null)

function NumeroDoDia({ dia, hoje, onIr, grande = false }: { dia: string; hoje: string; onIr: () => void; grande?: boolean }) {
  return (
    <button
      type="button"
      onClick={onIr}
      title={`Ver ${rotuloDoDia(dia)}`}
      className={clsx(
        'grid place-items-center rounded-full font-bold tabular-nums transition-colors',
        grande ? 'size-8 text-sm' : 'size-6 text-xs',
        dia === hoje ? 'bg-marca text-white' : 'text-foreground hover:bg-muted',
      )}
    >
      {Number(dia.slice(8))}
    </button>
  )
}

// ---------------------------------------------------------------------------
// MÊS
// ---------------------------------------------------------------------------

export function VisaoMes({ dias, mes, hoje, porDia, feriados, onAbrir, onIrParaDia }: PropsComuns & { dias: string[]; mes: string }) {
  return (
    <div className="overflow-hidden rounded-painel border border-border bg-card">
      <div className="grid grid-cols-7 border-b border-border bg-muted/40">
        {NOMES_DOS_DIAS.map((n) => (
          <div key={n} className="py-2 text-center text-xs font-semibold text-muted-foreground">
            {n}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {dias.map((dia, i) => {
          const itens = doDia(porDia, dia)
          const feriado = feriados.get(dia)
          const sobra = itens.length - VISIVEIS_NO_MES
          return (
            <div
              key={dia}
              onClick={() => onIrParaDia(dia)}
              className={clsx(
                'flex min-h-20 cursor-pointer flex-col gap-1 border-border p-1 transition-colors sm:min-h-28 sm:p-1.5',
                i % 7 !== 6 && 'border-r',
                i < dias.length - 7 && 'border-b',
                dia.slice(0, 7) !== mes ? 'bg-muted/40 text-muted-foreground' : feriado ? 'bg-muted/60' : 'hover:bg-muted/40',
              )}
            >
              <span className="flex items-center gap-1">
                <NumeroDoDia dia={dia} hoje={hoje} onIr={() => onIrParaDia(dia)} />
                {feriado && (
                  <span className="hidden truncate text-[10px] font-semibold text-muted-foreground sm:inline">{feriado.descricao}</span>
                )}
              </span>
              {/* Celular: só as cores. */}
              {itens.length > 0 && (
                <span className="flex flex-wrap gap-0.5 sm:hidden" aria-hidden="true">
                  {itens.slice(0, 6).map((item) => {
                    const a = aparencia(item)
                    return (
                      <span
                        key={item.chave}
                        className="size-1.5 rounded-full"
                        style={a.cheio ? { backgroundColor: a.hex } : { boxShadow: `inset 0 0 0 1.5px ${a.hex}` }}
                      />
                    )
                  })}
                </span>
              )}
              <span className="hidden min-w-0 flex-col gap-0.5 sm:flex">
                {itens.slice(0, VISIVEIS_NO_MES).map((item) => (
                  <CartaoDoItem key={item.chave} item={item} densidade="compacto" onAbrir={onAbrir} />
                ))}
                {sobra > 0 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onIrParaDia(dia)
                    }}
                    className="px-1 text-left text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                  >
                    +{sobra} mais
                  </button>
                )}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// GRADE DE HORAS — semana e dia
// ---------------------------------------------------------------------------

function useRolarParaAsSeis() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = 6 * ALTURA_DA_HORA
  }, [])
  return ref
}

export function VisaoSemana({ dias, hoje, porDia, feriados, onAbrir, onIrParaDia }: PropsComuns & { dias: string[] }) {
  const rolagem = useRolarParaAsSeis()
  const colunas = 'grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))]'
  const temDiaTodo = dias.some((d) => semHora(doDia(porDia, d)).length > 0 || feriados.has(d))
  return (
    <div className="overflow-hidden rounded-painel border border-border bg-card">
      <div className="overflow-x-auto">
        <div className="min-w-[48rem]">
          <div className={clsx(colunas, 'border-b border-border bg-muted/40')}>
            <div />
            {dias.map((dia) => (
              <div key={dia} className="flex flex-col items-center gap-0.5 border-l border-border py-1.5">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase">{diaDaSemanaCurto(dia)}</span>
                <NumeroDoDia dia={dia} hoje={hoje} onIr={() => onIrParaDia(dia)} grande />
              </div>
            ))}
          </div>
          {temDiaTodo && (
            <div className={clsx(colunas, 'border-b border-border')}>
              <div className="px-1 py-1.5 text-right text-[10px] text-muted-foreground">dia todo</div>
              {dias.map((dia) => (
                <div key={dia} className="flex min-w-0 flex-col gap-0.5 border-l border-border p-0.5">
                  {feriados.get(dia) && (
                    <span className="truncate rounded bg-muted px-1.5 py-0.5 text-[11px] font-semibold">{feriados.get(dia)?.descricao}</span>
                  )}
                  {semHora(doDia(porDia, dia)).map((item) => (
                    <CartaoDoItem key={item.chave} item={item} densidade="compacto" onAbrir={onAbrir} />
                  ))}
                </div>
              ))}
            </div>
          )}
          <div ref={rolagem} className="max-h-[65vh] overflow-y-auto">
            {HORAS.map((h) => (
              <div key={h} className={colunas} style={{ minHeight: ALTURA_DA_HORA }}>
                <div className="-mt-2 px-1 text-right text-[10px] text-muted-foreground tabular-nums">
                  {h === 0 ? '' : `${String(h).padStart(2, '0')}:00`}
                </div>
                {dias.map((dia) => (
                  <div
                    key={dia}
                    className={clsx('flex min-w-0 flex-col gap-0.5 border-t border-l border-border p-0.5', dia === hoje && 'bg-marca-suave/30')}
                  >
                    {naHora(doDia(porDia, dia), h).map((item) => (
                      <CartaoDoItem key={item.chave} item={item} densidade="normal" onAbrir={onAbrir} />
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export function VisaoDia({
  dia,
  hoje,
  porDia,
  feriados,
  onAbrir,
  acoes,
}: Omit<PropsComuns, 'onIrParaDia'> & { dia: string; acoes: ReactNode }) {
  const rolagem = useRolarParaAsSeis()
  const itens = doDia(porDia, dia)
  const feriado = feriados.get(dia)
  return (
    <div className="overflow-hidden rounded-painel border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-lg leading-tight font-bold tracking-tight">
            {rotuloDoDiaCompleto(dia)}
            {dia === hoje && <span className="ml-2 rounded-full bg-marca px-2 py-0.5 align-middle text-[11px] text-white">hoje</span>}
          </h2>
          <p className="text-xs text-muted-foreground">
            {itens.length === 0 ? 'Nada marcado.' : `${itens.length} ${itens.length === 1 ? 'item' : 'itens'}`}
            {feriado && ` · Feriado: ${feriado.descricao}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">{acoes}</div>
      </div>
      {semHora(itens).length > 0 && (
        <div className="flex gap-2 border-b border-border p-2">
          <span className="w-14 flex-shrink-0 pt-2 text-right text-[10px] text-muted-foreground">dia todo</span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            {semHora(itens).map((item) => (
              <CartaoDoItem key={item.chave} item={item} densidade="detalhado" onAbrir={onAbrir} />
            ))}
          </div>
        </div>
      )}
      <div ref={rolagem} className="max-h-[65vh] overflow-y-auto">
        {HORAS.map((h) => (
          <div key={h} className="flex" style={{ minHeight: ALTURA_DA_HORA }}>
            <div className="-mt-2 w-16 flex-shrink-0 pr-2 text-right text-[11px] text-muted-foreground tabular-nums">
              {h === 0 ? '' : `${String(h).padStart(2, '0')}:00`}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1 border-t border-l border-border p-1">
              {naHora(itens, h).map((item) => (
                <CartaoDoItem key={item.chave} item={item} densidade="detalhado" onAbrir={onAbrir} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// LISTA
// ---------------------------------------------------------------------------

export function VisaoLista({ dias, hoje, porDia, feriados, onAbrir, onIrParaDia }: PropsComuns & { dias: string[] }) {
  const comItem = dias.filter((d) => doDia(porDia, d).length > 0 || feriados.has(d))
  if (comItem.length === 0) {
    return (
      <p className="rounded-painel border border-border bg-card py-16 text-center text-sm text-muted-foreground">
        Nada neste mês com a busca e os filtros de agora.
      </p>
    )
  }
  return (
    <div className="space-y-5 rounded-painel border border-border bg-card p-3 sm:p-4">
      {comItem.map((dia) => (
        <section key={dia} className="space-y-2">
          <button
            type="button"
            onClick={() => onIrParaDia(dia)}
            className={clsx(
              'text-xs font-bold tracking-wide uppercase hover:underline',
              dia === hoje ? 'text-marca' : 'text-muted-foreground',
            )}
          >
            {rotuloDoDiaCompleto(dia)}
            {dia === hoje && ' · hoje'}
            {feriados.get(dia) && ` · Feriado: ${feriados.get(dia)?.descricao}`}
          </button>
          <div className="space-y-1.5">
            {doDia(porDia, dia).map((item) => (
              <CartaoDoItem key={item.chave} item={item} densidade="detalhado" onAbrir={onAbrir} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
