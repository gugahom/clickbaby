import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import clsx from 'clsx'
import { IconeAdicionar, IconeLupa, IconeSetaDireita } from '@/components/ui/icones'
import { iniciais } from '@/lib/iniciais'
import {
  ROTULO_SITUACAO,
  estaAberto,
  nomeDoLead,
  normalizarBusca,
  porPrazo,
  telefoneLegivel,
  type Lead,
} from '../lib/leads'
import { PAGINAS_DO_CRM, caminhoDaPagina } from './navegacao'

interface Item {
  id: string
  grupo: 'Leads' | 'Ir para' | 'Ações'
  rotulo: string
  detalhe?: string
  icone: ReactNode
  executar: () => void
}

const MAXIMO_DE_LEADS = 8

/**
 * A BUSCA RÁPIDA (Ctrl K, ⌘ K ou "/"), como nos CRMs de referência — Attio,
 * Twenty, Linear. Um campo só acha uma família pelo nome da mãe, do bebê ou
 * pelo telefone, leva a qualquer página e cria lead, sem tirar a mão do
 * teclado.
 *
 * Sem acento e sem caixa, como todas as buscas do sistema. O telefone casa a
 * partir de quatro dígitos — menos que isso acha metade da lista.
 */
export function PaletaDeComandos({
  leads,
  onFechar,
  onAbrirLead,
  onNovoLead,
  onNavegar,
}: {
  leads: Lead[]
  onFechar: () => void
  onAbrirLead: (id: string) => void
  onNovoLead: () => void
  onNavegar: (para: string) => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const listaId = useId()
  const [texto, setTexto] = useState('')
  const [ativo, setAtivo] = useState(0)

  useEffect(() => {
    const d = ref.current
    if (!d?.open) d?.showModal()
  }, [])

  const itens = useMemo<Item[]>(() => {
    const termo = normalizarBusca(texto)
    const digitos = texto.replace(/\D/g, '')

    const daFamilia = (termo === ''
      ? leads.filter(estaAberto).sort(porPrazo).slice(0, 5)
      : leads
          .filter(
            (l) =>
              normalizarBusca(nomeDoLead(l)).includes(termo) ||
              (digitos.length >= 4 && l.telefone.includes(digitos)),
          )
          .sort((a, b) => Number(estaAberto(b)) - Number(estaAberto(a)) || porPrazo(a, b))
          .slice(0, MAXIMO_DE_LEADS)
    ).map<Item>((l) => ({
      id: `lead-${l.id}`,
      grupo: 'Leads',
      rotulo: nomeDoLead(l),
      detalhe: [l.maternidadeSigla, ROTULO_SITUACAO[l.situacao], telefoneLegivel(l.telefone)]
        .filter(Boolean)
        .join(' · '),
      icone: <span className="text-[11px] font-extrabold">{iniciais(l.maeNome)}</span>,
      executar: () => onAbrirLead(l.id),
    }))

    const paginas = PAGINAS_DO_CRM.filter((p) => termo === '' || normalizarBusca(p.rotulo).includes(termo)).map<Item>(
      (p) => ({
        id: `pagina-${p.id || 'inicio'}`,
        grupo: 'Ir para',
        rotulo: p.rotulo,
        ...(p.emBreve ? { detalhe: 'em breve' } : {}),
        icone: <p.Icone className="size-4" />,
        executar: () => onNavegar(caminhoDaPagina(p)),
      }),
    )

    const acoes: Item[] =
      termo === '' || normalizarBusca('novo lead criar').includes(termo)
        ? [
            {
              id: 'acao-novo',
              grupo: 'Ações',
              rotulo: 'Novo lead',
              icone: <IconeAdicionar className="size-4" />,
              executar: onNovoLead,
            },
          ]
        : []

    return [...acoes, ...daFamilia, ...paginas]
  }, [texto, leads, onAbrirLead, onNavegar, onNovoLead])

  const indice = Math.min(ativo, Math.max(0, itens.length - 1))
  const escolhido = itens[indice]

  function executar(item: Item | undefined) {
    if (!item) return
    onFechar()
    item.executar()
  }

  // Os itens agrupados, na ordem em que a lista os traz.
  const grupos = itens.reduce<{ grupo: Item['grupo']; itens: Item[] }[]>((acc, item) => {
    const ultimo = acc.at(-1)
    if (ultimo && ultimo.grupo === item.grupo) ultimo.itens.push(item)
    else acc.push({ grupo: item.grupo, itens: [item] })
    return acc
  }, [])

  return (
    <dialog
      ref={ref}
      aria-label="Busca rápida"
      onCancel={(e) => {
        e.preventDefault()
        onFechar()
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onFechar()
      }}
      className="entra-paleta mx-auto mt-[12vh] w-[min(38rem,calc(100vw-1.5rem))] overflow-hidden rounded-painel border border-border bg-card p-0 text-foreground shadow-cartao-alto backdrop:bg-marca-forte/30 backdrop:backdrop-blur-[2px]"
    >
      <div className="flex items-center gap-3 border-b border-border px-4">
        <IconeLupa className="size-5 flex-shrink-0 text-muted-foreground" />
        <input
          autoFocus
          role="combobox"
          aria-expanded="true"
          aria-controls={listaId}
          aria-activedescendant={escolhido ? `${listaId}-${escolhido.id}` : undefined}
          aria-label="Buscar leads e páginas"
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value)
            setAtivo(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setAtivo((i) => Math.min(itens.length - 1, i + 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setAtivo((i) => Math.max(0, i - 1))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              executar(escolhido)
            }
          }}
          placeholder="Mãe, bebê, telefone ou página…"
          className="h-14 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
        />
        <kbd className="rounded-md border border-border bg-muted px-1.5 py-px font-mono text-[11px] text-muted-foreground">
          Esc
        </kbd>
      </div>

      <ul id={listaId} role="listbox" aria-label="Resultados" className="max-h-[min(26rem,60vh)] overflow-y-auto p-2">
        {itens.length === 0 && (
          <li className="px-3 py-8 text-center text-sm text-muted-foreground">
            Nada com “{texto}”. Confira a grafia, ou crie o lead.
          </li>
        )}
        {grupos.map((g) => (
          <li key={g.grupo} role="presentation">
            <p className="rotulo-sobrescrito px-3 pt-2 pb-1 text-muted-foreground">{g.grupo}</p>
            <ul role="presentation">
              {g.itens.map((item) => {
                const marcado = item === escolhido
                return (
                  <li
                    key={item.id}
                    id={`${listaId}-${item.id}`}
                    role="option"
                    aria-selected={marcado}
                    onMouseMove={() => setAtivo(itens.indexOf(item))}
                    onClick={() => executar(item)}
                    className={clsx(
                      'flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm',
                      marcado ? 'bg-marca-suave text-marca' : 'text-foreground',
                    )}
                  >
                    <span
                      className={clsx(
                        'grid size-7 flex-shrink-0 place-items-center rounded-lg',
                        marcado ? 'bg-card text-marca' : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {item.icone}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{item.rotulo}</span>
                      {item.detalhe && (
                        <span className="block truncate text-xs text-muted-foreground">{item.detalhe}</span>
                      )}
                    </span>
                    {marcado && <IconeSetaDireita className="size-4 flex-shrink-0" />}
                  </li>
                )
              })}
            </ul>
          </li>
        ))}
      </ul>
    </dialog>
  )
}
