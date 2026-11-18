import { useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import clsx from 'clsx'
import { FiltrosDeBusca } from '@/components/ui/FiltrosDeBusca'
import { Chevron, IconeConversa, IconeOrdenar } from '@/components/ui/icones'
import { iniciais } from '@/lib/iniciais'
import { LinhaDoLead } from '../components/LinhaDoLead'
import { PilulaPrazo, PilulaRetorno, PilulaSituacao } from '../components/Pilulas'
import { useCrm } from '../crm/contexto'
import {
  ORDEM_PRIORIDADE,
  ROTULO_ORIGEM,
  ROTULO_PRIORIDADE,
  estaAberto,
  haQuantoTempo,
  linkDoWhatsapp,
  nomeDoLead,
  normalizarBusca,
  telefoneLegivel,
  type Lead,
  type OrigemLead,
} from '../lib/leads'

/**
 * AS VISÕES são listas que se esvaziam sozinhas conforme o trabalho anda — as
 * "smart views" do Close e as abas salvas do HubSpot. Nenhuma é guardada: são
 * perguntas fixas que o comercial faz todo dia, e cada uma mostra quantos leads
 * responde.
 */
type Visao = 'abertos' | 'sem_passo' | 'urgentes' | 'repescagem' | 'fechados' | 'perdidos' | 'todos'
type Coluna = 'familia' | 'prazo' | 'proximo' | 'ultimo' | 'entrada' | 'encerrado'
type Ordem = { coluna: Coluna; direcao: 'asc' | 'desc' }

const VISOES: { id: Visao; rotulo: string; filtro: (l: Lead) => boolean; ordem: Ordem }[] = [
  { id: 'abertos', rotulo: 'Abertos', filtro: estaAberto, ordem: { coluna: 'prazo', direcao: 'asc' } },
  {
    id: 'sem_passo',
    rotulo: 'Sem próximo passo',
    filtro: (l) => estaAberto(l) && !l.proximoRetornoEm,
    ordem: { coluna: 'prazo', direcao: 'asc' },
  },
  {
    id: 'urgentes',
    rotulo: 'Urgentes',
    filtro: (l) => estaAberto(l) && l.prioridade === 'urgente',
    ordem: { coluna: 'prazo', direcao: 'asc' },
  },
  {
    id: 'repescagem',
    rotulo: 'Repescagem',
    filtro: (l) => estaAberto(l) && l.fase === 'repescagem',
    ordem: { coluna: 'prazo', direcao: 'asc' },
  },
  {
    id: 'fechados',
    rotulo: 'Fechados',
    filtro: (l) => l.situacao === 'ganho',
    ordem: { coluna: 'encerrado', direcao: 'desc' },
  },
  {
    id: 'perdidos',
    rotulo: 'Perdidos',
    filtro: (l) => l.situacao === 'perdido',
    ordem: { coluna: 'encerrado', direcao: 'desc' },
  },
  { id: 'todos', rotulo: 'Todos', filtro: () => true, ordem: { coluna: 'entrada', direcao: 'desc' } },
]

const POR_PAGINA = 25

/** Nulo vai sempre para o fim, nos dois sentidos — "sem retorno" não é "o mais cedo". */
function comparar(a: string | null, b: string | null, direcao: 'asc' | 'desc'): number {
  if (a === b) return 0
  if (a === null) return 1
  if (b === null) return -1
  return direcao === 'asc' ? a.localeCompare(b) : b.localeCompare(a)
}

function valorDaColuna(l: Lead, c: Coluna): string | null {
  switch (c) {
    case 'familia':
      return normalizarBusca(nomeDoLead(l))
    case 'prazo':
      return l.prazoVenda
    case 'proximo':
      return l.proximoRetornoEm
    case 'ultimo':
      return l.ultimoContatoEm
    case 'entrada':
      return l.criadoEm
    case 'encerrado':
      return l.encerradoEm
  }
}

/**
 * A PÁGINA DE LEADS: a planilha "PAINEL DE VENDAS" inteira, como tabela de CRM
 * — visões em cima, filtros, colunas que ordenam, e a ficha na gaveta ao lado
 * quando se toca numa linha. No celular a tabela vira a lista de cartões da
 * fila, porque oito colunas não cabem em 375px.
 */
export function LeadsDoCrm() {
  const { visiveis, carregando, escopo, hoje, leadAberto, abrirLead, registrarContato } = useCrm()
  const [params, setParams] = useSearchParams()
  const visao = VISOES.find((v) => v.id === params.get('visao')) ?? VISOES[0]!

  const [busca, setBusca] = useState('')
  const [maternidades, setMaternidades] = useState<string[]>([])
  const [origens, setOrigens] = useState<string[]>([])
  const [prioridades, setPrioridades] = useState<string[]>([])
  const [vendedores, setVendedores] = useState<string[]>([])
  const [ordemEscolhida, setOrdemEscolhida] = useState<Ordem | null>(null)
  const [pagina, setPagina] = useState(0)

  const ordem = ordemEscolhida ?? visao.ordem
  const comVendedor = escopo === 'equipe'

  const siglas = useMemo(() => [...new Set(visiveis.map((l) => l.maternidadeSigla ?? '—'))].sort(), [visiveis])
  const nomesDeVendedor = useMemo(
    () => [...new Set(visiveis.map((l) => l.vendedorNome ?? 'Sem vendedor'))].sort(),
    [visiveis],
  )

  // Os filtros valem para todas as visões; a contagem de cada visão já os leva
  // em conta, para o número na aba ser o que a tabela vai mostrar.
  const filtrados = useMemo(() => {
    const termo = normalizarBusca(busca)
    const digitos = busca.replace(/\D/g, '')
    return visiveis.filter(
      (l) =>
        (termo === '' ||
          normalizarBusca(nomeDoLead(l)).includes(termo) ||
          (digitos.length >= 4 && l.telefone.includes(digitos))) &&
        (maternidades.length === 0 || maternidades.includes(l.maternidadeSigla ?? '—')) &&
        (origens.length === 0 || origens.includes(l.origem)) &&
        (prioridades.length === 0 || (l.prioridade !== null && prioridades.includes(l.prioridade))) &&
        (!comVendedor || vendedores.length === 0 || vendedores.includes(l.vendedorNome ?? 'Sem vendedor')),
    )
  }, [visiveis, busca, maternidades, origens, prioridades, vendedores, comVendedor])

  const linhas = useMemo(
    () =>
      filtrados
        .filter(visao.filtro)
        .sort(
          (a, b) =>
            comparar(valorDaColuna(a, ordem.coluna), valorDaColuna(b, ordem.coluna), ordem.direcao) ||
            comparar(a.prazoVenda, b.prazoVenda, 'asc') ||
            a.id.localeCompare(b.id),
        ),
    [filtrados, visao, ordem],
  )

  const paginas = Math.max(1, Math.ceil(linhas.length / POR_PAGINA))
  const atual = Math.min(pagina, paginas - 1)
  const naPagina = linhas.slice(atual * POR_PAGINA, (atual + 1) * POR_PAGINA)

  function trocarVisao(id: Visao) {
    setOrdemEscolhida(null)
    setPagina(0)
    setParams(
      (antes) => {
        const p = new URLSearchParams(antes)
        if (id === 'abertos') p.delete('visao')
        else p.set('visao', id)
        return p
      },
      { replace: true },
    )
  }

  function ordenarPor(coluna: Coluna) {
    setPagina(0)
    setOrdemEscolhida(
      ordem.coluna === coluna
        ? { coluna, direcao: ordem.direcao === 'asc' ? 'desc' : 'asc' }
        : { coluna, direcao: coluna === 'ultimo' || coluna === 'entrada' || coluna === 'encerrado' ? 'desc' : 'asc' },
    )
  }

  const mudarFiltro = (f: (v: string[]) => void) => (v: string[]) => {
    f(v)
    setPagina(0)
  }

  return (
    <div className="mx-auto w-full max-w-[90rem] px-4 py-6 md:px-8 md:py-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight md:text-[28px]">Leads</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {visiveis.length} {visiveis.length === 1 ? 'lead' : 'leads'} {escopo === 'meus' ? 'na sua carteira' : 'da equipe'}
            {' · '}
            {visiveis.filter(estaAberto).length} abertos
          </p>
        </div>
      </header>

      {/* As visões, como abas com contagem. Rolam de lado no celular. */}
      <div className="-mx-4 mt-5 overflow-x-auto px-4 md:mx-0 md:px-0">
        <div role="tablist" aria-label="Visões dos leads" className="flex min-w-max gap-1 border-b border-border">
          {VISOES.map((v) => {
            const n = filtrados.filter(v.filtro).length
            const ativa = v.id === visao.id
            return (
              <button
                key={v.id}
                type="button"
                role="tab"
                aria-selected={ativa}
                onClick={() => trocarVisao(v.id)}
                className={clsx(
                  '-mb-px flex min-h-11 items-center gap-2 border-b-2 px-3 text-sm whitespace-nowrap transition-colors',
                  ativa
                    ? 'border-marca font-bold text-foreground'
                    : 'border-transparent font-medium text-muted-foreground hover:text-foreground',
                )}
              >
                {v.rotulo}
                <span
                  className={clsx(
                    'rounded-md px-1.5 text-[11px] font-bold tabular-nums',
                    ativa ? 'bg-marca text-white' : 'bg-muted text-muted-foreground',
                  )}
                >
                  {n}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="mt-4">
        <FiltrosDeBusca
          busca={busca}
          onBuscar={(t) => {
            setBusca(t)
            setPagina(0)
          }}
          placeholder="Buscar por mãe, bebê ou telefone"
          rotuloDaBusca="Buscar lead"
          grupos={[
            {
              id: 'maternidade',
              titulo: 'Maternidade',
              opcoes: siglas.map((s) => ({ valor: s, rotulo: s === '—' ? 'Sem maternidade' : s })),
              marcados: maternidades,
              onMudar: mudarFiltro(setMaternidades),
            },
            {
              id: 'origem',
              titulo: 'Origem',
              opcoes: (Object.keys(ROTULO_ORIGEM) as OrigemLead[]).map((o) => ({ valor: o, rotulo: ROTULO_ORIGEM[o] })),
              marcados: origens,
              onMudar: mudarFiltro(setOrigens),
            },
            {
              id: 'prioridade',
              titulo: 'Prioridade',
              opcoes: ORDEM_PRIORIDADE.map((p) => ({ valor: p, rotulo: ROTULO_PRIORIDADE[p] })),
              marcados: prioridades,
              onMudar: mudarFiltro(setPrioridades),
            },
            ...(comVendedor
              ? [
                  {
                    id: 'vendedor',
                    titulo: 'Vendedor',
                    opcoes: nomesDeVendedor.map((n) => ({ valor: n, rotulo: n })),
                    marcados: vendedores,
                    onMudar: mudarFiltro(setVendedores),
                  },
                ]
              : []),
          ]}
        />
      </div>

      {carregando ? (
        <p className="py-16 text-center text-sm text-muted-foreground">Carregando os leads…</p>
      ) : linhas.length === 0 ? (
        <div className="mt-4 rounded-painel border border-dashed border-border px-6 py-14 text-center">
          <p className="font-bold">Nenhum lead nesta visão.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {visiveis.length === 0 ? 'A carteira está vazia — comece em “Novo lead”.' : 'Troque a visão ou limpe os filtros.'}
          </p>
        </div>
      ) : (
        <>
          {/* O CELULAR: a lista de cartões. */}
          <ul className="mt-4 divide-y divide-border overflow-hidden rounded-painel border border-border bg-card md:hidden">
            {naPagina.map((l) => (
              <LinhaDoLead
                key={l.id}
                lead={l}
                hoje={hoje}
                mostrarVendedor={comVendedor}
                selecionado={leadAberto === l.id}
                onAbrir={() => abrirLead(l.id)}
                onContato={() => registrarContato(l)}
              />
            ))}
          </ul>

          {/* O COMPUTADOR: a tabela. */}
          <div className="mt-4 hidden overflow-hidden rounded-painel border border-border bg-card shadow-cartao md:block">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <caption className="sr-only">Leads da visão {visao.rotulo}, ordenáveis pelas colunas</caption>
                <thead>
                  <tr className="border-b border-border bg-muted/50 text-left text-[11px] tracking-[0.06em] text-muted-foreground uppercase">
                    <Cabeca coluna="familia" rotulo="Família" ordem={ordem} onOrdenar={ordenarPor} className="pl-4" />
                    <Cabeca coluna="prazo" rotulo="Prazo" ordem={ordem} onOrdenar={ordenarPor} />
                    <th scope="col" className="px-3 py-2.5 font-bold">
                      Situação
                    </th>
                    <th scope="col" className="px-3 py-2.5 font-bold">
                      Mat.
                    </th>
                    <Cabeca coluna="proximo" rotulo="Próximo passo" ordem={ordem} onOrdenar={ordenarPor} />
                    <Cabeca
                      coluna="ultimo"
                      rotulo="Último contato"
                      ordem={ordem}
                      onOrdenar={ordenarPor}
                      className="hidden lg:table-cell"
                    />
                    <th scope="col" className="hidden px-3 py-2.5 font-bold xl:table-cell">
                      Origem
                    </th>
                    {comVendedor && (
                      <th scope="col" className="hidden px-3 py-2.5 font-bold lg:table-cell">
                        Vendedor
                      </th>
                    )}
                    <th scope="col" className="w-24 px-3 py-2.5">
                      <span className="sr-only">Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {naPagina.map((l) => (
                    <LinhaDaTabela
                      key={l.id}
                      lead={l}
                      hoje={hoje}
                      comVendedor={comVendedor}
                      selecionada={leadAberto === l.id}
                      onAbrir={() => abrirLead(l.id)}
                      onContato={() => registrarContato(l)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between gap-3 text-sm text-muted-foreground">
            <span className="tabular-nums">
              {atual * POR_PAGINA + 1}–{Math.min(linhas.length, (atual + 1) * POR_PAGINA)} de {linhas.length}
            </span>
            {paginas > 1 && (
              <div className="flex items-center gap-1">
                <BotaoDePagina rotulo="Página anterior" desabilitado={atual === 0} onClick={() => setPagina(atual - 1)}>
                  <Chevron className="size-4 rotate-90" />
                </BotaoDePagina>
                <span className="min-w-[4.5ch] text-center font-semibold tabular-nums" aria-live="polite">
                  {atual + 1}/{paginas}
                </span>
                <BotaoDePagina
                  rotulo="Próxima página"
                  desabilitado={atual >= paginas - 1}
                  onClick={() => setPagina(atual + 1)}
                >
                  <Chevron className="size-4 -rotate-90" />
                </BotaoDePagina>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function Cabeca({
  coluna,
  rotulo,
  ordem,
  onOrdenar,
  className,
}: {
  coluna: Coluna
  rotulo: string
  ordem: Ordem
  onOrdenar: (c: Coluna) => void
  className?: string
}) {
  const ativa = ordem.coluna === coluna
  return (
    <th
      scope="col"
      aria-sort={ativa ? (ordem.direcao === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={clsx('px-3 py-0 font-bold', className)}
    >
      <button
        type="button"
        onClick={() => onOrdenar(coluna)}
        className={clsx(
          'inline-flex h-10 items-center gap-1 uppercase transition-colors hover:text-foreground',
          ativa && 'text-foreground',
        )}
      >
        {rotulo}
        {ativa ? (
          <Chevron className={clsx('size-3.5', ordem.direcao === 'asc' && 'rotate-180')} />
        ) : (
          <IconeOrdenar className="size-3 opacity-50" />
        )}
      </button>
    </th>
  )
}

function LinhaDaTabela({
  lead,
  hoje,
  comVendedor,
  selecionada,
  onAbrir,
  onContato,
}: {
  lead: Lead
  hoje: string
  comVendedor: boolean
  selecionada: boolean
  onAbrir: () => void
  onContato: () => void
}) {
  const aberto = estaAberto(lead)
  return (
    <tr
      onClick={onAbrir}
      className={clsx(
        'group cursor-pointer border-b border-border transition-colors last:border-b-0',
        selecionada ? 'bg-marca-suave/70' : 'hover:bg-muted/40',
      )}
    >
      <td className="max-w-0 py-2.5 pr-3 pl-4 md:w-[26%]">
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden="true"
            className="grid size-8 flex-shrink-0 place-items-center rounded-full bg-marca-suave text-[11px] font-extrabold text-marca"
          >
            {iniciais(lead.maeNome)}
          </span>
          <div className="min-w-0">
            {/* O nome é o BOTÃO da linha: o clique na linha inteira é atalho
                de mouse, e o teclado precisa de um alvo de verdade. */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onAbrir()
              }}
              className="block max-w-full truncate text-left font-bold outline-none hover:underline focus-visible:underline"
            >
              {nomeDoLead(lead)}
            </button>
            <p className="truncate text-xs text-muted-foreground tabular-nums">{telefoneLegivel(lead.telefone)}</p>
          </div>
        </div>
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap">{aberto ? <PilulaPrazo lead={lead} /> : <span className="text-muted-foreground">—</span>}</td>
      <td className="px-3 py-2.5">
        <PilulaSituacao lead={lead} />
      </td>
      <td className="px-3 py-2.5 font-mono text-xs font-bold text-muted-foreground">{lead.maternidadeSigla ?? '—'}</td>
      <td className="px-3 py-2.5 whitespace-nowrap">
        {!aberto ? (
          <span className="text-muted-foreground">—</span>
        ) : lead.proximoRetornoEm ? (
          <PilulaRetorno quando={lead.proximoRetornoEm} hoje={hoje} />
        ) : (
          <span className="text-xs font-semibold text-atencao-tinta">Sem próximo passo</span>
        )}
      </td>
      <td className="hidden px-3 py-2.5 whitespace-nowrap text-muted-foreground lg:table-cell">
        {lead.ultimoContatoEm ? haQuantoTempo(lead.ultimoContatoEm, hoje) : 'nunca'}
      </td>
      <td className="hidden px-3 py-2.5 text-muted-foreground xl:table-cell">{ROTULO_ORIGEM[lead.origem]}</td>
      {comVendedor && (
        <td className="hidden px-3 py-2.5 whitespace-nowrap lg:table-cell">
          {lead.vendedorNome ?? <span className="text-muted-foreground">sem vendedor</span>}
        </td>
      )}
      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
        {aberto && (
          <div className="flex items-center justify-end gap-1 opacity-60 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            <a
              href={linkDoWhatsapp(lead.telefone)}
              target="_blank"
              rel="noreferrer"
              aria-label={`Abrir a conversa com ${lead.maeNome} no WhatsApp`}
              title="Abrir no WhatsApp"
              className="grid size-8 place-items-center rounded-full text-concluido-tinta hover:bg-concluido/10"
            >
              <IconeConversa className="size-4" />
            </a>
            <button
              type="button"
              onClick={onContato}
              className="rounded-full border border-border bg-card px-2.5 py-1 text-xs font-semibold whitespace-nowrap hover:border-marca/40 hover:bg-marca-suave hover:text-marca"
            >
              Registrar
            </button>
          </div>
        )}
      </td>
    </tr>
  )
}

function BotaoDePagina({
  rotulo,
  desabilitado,
  onClick,
  children,
}: {
  rotulo: string
  desabilitado: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={rotulo}
      disabled={desabilitado}
      onClick={onClick}
      className="grid size-9 place-items-center rounded-full border border-border bg-card text-foreground hover:bg-muted disabled:opacity-40"
    >
      {children}
    </button>
  )
}
