import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Alerta } from '@/components/ui/Alerta'
import { Botao } from '@/components/ui/Botao'
import { Dropdown } from '@/components/ui/Dropdown'
import { FiltrosDeBusca } from '@/components/ui/FiltrosDeBusca'
import { IconeAdicionar } from '@/components/ui/icones'
import { hojeNoFuso } from '@/lib/formato'
import { useAuth } from '@/features/auth/contexto'
import { useTelas } from '@/features/auth/telas'
import { Segmentado } from '@/features/relatorios/components/Segmentado'
import { TrilhoDeAbas } from '@/features/relatorios/components/TrilhoDeAbas'
import { useLeads, usePessoasDoComercial } from './api/useLeads'
import { DialogoContato } from './components/DialogosDoLead'
import { DialogoLead } from './components/DialogoLead'
import { Distribuicao } from './components/Distribuicao'
import { FichaDoLead } from './components/FichaDoLead'
import { LinhaDoLead } from './components/LinhaDoLead'
import {
  GRUPOS_DO_HOJE,
  ORDEM_PRIORIDADE,
  ROTULO_ORIGEM,
  ROTULO_PRIORIDADE,
  ROTULO_SITUACAO,
  diaDoInstante,
  ehMeu,
  estaAberto,
  grupoDoHoje,
  nomeDoLead,
  normalizarBusca,
  porPrazo,
  type GrupoDoHoje,
  type Lead,
  type OrigemLead,
  type SituacaoLead,
} from './lib/leads'

/**
 * A TELA COMERCIAL — fase A do painel comercial (18/11/2026; o desenho inteiro
 * e as fases seguintes em docs/painel-comercial.md). Substitui a planilha
 * "PAINEL DE VENDAS": cada mãe em negociação é um LEAD, cada conversa é um
 * CONTATO, e a prioridade sai da DPP sozinha.
 *
 * DUAS ABAS. "Hoje" é a fila de trabalho — só o que pede gesto agora; "Todos
 * os leads" é a planilha inteira, com busca e filtros. E DUAS LENTES: "Meus"
 * (a fila de quem vende) e "Equipe" (a gestão olhando todo mundo).
 *
 * A ficha e a aba moram no ENDEREÇO (`?lead=`, `?aba=`): um link leva ao lead,
 * e o "voltar" do navegador fecha a ficha.
 */

type Aba = 'hoje' | 'todos'
type Escopo = 'meus' | 'equipe'
type Ordem = 'prazo' | 'recentes' | 'ultimo_contato'

const CHAVE_ESCOPO = 'clickbaby:comercial-escopo'
const POR_PAGINA = 100

function lerEscopo(): Escopo | null {
  try {
    const v = window.localStorage.getItem(CHAVE_ESCOPO)
    return v === 'meus' || v === 'equipe' ? v : null
  } catch {
    return null
  }
}

function gravarEscopo(e: Escopo) {
  try {
    window.localStorage.setItem(CHAVE_ESCOPO, e)
  } catch {
    // Preferência de tela: sem armazenamento, só não é lembrada.
  }
}

export function ComercialPage() {
  const hoje = hojeNoFuso()
  const { pessoa } = useAuth()
  const telas = useTelas()
  const [params, setParams] = useSearchParams()
  const { data: leads = [], isPending, isError, error } = useLeads()
  const { data: pessoas = [] } = usePessoasDoComercial()

  const [escopoEscolhido, setEscopoEscolhido] = useState<Escopo | null>(lerEscopo)
  const [novo, setNovo] = useState(false)
  const [distribuir, setDistribuir] = useState(false)
  const [contatoDe, setContatoDe] = useState<Lead | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const aba: Aba = params.get('aba') === 'todos' ? 'todos' : 'hoje'
  const leadAberto = leads.find((l) => l.id === params.get('lead')) ?? null

  function mudarParam(chave: string, valor: string | null) {
    setParams(
      (antes) => {
        const p = new URLSearchParams(antes)
        if (valor === null) p.delete(chave)
        else p.set(chave, valor)
        return p
      },
      { replace: chave === 'aba' },
    )
  }

  // QUEM É "MEU". A marca da repescagem vem da lista de pessoas, e não da
  // sessão: assim a gestão marca alguém e a fila muda sem ninguém recarregar.
  const eu = pessoas.find((p) => p.id === pessoa?.id)
  const euFacoRepescagem = eu?.fazRepescagem ?? false
  const alguemFazRepescagem = pessoas.some((p) => p.fazRepescagem && p.podeReceber)
  const meu = (l: Lead) => (pessoa ? ehMeu(l, pessoa.id, euFacoRepescagem, alguemFazRepescagem) : false)

  // Sem escolha guardada: quem tem fila abre nos "Meus"; quem não tem (a
  // gestão, quase sempre), na Equipe.
  const temFila = leads.some((l) => estaAberto(l) && meu(l))
  const escopo: Escopo = escopoEscolhido ?? (temFila ? 'meus' : 'equipe')
  const visiveis = escopo === 'meus' ? leads.filter(meu) : leads

  const filaDeHoje = useMemo(() => {
    const grupos = new Map<GrupoDoHoje, Lead[]>()
    for (const l of visiveis) {
      const g = grupoDoHoje(l, hoje)
      if (!g) continue
      grupos.set(g, [...(grupos.get(g) ?? []), l])
    }
    for (const lista of grupos.values()) lista.sort(porPrazo)
    return grupos
  }, [visiveis, hoje])

  const totalHoje = [...filaDeHoje.values()].reduce((s, l) => s + l.length, 0)

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-3 md:p-6">
      <header className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 basis-full sm:basis-0">
          <h1 className="text-2xl font-extrabold tracking-tight">Comercial</h1>
          <p className="text-sm text-muted-foreground">Quem chamar hoje, e o que já se conversou com cada família.</p>
        </div>
        {telas.has('equipe') && (
          <Botao variante="fantasma" onClick={() => setDistribuir(true)}>
            Quem atende o quê
          </Botao>
        )}
        <Botao variante="primario" onClick={() => setNovo(true)}>
          <IconeAdicionar className="size-4" /> Novo lead
        </Botao>
      </header>

      {isError && <Alerta>{`Não foi possível carregar os leads: ${error instanceof Error ? error.message : String(error)}`}</Alerta>}

      <Indicadores leads={visiveis} totalHoje={totalHoje} hoje={hoje} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <TrilhoDeAbas
          abas={[
            { id: 'hoje', rotulo: totalHoje > 0 ? `Hoje · ${totalHoje}` : 'Hoje' },
            { id: 'todos', rotulo: 'Todos os leads' },
          ]}
          ativa={aba}
          onTrocar={(id) => mudarParam('aba', id === 'hoje' ? null : id)}
          rotulo="Visões do comercial"
        />
        <Segmentado
          rotulo="De quem são os leads mostrados"
          opcoes={[
            { id: 'meus', conteudo: 'Meus', titulo: 'Os leads da minha fila' },
            { id: 'equipe', conteudo: 'Equipe', titulo: 'Os leads de todo mundo' },
          ]}
          ativa={escopo}
          onTrocar={(e) => {
            setEscopoEscolhido(e)
            gravarEscopo(e)
          }}
        />
      </div>

      {isPending ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Carregando os leads…</p>
      ) : aba === 'hoje' ? (
        <AbaHoje
          grupos={filaDeHoje}
          visiveis={visiveis}
          hoje={hoje}
          mostrarVendedor={escopo === 'equipe'}
          onAbrir={(l) => mudarParam('lead', l.id)}
          onContato={setContatoDe}
          onVerTodos={() => mudarParam('aba', 'todos')}
        />
      ) : (
        <AbaTodos
          leads={visiveis}
          hoje={hoje}
          mostrarVendedor={escopo === 'equipe'}
          onAbrir={(l) => mudarParam('lead', l.id)}
          onContato={setContatoDe}
        />
      )}

      {leadAberto && (
        <FichaDoLead
          lead={leadAberto}
          aviso={aviso}
          onFechar={() => {
            setAviso(null)
            mudarParam('lead', null)
          }}
        />
      )}
      {contatoDe && (
        <DialogoContato
          lead={leads.find((l) => l.id === contatoDe.id) ?? contatoDe}
          onFechar={() => setContatoDe(null)}
        />
      )}
      {novo && (
        <DialogoLead
          onFechar={() => setNovo(false)}
          onCriado={(id, jaExistia) => {
            setNovo(false)
            setAviso(jaExistia ? 'Este telefone já tinha um lead aberto: esta é a ficha dele, e nenhum lead novo foi criado.' : null)
            mudarParam('lead', id)
          }}
        />
      )}
      {distribuir && <Distribuicao onFechar={() => setDistribuir(false)} />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Os quatro números
// ---------------------------------------------------------------------------

/**
 * QUATRO NÚMEROS, e só (o gestor recusou painel "completo" no relatório
 * interno: KPI primeiro, detalhe sob demanda). Três dizem o tamanho da fila;
 * o quarto diz se ela vira venda. Seguem a lente — nos "Meus", são da minha
 * fila.
 */
function Indicadores({ leads, totalHoje, hoje }: { leads: Lead[]; totalHoje: number; hoje: string }) {
  const mes = hoje.slice(0, 7)
  const abertos = leads.filter(estaAberto)
  const urgentes = abertos.filter((l) => l.prioridade === 'urgente').length
  const repescagem = abertos.filter((l) => l.fase === 'repescagem').length
  const doMes = leads.filter((l) => l.encerradoEm && diaDoInstante(l.encerradoEm).slice(0, 7) === mes)
  const fechados = doMes.filter((l) => l.situacao === 'ganho').length
  const conversao = doMes.length > 0 ? Math.round((fechados / doMes.length) * 100) : null
  const nomeDoMes = new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' }).format(
    new Date(`${mes}-15T12:00:00Z`),
  )

  return (
    <dl className="grid grid-cols-2 gap-2 md:grid-cols-4">
      <Numero rotulo="Para hoje" valor={totalHoje} nota={`${abertos.length} leads abertos`} />
      <Numero rotulo="Urgentes" valor={urgentes} nota="0 a 2 dias até o prazo" alerta={urgentes > 0} />
      <Numero rotulo="Repescagem" valor={repescagem} nota="o prazo passou sem fechar" />
      <Numero
        rotulo={`Fechados em ${nomeDoMes}`}
        valor={fechados}
        nota={conversao === null ? 'nenhum lead encerrado no mês' : `${conversao}% dos encerrados no mês`}
      />
    </dl>
  )
}

function Numero({ rotulo, valor, nota, alerta = false }: { rotulo: string; valor: number; nota: string; alerta?: boolean }) {
  return (
    <div className="rounded-painel border border-border bg-card px-3 py-2.5">
      <dt className="text-xs font-semibold text-muted-foreground">{rotulo}</dt>
      <dd className={`text-2xl font-extrabold tracking-tight tabular-nums ${alerta ? 'text-atrasado' : ''}`}>{valor}</dd>
      <dd className="truncate text-[11px] text-muted-foreground">{nota}</dd>
    </div>
  )
}

// ---------------------------------------------------------------------------
// HOJE
// ---------------------------------------------------------------------------

function AbaHoje({
  grupos,
  visiveis,
  hoje,
  mostrarVendedor,
  onAbrir,
  onContato,
  onVerTodos,
}: {
  grupos: Map<GrupoDoHoje, Lead[]>
  visiveis: Lead[]
  hoje: string
  mostrarVendedor: boolean
  onAbrir: (l: Lead) => void
  onContato: (l: Lead) => void
  onVerTodos: () => void
}) {
  const agendados = visiveis.filter(
    (l) => estaAberto(l) && l.proximoRetornoEm && diaDoInstante(l.proximoRetornoEm) > hoje,
  ).length

  const rodape =
    agendados > 0 ? (
      <p className="text-center text-sm text-muted-foreground">
        Mais {agendados} {agendados === 1 ? 'lead tem' : 'leads têm'} retorno marcado para os próximos dias —{' '}
        <button type="button" onClick={onVerTodos} className="font-semibold text-marca hover:underline">
          ver todos os leads
        </button>
        .
      </p>
    ) : null

  if (grupos.size === 0) {
    return (
      <div className="space-y-3 rounded-painel border border-dashed border-border px-4 py-10 text-center">
        <p className="font-semibold">Nada pede contato agora.</p>
        <p className="text-sm text-muted-foreground">
          Todo lead aberto tem um retorno marcado para depois. Um lead novo entra em “Novo lead”.
        </p>
        {rodape}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {GRUPOS_DO_HOJE.filter((g) => grupos.has(g.id)).map((g) => {
        const lista = grupos.get(g.id) ?? []
        return (
          <section key={g.id} aria-labelledby={`grupo-${g.id}`}>
            <div className="mb-2 flex items-baseline gap-2">
              <h2 id={`grupo-${g.id}`} className="text-base font-extrabold tracking-tight">
                {g.titulo}
              </h2>
              <span className="rounded-full bg-muted px-2 text-xs font-bold tabular-nums">{lista.length}</span>
              <span className="truncate text-xs text-muted-foreground">{g.ajuda}</span>
            </div>
            <ul className="divide-y divide-border overflow-hidden rounded-painel border border-border bg-card">
              {lista.map((l) => (
                <LinhaDoLead
                  key={l.id}
                  lead={l}
                  hoje={hoje}
                  mostrarVendedor={mostrarVendedor}
                  onAbrir={() => onAbrir(l)}
                  onContato={() => onContato(l)}
                />
              ))}
            </ul>
          </section>
        )
      })}
      {rodape}
    </div>
  )
}

// ---------------------------------------------------------------------------
// TODOS OS LEADS
// ---------------------------------------------------------------------------

const ORDENS: { id: Ordem; rotulo: string }[] = [
  { id: 'prazo', rotulo: 'Prazo mais perto' },
  { id: 'recentes', rotulo: 'Entrada mais recente' },
  { id: 'ultimo_contato', rotulo: 'Contato mais antigo' },
]

function ordenar(leads: Lead[], ordem: Ordem): Lead[] {
  const copia = [...leads]
  if (ordem === 'recentes') return copia.sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))
  if (ordem === 'ultimo_contato') {
    // Quem está há mais tempo sem ouvir da empresa primeiro; nunca contatado,
    // antes de todos.
    return copia.sort((a, b) => (a.ultimoContatoEm ?? '').localeCompare(b.ultimoContatoEm ?? '') || porPrazo(a, b))
  }
  // Abertos pelo prazo; encerrados depois, o mais recente primeiro.
  return copia.sort((a, b) => {
    const aa = estaAberto(a)
    const ba = estaAberto(b)
    if (aa !== ba) return aa ? -1 : 1
    if (!aa) return (b.encerradoEm ?? '').localeCompare(a.encerradoEm ?? '')
    return porPrazo(a, b)
  })
}

function AbaTodos({
  leads,
  hoje,
  mostrarVendedor,
  onAbrir,
  onContato,
}: {
  leads: Lead[]
  hoje: string
  mostrarVendedor: boolean
  onAbrir: (l: Lead) => void
  onContato: (l: Lead) => void
}) {
  const [busca, setBusca] = useState('')
  const [situacoes, setSituacoes] = useState<string[]>([])
  const [prioridades, setPrioridades] = useState<string[]>([])
  const [maternidades, setMaternidades] = useState<string[]>([])
  const [origens, setOrigens] = useState<string[]>([])
  const [vendedores, setVendedores] = useState<string[]>([])
  const [ordem, setOrdem] = useState<Ordem>('prazo')
  const [limite, setLimite] = useState(POR_PAGINA)

  const siglas = [...new Set(leads.map((l) => l.maternidadeSigla ?? '—'))].sort()
  const nomesDeVendedor = [...new Set(leads.map((l) => l.vendedorNome ?? 'Sem vendedor'))].sort()
  const termo = normalizarBusca(busca)
  const digitos = busca.replace(/\D/g, '')

  const filtrados = ordenar(
    leads.filter(
      (l) =>
        (termo === '' ||
          normalizarBusca(nomeDoLead(l)).includes(termo) ||
          (digitos.length >= 4 && l.telefone.includes(digitos))) &&
        (situacoes.length === 0 || situacoes.includes(l.situacao)) &&
        (prioridades.length === 0 || (estaAberto(l) && l.prioridade !== null && prioridades.includes(l.prioridade))) &&
        (maternidades.length === 0 || maternidades.includes(l.maternidadeSigla ?? '—')) &&
        (origens.length === 0 || origens.includes(l.origem)) &&
        (!mostrarVendedor || vendedores.length === 0 || vendedores.includes(l.vendedorNome ?? 'Sem vendedor')),
    ),
    ordem,
  )

  return (
    <div className="space-y-3">
      <FiltrosDeBusca
        busca={busca}
        onBuscar={(t) => {
          setBusca(t)
          setLimite(POR_PAGINA)
        }}
        placeholder="Buscar por mãe, bebê ou telefone"
        rotuloDaBusca="Buscar lead"
        grupos={[
          {
            id: 'situacao',
            titulo: 'Situação',
            opcoes: (Object.keys(ROTULO_SITUACAO) as SituacaoLead[]).map((s) => ({
              valor: s,
              rotulo: ROTULO_SITUACAO[s],
            })),
            marcados: situacoes,
            onMudar: setSituacoes,
          },
          {
            id: 'prioridade',
            titulo: 'Prioridade',
            opcoes: ORDEM_PRIORIDADE.map((p) => ({ valor: p, rotulo: ROTULO_PRIORIDADE[p] })),
            marcados: prioridades,
            onMudar: setPrioridades,
          },
          {
            id: 'maternidade',
            titulo: 'Maternidade',
            opcoes: siglas.map((s) => ({ valor: s, rotulo: s === '—' ? 'Sem maternidade' : s })),
            marcados: maternidades,
            onMudar: setMaternidades,
          },
          {
            id: 'origem',
            titulo: 'Origem',
            opcoes: (Object.keys(ROTULO_ORIGEM) as OrigemLead[]).map((o) => ({ valor: o, rotulo: ROTULO_ORIGEM[o] })),
            marcados: origens,
            onMudar: setOrigens,
          },
          ...(mostrarVendedor
            ? [
                {
                  id: 'vendedor',
                  titulo: 'Vendedor',
                  opcoes: nomesDeVendedor.map((n) => ({ valor: n, rotulo: n })),
                  marcados: vendedores,
                  onMudar: setVendedores,
                },
              ]
            : []),
        ]}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {filtrados.length} {filtrados.length === 1 ? 'lead' : 'leads'}
        </p>
        <Dropdown
          variante="pilula"
          prefixo="Ordenar"
          rotulo="Ordenar"
          itens={ORDENS}
          selecionado={ordem}
          onEscolher={(i) => setOrdem(i.id as Ordem)}
          alinhamento="direita"
        />
      </div>

      {filtrados.length === 0 ? (
        <p className="rounded-painel border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          {leads.length === 0 ? 'Nenhum lead ainda. Comece em “Novo lead”.' : 'Nenhum lead com esses filtros.'}
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-painel border border-border bg-card">
          {filtrados.slice(0, limite).map((l) => (
            <LinhaDoLead
              key={l.id}
              lead={l}
              hoje={hoje}
              mostrarVendedor={mostrarVendedor}
              onAbrir={() => onAbrir(l)}
              onContato={() => onContato(l)}
            />
          ))}
        </ul>
      )}
      {filtrados.length > limite && (
        <div className="text-center">
          <Botao onClick={() => setLimite((n) => n + POR_PAGINA)}>
            Mostrar mais {Math.min(POR_PAGINA, filtrados.length - limite)}
          </Botao>
        </div>
      )}
    </div>
  )
}
