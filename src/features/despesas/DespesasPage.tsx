import { useState } from 'react'
import clsx from 'clsx'
import { Botao } from '@/components/ui/Botao'
import { formatarMoeda, hojeNoFuso } from '@/lib/formato'
import { useRelatorioDespesas, type LinhaDoRelatorio } from './api/useRelatorioDespesas'
import { baixarCsv, montarCsv, numeroParaCsv } from './lib/csv'

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

/** '2026-09-10' -> '10/09'. */
function diaCurto(dia: string): string {
  const [, m, d] = dia.split('-')
  return `${d}/${m}`
}

/**
 * RECOLHER AS DESPESAS DO MÊS — a tela do financeiro (14/09/2026).
 *
 * As funcionárias lançam o gasto no card, na hora; o financeiro vem aqui depois
 * e leva o mês inteiro de uma vez. É o fim da faixa DESPESAS da planilha: em vez
 * de abrir caso por caso e somar à mão, o mês já chega somado, caso a caso e no
 * total, e sai num CSV que abre direto no Excel deles.
 *
 * O MÊS É O DO ATENDIMENTO, não o do lançamento — ver `despesas_por_caso`. Uma
 * corrida de um parto de setembro lançada em outubro aparece em setembro, que é
 * onde a planilha deles sempre a pôs.
 *
 * TODA SOMA DESTA TELA VEM DO BANCO. Cada linha já chega somada pela view; o
 * que se soma aqui é só o rodapé do mês, sobre uma lista que o `buscarTudo`
 * garante que veio inteira.
 */
export function DespesasPage() {
  const mesAtual = hojeNoFuso().slice(0, 7)
  const [mes, setMes] = useState(mesAtual)
  const { data: linhas, isPending, error } = useRelatorioDespesas(mes)

  const lista = linhas ?? []
  const soma = (campo: keyof Pick<LinhaDoRelatorio, 'total' | 'uberIda' | 'uberVolta' | 'refeicao' | 'outro'>) =>
    lista.reduce((acc, l) => acc + l[campo], 0)

  const totalDoMes = soma('total')
  const lancamentos = lista.reduce((acc, l) => acc + l.lancamentos, 0)

  function exportar() {
    const csv = montarCsv(
      ['Dia', 'Mãe', 'Bebê', 'Pacote', 'Maternidade', 'Situação', 'Uber ida', 'Uber volta', 'Refeição', 'Outro', 'Total', 'Lançamentos'],
      lista.map((l) => [
        l.dia.split('-').reverse().join('/'),
        l.maeNome,
        l.bebeNome ?? '',
        l.pacoteNome ?? '',
        l.maternidadeSigla ?? '',
        l.statusOperacional ?? '',
        numeroParaCsv(l.uberIda),
        numeroParaCsv(l.uberVolta),
        numeroParaCsv(l.refeicao),
        numeroParaCsv(l.outro),
        numeroParaCsv(l.total),
        String(l.lancamentos),
      ]),
    )
    baixarCsv(`despesas-${mes}.csv`, csv)
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-3 md:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-extrabold tracking-tight">Despesas</h1>
        <p className="text-sm text-muted-foreground">
          O que as funcionárias lançaram nos casos, somado por mês de atendimento.
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
        <span className="text-base font-bold">
          {rotuloDoMes(mes).replace(/^./, (letra) => letra.toUpperCase())}
        </span>
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
          <section className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Numero rotulo="Total do mês" valor={formatarMoeda(totalDoMes)} destaque />
            <Numero rotulo="Casos com gasto" valor={String(lista.length)} />
            <Numero rotulo="Uber" valor={formatarMoeda(soma('uberIda') + soma('uberVolta'))} />
            <Numero rotulo="Refeição e outros" valor={formatarMoeda(soma('refeicao') + soma('outro'))} />
          </section>

          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {lancamentos} {lancamentos === 1 ? 'lançamento' : 'lançamentos'}
            </span>
            {/* Sem linha, sem arquivo: um CSV só com cabeçalho abriria no Excel
                parecendo que a exportação quebrou. */}
            <Botao onClick={exportar} disabled={lista.length === 0}>
              Exportar CSV
            </Botao>
          </div>

          {lista.length === 0 ? (
            <p className="rounded-painel border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Nenhuma despesa lançada em casos de {rotuloDoMes(mes)}.
            </p>
          ) : (
            <ul className="space-y-2">
              {lista.map((l) => (
                <LinhaDeCaso key={l.casoId} linha={l} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

function Numero({ rotulo, valor, destaque = false }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <div className={clsx('rounded-painel border border-border bg-card p-3', destaque && 'border-marca')}>
      <div className="text-xs text-muted-foreground">{rotulo}</div>
      <div className={clsx('mt-0.5 font-bold tabular-nums', destaque ? 'text-xl' : 'text-base')}>{valor}</div>
    </div>
  )
}

/**
 * Um caso do mês: quem, quando e o gasto quebrado pelas colunas da planilha.
 *
 * SÓ OS TIPOS COM VALOR aparecem na quebra. Quatro rótulos com "R$ 0,00" em
 * cada linha fariam o que importa — a corrida que existiu — se perder no meio
 * dos zeros.
 */
function LinhaDeCaso({ linha }: { linha: LinhaDoRelatorio }) {
  const partes = [
    { rotulo: 'Uber ida', valor: linha.uberIda },
    { rotulo: 'Uber volta', valor: linha.uberVolta },
    { rotulo: 'Refeição', valor: linha.refeicao },
    { rotulo: 'Outro', valor: linha.outro },
  ].filter((p) => p.valor > 0)

  return (
    <li className="rounded-painel border border-border bg-card px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-semibold">
            <span className="mr-2 font-normal text-muted-foreground tabular-nums">{diaCurto(linha.dia)}</span>
            {linha.maeNome}
            {linha.bebeNome ? ` · ${linha.bebeNome}` : ''}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {linha.pacoteNome && <span className="font-medium text-foreground">{linha.pacoteNome}</span>}
            {linha.maternidadeSigla && (
              <span className="rounded bg-muted px-1.5 py-0.5 font-mono">{linha.maternidadeSigla}</span>
            )}
            {/* Cancelado ganha selo: é o gasto que não virou atendimento, e é o
                que o financeiro mais precisa conseguir achar na lista. */}
            {linha.statusOperacional === 'cancelado' && (
              <span className="rounded-full bg-atrasado/15 px-2 py-0.5 font-semibold text-atrasado">cancelado</span>
            )}
          </div>
        </div>
        <span className="flex-shrink-0 text-base font-bold tabular-nums">{formatarMoeda(linha.total)}</span>
      </div>

      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
        {partes.map((p) => (
          <span key={p.rotulo}>
            {p.rotulo} <span className="tabular-nums text-foreground">{formatarMoeda(p.valor)}</span>
          </span>
        ))}
      </div>
    </li>
  )
}
