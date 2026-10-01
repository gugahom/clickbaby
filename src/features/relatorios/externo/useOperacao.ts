import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { chavesQuadro } from '@/features/quadro/api/useQuadro'
import type { Database, Json } from '@/types/database'
import {
  paraOBanco,
  type FaseComercial,
  type FiltrosDaOperacao,
  type OfertaComercial,
  type Ordem,
  type TipoDeLink,
} from './filtros'
import type { Eixo, LinhaDoGrafico } from './grafico'

/**
 * A LEITURA DO RELATÓRIO EXTERNO — três funções do banco, o mesmo filtro
 * (migration 20260929233525). A tela não filtra nem conta nada: toda soma de
 * mais de um caso é do banco (seção 13 do CLAUDE.md), e a lista vem paginada lá
 * de dentro, com o total do recorte.
 *
 * Trocar um filtro NÃO PISCA a tela: o resultado anterior fica, esmaecido, até
 * o novo chegar — as contagens mudando no lugar é o que dá a sensação dos
 * classificados.
 */

export interface CasoDaOperacao {
  id: string
  maeNome: string
  bebeNome: string | null
  dia: string | null
  maternidadeSigla: string | null
  pacoteNome: string | null
  situacao: string
  prazo: string
  horasAteEnvio: number | null
  totalDespesas: number
  termo: string
  fotografouOParto: string | null
  adicionais: string[]
  passouUti: boolean
  reaberto: boolean
  // O que as colunas dos filtros mostram (30/09/2026).
  turno: string | null
  diaSemana: number | null
  avaliado: boolean
  teveHandoff: boolean
  /** "cel:CEL CLICK 3", "cartao:14 HSC" — ver `rotuloDoEquipamento`. */
  equipamentos: string[]
  /** Os links COM endereço, só da página. A planilha não os leva. */
  links: { tipo: TipoDeLink; url: string }[]
  /** Quem fez cada etapa (não dispensada) do caso. */
  trabalho: { etapa: string; pessoaId: string; pessoa: string }[]
  /** A fase de cada oferta do comercial; nulo onde ela não se aplica. */
  ofertas: Record<OfertaComercial, FaseComercial | null>
}

export interface PaginaDaOperacao {
  casos: CasoDaOperacao[]
  total: number
}

export interface OpcaoDeFaceta {
  valor: string
  rotulo: string | null
  contagem: number
}

export type Facetas = Map<string, OpcaoDeFaceta[]>

export interface ResumoDaOperacao {
  casos: number
  partos: number
  enviados: number
  noPrazo: number
  medianaHorasAteEnvio: number | null
  totalDespesas: number
  cancelados: number
}

export const POR_PAGINA = 50

const numero = (v: number | string | null | undefined): number | null =>
  v === null || v === undefined ? null : Number(v)

async function chamar<T>(consulta: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await consulta
  if (error) throw new Error(error.message)
  return data as T
}

type LinhaDaBusca = Database['public']['Functions']['operacao_buscar']['Returns'][number]

function paraCaso(l: LinhaDaBusca): CasoDaOperacao {
  return {
    id: l.id,
    maeNome: l.mae_nome,
    bebeNome: l.bebe_nome,
    dia: l.dia,
    maternidadeSigla: l.maternidade_sigla,
    pacoteNome: l.pacote_nome,
    situacao: l.situacao,
    prazo: l.prazo,
    horasAteEnvio: numero(l.horas_ate_envio),
    totalDespesas: numero(l.total_despesas) ?? 0,
    termo: l.termo,
    fotografouOParto: l.fotografou_o_parto,
    adicionais: l.adicionais ?? [],
    passouUti: l.passou_uti,
    reaberto: l.reaberto,
    turno: l.turno,
    diaSemana: l.dia_semana,
    avaliado: l.avaliado,
    teveHandoff: l.teve_handoff,
    equipamentos: l.equipamentos ?? [],
    links: (l.links as { tipo: TipoDeLink; url: string }[] | null) ?? [],
    trabalho: ((l.trabalho as { etapa: string; pessoa_id: string; pessoa: string }[] | null) ?? []).map((t) => ({
      etapa: t.etapa,
      pessoaId: t.pessoa_id,
      pessoa: t.pessoa,
    })),
    ofertas: {
      reels: null,
      new_born: null,
      fotolivro: null,
      ...((l.ofertas as Partial<Record<OfertaComercial, FaseComercial | null>> | null) ?? {}),
    },
  }
}

/**
 * MUDAR A FASE DE UMA OFERTA (01/10/2026). Vendido no New Born ou no Foto/Livro
 * cria a etapa no caso — e aí o Quadro também precisa reler.
 */
export function useDefinirOferta() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ casoId, oferta, fase }: { casoId: string; oferta: OfertaComercial; fase: FaseComercial }) =>
      chamar(supabase.rpc('definir_oferta_comercial', { p_caso_id: casoId, p_oferta: oferta, p_fase: fase })),
    onSuccess: (criouEtapa) => {
      void qc.invalidateQueries({ queryKey: ['operacao'] })
      if (criouEtapa) void qc.invalidateQueries({ queryKey: chavesQuadro.todos })
    },
  })
}

export function useBuscaDaOperacao(filtros: FiltrosDaOperacao, ordem: Ordem, pagina: number) {
  const f = paraOBanco(filtros)
  return useQuery({
    queryKey: ['operacao', 'buscar', f, ordem, pagina],
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<PaginaDaOperacao> => {
      const linhas = await chamar(
        supabase.rpc('operacao_buscar', {
          p_filtros: f as Json,
          p_ordem: ordem,
          p_limite: POR_PAGINA,
          p_deslocamento: (pagina - 1) * POR_PAGINA,
        }),
      )
      return {
        total: linhas?.[0]?.total ?? 0,
        casos: (linhas ?? []).map(paraCaso),
      }
    },
  })
}

export function useFacetasDaOperacao(filtros: FiltrosDaOperacao) {
  const f = paraOBanco(filtros)
  return useQuery({
    queryKey: ['operacao', 'facetas', f],
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<Facetas> => {
      const linhas = await chamar(supabase.rpc('operacao_facetas', { p_filtros: f as Json }))
      const mapa: Facetas = new Map()
      for (const l of linhas ?? []) {
        const lista = mapa.get(l.grupo) ?? []
        lista.push({ valor: l.valor, rotulo: l.rotulo, contagem: l.contagem })
        mapa.set(l.grupo, lista)
      }
      return mapa
    },
  })
}

/**
 * OS NOMES das opções abertas (maternidade, pacote, pessoa), lidos do cadastro —
 * que toda pessoa ativa já lê. Sem isto, uma maternidade marcada que zerou
 * sumiria da contagem e a etiqueta dela não teria o que dizer.
 */
export function useCatalogoDaOperacao() {
  return useQuery({
    queryKey: ['operacao', 'catalogo'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Map<string, string>> => {
      const [mats, pacs, pes] = await Promise.all([
        chamar(supabase.from('maternidades').select('id, sigla')),
        chamar(supabase.from('pacotes').select('id, nome')),
        chamar(supabase.from('pessoas').select('id, nome')),
      ])
      const mapa = new Map<string, string>()
      for (const m of mats ?? []) mapa.set(`maternidades:${m.id}`, m.sigla)
      for (const p of pacs ?? []) mapa.set(`pacotes:${p.id}`, p.nome)
      for (const p of pes ?? []) mapa.set(`pessoas:${p.id}`, p.nome)
      return mapa
    },
  })
}

export function useResumoDaOperacao(filtros: FiltrosDaOperacao) {
  const f = paraOBanco(filtros)
  return useQuery({
    queryKey: ['operacao', 'resumo', f],
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<ResumoDaOperacao> => {
      const linhas = await chamar(supabase.rpc('operacao_resumo', { p_filtros: f as Json }))
      const l = linhas?.[0]
      return {
        casos: l?.casos ?? 0,
        partos: l?.partos ?? 0,
        enviados: l?.enviados ?? 0,
        noPrazo: l?.no_prazo ?? 0,
        medianaHorasAteEnvio: numero(l?.mediana_horas_ate_envio),
        totalDespesas: numero(l?.total_despesas) ?? 0,
        cancelados: l?.cancelados ?? 0,
      }
    },
  })
}

/**
 * O RECORTE QUEBRADO para o gráfico: no tempo (dia ou mês) ou por uma dimensão.
 * Só busca com a visão de gráfico aberta — a lista de casos não precisa dele.
 */
export function useGraficoDaOperacao(filtros: FiltrosDaOperacao, eixo: EixoDoBanco, habilitado: boolean) {
  const f = paraOBanco(filtros)
  return useQuery({
    queryKey: ['operacao', 'grafico', f, eixo],
    enabled: habilitado,
    placeholderData: keepPreviousData,
    queryFn: () => lerGraficoDaOperacao(filtros, eixo),
  })
}

export type EixoDoBanco = Exclude<Eixo, 'tempo'> | 'dia' | 'mes'

export async function lerGraficoDaOperacao(filtros: FiltrosDaOperacao, eixo: EixoDoBanco): Promise<LinhaDoGrafico[]> {
  const linhas = await chamar(
    supabase.rpc('operacao_grafico', { p_filtros: paraOBanco(filtros) as Json, p_eixo: eixo }),
  )
  return (linhas ?? []).map((l) => ({
    chave: l.chave,
    rotulo: l.rotulo,
    casos: l.casos,
    partos: l.partos,
    enviados: l.enviados,
    noPrazo: l.no_prazo,
    medianaHorasAteEnvio: numero(l.mediana_horas_ate_envio),
    totalDespesas: numero(l.total_despesas) ?? 0,
    cancelados: l.cancelados,
  }))
}

/**
 * TODOS os casos do recorte, para a planilha: a lista da tela é de 50 em 50, e
 * a exportação vai de 200 em 200 (o teto da função) até o total. A ordenação é
 * total no banco (id no fim), então nenhuma página repete ou pula caso.
 */
export async function lerTodosOsCasos(filtros: FiltrosDaOperacao, ordem: Ordem): Promise<CasoDaOperacao[]> {
  const LOTE = 200
  const todos: CasoDaOperacao[] = []
  for (let deslocamento = 0; ; deslocamento += LOTE) {
    const linhas = await chamar(
      supabase.rpc('operacao_buscar', {
        p_filtros: paraOBanco(filtros) as Json,
        p_ordem: ordem,
        p_limite: LOTE,
        p_deslocamento: deslocamento,
      }),
    )
    todos.push(...(linhas ?? []).map(paraCaso))
    const total = linhas?.[0]?.total ?? 0
    if (!linhas || linhas.length === 0 || todos.length >= total) break
  }
  return todos
}
