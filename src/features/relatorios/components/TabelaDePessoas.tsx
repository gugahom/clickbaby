import { useRef, useState } from 'react'
import clsx from 'clsx'
import type { FaseDaPessoa, MetricaPorEtapa, MetricaPorPessoa } from '../api/useMetricas'
import type { LinhaDaPessoa } from '../lib/kpis'
import { primeiroNome } from '../lib/metricas'
import { Cartao } from './PainelDaEquipe'
import { PerfilDaPessoa } from './PerfilDaPessoa'

type Coluna = 'partos' | 'edicoes' | 'taxaPrazo' | 'ajustes' | 'dias'

const COLUNAS: { id: Coluna; rotulo: string; so_no_largo?: boolean; menorEMelhor?: boolean }[] = [
  { id: 'partos', rotulo: 'Partos' },
  { id: 'edicoes', rotulo: 'Edições' },
  { id: 'taxaPrazo', rotulo: 'No prazo' },
  { id: 'ajustes', rotulo: 'Ajustes', so_no_largo: true, menorEMelhor: true },
  { id: 'dias', rotulo: 'Dias', so_no_largo: true },
]

const TELA_LARGA = '(min-width: 1280px)'

/**
 * AS PESSOAS — três destaques e UMA tabela de KPIs, que é também o ranking.
 *
 * A primeira versão tinha um ranking por tipo de etapa (com chips, critérios e
 * marcas) e uma ficha individual de cinco cartões. O gestor pediu foco em KPI,
 * e as duas viraram isto: cada coluna é um KPI e tocar no título ordena por
 * ele.
 *
 * TOCAR NUMA PESSOA ABRE O MINI PERFIL (29/09/2026, pedido do gestor), no lugar
 * das três linhas de resumo que abriam dentro da tabela. No computador ele fica
 * AO LADO da tabela, já aberto na primeira pessoa da ordem — o mesmo arranjo do
 * painel da equipe, que nasce cheio; no celular fica embaixo, e só aparece
 * depois do toque, que rola até ele.
 *
 * TEMPO NÃO É COLUNA. Ele entra no perfil, ao lado da média da equipe: com
 * metade das edições sem relógio em setembro, ordenar por velocidade premiaria
 * quem não abre o relógio (ver a migration 20260929020655).
 *
 * "NO PRAZO" PEDE AMOSTRA: abaixo de 5 fotos e reels com prazo a célula fica
 * "—" e vai para o fim da ordem. 3 de 3 não é melhor que 18 de 20.
 */
export function TabelaDePessoas({
  linhas,
  pessoas,
  porEtapa,
  fases,
  rotuloDoMes,
}: {
  linhas: LinhaDaPessoa[]
  pessoas: MetricaPorPessoa[]
  porEtapa: MetricaPorEtapa[]
  fases: FaseDaPessoa[]
  rotuloDoMes: string
}) {
  const [coluna, setColuna] = useState<Coluna>('partos')
  const [crescente, setCrescente] = useState(false)
  const [aberta, setAberta] = useState<string | null>(null)
  const perfil = useRef<HTMLDivElement>(null)

  if (linhas.length === 0) {
    return (
      <Cartao titulo="Pessoas">
        <p className="py-8 text-center text-sm text-muted-foreground">Ninguém registrou trabalho neste período.</p>
      </Cartao>
    )
  }

  const valor = (l: LinhaDaPessoa) => l[coluna]
  const ordenadas = [...linhas].sort((a, b) => {
    const va = valor(a)
    const vb = valor(b)
    if (va === null && vb === null) return a.nome.localeCompare(b.nome)
    if (va === null) return 1
    if (vb === null) return -1
    return (crescente ? va - vb : vb - va) || a.nome.localeCompare(b.nome)
  })

  // Empate divide a posição (1, 2, 2, 4); sem valor, sem posição. ZERO numa
  // coluna de volume também não tem posição: quem não fez nenhum parto não é
  // "11º em partos", só não trabalha nessa ponta. Em Ajustes, zero é o melhor.
  const menorEMelhor = COLUNAS.find((c) => c.id === coluna)?.menorEMelhor ?? false
  const posicoes: (number | null)[] = []
  ordenadas.forEach((l, i) => {
    const anterior = ordenadas[i - 1]
    if (valor(l) === null || (valor(l) === 0 && !menorEMelhor)) posicoes.push(null)
    else if (anterior && valor(anterior) === valor(l)) posicoes.push(posicoes[i - 1] ?? i + 1)
    else posicoes.push(i + 1)
  })

  function ordenarPor(c: Coluna) {
    if (c === coluna) setCrescente((v) => !v)
    else {
      setColuna(c)
      // O primeiro toque já põe o MELHOR em cima: maior número, menos ajustes.
      setCrescente(COLUNAS.find((x) => x.id === c)?.menorEMelhor ?? false)
    }
  }

  // Sem toque ainda, o perfil é o da primeira da ordem — e só aparece no
  // computador. No celular ele mora embaixo da tabela, e abrir sozinho
  // empurraria a lista para longe de quem ainda não escolheu ninguém.
  const selecionada = linhas.find((l) => l.pessoaId === aberta) ?? ordenadas[0]
  const tocou = aberta !== null && selecionada?.pessoaId === aberta

  function abrir(pessoaId: string) {
    setAberta(pessoaId)
    if (!window.matchMedia(TELA_LARGA).matches) {
      const suave = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
      requestAnimationFrame(() =>
        perfil.current?.scrollIntoView({ behavior: suave ? 'smooth' : 'auto', block: 'start' }),
      )
    }
  }

  return (
    <div className="space-y-4">
      <Destaques linhas={linhas} />

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_30rem]">
        <Cartao titulo="Pessoas">
          <div className="-mx-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="w-10 py-2 pl-4 text-center font-semibold">#</th>
                  <th className="py-2 pr-3 font-semibold">Pessoa</th>
                  {COLUNAS.map((c) => (
                    <th
                      key={c.id}
                      aria-sort={coluna === c.id ? (crescente ? 'ascending' : 'descending') : 'none'}
                      className={clsx('py-2 pr-4 text-right font-semibold', c.so_no_largo && 'hidden sm:table-cell')}
                    >
                      <button
                        type="button"
                        onClick={() => ordenarPor(c.id)}
                        className={clsx(
                          'inline-flex items-center gap-1 rounded hover:text-foreground',
                          coluna === c.id && 'text-foreground',
                        )}
                      >
                        {c.rotulo}
                        <span aria-hidden="true" className={clsx('text-[10px]', coluna !== c.id && 'opacity-0')}>
                          {crescente ? '▲' : '▼'}
                        </span>
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ordenadas.map((l, i) => {
                  const escolhida = selecionada?.pessoaId === l.pessoaId
                  return (
                    <tr
                      key={l.pessoaId}
                      onClick={() => abrir(l.pessoaId)}
                      className={clsx(
                        'cursor-pointer border-b border-border tabular-nums transition-colors hover:bg-muted/50',
                        // A linha escolhida se marca onde o perfil está à vista:
                        // sempre no computador, e no celular depois do toque.
                        escolhida && (tocou ? 'bg-marca-suave' : 'xl:bg-marca-suave'),
                      )}
                    >
                      <td className="py-2.5 pl-4 text-center font-bold text-muted-foreground">
                        {posicoes[i] ?? '–'}
                      </td>
                      <td className="py-2.5 pr-3 font-semibold text-foreground">
                        <button
                          type="button"
                          aria-pressed={escolhida}
                          className="text-left"
                          onClick={(e) => {
                            e.stopPropagation()
                            abrir(l.pessoaId)
                          }}
                        >
                          {primeiroNome(l.nome)}
                        </button>
                      </td>
                      <Celula ativa={coluna === 'partos'}>{l.partos}</Celula>
                      <Celula ativa={coluna === 'edicoes'}>{l.edicoes}</Celula>
                      <Celula ativa={coluna === 'taxaPrazo'}>
                        {l.taxaPrazo === null ? '—' : `${Math.round(l.taxaPrazo * 100)}%`}
                      </Celula>
                      <Celula ativa={coluna === 'ajustes'} soNoLargo>
                        {l.ajustes}
                      </Celula>
                      <Celula ativa={coluna === 'dias'} soNoLargo>
                        {l.dias}
                      </Celula>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Cartao>

        {selecionada && (
          <div
            ref={perfil}
            className={clsx('min-w-0 scroll-mt-4 xl:sticky xl:top-4', !tocou && 'hidden xl:block')}
          >
            <PerfilDaPessoa
              linha={selecionada}
              pessoa={pessoas.find((p) => p.pessoaId === selecionada.pessoaId)}
              porEtapa={porEtapa}
              fases={fases}
              rotuloDoMes={rotuloDoMes}
            />
          </div>
        )}
      </div>
    </div>
  )
}

function Celula({
  ativa,
  soNoLargo = false,
  children,
}: {
  ativa: boolean
  soNoLargo?: boolean
  children: React.ReactNode
}) {
  return (
    <td
      className={clsx(
        'py-2.5 pr-4 text-right',
        ativa ? 'font-bold text-foreground' : 'text-foreground/80',
        soNoLargo && 'hidden sm:table-cell',
      )}
    >
      {children}
    </td>
  )
}

/**
 * OS TRÊS DESTAQUES do mês — o "ranking" lido num olhar. Um número por
 * cartão, e o nome de quem o fez.
 */
function Destaques({ linhas }: { linhas: LinhaDaPessoa[] }) {
  const topo = <K extends keyof LinhaDaPessoa>(campo: K, desempate?: (l: LinhaDaPessoa) => number) =>
    [...linhas]
      .filter((l) => typeof l[campo] === 'number' && (l[campo] as number) > 0)
      .sort((a, b) => (b[campo] as number) - (a[campo] as number) || (desempate ? desempate(b) - desempate(a) : 0))[0]

  const partos = topo('partos')
  const edicoes = topo('edicoes')
  const prazo = topo('taxaPrazo', (l) => l.comPrazo)

  const cartoes = [
    partos && { rotulo: 'Mais partos', nome: partos.nome, valor: String(partos.partos) },
    edicoes && { rotulo: 'Mais edições', nome: edicoes.nome, valor: String(edicoes.edicoes) },
    prazo &&
      prazo.taxaPrazo !== null && {
        rotulo: 'Melhor prazo',
        nome: prazo.nome,
        valor: `${Math.round(prazo.taxaPrazo * 100)}%`,
      },
  ].filter((c): c is { rotulo: string; nome: string; valor: string } => Boolean(c))

  if (cartoes.length === 0) return null

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {cartoes.map((c) => (
        <div key={c.rotulo} className="flex items-center justify-between gap-3 rounded-painel border border-border bg-card p-4">
          <div className="min-w-0">
            <div className="text-sm text-muted-foreground">{c.rotulo}</div>
            <div className="truncate text-lg font-bold text-foreground">{primeiroNome(c.nome)}</div>
          </div>
          <div className="text-3xl font-extrabold tracking-tight text-foreground">{c.valor}</div>
        </div>
      ))}
    </div>
  )
}
