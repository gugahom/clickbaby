import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import clsx from 'clsx'
import { Dropdown } from '@/components/ui/Dropdown'
import { IconeX } from '@/components/ui/icones'
import { ROTULO_ETAPA, type EtapaTipo } from '@/features/quadro/types'
import { formatarMoeda } from '@/lib/formato'
import { useTelas } from '@/features/auth/telas'
import type { TipoDeGrafico } from '../components/GraficoDoKpi'
import { Segmentado } from '../components/Segmentado'
import { dataCurta, hojeDoRelatorio, periodoDoMes } from '../lib/metricas'
import { exportarCasos, exportarNumeros } from './exportar'
import {
  GRUPOS_DE_LISTA,
  GRUPOS_SIM_NAO,
  OFERTAS,
  ORDEM_PADRAO,
  ORDENS,
  ROTULO_DO_LINK,
  TITULO_DO_GRUPO,
  colunasDosFiltros,
  escreverNoEndereco,
  rotuloDoEquipamento,
  lerDoEndereco,
  quantosFiltros,
  rotuloFixo,
  semFiltros,
  type ColunaDoFiltro,
  type FiltrosDaOperacao,
  type GrupoDeLista,
  type Ordem,
} from './filtros'
import { EIXOS, METRICAS, type Eixo, type Metrica } from './grafico'
import { GraficoDoRecorte } from './GraficoDoRecorte'
import { PainelDeFiltros } from './PainelDeFiltros'
import { SeletorDeOferta } from './SeletorDeOferta'
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
 *
 * O RECORTE VIRA GRÁFICO E PLANILHA (30/09/2026, segunda volta do gestor): a
 * chave "Casos · Gráfico" troca a lista pelo gráfico do mesmo recorte, e
 * "Exportar planilha" leva os casos, ou os números por trás do gráfico, para o
 * Excel. A visão, o eixo e o número escolhidos também moram no endereço.
 *
 * CADA FILTRO VIRA UMA COLUNA (30/09/2026, terceira volta do gestor): a lista
 * abre com quatro colunas fixas — data, mãe/bebê, maternidade, pacote — e cada
 * filtro aplicado acrescenta a sua à direita, na ordem em que foi aplicado
 * (`colunasDosFiltros`). Tirou o filtro, a coluna sai. E a lista abre do MAIS
 * ANTIGO para o mais recente.
 *
 * O MODO COMERCIAL (01/10/2026, pedido do gestor). Um botão no cabeçalho liga
 * o modo: só os partos, e três colunas fixas a mais — REELS (nos BASIC e
 * STANDARD), NEW BORN e FOTO/LIVRO — com o seletor de fase de cada oferta:
 * apresentar, enviado, recusou, vendido. É a planilha que o comercial usava,
 * com os filtros do relatório. Quem tem SÓ a tela Comercial entra aqui direto
 * no modo, sem o botão — e o banco recusa qualquer busca dele fora do modo.
 * Quando a página comercial existir, isto muda de casa.
 */
type Visao = 'casos' | 'grafico'
const METRICAS_IDS = Object.keys(METRICAS) as Metrica[]

interface Extras {
  ordem?: Ordem
  pagina?: number
  visao?: Visao
  eixo?: Eixo
  metrica?: Metrica
  forma?: TipoDeGrafico
}

export function RelatorioExternoPage() {
  const [{ hoje, simulado }] = useState(hojeDoRelatorio)
  const [params, setParams] = useSearchParams()
  const telas = useTelas()
  const podeComercial = telas.has('comercial')
  // Quem só tem a tela Comercial vive no modo comercial.
  const soComercial = podeComercial && !telas.has('relatorios')
  const lidos = lerDoEndereco(params, periodoDoMes(hoje.slice(0, 7)))
  const filtros: FiltrosDaOperacao = soComercial ? { ...lidos, comercial: true } : lidos
  const comercial = filtros.comercial === true
  const ordem = (ORDENS.some((o) => o.id === params.get('ordem')) ? params.get('ordem') : ORDEM_PADRAO) as Ordem
  const pagina = Math.max(1, Number(params.get('pagina')) || 1)
  const visao: Visao = params.get('ver') === 'grafico' ? 'grafico' : 'casos'
  const eixo = (EIXOS.some((e) => e.id === params.get('eixo')) ? params.get('eixo') : 'tempo') as Eixo
  const metrica = (METRICAS_IDS.includes(params.get('numero') as Metrica) ? params.get('numero') : 'casos') as Metrica
  const forma: TipoDeGrafico = params.get('forma') === 'barras' ? 'barras' : 'linha'
  const [filtrosAbertos, setFiltrosAbertos] = useState(false)
  const [exportando, setExportando] = useState(false)
  const [avisoDaExportacao, setAvisoDaExportacao] = useState<string | null>(null)

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

  /** O endereço com os filtros e a tela (ordem, página, visão, gráfico). */
  function endereco(f: FiltrosDaOperacao, extras: Extras) {
    const o = extras.ordem ?? ordem
    const p = extras.pagina ?? 1
    const v = extras.visao ?? visao
    const e = extras.eixo ?? eixo
    const n = extras.metrica ?? metrica
    const fo = extras.forma ?? forma
    return escreverNoEndereco(f, {
      ordem: o === ORDEM_PADRAO ? undefined : o,
      pagina: p > 1 ? String(p) : undefined,
      ver: v === 'grafico' ? 'grafico' : undefined,
      eixo: e === 'tempo' ? undefined : e,
      numero: n === 'casos' ? undefined : n,
      forma: fo === 'linha' ? undefined : fo,
    })
  }

  // Filtro novo volta para a primeira página: a página 4 de outro recorte não
  // é continuação de nada. A visão e o gráfico ficam.
  const mudar = (f: FiltrosDaOperacao) => setParams(endereco(f, {}))
  const irPara = (extras: Extras) => setParams(endereco(filtros, extras))

  async function exportar(qual: 'casos' | 'numeros') {
    setExportando(true)
    setAvisoDaExportacao(null)
    try {
      if (qual === 'casos') await exportarCasos(filtros, ordem)
      else await exportarNumeros(filtros, eixo)
    } catch (e) {
      setAvisoDaExportacao(`Não deu para exportar: ${e instanceof Error ? e.message : 'erro desconhecido'}`)
    } finally {
      setExportando(false)
    }
  }

  const erro = busca.error ?? facetas.error ?? resumo.error
  const atualizando = busca.isPlaceholderData || facetas.isPlaceholderData || resumo.isPlaceholderData
  const total = busca.data?.total ?? 0
  const marcados = quantosFiltros(filtros)

  return (
    <div className="mx-auto w-full max-w-[100rem] space-y-4 p-3 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
        <h1 className="text-2xl font-extrabold tracking-tight">{soComercial ? 'Comercial' : 'Relatório externo'}</h1>
        <p className="text-sm text-muted-foreground">
          {comercial
            ? 'As ofertas pós-parto: reels nos BASIC e STANDARD, New Born e Foto/Livro. Mude a fase de cada uma na própria linha.'
            : 'Toda a operação. Combine os filtros para chegar no recorte — cada opção mostra quantos casos ela daria.'}
          {simulado && (
            <span className="ml-2 rounded-full bg-atencao/15 px-2 py-0.5 text-xs font-semibold text-atencao-tinta">
              Data simulada: {dataCurta(hoje)} · só no local
            </span>
          )}
        </p>
        </div>
        {podeComercial && !soComercial && (
          <ChaveComercial ligada={comercial} onTrocar={() => mudar({ ...filtros, comercial: !comercial })} />
        )}
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

      <div className="grid items-start gap-5 lg:grid-cols-[17.5rem_minmax(0,1fr)] 2xl:grid-cols-[19rem_minmax(0,1fr)]">
        <aside className={clsx('space-y-3', !filtrosAbertos && 'hidden lg:block')}>
          <PainelDeFiltros
            filtros={filtros}
            facetas={facetas.data}
            hoje={hoje}
            rotuloDe={rotuloDe}
            onMudar={mudar}
          />
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
            ordem={visao === 'casos' ? ordem : null}
            onOrdenar={(o) => irPara({ ordem: o })}
            visao={visao}
            onTrocarVisao={(v) => irPara({ visao: v, pagina })}
            exportando={exportando}
            nomeDoEixo={visao === 'grafico' ? (EIXOS.find((e) => e.id === eixo)?.rotulo.toLowerCase() ?? '') : 'no tempo'}
            onExportar={exportar}
          />

          {avisoDaExportacao && <p className="text-sm font-semibold text-atrasado">{avisoDaExportacao}</p>}

          <Etiquetas filtros={filtros} rotuloDe={rotuloDe} onMudar={mudar} />

          {erro ? (
            <p className="rounded-painel border border-atrasado/40 bg-card p-4 text-sm text-atrasado">
              Não deu para carregar o relatório: {erro.message}
            </p>
          ) : (
            <div className={clsx('space-y-4 transition-opacity', atualizando && 'opacity-60')}>
              <NumerosDoRecorte
                resumo={resumo.data}
                escolhida={visao === 'grafico' ? metrica : null}
                onEscolher={(n) => irPara({ metrica: n, visao: 'grafico' })}
              />
              {visao === 'grafico' ? (
                <GraficoDoRecorte
                  filtros={filtros}
                  eixo={eixo}
                  metrica={metrica}
                  forma={forma}
                  onTrocarEixo={(e) => irPara({ eixo: e })}
                  onTrocarForma={(f) => irPara({ forma: f })}
                  onFiltrar={(g, v) => mudar({ ...filtros, listas: { ...filtros.listas, [g]: [...filtros.listas[g], v] } })}
                />
              ) : (
                <>
                  <ListaDeCasos
                    casos={busca.data?.casos}
                    carregando={busca.isPending}
                    colunas={colunasDosFiltros(filtros)}
                    filtros={filtros}
                    comercial={comercial}
                    podeMudarOfertas={podeComercial}
                  />
                  {total > POR_PAGINA && (
                    <Paginacao pagina={pagina} total={total} onIr={(p) => irPara({ pagina: p })} />
                  )}
                </>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

/**
 * O BOTÃO DO MODO COMERCIAL, no cabeçalho (pedido do gestor: "um checkbox de
 * comercial"). Uma chave e não uma caixa de marcar solta: ela liga um MODO da
 * tela, e a chave diz isso pela forma.
 */
function ChaveComercial({ ligada, onTrocar }: { ligada: boolean; onTrocar: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligada}
      onClick={onTrocar}
      className={clsx(
        'inline-flex min-h-11 items-center gap-3 rounded-full border px-4 text-sm font-bold transition-colors',
        ligada ? 'border-marca bg-marca-suave text-marca' : 'border-border bg-card text-foreground hover:border-marca/40',
      )}
    >
      <span
        aria-hidden="true"
        className={clsx(
          'relative inline-flex h-5 w-9 flex-shrink-0 rounded-full transition-colors',
          ligada ? 'bg-marca' : 'bg-muted-foreground/30',
        )}
      >
        <span
          className={clsx(
            'absolute top-0.5 size-4 rounded-full bg-white shadow transition-transform',
            ligada ? 'translate-x-4' : 'translate-x-0.5',
          )}
        />
      </span>
      Comercial
    </button>
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
  visao,
  onTrocarVisao,
  exportando,
  nomeDoEixo,
  onExportar,
}: {
  busca: string
  onBuscar: (texto: string) => void
  total: number
  periodo: string
  /** Nula no gráfico: lá a ordem da lista não muda nada. */
  ordem: Ordem | null
  onOrdenar: (o: Ordem) => void
  visao: Visao
  onTrocarVisao: (v: Visao) => void
  exportando: boolean
  /** "no tempo", "por maternidade": o que a planilha dos números vai levar. */
  nomeDoEixo: string
  onExportar: (qual: 'casos' | 'numeros') => void
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
        className="h-10 w-full min-w-0 rounded-full border border-border bg-card px-4 text-sm placeholder:text-muted-foreground sm:w-auto sm:min-w-56 sm:max-w-80 sm:flex-1"
      />
      <p className="text-sm text-muted-foreground">
        <span className="text-lg font-extrabold text-foreground tabular-nums">{total.toLocaleString('pt-BR')}</span>{' '}
        {total === 1 ? 'caso' : 'casos'} · {periodo}
      </p>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {ordem !== null && (
          <Dropdown
            variante="pilula"
            prefixo="Ordenar"
            compacto
            rotulo="Ordenar"
            alinhamento="direita"
            selecionado={ordem}
            onEscolher={(item) => onOrdenar(item.id as Ordem)}
            itens={ORDENS.map((o) => ({ id: o.id, rotulo: o.rotulo }))}
          />
        )}
        <Segmentado
          rotulo="Ver o recorte como"
          opcoes={[
            { id: 'casos', conteudo: 'Casos' },
            { id: 'grafico', conteudo: 'Gráfico' },
          ]}
          ativa={visao}
          onTrocar={onTrocarVisao}
        />
        <Dropdown
          variante="pilula"
          compacto
          alinhamento="direita"
          rotulo={exportando ? 'Exportando…' : 'Exportar planilha'}
          desabilitado={exportando || total === 0}
          onEscolher={(item) => onExportar(item.id as 'casos' | 'numeros')}
          itens={[
            { id: 'casos', rotulo: `Casos do recorte (${total.toLocaleString('pt-BR')})` },
            { id: 'numeros', rotulo: `Números ${nomeDoEixo}` },
          ]}
        />
      </div>
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
function NumerosDoRecorte({
  resumo,
  escolhida,
  onEscolher,
}: {
  resumo: ResumoDaOperacao | undefined
  /** No gráfico, o número que ele desenha. Nula na lista. */
  escolhida: Metrica | null
  onEscolher: (m: Metrica) => void
}) {
  const r = resumo
  const taxa = r && r.enviados > 0 ? Math.round((r.noPrazo / r.enviados) * 100) : null
  const numeros: { id: Metrica; rotulo: string; valor: string; detalhe?: string | undefined }[] = [
    { id: 'casos', rotulo: 'Casos', valor: r ? r.casos.toLocaleString('pt-BR') : '—' },
    { id: 'partos', rotulo: 'Partos', valor: r ? r.partos.toLocaleString('pt-BR') : '—' },
    {
      id: 'no_prazo',
      rotulo: 'No prazo',
      valor: taxa === null ? '—' : `${taxa}%`,
      detalhe: r ? `${r.noPrazo} de ${r.enviados} enviados` : undefined,
    },
    {
      id: 'parto_envio',
      rotulo: 'Do parto ao envio',
      valor: r?.medianaHorasAteEnvio == null ? '—' : `${r.medianaHorasAteEnvio.toLocaleString('pt-BR')}h`,
      detalhe: 'mediana',
    },
    { id: 'despesas', rotulo: 'Despesas', valor: r ? formatarMoeda(r.totalDespesas) : '—' },
    { id: 'cancelados', rotulo: 'Cancelados', valor: r ? r.cancelados.toLocaleString('pt-BR') : '—' },
  ]
  // Os cartões são BOTÕES nas duas visões: na lista, tocar num deles abre o
  // gráfico já naquele número — o caminho mais curto de "86% no prazo" até
  // "como isso andou no mês".
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      {numeros.map((n) => (
        <button
          key={n.id}
          type="button"
          aria-pressed={escolhida === n.id}
          onClick={() => onEscolher(n.id)}
          title={`Ver ${n.rotulo.toLowerCase()} no gráfico`}
          className={clsx(
            'rounded-painel border bg-card p-3 text-left transition-colors',
            escolhida === n.id ? 'border-marca ring-2 ring-marca/25' : 'border-border hover:border-marca/40',
          )}
        >
          <div className="text-xs text-muted-foreground">{n.rotulo}</div>
          <div className="text-2xl leading-tight font-extrabold tracking-tight text-foreground tabular-nums">{n.valor}</div>
          {n.detalhe && <div className="text-[11px] text-muted-foreground">{n.detalhe}</div>}
        </button>
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

const ADICIONAL: Record<string, string> = { new_born: 'New Born', fotolivro: 'Foto/Livro', video_master: 'Vídeo MASTER' }

/** O título de cada coluna que um filtro acrescenta. */
function tituloDaColuna(c: ColunaDoFiltro): string {
  switch (c.tipo) {
    case 'link':
      return ROTULO_DO_LINK[c.link]
    case 'trabalho':
      return 'Quem fez'
    case 'grupo':
      return c.grupo === 'turnos' ? 'Horário' : TITULO_DO_GRUPO[c.grupo]
    case 'simNao':
      return { uti: 'UTI', handoff: 'Passagem de turno', reaberto: 'Voltou para ajuste', avaliado: 'Avaliação', com_despesa: 'Despesas' }[c.grupo]
    case 'faixa':
      return c.faixa === 'horas' ? 'Parto → envio' : 'Despesas'
  }
}

const chaveDaColuna = (c: ColunaDoFiltro) =>
  c.tipo === 'link' ? `link:${c.link}` : c.tipo === 'grupo' || c.tipo === 'simNao' ? c.grupo : c.tipo === 'faixa' ? c.faixa : c.tipo

const simNao = (v: boolean) => (v ? 'Sim' : 'Não')

/** O que uma coluna de filtro mostra num caso. */
function CelulaDaColuna({ coluna, caso, filtros }: { coluna: ColunaDoFiltro; caso: CasoDaOperacao; filtros: FiltrosDaOperacao }) {
  const traco = <span className="text-muted-foreground">—</span>
  switch (coluna.tipo) {
    case 'link': {
      const links = caso.links.filter((l) => l.tipo === coluna.link)
      if (links.length === 0) return traco
      return (
        <div className="space-y-1">
          {links.map((l) => (
            <LinkNaCelula key={l.url} url={l.url} />
          ))}
        </div>
      )
    }
    case 'trabalho': {
      // Só o que o filtro pediu: as pessoas marcadas, nas etapas marcadas.
      const { pessoas, etapas } = filtros.listas
      const feitos = caso.trabalho.filter(
        (t) => (pessoas.length === 0 || pessoas.includes(t.pessoaId)) && (etapas.length === 0 || etapas.includes(t.etapa)),
      )
      const linhas = [...new Set(feitos.map((t) => `${ROTULO_ETAPA[t.etapa as EtapaTipo] ?? t.etapa}: ${t.pessoa}`))]
      if (linhas.length === 0) return traco
      return (
        <div className="space-y-0.5 text-xs">
          {linhas.map((l) => (
            <div key={l} className="whitespace-nowrap">
              {l}
            </div>
          ))}
        </div>
      )
    }
    case 'grupo':
      switch (coluna.grupo) {
        case 'situacoes':
          return <Selo {...(SITUACAO[caso.situacao] ?? { rotulo: caso.situacao, cor: '' })} />
        case 'prazos':
          return <span className={clsx('whitespace-nowrap', PRAZO[caso.prazo]?.cor)}>{PRAZO[caso.prazo]?.rotulo ?? caso.prazo}</span>
        case 'termos':
          return <span className="whitespace-nowrap">{rotuloFixo('termos', caso.termo) ?? caso.termo}</span>
        case 'equipamentos': {
          if (caso.equipamentos.length === 0) return traco
          const marcados = filtros.listas.equipamentos
          return (
            <div className="space-y-0.5 text-xs">
              {caso.equipamentos.map((e) => (
                <div key={e} className={clsx('whitespace-nowrap', marcados.includes(e) ? 'font-bold text-foreground' : 'text-muted-foreground')}>
                  {rotuloDoEquipamento(e)}
                </div>
              ))}
            </div>
          )
        }
        case 'adicionais':
          return caso.adicionais.length === 0 ? traco : <span className="text-xs">{caso.adicionais.map((a) => ADICIONAL[a] ?? a).join(', ')}</span>
        case 'turnos':
          return caso.turno ? <span className="whitespace-nowrap">{rotuloFixo('turnos', caso.turno)}</span> : traco
        case 'dias_semana':
          return caso.diaSemana ? <span>{rotuloFixo('dias_semana', String(caso.diaSemana))}</span> : traco
      }
      return traco
    case 'simNao':
      switch (coluna.grupo) {
        case 'uti':
          return <span>{simNao(caso.passouUti)}</span>
        case 'handoff':
          return <span>{simNao(caso.teveHandoff)}</span>
        case 'reaberto':
          return <span>{simNao(caso.reaberto)}</span>
        case 'avaliado':
          return <span>{simNao(caso.avaliado)}</span>
        case 'com_despesa':
          return <span className="tabular-nums">{caso.totalDespesas > 0 ? formatarMoeda(caso.totalDespesas) : 'Não'}</span>
      }
      return traco
    case 'faixa':
      return coluna.faixa === 'horas' ? (
        <span className="tabular-nums">{caso.horasAteEnvio === null ? '—' : `${caso.horasAteEnvio.toLocaleString('pt-BR')}h`}</span>
      ) : (
        <span className="tabular-nums">{caso.totalDespesas > 0 ? formatarMoeda(caso.totalDespesas) : '—'}</span>
      )
  }
}

/**
 * O LINK DE ENTREGA NUMA CÉLULA: clicável e com copiar (decisão do gestor). Ele
 * é a chave da galeria da família — por isso só existe aqui, atrás da gestão, e
 * a planilha exportada não o leva. O clique não abre o caso junto.
 */
function LinkNaCelula({ url }: { url: string }) {
  const [copiado, setCopiado] = useState(false)
  let curto = url
  try {
    const u = new URL(url)
    curto = u.hostname.replace(/^www\./, '') + (u.pathname.length > 1 ? '/…' : '')
  } catch {
    // Link que não é URL válida aparece como veio.
  }
  return (
    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        title={url}
        className="max-w-40 truncate text-xs font-semibold text-marca hover:underline"
      >
        {curto}
      </a>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(url).then(() => {
            setCopiado(true)
            window.setTimeout(() => setCopiado(false), 1500)
          })
        }}
        className="rounded-full border border-border px-2 py-0.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
      >
        {copiado ? 'Copiado' : 'Copiar'}
      </button>
    </div>
  )
}

function ListaDeCasos({
  casos,
  carregando,
  colunas,
  filtros,
  comercial,
  podeMudarOfertas,
}: {
  casos: CasoDaOperacao[] | undefined
  carregando: boolean
  colunas: ColunaDoFiltro[]
  filtros: FiltrosDaOperacao
  /** As três colunas das ofertas, fixas, logo depois do pacote. */
  comercial: boolean
  podeMudarOfertas: boolean
}) {
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

  return (
    <div className="rounded-painel border border-border bg-card">
      {/* Computador: tabela, com as colunas dos filtros à direita. Celular: cartões. */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="py-3 pr-3 pl-4 font-semibold">Data</th>
              <th className="px-3 py-3 font-semibold">Mãe · bebê</th>
              <th className="px-3 py-3 font-semibold">Maternidade</th>
              <th className="px-3 py-3 font-semibold">Pacote</th>
              {comercial &&
                OFERTAS.map((o) => (
                  <th key={o.id} className="border-l border-border/60 px-3 py-3 font-semibold whitespace-nowrap text-marca">
                    {o.rotulo}
                  </th>
                ))}
              {colunas.map((c) => (
                <th key={chaveDaColuna(c)} className="border-l border-border/60 px-3 py-3 font-semibold whitespace-nowrap text-foreground">
                  {tituloDaColuna(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {casos.map((c) => (
              <tr
                key={c.id}
                onClick={() => abrir(c.id)}
                className="cursor-pointer border-b border-border last:border-b-0 hover:bg-muted/50"
              >
                <td className="py-3 pr-3 pl-4 whitespace-nowrap text-muted-foreground tabular-nums">
                  {c.dia ? dataCurta(c.dia) : '—'}
                </td>
                {/* `max-w-0` com largura em %: o nome é a coluna que encolhe (quebra em
                    duas linhas, com o nome inteiro no `title`). */}
                <td className="w-[28%] max-w-0 px-3 py-3">
                  <Link
                    to={`/?caso=${c.id}`}
                    onClick={(e) => e.stopPropagation()}
                    title={nome(c)}
                    className="line-clamp-2 font-semibold text-foreground hover:underline"
                  >
                    {nome(c)}
                  </Link>
                </td>
                <td className="px-3 py-3 font-semibold whitespace-nowrap text-foreground">{c.maternidadeSigla ?? '—'}</td>
                <td className="px-3 py-3 whitespace-nowrap text-muted-foreground">{c.pacoteNome ?? 'sem pacote'}</td>
                {comercial &&
                  OFERTAS.map((o) => (
                    <td key={o.id} className="border-l border-border/60 px-3 py-2 align-middle">
                      <SeletorDeOferta casoId={c.id} oferta={o.id} fase={c.ofertas[o.id]} podeMudar={podeMudarOfertas} />
                    </td>
                  ))}
                {colunas.map((col) => (
                  <td key={chaveDaColuna(col)} className="border-l border-border/60 px-3 py-3 align-top">
                    <CelulaDaColuna coluna={col} caso={c} filtros={filtros} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-border md:hidden">
        {casos.map((c) => (
          <li key={c.id}>
            <div role="link" tabIndex={0} onClick={() => abrir(c.id)} onKeyDown={(e) => e.key === 'Enter' && abrir(c.id)} className="block cursor-pointer space-y-1.5 px-4 py-3 hover:bg-muted/50">
              <div className="min-w-0 truncate font-semibold text-foreground">{nome(c)}</div>
              <div className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                <span className="tabular-nums">{c.dia ? dataCurta(c.dia) : '—'}</span>
                <span>{c.maternidadeSigla ?? '—'}</span>
                <span>{c.pacoteNome ?? '—'}</span>
              </div>
              {comercial && (
                <div className="flex flex-wrap gap-x-3 gap-y-1.5 pt-0.5">
                  {OFERTAS.filter((o) => c.ofertas[o.id] !== null).map((o) => (
                    <span key={o.id} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      {o.rotulo}
                      <SeletorDeOferta casoId={c.id} oferta={o.id} fase={c.ofertas[o.id]} podeMudar={podeMudarOfertas} />
                    </span>
                  ))}
                </div>
              )}
              {colunas.length > 0 && (
                <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
                  {colunas.map((col) => (
                    <div key={chaveDaColuna(col)} className="contents">
                      <dt className="text-muted-foreground">{tituloDaColuna(col)}</dt>
                      <dd className="min-w-0">
                        <CelulaDaColuna coluna={col} caso={c} filtros={filtros} />
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
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
