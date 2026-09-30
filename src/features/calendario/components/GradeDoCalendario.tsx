import clsx from 'clsx'
import type { Feriado, ItemDoCalendario } from '../api/useCalendario'
import { NOMES_DOS_DIAS, diaDaSemanaCurto, rotuloDoDia } from '../lib/datas'
import { corDoParto, textoSobre } from '../lib/coresGoogle'
import { esmaecido, estiloDoItem } from '../lib/estilos'

/**
 * A GRADE DO MÊS e as SETE COLUNAS DA SEMANA. As duas são a mesma pergunta —
 * "o que tem em cada dia" — em escalas diferentes, e as duas só ESCOLHEM o dia:
 * o detalhe mora na agenda ao lado, que tem espaço para dizer o que cada item é.
 *
 * NO MÊS, cada dia mostra até três itens e "+N"; no celular, só as bolinhas das
 * cores, porque sete colunas em 375px não cabem nome nenhum. NA SEMANA, cada
 * coluna mostra tudo, com hora e nome.
 *
 * O dia é um <button>: escolher o dia pelo teclado é o mesmo gesto que pelo
 * mouse, e o nome acessível diz quantos itens ele tem.
 */

const VISIVEIS_NO_MES = 3

interface PropsDaGrade {
  dias: string[]
  /** O mês da tela ('YYYY-MM'): os dias das pontas ficam apagados. */
  mes?: string
  hoje: string
  escolhido: string
  porDia: Map<string, ItemDoCalendario[]>
  feriados: Map<string, Feriado>
  onEscolher: (dia: string) => void
}

export function GradeDoMes({ dias, mes, hoje, escolhido, porDia, feriados, onEscolher }: PropsDaGrade) {
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
          const itens = porDia.get(dia) ?? []
          const feriado = feriados.get(dia)
          const foraDoMes = mes !== undefined && dia.slice(0, 7) !== mes
          const sobra = itens.length - VISIVEIS_NO_MES
          return (
            <button
              key={dia}
              type="button"
              onClick={() => onEscolher(dia)}
              aria-pressed={dia === escolhido}
              aria-label={`${rotuloDoDia(dia)}${feriado ? `, feriado: ${feriado.descricao}` : ''}, ${itens.length} ${itens.length === 1 ? 'item' : 'itens'}`}
              className={clsx(
                'flex min-h-16 flex-col gap-1 border-border p-1 text-left align-top transition-colors sm:min-h-28 sm:p-1.5',
                i % 7 !== 6 && 'border-r',
                i < dias.length - 7 && 'border-b',
                dia === escolhido ? 'bg-marca-suave/70' : feriado ? 'bg-muted/60 hover:bg-muted' : 'hover:bg-muted/50',
                foraDoMes && 'opacity-45',
              )}
            >
              <span className="flex items-center gap-1">
                <span
                  className={clsx(
                    'grid size-6 place-items-center rounded-full text-xs font-bold tabular-nums',
                    dia === hoje ? 'bg-marca text-white' : 'text-foreground',
                  )}
                >
                  {Number(dia.slice(8))}
                </span>
                {feriado && (
                  <span className="hidden truncate text-[10px] font-semibold text-muted-foreground sm:inline">
                    {feriado.descricao}
                  </span>
                )}
              </span>

              {/* Celular: só as cores. */}
              {itens.length > 0 && (
                <span className="flex flex-wrap gap-0.5 sm:hidden" aria-hidden="true">
                  {itens.slice(0, 6).map((item) => (
                    <span
                      key={item.chave}
                      className={clsx(
                        'size-1.5 rounded-full',
                        item.tipo !== 'parto' && estiloDoItem(item).marca,
                        esmaecido(item) && 'opacity-45',
                      )}
                      style={item.tipo === 'parto' ? { backgroundColor: corDoParto(item.corDoGoogle).hex } : undefined}
                    />
                  ))}
                </span>
              )}

              <span className="hidden min-w-0 flex-col gap-0.5 sm:flex" aria-hidden="true">
                {itens.slice(0, VISIVEIS_NO_MES).map((item) => (
                  <PilulaDoItem key={item.chave} item={item} />
                ))}
                {sobra > 0 && <span className="px-1 text-[11px] font-semibold text-muted-foreground">+{sobra} mais</span>}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function ColunasDaSemana({ dias, hoje, escolhido, porDia, feriados, onEscolher }: PropsDaGrade) {
  return (
    <div className="grid gap-2 sm:grid-cols-7">
      {dias.map((dia) => {
        const itens = porDia.get(dia) ?? []
        const feriado = feriados.get(dia)
        return (
          <button
            key={dia}
            type="button"
            onClick={() => onEscolher(dia)}
            aria-pressed={dia === escolhido}
            aria-label={`${rotuloDoDia(dia)}, ${itens.length} ${itens.length === 1 ? 'item' : 'itens'}`}
            className={clsx(
              'flex min-h-24 flex-col gap-1.5 rounded-painel border bg-card p-2 text-left transition-colors sm:min-h-[26rem]',
              dia === escolhido ? 'border-marca ring-2 ring-marca/20' : 'border-border hover:border-marca/40',
            )}
          >
            <span className="flex items-baseline gap-1.5">
              <span className="text-xs font-semibold text-muted-foreground uppercase">{diaDaSemanaCurto(dia)}</span>
              <span
                className={clsx(
                  'grid size-7 place-items-center rounded-full text-sm font-bold tabular-nums',
                  dia === hoje ? 'bg-marca text-white' : 'text-foreground',
                )}
              >
                {Number(dia.slice(8))}
              </span>
            </span>
            {feriado && <span className="truncate text-[11px] font-semibold text-muted-foreground">{feriado.descricao}</span>}
            <span className="flex min-w-0 flex-col gap-1" aria-hidden="true">
              {itens.map((item) => (
                <PilulaDoItem key={item.chave} item={item} comDetalhe />
              ))}
              {itens.length === 0 && <span className="text-[11px] text-muted-foreground/70">—</span>}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * Como a pílula se pinta. O PARTO vem na COR CHEIA do seu evento no Google
 * (segunda volta do gestor: "tá muito apagado" — o fundo tingido de leve lia
 * como pastel), com o texto que tiver mais contraste com ela (`textoSobre`). Os
 * outros tipos usam as cores da casa. O que JÁ PASSOU, de qualquer tipo, perde a
 * força — ver `esmaecido`.
 */
function aparencia(item: ItemDoCalendario): { classe: string; fundo?: { backgroundColor: string; color: string } } {
  if (item.tipo !== 'parto' || item.vencido) {
    return { classe: clsx(estiloDoItem(item).pilula, esmaecido(item) && 'opacity-45') }
  }
  const cor = corDoParto(item.corDoGoogle).hex
  return { classe: clsx(esmaecido(item) && 'opacity-45'), fundo: { backgroundColor: cor, color: textoSobre(cor) } }
}

function PilulaDoItem({ item, comDetalhe = false }: { item: ItemDoCalendario; comDetalhe?: boolean }) {
  const a = aparencia(item)
  // NA SEMANA a coluna é estreita (sete ao lado da agenda): hora e tipo em
  // cima, e o nome embaixo QUEBRANDO em duas linhas — cortado em "TESTE CA…"
  // ele não dizia de quem era.
  if (comDetalhe) {
    return (
      <span className={clsx('block min-w-0 rounded-md px-1.5 py-1 text-[11px] leading-tight', a.classe)} style={a.fundo}>
        <span className="block truncate font-normal opacity-90">
          {item.hora && <span className="font-bold tabular-nums">{item.hora} · </span>}
          {item.titulo}
        </span>
        <span className="line-clamp-2 font-semibold break-words">{item.nome}</span>
      </span>
    )
  }
  return (
    <span
      className={clsx('block min-w-0 truncate rounded-md px-1.5 py-0.5 text-[11px] leading-tight font-semibold', a.classe)}
      style={a.fundo}
    >
      {item.hora && <span className="tabular-nums">{item.hora} </span>}
      {item.nome}
    </span>
  )
}
