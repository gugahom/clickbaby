import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { EtapaTipo, FaseCampo } from '@/features/quadro/types'
import type { Json } from '@/types/database'
import type { ItemDePontuacao } from '../lib/pontos'

/**
 * AS MÉTRICAS DAS PESSOAS — a leitura do relatório interno.
 *
 * Toda soma vem PRONTA do banco (migration 20260929020655): a tela não conta
 * etapa nenhuma, só desenha. É a regra do relatório de despesas — "toda soma de
 * mais de um caso é do banco" — pelo mesmo motivo: a conta feita no cliente
 * dependeria de a lista ter vindo inteira.
 *
 * SEM PAGINAÇÃO, e por conta: as funções devolvem linhas por PESSOA e TIPO (ou
 * por pedaço do período), não por caso. Com a equipe de hoje são ~200 linhas
 * no pior caso, e a série tem no máximo 62. O teto de mil do PostgREST só vira
 * assunto se a equipe passar de ~80 pessoas.
 *
 * SÓ A GESTÃO. As funções recusam os outros papéis no banco; a tela nem as
 * chama fora da `RotaDeGestao`.
 */

export interface Periodo {
  /** 'YYYY-MM-DD', Brasília. */
  inicio: string
  /** 'YYYY-MM-DD', Brasília, INCLUSIVO. */
  fim: string
}

export interface MetricaPorEtapa {
  pessoaId: string
  tipo: EtapaTipo
  concluidas: number
  /** Com relógio de verdade: ciclo líquido ≥ 5 min. */
  medidas: number
  /** Mediana do tempo líquido das medidas; nulo sem nenhuma. */
  medianaMin: number | null
  somaMin: number
  comPrazo: number
  noPrazo: number
  /** Quem clicou concluir foi outra pessoa (registro feito no lugar dela). */
  concluidasPorOutra: number
  /** Campo cruzado no tempo com outra etapa do mesmo tipo, dela, em outro caso. */
  emParalelo: number
}

export interface MetricaDaEquipe {
  tipo: EtapaTipo
  concluidas: number
  medidas: number
  pessoas: number
  medianaMin: number | null
  p25Min: number | null
  p75Min: number | null
}

export interface MetricaPorPessoa {
  pessoaId: string
  nome: string
  papel: string
  ativo: boolean
  diasComTrabalho: number
  passagensDadas: number
  passagensRecebidas: number
  materialBaixou: number
  materialSubiu: number
  atribuicoesFeitas: number
  entregasConfirmadas: number
  termosRegistrados: number
  avaliacoesFeitas: number
  voltouParaAjuste: number
}

export interface PadraoDeTempo {
  tipo: EtapaTipo
  minutos: number
  vigenteDesde: string
}

/** numeric chega como número ou string conforme o driver; nulo continua nulo. */
function numero(valor: number | string | null | undefined): number | null {
  if (valor === null || valor === undefined) return null
  const n = typeof valor === 'number' ? valor : Number(valor)
  return Number.isNaN(n) ? null : n
}

async function chamar<T>(consulta: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await consulta
  if (error) throw new Error(error.message)
  return data as T
}

const CHAVE = 'metricas'

export function useMetricasPorEtapa({ inicio, fim }: Periodo) {
  return useQuery({
    queryKey: [CHAVE, 'por-etapa', inicio, fim],
    // TROCAR DE MÊS NÃO PISCA A TELA: o quadro anterior fica, esmaecido, até o
    // novo chegar — sem esqueleto, sem pulo de layout. Vale para todas abaixo.
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<MetricaPorEtapa[]> => {
      const linhas = await chamar(supabase.rpc('metricas_por_etapa', { p_inicio: inicio, p_fim: fim }))
      return (linhas ?? []).map((l) => ({
        pessoaId: l.pessoa_id,
        tipo: l.tipo,
        concluidas: l.concluidas,
        medidas: l.medidas,
        medianaMin: numero(l.mediana_min),
        somaMin: numero(l.soma_min) ?? 0,
        comPrazo: l.com_prazo,
        noPrazo: l.no_prazo,
        concluidasPorOutra: l.concluidas_por_outra,
        emParalelo: l.em_paralelo,
      }))
    },
  })
}

export function useMetricasDaEquipe({ inicio, fim }: Periodo) {
  return useQuery({
    queryKey: [CHAVE, 'equipe', inicio, fim],
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<MetricaDaEquipe[]> => {
      const linhas = await chamar(supabase.rpc('metricas_da_equipe_por_etapa', { p_inicio: inicio, p_fim: fim }))
      return (linhas ?? []).map((l) => ({
        tipo: l.tipo,
        concluidas: l.concluidas,
        medidas: l.medidas,
        pessoas: l.pessoas,
        medianaMin: numero(l.mediana_min),
        p25Min: numero(l.p25_min),
        p75Min: numero(l.p75_min),
      }))
    },
  })
}

export function useMetricasPorPessoa({ inicio, fim }: Periodo) {
  return useQuery({
    queryKey: [CHAVE, 'por-pessoa', inicio, fim],
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<MetricaPorPessoa[]> => {
      const linhas = await chamar(supabase.rpc('metricas_por_pessoa', { p_inicio: inicio, p_fim: fim }))
      return (linhas ?? []).map((l) => ({
        pessoaId: l.pessoa_id,
        nome: l.nome,
        papel: l.papel_sistema,
        ativo: l.ativo,
        diasComTrabalho: l.dias_com_trabalho,
        passagensDadas: l.passagens_dadas,
        passagensRecebidas: l.passagens_recebidas,
        materialBaixou: l.material_baixou,
        materialSubiu: l.material_subiu,
        atribuicoesFeitas: l.atribuicoes_feitas,
        entregasConfirmadas: l.entregas_confirmadas,
        termosRegistrados: l.termos_registrados,
        avaliacoesFeitas: l.avaliacoes_feitas,
        voltouParaAjuste: l.voltou_para_ajuste,
      }))
    },
  })
}

/** O que a série traz de cada tipo de etapa num pedaço do período. */
export interface DadosDoTipo {
  concluidas: number
  medidas: number
  medianaMin: number | null
}

/**
 * Um pedaço do período com tudo o que os seis cartões precisam — ver
 * `metricas_serie_da_equipe` (migration 20260929053020). O cartão, a
 * mini-linha e o gráfico leem a MESMA função, e por isso não discordam.
 */
export interface BaldeDaSerie {
  /** 'YYYY-MM-DD', Brasília, inclusivo nos dois lados. */
  inicio: string
  fim: string
  enviados: number
  noPrazo: number
  medianaHorasAteEnvio: number | null
  medianaHorasAteConfirmacao: number | null
  porTipo: Partial<Record<EtapaTipo, DadosDoTipo>>
  voltouParaAjuste: number
}

/**
 * 'dia' — um pedaço por dia (a semana e os 30 dias do gráfico).
 * 'bloco' — 7 dias contados do começo, o último absorve a sobra (1–7, 8–14,
 * 15–21, 22–fim); é a mini-linha do cartão.
 * 'mes' — meses do calendário (o número do cartão e o último ano do gráfico).
 * 'periodo' — o período inteiro num pedaço só (o selo do gráfico: mediana não
 * sai da soma dos dias).
 */
export type Grao = 'dia' | 'bloco' | 'mes' | 'periodo'

function objeto(valor: Json | undefined): { [chave: string]: Json | undefined } | null {
  return valor !== null && typeof valor === 'object' && !Array.isArray(valor) ? valor : null
}

function lerPorTipo(json: Json): Partial<Record<EtapaTipo, DadosDoTipo>> {
  const saida: Partial<Record<EtapaTipo, DadosDoTipo>> = {}
  for (const [tipo, valor] of Object.entries(objeto(json) ?? {})) {
    const v = objeto(valor)
    if (!v) continue
    saida[tipo as EtapaTipo] = {
      concluidas: numero(v.concluidas as number | string | null) ?? 0,
      medidas: numero(v.medidas as number | string | null) ?? 0,
      medianaMin: numero(v.mediana_min as number | string | null),
    }
  }
  return saida
}

/**
 * A série da equipe — ou da produção de uma pessoa. Sem período, não consulta:
 * é como a tela diz "não há o que comparar" (antes de 01/10/2026, por exemplo).
 */
export function useSerieDaEquipe(periodo: Periodo | null, grao: Grao, pessoaId: string | null = null) {
  return useQuery({
    queryKey: [CHAVE, 'serie', grao, periodo?.inicio, periodo?.fim, pessoaId],
    enabled: periodo !== null,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<BaldeDaSerie[]> => {
      if (!periodo) return []
      const linhas = await chamar(
        supabase.rpc('metricas_serie_da_equipe', {
          p_inicio: periodo.inicio,
          p_fim: periodo.fim,
          p_grao: grao,
          // Sem pessoa, a equipe inteira. Com pessoa, a PRODUÇÃO é só dela —
          // o prazo continua da equipe (é fato do caso, não de uma pessoa).
          ...(pessoaId ? { p_pessoa_id: pessoaId } : {}),
        }),
      )
      return (linhas ?? []).map((l) => ({
        inicio: l.inicio,
        fim: l.fim,
        enviados: l.enviados,
        noPrazo: l.no_prazo,
        medianaHorasAteEnvio: numero(l.mediana_horas_ate_envio),
        medianaHorasAteConfirmacao: numero(l.mediana_horas_ate_confirmacao),
        porTipo: lerPorTipo(l.por_tipo),
        voltouParaAjuste: l.voltou_para_ajuste,
      }))
    },
  })
}

/**
 * Quanto tempo cada pessoa passa em cada fase do campo, por etapa concluída —
 * ver `metricas_fases_de_campo` (migration 20260929092831).
 */
export interface FaseDaPessoa {
  pessoaId: string
  tipo: EtapaTipo
  fase: FaseCampo
  /** Etapas em que a fase foi declarada. */
  etapas: number
  somaMin: number
  mediaMin: number | null
}

export function useFasesDeCampo({ inicio, fim }: Periodo) {
  return useQuery({
    queryKey: [CHAVE, 'fases', inicio, fim],
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<FaseDaPessoa[]> => {
      const linhas = await chamar(supabase.rpc('metricas_fases_de_campo', { p_inicio: inicio, p_fim: fim }))
      return (linhas ?? []).map((l) => ({
        pessoaId: l.pessoa_id,
        tipo: l.etapa_tipo,
        fase: l.fase,
        etapas: l.etapas,
        somaMin: numero(l.soma_min) ?? 0,
        mediaMin: numero(l.media_min),
      }))
    },
  })
}

/**
 * O RANKING POR PONTOS — ver `metricas_pontos_por_pessoa` (migration
 * 20260929210556). Os pontos já vêm DIVIDIDOS entre quem pôs a mão na etapa.
 */
export interface PontosDaPessoa {
  pessoaId: string
  item: ItemDePontuacao
  /** Etapas em que a pessoa pôs a mão. */
  etapas: number
  /** Dessas, quantas dividiu com alguém. */
  divididas: number
  pontos: number
}

export function usePontosPorPessoa({ inicio, fim }: Periodo) {
  return useQuery({
    queryKey: [CHAVE, 'pontos', inicio, fim],
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<PontosDaPessoa[]> => {
      const linhas = await chamar(supabase.rpc('metricas_pontos_por_pessoa', { p_inicio: inicio, p_fim: fim }))
      return (linhas ?? []).map((l) => ({
        pessoaId: l.pessoa_id,
        item: l.item,
        etapas: l.etapas,
        divididas: l.divididas,
        pontos: numero(l.pontos) ?? 0,
      }))
    },
  })
}

export interface PesoDoItem {
  item: ItemDePontuacao
  pontos: number
  vigenteDesde: string
}

/** A régua de pontos em vigor. */
export function usePesosDosItens() {
  return useQuery({
    queryKey: [CHAVE, 'pesos'],
    queryFn: async (): Promise<PesoDoItem[]> => {
      const linhas = await chamar(supabase.rpc('pontos_por_item_vigentes'))
      return (linhas ?? []).map((l) => ({
        item: l.item,
        pontos: numero(l.pontos) ?? 0,
        vigenteDesde: l.vigente_desde,
      }))
    },
  })
}

/**
 * Muda o peso de um item, valendo de hoje em diante (no mesmo dia, corrige). O
 * ranking inteiro depende disto, então as duas consultas voltam a ser lidas.
 */
export function useDefinirPesoDoItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ item, pontos }: { item: ItemDePontuacao; pontos: number }) => {
      await chamar(supabase.rpc('definir_pontos_do_item', { p_item: item, p_pontos: pontos }))
    },
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: [CHAVE, 'pesos'] }),
        queryClient.invalidateQueries({ queryKey: [CHAVE, 'pontos'] }),
      ]),
  })
}

export function usePadroesDeTempo() {
  return useQuery({
    queryKey: [CHAVE, 'padroes'],
    queryFn: async (): Promise<PadraoDeTempo[]> => {
      const linhas = await chamar(supabase.rpc('padroes_de_tempo'))
      return (linhas ?? []).map((l) => ({
        tipo: l.etapa_tipo,
        minutos: l.minutos_esperados,
        vigenteDesde: l.vigente_desde,
      }))
    },
  })
}

/**
 * Define a régua de uma etapa, valendo a partir de hoje. No mesmo dia,
 * substitui (é correção); depois, é linha nova e a anterior fica no histórico.
 */
export function useDefinirPadrao() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ tipo, minutos }: { tipo: EtapaTipo; minutos: number }) => {
      await chamar(supabase.rpc('definir_padrao_de_tempo', { p_etapa_tipo: tipo, p_minutos: minutos }))
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [CHAVE, 'padroes'] }),
  })
}
