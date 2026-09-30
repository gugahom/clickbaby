import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import clsx from 'clsx'
import { IconeX } from '@/components/ui/icones'
import { ROTULO_ETAPA, type EtapaTipo } from '@/features/quadro/types'
import { formatarMoeda } from '@/lib/formato'
import { dataCurta, hojeDoRelatorio, periodoDoMes } from '../lib/metricas'
import {
  GRUPOS_DE_LISTA,
  GRUPOS_SIM_NAO,
  ORDENS,
  TITULO_DO_GRUPO,
  escreverNoEndereco,
  lerDoEndereco,
  quantosFiltros,
  rotuloFixo,
  semFiltros,
  type FiltrosDaOperacao,
  type GrupoDeLista,
  type Ordem,
} from './filtros'
import { PainelDeFiltros } from './PainelDeFiltros'
import {
  POR_PAGINA,
  useBuscaDaOperacao,
  useCatalogoDaOperacao,
  useFacetasDaOperacao,
  useResumoDaOperacao,
  type CasoDaOperacao,
  type ResumoDaOperacao,
} from './useOperacao'

/**
 * O RELATÓRIO EXTERNO — A OPERAÇÃO INTEIRA (29/09/2026, pedido do gestor).
 *
 * O interno olha a EQUIPE; este olha os CASOS. E o que importa nele, nas
 * palavras dele, são os filtros: "como SóCarrão ou Webmotors (…) misturar
 * vários tipos de filtros para chegar num denominador comum". A tela é o
 * desenho dos classificados: filtros à esquerda com a contagem de cada opção,
 * os aplicados em etiquetas no alto, a lista ordenável à direita — mais os
 * NÚMEROS DO RECORTE, que é o que um relatório tem e um classificado não.
 *
 * TUDO MORA NO ENDEREÇO: cada filtro, a ordem e a página. Um link leva a busca
 * junto, e o "voltar" do navegador desfaz o último filtro.
 *
 * SÓ A GESTÃO (a rota está atrás da `RotaDeGestao`, e cada função confere de
 * novo no banco): a lista tem nome de mãe e bebê (seção 10 do CLAUDE.md).
 *
 * TOCAR NUM CASO ABRE O CASO NO QUADRO (`/?caso=`), que já sabe achá-lo — no
 * dia dele, em Entregáveis ou nos Concluídos.
 */
export function RelatorioExternoPage() {
  const [{ hoje, simulado }] = useState(hojeDoRelatorio)
  const [params, setParams] = useSearchParams()
  const filtros = lerDoEndereco(params, periodoDoMes(hoje.slice(0, 7)))
  const ordem = (ORDENS.some((o) => o.id === params.get('ordem')) ? params.get('ordem') : 'recentes') as Ordem
  const pagina = Math.max(1, Number(params.get('pagina')) || 1)
  const [filtrosAbertos, setFiltrosAbertos] = useState(false)

  const busca = useBuscaDaOperacao(filtros, ordem, pagina)
  const facetas = useFacetasDaOperacao(filtros)
  const resumo = useResumoDaOperacao(filtros)

  // OS NOMES vêm do cadastro, e não só das contagens: uma maternidade marcada
  // que zerou some da contagem, e a etiqueta dela ainda precisa dizer qual era.
  const catalogo = useCatalogoDaOperacao()
  const rotuloDe = (grupo: GrupoDeLista, valor: string): string =>
    rotuloFixo(grupo, valor) ??
    (grupo === 'etapas' ? ROTULO_ETAPA[valor as EtapaTipo] : undefined) ??
    catalogo.data?.get(`${grupo}:${valor}`) ??
    facetas.data?.get(grupo)?.find((o) => o.valor === valor)?.rotulo ??
    '…'

  function mudar(f: FiltrosDaOperacao) {
    // Filtro novo volta para a primeira página: a página 4 de outro recorte
    // não é continuação de nada.
    setParams(escreverNoEndereco(f, { ordem: ordem === 'recentes' ? undefined : ordem }))
  }

  function irPara(extras: { ordem?: Ordem; pagina?: number }) {
    const o = extras.ordem ?? ordem
    const p = extras.pagina ?? 1
    setParams(
      escreverNoEndereco(filtros, {
        ordem: o === 'recentes' ? undefined : o,
        pagina: p > 1 ? String(p) : undefined,
      }),
    )
  }

  const erro = busca.error ?? facetas.error ?? resumo.error
  const atualizando = busca.isPlaceholderData || facetas.isPlaceholderData || resumo.isPlaceholderData
  const total = busca.data?.total ?? 0
  const marcados = quantosFiltros(filtros)

  return (
    <div className="mx-auto w-full max-w-[100rem] space-y-4 p-3 md:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-extrabold tracking-tight">Relatório externo</h1>
        <p className="text-sm text-muted-foreground">
          Toda a operação. Combine os filtros para chegar no recorte — cada opção mostra quantos casos ela daria.
          {simulado && (
            <span className="ml-2 rounded-full bg-atencao/15 px-2 py-0.5 text-xs font-semibold text-atencao-tinta">
              Data simulada: {dataCurta(hoje)} · só no local
            </span>
          )}
        </p>
      </header>

      <button
        type="button"
        onClick={() => setFiltrosAbertos((a) => !a)}
        aria-expanded={filtrosAbertos}
        className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-bold lg:hidden"
      >
        Filtros
        {marcados > 0 && (
          <span className="rounded-full bg-marca px-1.5 text-[11px] leading-5 text-white tabular-nums">{marcados}</span>
        )}
      </button>

      <div className="grid items-start gap-5 lg:grid-cols-[19rem_minmax(0,1fr)]">
        <aside className={clsx('space-y-3', !filtrosAbertos && 'hidden lg:block')}>
          <PainelDeFiltros filtros={filtros} facetas={facetas.data} hoje={hoje} rotuloDe={rotuloDe} onMudar={mudar} />
          <button
            type="button"
            onClick={() => setFiltrosAbertos(false)}
            className="superficie-acento flex min-h-11 w-full items-center justify-center rounded-full text-sm font-bold text-white lg:hidden"
          >
            Ver {total.toLocaleString('pt-BR')} {total === 1 ? 'caso' : 'casos'}
          </button>
        </aside>

        <section className="min-w-0 space-y-4">
          <BuscaENumero
            key={filtros.busca ?? ''}
            busca={filtros.busca ?? ''}
            onBuscar={(texto) => mudar({ ...filtros, busca: texto || undefined })}
            total={total}
            periodo={filtros.de || filtros.ate ? `${filtros.de ? dataCurta(filtros.de) : '…'} a ${filtros.ate ? dataCurta(filtros.ate) : '…'}` : 'todo o período'}
            ordem={ordem}
            onOrdenar={(o) => irPara({ ordem: o })}
          />

          <Etiquetas filtros={filtros} rotuloDe={rotuloDe} onMudar={mudar} />

          {erro ? (
            <p className="rounded-painel border border-atrasado/40 bg-card p-4 text-sm text-atrasado">
              Não deu para carregar o relatório: {erro.message}
            </p>
          ) : (
            <div className={clsx('space-y-4 transition-opacity', atualizando && 'opacity-60')}>
              <NumerosDoRecorte resumo={resumo.data} />
              <ListaDeCasos casos={busca.data?.casos} carregando={busca.isPending} />
              {total > POR_PAGINA && (
                <Paginacao pagina={pagina} total={total} onIr={(p) => irPara({ pagina: p })} />
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

/** Busca por nome (vale 300ms depois de parar de digitar), total e ordem. */
function BuscaENumero({
  busca,
  onBuscar,
  total,
  periodo,
  ordem,
  onOrdenar,
}: {
  busca: string
  onBuscar: (texto: string) => void
  total: number
  periodo: string
  ordem: Ordem
  onOrdenar: (o: Ordem) => void
}) {
  const [texto, setTexto] = useState(busca)
  // A espera mora no EVENTO de digitar: cada tecla adia a busca, e só a última
  // vai ao banco.
  const espera = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(espera.current), [])
  function digitar(valor: string) {
    setTexto(valor)
    window.clearTimeout(espera.current)
    espera.current = window.setTimeout(() => {
      if (valor.trim() !== busca) onBuscar(valor.trim())
    }, 300)
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <input
        type="search"
        value={texto}
        onChange={(e) => digitar(e.target.value)}
        placeholder="Buscar por mãe ou bebê"
        aria-label="Buscar por mãe ou bebê"
        className="h-10 w-full min-w-0 rounded-full border border-border bg-card px-4 text-sm placeholder:text-muted-foreground sm:w-auto sm:max-w-80 sm:flex-1"
      />
      <p className="text-sm text-muted-foreground">
        <span className="text-lg font-extrabold text-foreground tabular-nums">{total.toLocaleString('pt-BR')}</span>{' '}
        {total === 1 ? 'caso' : 'casos'} · {periodo}
      </p>
      <label className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
        Ordenar
        <select
          value={ordem}
          onChange={(e) => onOrdenar(e.target.value as Ordem)}
          className="h-10 rounded-full border border-border bg-card px-3 text-sm text-foreground"
        >
          {ORDENS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.rotulo}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}

/** Os filtros aplicados, um por etiqueta, com o × de cada — e "Limpar filtros". */
function Etiquetas({
  filtros,
  rotuloDe,
  onMudar,
}: {
  filtros: FiltrosDaOperacao
  rotuloDe: (grupo: GrupoDeLista, valor: string) => string
  onMudar: (f: FiltrosDaOperacao) => void
}) {
  const etiquetas: { chave: string; texto: string; tirar: () => void }[] = []
  for (const g of GRUPOS_DE_LISTA) {
    for (const v of filtros.listas[g]) {
      etiquetas.push({
        chave: `${g}:${v}`,
        texto: g === 'pessoas' || g === 'etapas' ? `${TITULO_DO_GRUPO[g]}: ${rotuloDe(g, v)}` : rotuloDe(g, v),
        tirar: () => onMudar({ ...filtros, listas: { ...filtros.listas, [g]: filtros.listas[g].filter((x) => x !== v) } }),
      })
    }
  }
  for (const g of GRUPOS_SIM_NAO) {
    const v = filtros.simNao[g]
    if (v === undefined) continue
    etiquetas.push({
      chave: g,
      texto: `${TITULO_DO_GRUPO[g]}: ${v ? 'sim' : 'não'}`,
      tirar: () => {
        const simNao = { ...filtros.simNao }
        delete simNao[g]
        onMudar({ ...filtros, simNao })
      },
    })
  }
  const faixa = (min: number | undefined, max: number | undefined, fmt: (n: number) => string) =>
    min !== undefined && max !== undefined ? `${fmt(min)} a ${fmt(max)}` : min !== undefined ? `a partir de ${fmt(min)}` : `até ${fmt(max ?? 0)}`
  if (filtros.horas_min !== undefined || filtros.horas_max !== undefined) {
    etiquetas.push({
      chave: 'horas',
      texto: `Parto ao envio: ${faixa(filtros.horas_min, filtros.horas_max, (n) => `${n}h`)}`,
      tirar: () => onMudar({ ...filtros, horas_min: undefined, horas_max: undefined }),
    })
  }
  if (filtros.despesa_min !== undefined || filtros.despesa_max !== undefined) {
    etiquetas.push({
      chave: 'despesa',
      texto: `Despesas: ${faixa(filtros.despesa_min, filtros.despesa_max, formatarMoeda)}`,
      tirar: () => onMudar({ ...filtros, despesa_min: undefined, despesa_max: undefined }),
    })
  }
  if (filtros.busca) {
    etiquetas.push({ chave: 'busca', texto: `“${filtros.busca}”`, tirar: () => onMudar({ ...filtros, busca: undefined }) })
  }

  if (etiquetas.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {etiquetas.map((e) => (
        <span
          key={e.chave}
          className="inline-flex items-center gap-1 rounded-full border border-marca/30 bg-marca-suave py-0.5 pr-1 pl-3 text-xs font-semibold text-marca"
        >
          {e.texto}
          <button
            type="button"
            onClick={e.tirar}
            aria-label={`Tirar o filtro ${e.texto}`}
            className="grid size-6 place-items-center rounded-full hover:bg-marca/15"
          >
            <IconeX className="size-3.5" />
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={() => onMudar(semFiltros(filtros))}
        className="ml-1 text-xs font-semibold text-muted-foreground underline underline-offset-2 hover:text-foreground"
      >
        Limpar filtros
      </button>
    </div>
  )
}

/** O que um relatório tem e um classificado não: os números do recorte. */
function NumerosDoRecorte({ resumo }: { resumo: ResumoDaOperacao | undefined }) {
  const r = resumo
  const taxa = r && r.enviados > 0 ? Math.round((r.noPrazo / r.enviados) * 100) : null
  const numeros: { rotulo: string; valor: string; detalhe?: string | undefined }[] = [
    { rotulo: 'Casos', valor: r ? r.casos.toLocaleString('pt-BR') : '—' },
    { rotulo: 'Partos', valor: r ? r.partos.toLocaleString('pt-BR') : '—' },
    {
      rotulo: 'No prazo',
      valor: taxa === null ? '—' : `${taxa}%`,
      detalhe: r ? `${r.noPrazo} de ${r.enviados} enviados` : undefined,
    },
    {
      rotulo: 'Do parto ao envio',
      valor: r?.medianaHorasAteEnvio == null ? '—' : `${r.medianaHorasAteEnvio.toLocaleString('pt-BR')}h`,
      detalhe: 'mediana',
    },
    { rotulo: 'Despesas', valor: r ? formatarMoeda(r.totalDespesas) : '—' },
    { rotulo: 'Cancelados', valor: r ? r.cancelados.toLocaleString('pt-BR') : '—' },
  ]
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      {numeros.map((n) => (
        <div key={n.rotulo} className="rounded-painel border border-border bg-card p-3">
          <div className="text-xs text-muted-foreground">{n.rotulo}</div>
          <div className="text-2xl leading-tight font-extrabold tracking-tight text-foreground tabular-nums">{n.valor}</div>
          {n.detalhe && <div className="text-[11px] text-muted-foreground">{n.detalhe}</div>}
        </div>
      ))}
    </div>
  )
}

const SITUACAO: Record<string, { rotulo: string; cor: string }> = {
  aberto: { rotulo: 'Em andamento', cor: 'bg-andamento/12 text-andamento-tinta' },
  em_entregaveis: { rotulo: 'Em Entregáveis', cor: 'bg-concluido/12 text-concluido-tinta' },
  encerrado: { rotulo: 'Entregue', cor: 'bg-foreground/6 text-foreground' },
  cancelado_equipe: { rotulo: 'Cancelado', cor: 'bg-atrasado/10 text-atrasado' },
  cancelado_agenda: { rotulo: 'Cancelado (agenda)', cor: 'bg-atrasado/10 text-atrasado' },
  rascunho: { rotulo: 'Rascunho', cor: 'bg-rascunho-fundo text-rascunho' },
}

const PRAZO: Record<string, { rotulo: string; cor: string }> = {
  no_prazo: { rotulo: 'No prazo', cor: 'text-concluido-tinta' },
  atrasado: { rotulo: 'Atrasado', cor: 'font-bold text-atrasado' },
  vencido: { rotulo: 'Vencido', cor: 'font-bold text-atrasado' },
  correndo: { rotulo: 'Correndo', cor: 'text-foreground/80' },
  sem_prazo: { rotulo: '—', cor: 'text-muted-foreground' },
}

const MARCA_DO_ADICIONAL: Record<string, string> = { new_born: 'NB', fotolivro: 'FL', video_master: 'VM' }

function ListaDeCasos({ casos, carregando }: { casos: CasoDaOperacao[] | undefined; carregando: boolean }) {
  const navegar = useNavigate()
  if (carregando && !casos) return <p className="py-16 text-center text-sm text-muted-foreground">Carregando…</p>
  if (!casos || casos.length === 0) {
    return (
      <p className="rounded-painel border border-border bg-card py-12 text-center text-sm text-muted-foreground">
        Nenhum caso neste recorte. Tire um filtro ou aumente o período.
      </p>
    )
  }

  const abrir = (id: string) => navegar(`/?caso=${id}`)
  const nome = (c: CasoDaOperacao) => (c.bebeNome ? `${c.maeNome} · ${c.bebeNome}` : c.maeNome)
  const marcas = (c: CasoDaOperacao) =>
    [...c.adicionais.map((a) => MARCA_DO_ADICIONAL[a] ?? a), ...(c.passouUti ? ['UTI'] : []), ...(c.reaberto ? ['Reaberto'] : [])]

  return (
    <div className="rounded-painel border border-border bg-card">
      {/* Computador: tabela. Celular: cartões — a tabela de nove colunas não cabe. */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="py-2.5 pr-3 pl-4 font-semibold">Data</th>
              <th className="py-2.5 pr-3 font-semibold">Mãe · bebê</th>
              <th className="py-2.5 pr-3 font-semibold">Maternidade</th>
              <th className="py-2.5 pr-3 font-semibold">Pacote</th>
              <th className="py-2.5 pr-3 font-semibold">Situação</th>
              <th className="py-2.5 pr-3 font-semibold">Prazo</th>
              <th className="py-2.5 pr-3 text-right font-semibold">Parto → envio</th>
              <th className="py-2.5 pr-3 text-right font-semibold">Despesas</th>
              <th className="py-2.5 pr-4 font-semibold">Parto por</th>
            </tr>
          </thead>
          <tbody>
            {casos.map((c) => (
              <tr
                key={c.id}
                onClick={() => abrir(c.id)}
                className="cursor-pointer border-b border-border last:border-b-0 hover:bg-muted/50"
              >
                <td className="py-2.5 pr-3 pl-4 whitespace-nowrap text-muted-foreground tabular-nums">
                  {c.dia ? dataCurta(c.dia) : '—'}
                </td>
                <td className="max-w-72 py-2.5 pr-3">
                  <Link
                    to={`/?caso=${c.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="block truncate font-semibold text-foreground hover:underline"
                  >
                    {nome(c)}
                  </Link>
                  {marcas(c).length > 0 && (
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {marcas(c).map((m) => (
                        <span key={m} className="rounded bg-foreground/6 px-1 text-[10px] font-bold text-muted-foreground">
                          {m}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="py-2.5 pr-3 whitespace-nowrap">{c.maternidadeSigla ?? '—'}</td>
                <td className="py-2.5 pr-3 whitespace-nowrap">{c.pacoteNome ?? '—'}</td>
                <td className="py-2.5 pr-3">
                  <Selo {...(SITUACAO[c.situacao] ?? { rotulo: c.situacao, cor: '' })} />
                </td>
                <td className={clsx('py-2.5 pr-3 whitespace-nowrap', PRAZO[c.prazo]?.cor)}>{PRAZO[c.prazo]?.rotulo ?? c.prazo}</td>
                <td className="py-2.5 pr-3 text-right tabular-nums">
                  {c.horasAteEnvio === null ? '—' : `${c.horasAteEnvio.toLocaleString('pt-BR')}h`}
                </td>
                <td className="py-2.5 pr-3 text-right tabular-nums">
                  {c.totalDespesas > 0 ? formatarMoeda(c.totalDespesas) : '—'}
                </td>
                <td className="max-w-40 truncate py-2.5 pr-4 text-muted-foreground">{c.fotografouOParto ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-border md:hidden">
        {casos.map((c) => (
          <li key={c.id}>
            <Link to={`/?caso=${c.id}`} className="block space-y-1 px-4 py-3 hover:bg-muted/50">
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0 truncate font-semibold text-foreground">{nome(c)}</span>
                <Selo {...(SITUACAO[c.situacao] ?? { rotulo: c.situacao, cor: '' })} />
              </div>
              <div className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                <span className="tabular-nums">{c.dia ? dataCurta(c.dia) : '—'}</span>
                <span>{c.maternidadeSigla ?? '—'}</span>
                <span>{c.pacoteNome ?? '—'}</span>
                <span className={PRAZO[c.prazo]?.cor}>{PRAZO[c.prazo]?.rotulo}</span>
                {marcas(c).map((m) => (
                  <span key={m} className="font-bold">
                    {m}
                  </span>
                ))}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Selo({ rotulo, cor }: { rotulo: string; cor: string }) {
  return (
    <span className={clsx('inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold whitespace-nowrap', cor)}>{rotulo}</span>
  )
}

function Paginacao({ pagina, total, onIr }: { pagina: number; total: number; onIr: (p: number) => void }) {
  const ultima = Math.ceil(total / POR_PAGINA)
  const de = (pagina - 1) * POR_PAGINA + 1
  const ate = Math.min(pagina * POR_PAGINA, total)
  const botao = 'inline-flex min-h-10 items-center rounded-full border border-border bg-card px-4 text-sm font-semibold disabled:opacity-40'
  return (
    <div className="flex items-center justify-between gap-3">
      <button type="button" className={botao} disabled={pagina <= 1} onClick={() => onIr(pagina - 1)}>
        ‹ Anterior
      </button>
      <span className="text-sm text-muted-foreground tabular-nums">
        {de}–{ate} de {total.toLocaleString('pt-BR')}
      </span>
      <button type="button" className={botao} disabled={pagina >= ultima} onClick={() => onIr(pagina + 1)}>
        Próxima ›
      </button>
    </div>
  )
}
