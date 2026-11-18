import { useMemo, type ReactNode } from 'react'
import { Link } from 'react-router'
import clsx from 'clsx'
import { IconeCalendario, IconeCheck, IconeSetaDireita } from '@/components/ui/icones'
import { FUSO } from '@/lib/formato'
import { useAuth } from '@/features/auth/contexto'
import { LinhaDoLead } from '../components/LinhaDoLead'
import { useCrm } from '../crm/contexto'
import {
  GRUPOS_DO_HOJE,
  dataHoraCurta,
  diaDoInstante,
  diasEntre,
  estaAberto,
  grupoDoHoje,
  nomeDoLead,
  porPrazo,
  somarDias,
  type GrupoDoHoje,
  type Lead,
} from '../lib/leads'

/**
 * O INÍCIO DO CRM: o que pede gesto HOJE. É a caixa de entrada do Close e a
 * lista de atividades do Pipedrive na mesma tela — a fila de quem chamar,
 * e ao lado a agenda dos próximos dias, para o vendedor saber o que vem.
 *
 * Os quatro números do alto respondem "como está a minha carteira" sem abrir
 * nada; o resto da página responde "por onde eu começo".
 */
export function InicioDoCrm() {
  const { pessoa } = useAuth()
  const { visiveis, carregando, erro, escopo, hoje, leadAberto, abrirLead, registrarContato } = useCrm()

  const fila = useMemo(() => {
    const grupos = new Map<GrupoDoHoje, Lead[]>()
    for (const l of visiveis) {
      const g = grupoDoHoje(l, hoje)
      if (g) grupos.set(g, [...(grupos.get(g) ?? []), l])
    }
    for (const lista of grupos.values()) lista.sort(porPrazo)
    return grupos
  }, [visiveis, hoje])

  const totalHoje = [...fila.values()].reduce((s, l) => s + l.length, 0)
  const atrasados = fila.get('atrasado')?.length ?? 0
  const primeiroNome = pessoa?.nome.split(/\s+/)[0] ?? ''

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8">
      <header>
        <p className="text-sm text-muted-foreground first-letter:uppercase">{diaPorExtenso()}</p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight md:text-[28px]">
          {saudacao()}, {primeiroNome}.
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {carregando
            ? 'Carregando a carteira…'
            : totalHoje === 0
              ? 'Nada pede contato agora.'
              : `${totalHoje} ${totalHoje === 1 ? 'família pede' : 'famílias pedem'} contato hoje${
                  atrasados > 0 ? `, ${atrasados} com retorno atrasado` : ''
                }.`}
          {escopo === 'equipe' && ' Vendo a equipe inteira.'}
        </p>
      </header>

      {erro && (
        <p role="alert" className="mt-4 rounded-lg border border-atrasado/40 bg-atrasado/10 px-3 py-2 text-sm">
          Não foi possível carregar os leads: {erro}
        </p>
      )}

      <Numeros leads={visiveis} totalHoje={totalHoje} atrasados={atrasados} hoje={hoje} />

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <section aria-labelledby="titulo-fila" className="min-w-0">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 id="titulo-fila" className="text-base font-extrabold tracking-tight">
              Fila de hoje
            </h2>
            <Link to="/comercial/leads" className="text-sm font-semibold text-marca hover:underline">
              Ver todos os leads
            </Link>
          </div>

          {carregando ? (
            <Esqueleto />
          ) : totalHoje === 0 ? (
            <FilaVazia />
          ) : (
            <div className="overflow-hidden rounded-painel border border-border bg-card shadow-cartao">
              {GRUPOS_DO_HOJE.filter((g) => fila.has(g.id)).map((g, i) => {
                const lista = fila.get(g.id) ?? []
                return (
                  <section key={g.id} aria-labelledby={`grupo-${g.id}`} className={clsx(i > 0 && 'border-t border-border')}>
                    <div className="flex items-baseline gap-2 bg-muted/50 px-4 py-2">
                      <h3
                        id={`grupo-${g.id}`}
                        className={clsx('text-[13px] font-extrabold', g.id === 'atrasado' && 'text-atrasado')}
                      >
                        {g.titulo}
                      </h3>
                      <span className="text-xs font-bold text-muted-foreground tabular-nums">{lista.length}</span>
                      <span className="hidden truncate text-xs text-muted-foreground sm:inline">· {g.ajuda}</span>
                    </div>
                    <ul className="divide-y divide-border">
                      {lista.map((l) => (
                        <LinhaDoLead
                          key={l.id}
                          lead={l}
                          hoje={hoje}
                          mostrarVendedor={escopo === 'equipe'}
                          selecionado={leadAberto === l.id}
                          onAbrir={() => abrirLead(l.id)}
                          onContato={() => registrarContato(l)}
                        />
                      ))}
                    </ul>
                  </section>
                )
              })}
            </div>
          )}
        </section>

        <aside className="min-w-0">
          <Agenda leads={visiveis} hoje={hoje} onAbrir={abrirLead} />
        </aside>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function saudacao(): string {
  const hora = Number(
    new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: '2-digit', hour12: false }).format(new Date()),
  )
  if (hora < 5) return 'Boa noite'
  if (hora < 12) return 'Bom dia'
  if (hora < 18) return 'Boa tarde'
  return 'Boa noite'
}

function diaPorExtenso(): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, weekday: 'long', day: 'numeric', month: 'long' }).format(
    new Date(),
  )
}

const nomeDoMes = (mes: string) =>
  new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' }).format(new Date(`${mes}-15T12:00:00Z`))

function mesAnterior(mes: string): string {
  const [a = 1970, m = 1] = mes.split('-').map(Number)
  const total = a * 12 + (m - 1) - 1
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
}

/**
 * QUATRO NÚMEROS e só (o gestor recusou painel "completo" no relatório
 * interno: KPI primeiro, detalhe sob demanda). Três medem a fila, o quarto se
 * ela vira venda. A comparação com o mês anterior só aparece quando ele tem
 * lead encerrado — "+100%" contra nada é mentira com cara de conquista.
 */
function Numeros({
  leads,
  totalHoje,
  atrasados,
  hoje,
}: {
  leads: Lead[]
  totalHoje: number
  atrasados: number
  hoje: string
}) {
  const mes = hoje.slice(0, 7)
  const anterior = mesAnterior(mes)
  const abertos = leads.filter(estaAberto)
  const urgentes = abertos.filter((l) => l.prioridade === 'urgente').length
  const negociando = abertos.filter((l) => l.situacao === 'negociando').length

  const encerradosNo = (m: string) =>
    leads.filter((l) => l.encerradoEm && diaDoInstante(l.encerradoEm).slice(0, 7) === m)
  const doMes = encerradosNo(mes)
  const doAnterior = encerradosNo(anterior)
  const fechados = doMes.filter((l) => l.situacao === 'ganho').length
  const fechadosAntes = doAnterior.filter((l) => l.situacao === 'ganho').length
  const conversao = doMes.length > 0 ? Math.round((fechados / doMes.length) * 100) : null
  const variacao = doAnterior.length > 0 ? fechados - fechadosAntes : null

  return (
    <dl className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Numero
        rotulo="Para hoje"
        valor={totalHoje}
        nota={atrasados > 0 ? `${atrasados} com retorno atrasado` : 'nenhum retorno atrasado'}
        notaAlerta={atrasados > 0}
      />
      <Numero rotulo="Urgentes" valor={urgentes} nota="prazo em até 2 dias" valorAlerta={urgentes > 0} />
      <Numero rotulo="Em negociação" valor={negociando} nota={`de ${abertos.length} leads abertos`} />
      <Numero
        rotulo={`Fechados em ${nomeDoMes(mes)}`}
        valor={fechados}
        nota={conversao === null ? 'nenhum lead encerrado no mês' : `${conversao}% dos encerrados no mês`}
        selo={
          variacao === null ? undefined : (
            <span
              className={clsx(
                'inline-flex items-center rounded-md px-1.5 py-px text-[11px] font-bold tabular-nums',
                variacao > 0
                  ? 'bg-concluido/12 text-concluido-tinta'
                  : variacao < 0
                    ? 'bg-atrasado/10 text-atrasado'
                    : 'bg-muted text-muted-foreground',
              )}
              title={`Contra ${fechadosAntes} em ${nomeDoMes(anterior)}`}
            >
              {variacao > 0 ? '▲' : variacao < 0 ? '▼' : '='} {Math.abs(variacao)} vs {nomeDoMes(anterior).slice(0, 3)}
            </span>
          )
        }
      />
    </dl>
  )
}

function Numero({
  rotulo,
  valor,
  nota,
  valorAlerta = false,
  notaAlerta = false,
  selo,
}: {
  rotulo: string
  valor: number
  nota: string
  valorAlerta?: boolean
  notaAlerta?: boolean
  selo?: ReactNode
}) {
  return (
    <div className="min-w-0 rounded-cartao border border-border bg-card px-4 py-3.5 shadow-cartao">
      <dt className="truncate text-[12.5px] font-semibold text-muted-foreground first-letter:uppercase">{rotulo}</dt>
      <dd className="mt-2 flex items-center gap-2">
        <span
          className={clsx(
            'text-[28px] leading-none font-extrabold tracking-tight tabular-nums',
            valorAlerta && 'text-atrasado',
          )}
        >
          {valor}
        </span>
        {selo}
      </dd>
      <dd className={clsx('mt-2 truncate text-xs', notaAlerta ? 'font-semibold text-atrasado' : 'text-muted-foreground')}>
        {nota}
      </dd>
    </div>
  )
}

/**
 * A AGENDA DOS PRÓXIMOS SETE DIAS: os retornos combinados, por dia. É o
 * "futuro" da caixa de entrada do Close — o que já tem dia marcado e por isso
 * NÃO está na fila de hoje, mas o vendedor quer ver chegando.
 */
function Agenda({ leads, hoje, onAbrir }: { leads: Lead[]; hoje: string; onAbrir: (id: string) => void }) {
  const limite = somarDias(hoje, 7)
  const proximos = leads
    .filter((l) => estaAberto(l) && l.proximoRetornoEm)
    .map((l) => ({ lead: l, dia: diaDoInstante(l.proximoRetornoEm as string) }))
    .filter((x) => x.dia > hoje && x.dia <= limite)
    .sort((a, b) => (a.lead.proximoRetornoEm as string).localeCompare(b.lead.proximoRetornoEm as string))

  const porDia = proximos.reduce<{ dia: string; itens: Lead[] }[]>((acc, x) => {
    const ultimo = acc.at(-1)
    if (ultimo && ultimo.dia === x.dia) ultimo.itens.push(x.lead)
    else acc.push({ dia: x.dia, itens: [x.lead] })
    return acc
  }, [])

  return (
    <section
      aria-labelledby="titulo-agenda"
      className="rounded-painel border border-border bg-card p-4 shadow-cartao xl:sticky xl:top-6"
    >
      <div className="flex items-center gap-2">
        <IconeCalendario className="size-4 text-muted-foreground" />
        <h2 id="titulo-agenda" className="text-[13.5px] font-extrabold tracking-tight">
          Próximos retornos
        </h2>
        <span className="ml-auto text-xs text-muted-foreground">7 dias</span>
      </div>

      {porDia.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Nenhum retorno marcado para os próximos dias.</p>
      ) : (
        <ol className="mt-3 space-y-4">
          {porDia.map(({ dia, itens }) => (
            <li key={dia}>
              <p className="rotulo-sobrescrito text-muted-foreground">{rotuloDoDia(dia, hoje)}</p>
              <ul className="mt-1.5 space-y-0.5">
                {itens.map((l) => (
                  <li key={l.id}>
                    <button
                      type="button"
                      onClick={() => onAbrir(l.id)}
                      className="group flex min-h-11 w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-muted md:min-h-9"
                    >
                      <span className="w-11 flex-shrink-0 text-xs font-bold text-muted-foreground tabular-nums">
                        {(dataHoraCurta(l.proximoRetornoEm as string).split(' ')[1] ?? '').slice(0, 5)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{nomeDoLead(l)}</span>
                      {l.maternidadeSigla && (
                        <span className="font-mono text-[10px] font-bold text-muted-foreground">{l.maternidadeSigla}</span>
                      )}
                      <IconeSetaDireita className="size-3.5 flex-shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" />
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

function rotuloDoDia(dia: string, hoje: string): string {
  if (diasEntre(hoje, dia) === 1) return 'Amanhã'
  const [a, m, d] = dia.split('-').map(Number)
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', timeZone: 'UTC' }).format(
    new Date(Date.UTC(a ?? 1970, (m ?? 1) - 1, d ?? 1, 12)),
  )
}

function FilaVazia() {
  return (
    <div className="flex flex-col items-center rounded-painel border border-dashed border-border bg-card/60 px-6 py-12 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-concluido/12 text-concluido-tinta">
        <IconeCheck className="size-6" />
      </span>
      <p className="mt-4 font-bold">Fila zerada.</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Todo lead aberto tem um retorno marcado para depois. Os próximos estão na agenda ao lado.
      </p>
    </div>
  )
}

function Esqueleto() {
  return (
    <div aria-hidden="true" className="space-y-px overflow-hidden rounded-painel border border-border bg-card">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <span className="size-13 animate-pulse rounded-xl bg-muted" />
          <span className="flex-1 space-y-2">
            <span className="block h-3.5 w-1/3 animate-pulse rounded bg-muted" />
            <span className="block h-3 w-2/3 animate-pulse rounded bg-muted" />
          </span>
        </div>
      ))}
    </div>
  )
}
