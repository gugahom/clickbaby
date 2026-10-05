import { useState } from 'react'
import clsx from 'clsx'
import { Botao } from '@/components/ui/Botao'
import { Dropdown } from '@/components/ui/Dropdown'
import { IconeCheck } from '@/components/ui/icones'
import { formatarData, formatarMoeda, hojeNoFuso } from '@/lib/formato'
import { baixarCsv, montarCsv, numeroParaCsv } from '@/lib/csv'
import { seRessarce, useLancamentosDoMes, useMarcarRessarcida, type LancamentoDeDespesa } from './api/useRelatorioDespesas'

/** '2026-09' -> 'setembro de 2026'. Meio-dia UTC para nenhum fuso empurrar o mês. */
function rotuloDoMes(mes: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${mes}-01T12:00:00Z`))
}

/** Anda `delta` meses a partir de 'YYYY-MM', em inteiro. */
function deslocarMes(mes: string, delta: number): string {
  const [ano = 1970, m = 1] = mes.split('-').map(Number)
  const total = ano * 12 + (m - 1) + delta
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
}

type TipoDoFiltro = LancamentoDeDespesa['tipo']

/**
 * O FILTRO POR TIPO (30/09/2026, pedido do gestor: "filtrar por refeição").
 * Os tipos marcados SOMAM: marcar Refeição e Outro mostra os gastos de
 * qualquer um dos dois. Nada marcado é tudo.
 */
const TIPOS_DO_FILTRO: { id: TipoDoFiltro; rotulo: string }[] = [
  { id: 'refeicao', rotulo: 'Refeição' },
  { id: 'outro', rotulo: 'Outro' },
  { id: 'uber_ida', rotulo: 'Uber ida' },
  { id: 'uber_volta', rotulo: 'Uber volta' },
]

const ROTULO_TIPO: Record<TipoDoFiltro, string> = {
  uber_ida: 'Uber ida',
  uber_volta: 'Uber volta',
  refeicao: 'Refeição',
  outro: 'Outro',
}

const ROTULO_MOMENTO: Record<NonNullable<LancamentoDeDespesa['momento']>, string> = {
  parto: 'Parto',
  substituicao: 'Substituição',
  fechamento: 'Fechamento',
}

type Situacao = 'todas' | 'a_ressarcir' | 'ressarcidas'

/** O gasto que o financeiro ainda deve devolver: refeição ou "outro", sem marca. */
function aRessarcirDe(l: LancamentoDeDespesa): boolean {
  return seRessarce(l.tipo) && l.ressarcidoEm === null
}

/** '2026-09-10' -> '10/09'. */
function diaCurto(dia: string): string {
  const [, m, d] = dia.split('-')
  return `${d}/${m}`
}

/**
 * RECOLHER AS DESPESAS DO MÊS — a tela do financeiro (14/09/2026).
 *
 * As funcionárias lançam o gasto no card, na hora; o financeiro vem aqui depois
 * e leva o mês inteiro de uma vez. É o fim da faixa DESPESAS da planilha.
 *
 * UMA LINHA POR GASTO, COM A PESSOA E O RESSARCIMENTO (05/10/2026, pedido do
 * gestor: "o nome da pessoa que lança a despesa no card vá para a aba de
 * despesas" e "um checkbox para o financeiro saber que já ressarciu o
 * funcionário"). Até aqui o caso vinha somado por tipo, e o financeiro não via
 * de quem era cada Uber — justamente quem ele tem de pagar. Agora cada caso
 * lista os gastos dele: o tipo, DE QUEM FOI (quem recebe o reembolso; "lançado
 * por" aparece só quando outra pessoa digitou, como o ADM pela fotógrafa), o
 * valor e a caixa "Ressarcido", que carimba quem marcou e quando, e desmarca.
 * A caixa só existe na REFEIÇÃO e no "OUTRO" — o Uber não se ressarce (correção
 * do gestor no mesmo dia; ver `TIPOS_RESSARCIVEIS`).
 * Os filtros de SITUAÇÃO (a ressarcir) e de PESSOA são o caminho do pagamento:
 * escolhe a pessoa, vê o que falta, paga, marca.
 *
 * O MÊS É O DO ATENDIMENTO, não o do lançamento. Uma corrida de um parto de
 * setembro lançada em outubro aparece em setembro, que é onde a planilha deles
 * sempre a pôs.
 *
 * A SOMA É DE UMA LISTA QUE VEIO INTEIRA: `buscarTudo` pagina contra o total do
 * servidor, então o rodapé do mês soma o mês, e não as primeiras mil linhas.
 */
export function DespesasPage() {
  const mesAtual = hojeNoFuso().slice(0, 7)
  const [mes, setMes] = useState(mesAtual)
  const { data: lancamentos, isPending, error } = useLancamentosDoMes(mes)
  const [tipos, setTipos] = useState<TipoDoFiltro[]>([])
  const [situacao, setSituacao] = useState<Situacao>('todas')
  const [pessoaId, setPessoaId] = useState<string>('')

  const todos = lancamentos ?? []
  const lista = todos.filter(
    (l) =>
      (tipos.length === 0 || tipos.includes(l.tipo)) &&
      (situacao === 'todas' || (situacao === 'a_ressarcir' ? aRessarcirDe(l) : l.ressarcidoEm !== null)) &&
      (pessoaId === '' || l.pessoaId === pessoaId),
  )
  const filtrando = tipos.length > 0 || situacao !== 'todas' || pessoaId !== ''

  // As pessoas que têm gasto no mês, para o filtro — de quem foi o gasto.
  const pessoas = [...new Map(todos.filter((l) => l.pessoaId).map((l) => [l.pessoaId as string, l.pessoaNome ?? '—'])).entries()].sort(
    (a, b) => a[1].localeCompare(b[1], 'pt-BR'),
  )

  const soma = (f: (l: LancamentoDeDespesa) => boolean) => lista.filter(f).reduce((acc, l) => acc + l.valor, 0)
  const total = soma(() => true)
  const aRessarcir = soma(aRessarcirDe)

  // Agrupado por caso, na ordem que veio do banco (dia, caso).
  const casos: { casoId: string; linhas: LancamentoDeDespesa[] }[] = []
  for (const l of lista) {
    const ultimo = casos[casos.length - 1]
    if (ultimo && ultimo.casoId === l.casoId) ultimo.linhas.push(l)
    else casos.push({ casoId: l.casoId, linhas: [l] })
  }

  function alternarTipo(t: TipoDoFiltro) {
    setTipos((atuais) => (atuais.includes(t) ? atuais.filter((x) => x !== t) : [...atuais, t]))
  }

  function exportar() {
    // UMA LINHA POR GASTO (05/10/2026), com de quem foi, quem lançou e o
    // ressarcimento — o que o financeiro precisa para pagar e conferir.
    const csv = montarCsv(
      ['Dia', 'Mãe', 'Bebê', 'Pacote', 'Maternidade', 'Situação do caso', 'Tipo', 'Momento', 'Descrição', 'Valor', 'De quem', 'Lançado por', 'Ressarcido', 'Ressarcido em', 'Ressarcido por'],
      lista.map((l) => [
        l.dia.split('-').reverse().join('/'),
        l.maeNome,
        l.bebeNome ?? '',
        l.pacoteNome ?? '',
        l.maternidadeSigla ?? '',
        l.statusOperacional ?? '',
        ROTULO_TIPO[l.tipo],
        l.momento ? ROTULO_MOMENTO[l.momento] : '',
        l.descricao ?? '',
        numeroParaCsv(l.valor),
        l.pessoaNome ?? '',
        l.lancadoPor ?? '',
        seRessarce(l.tipo) ? (l.ressarcidoEm ? 'Sim' : 'Não') : 'Não se ressarce',
        l.ressarcidoEm ? (formatarData(l.ressarcidoEm) ?? '') : '',
        l.ressarcidoPor ?? '',
      ]),
    )
    baixarCsv(`despesas-${mes}${filtrando ? '-filtro' : ''}.csv`, csv)
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 p-3 md:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-extrabold tracking-tight">Despesas</h1>
        <p className="text-sm text-muted-foreground">
          O que as funcionárias lançaram nos casos, por mês de atendimento — de quem foi cada gasto e o que já foi
          ressarcido.
        </p>
      </header>

      {/* O MÊS É O CONTROLE PRINCIPAL, e é seta e não calendário: o financeiro
          recolhe um mês de cada vez, quase sempre o atual ou o anterior. */}
      <div className="flex items-center justify-between gap-2 rounded-painel border border-border bg-card p-2">
        <Botao variante="fantasma" onClick={() => setMes((m) => deslocarMes(m, -1))} aria-label="Mês anterior">
          ‹
        </Botao>
        {/* Maiúscula só na primeira letra, por código: a classe `capitalize`
            põe em toda palavra e escrevia "Setembro De 2026". */}
        <span className="text-base font-bold">{rotuloDoMes(mes).replace(/^./, (letra) => letra.toUpperCase())}</span>
        <Botao
          variante="fantasma"
          onClick={() => setMes((m) => deslocarMes(m, 1))}
          // Mês que ainda não começou não tem atendimento para recolher.
          disabled={mes >= mesAtual}
          aria-label="Próximo mês"
        >
          ›
        </Botao>
      </div>

      {error ? (
        <p className="rounded-md border border-atrasado/40 bg-atrasado/10 p-3 text-sm">
          Não deu para carregar as despesas deste mês. Tente de novo em instantes.
        </p>
      ) : isPending ? (
        <p className="text-sm text-muted-foreground">Somando o mês…</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrar por tipo de despesa">
              {TIPOS_DO_FILTRO.map((t) => (
                <Chip key={t.id} ativo={tipos.includes(t.id)} onClick={() => alternarTipo(t.id)}>
                  {t.rotulo}
                </Chip>
              ))}
            </div>
            <span className="mx-1 hidden h-6 w-px bg-border sm:block" aria-hidden="true" />
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrar pelo ressarcimento">
              <Chip ativo={situacao === 'a_ressarcir'} onClick={() => setSituacao((s) => (s === 'a_ressarcir' ? 'todas' : 'a_ressarcir'))}>
                A ressarcir
              </Chip>
              <Chip ativo={situacao === 'ressarcidas'} onClick={() => setSituacao((s) => (s === 'ressarcidas' ? 'todas' : 'ressarcidas'))}>
                Ressarcidas
              </Chip>
            </div>
            {pessoas.length > 0 && (
              <Dropdown
                variante="pilula"
                compacto
                prefixo="Pessoa"
                rotulo="Todas"
                selecionado={pessoaId || 'todas'}
                onEscolher={(item) => setPessoaId(item.id === 'todas' ? '' : item.id)}
                itens={[{ id: 'todas', rotulo: 'Todas' }, ...pessoas.map(([id, nome]) => ({ id, rotulo: nome }))]}
              />
            )}
            {filtrando && (
              <button
                type="button"
                onClick={() => {
                  setTipos([])
                  setSituacao('todas')
                  setPessoaId('')
                }}
                className="min-h-9 px-2 text-sm font-semibold text-marca hover:underline"
              >
                Limpar
              </button>
            )}
          </div>

          <section className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-6">
            <Numero rotulo={filtrando ? 'Total do filtro' : 'Total do mês'} valor={formatarMoeda(total)} destaque />
            <Numero rotulo="A ressarcir" valor={formatarMoeda(aRessarcir)} nota="refeição e outros" alerta={aRessarcir > 0} />
            <Numero rotulo="Já ressarcido" valor={formatarMoeda(soma((l) => l.ressarcidoEm !== null))} />
            <Numero rotulo="Uber" valor={formatarMoeda(soma((l) => l.tipo === 'uber_ida' || l.tipo === 'uber_volta'))} />
            <Numero rotulo="Refeição" valor={formatarMoeda(soma((l) => l.tipo === 'refeicao'))} />
            <Numero rotulo="Outros" valor={formatarMoeda(soma((l) => l.tipo === 'outro'))} />
          </section>

          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {casos.length} {casos.length === 1 ? 'caso' : 'casos'} · {lista.length}{' '}
              {lista.length === 1 ? 'lançamento' : 'lançamentos'}
            </span>
            {/* Sem linha, sem arquivo: um CSV só com cabeçalho abriria no Excel
                parecendo que a exportação quebrou. */}
            <Botao onClick={exportar} disabled={lista.length === 0}>
              Exportar CSV
            </Botao>
          </div>

          {casos.length === 0 ? (
            <p className="rounded-painel border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              {filtrando ? `Nenhum gasto de ${rotuloDoMes(mes)} neste filtro.` : `Nenhuma despesa lançada em casos de ${rotuloDoMes(mes)}.`}
            </p>
          ) : (
            <ul className="space-y-2">
              {casos.map((c) => (
                <CasoComGastos key={c.casoId} linhas={c.linhas} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

function Chip({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={ativo}
      onClick={onClick}
      className={clsx(
        'min-h-9 rounded-full border px-3.5 text-sm font-semibold transition-colors',
        ativo ? 'border-marca bg-marca text-white' : 'border-border bg-card text-foreground hover:border-marca/40',
      )}
    >
      {children}
    </button>
  )
}

function Numero({
  rotulo,
  valor,
  nota,
  destaque = false,
  alerta = false,
}: {
  rotulo: string
  valor: string
  nota?: string
  destaque?: boolean
  alerta?: boolean
}) {
  return (
    <div
      className={clsx(
        'rounded-painel border bg-card p-3',
        destaque ? 'border-marca' : alerta ? 'border-atencao/60 bg-atencao/5' : 'border-border',
      )}
    >
      <div className="text-xs text-muted-foreground">{rotulo}</div>
      <div className={clsx('mt-0.5 font-bold tabular-nums', destaque ? 'text-xl' : 'text-base', alerta && 'text-atencao-tinta')}>
        {valor}
      </div>
      {nota && <div className="text-[11px] leading-tight text-muted-foreground">{nota}</div>}
    </div>
  )
}

/** Um caso do mês, com os gastos dele — um por linha. */
function CasoComGastos({ linhas }: { linhas: LancamentoDeDespesa[] }) {
  const caso = linhas[0]
  if (!caso) return null
  const total = linhas.reduce((acc, l) => acc + l.valor, 0)

  return (
    <li className="rounded-painel border border-border bg-card px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-semibold">
            <span className="mr-2 font-normal text-muted-foreground tabular-nums">{diaCurto(caso.dia)}</span>
            {caso.maeNome}
            {caso.bebeNome ? ` · ${caso.bebeNome}` : ''}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {caso.pacoteNome && <span className="font-medium text-foreground">{caso.pacoteNome}</span>}
            {caso.maternidadeSigla && <span className="rounded bg-muted px-1.5 py-0.5 font-mono">{caso.maternidadeSigla}</span>}
            {/* Cancelado ganha selo: é o gasto que não virou atendimento, e é o
                que o financeiro mais precisa conseguir achar na lista. */}
            {caso.statusOperacional === 'cancelado' && (
              <span className="rounded-full bg-atrasado/15 px-2 py-0.5 font-semibold text-atrasado">cancelado</span>
            )}
          </div>
        </div>
        <span className="flex-shrink-0 text-base font-bold tabular-nums">{formatarMoeda(total)}</span>
      </div>

      <ul className="mt-2 divide-y divide-border/70 border-t border-border/70">
        {linhas.map((l) => (
          <LinhaDoGasto key={l.id} gasto={l} />
        ))}
      </ul>
    </li>
  )
}

/**
 * UM GASTO: tipo, de quem foi, valor e a caixa do ressarcimento. A caixa é um
 * botão de 44px (seção 6), e marcada diz quem marcou e quando — o carimbo é do
 * servidor.
 */
function LinhaDoGasto({ gasto }: { gasto: LancamentoDeDespesa }) {
  const marcar = useMarcarRessarcida()
  const [erro, setErro] = useState<string | null>(null)
  const ressarcida = gasto.ressarcidoEm !== null
  const outraPessoaLancou = gasto.lancadoPorId !== null && gasto.lancadoPorId !== gasto.pessoaId

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
      <span className="min-w-0 flex-1">
        <span className="font-medium">{ROTULO_TIPO[gasto.tipo]}</span>
        {gasto.momento && (
          <span className="ml-1.5 rounded bg-marca-suave px-1.5 py-0.5 text-xs font-medium">{ROTULO_MOMENTO[gasto.momento]}</span>
        )}
        <span className="mt-0.5 block text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{gasto.pessoaNome ?? 'sem pessoa'}</span>
          {outraPessoaLancou && gasto.lancadoPor && ` · lançado por ${gasto.lancadoPor}`}
          {gasto.descricao && ` · ${gasto.descricao}`}
        </span>
        {erro && <span className="mt-0.5 block text-xs font-semibold text-atrasado">{erro}</span>}
      </span>

      <span className="font-semibold tabular-nums">{formatarMoeda(gasto.valor)}</span>

      {seRessarce(gasto.tipo) ? (
        <button
          type="button"
          role="checkbox"
          aria-checked={ressarcida}
          disabled={marcar.isPending}
          onClick={() => {
            setErro(null)
            marcar.mutate(
              { despesaId: gasto.id, ressarcida: !ressarcida },
              { onError: (e) => setErro(e instanceof Error ? e.message : String(e)) },
            )
          }}
          title={
            ressarcida
              ? `Ressarcido em ${formatarData(gasto.ressarcidoEm) ?? ''}${gasto.ressarcidoPor ? ` por ${gasto.ressarcidoPor}` : ''}. Toque para desmarcar.`
              : 'Marcar como ressarcido'
          }
          className={clsx(
            'inline-flex min-h-11 items-center gap-2 rounded-full border px-3 text-xs font-bold transition-colors disabled:opacity-60',
            ressarcida
              ? 'border-concluido bg-concluido/10 text-concluido-tinta'
              : 'border-border text-muted-foreground hover:border-marca/40 hover:text-foreground',
          )}
        >
          <span
            aria-hidden="true"
            className={clsx(
              'grid size-5 place-items-center rounded border',
              ressarcida ? 'border-concluido bg-concluido text-white' : 'border-border bg-background',
            )}
          >
            {ressarcida && <IconeCheck className="size-3.5" />}
          </span>
          {ressarcida ? 'Ressarcido' : 'Ressarcir'}
        </button>
      ) : (
        // Sem caixa: o Uber não se ressarce. O espaço fica, para os valores
        // continuarem alinhados com os das linhas que têm caixa.
        <span className="inline-flex min-h-11 w-[7.5rem] items-center justify-center text-xs text-muted-foreground">
          não se ressarce
        </span>
      )}
    </li>
  )
}
