import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { EtapaTipo } from '@/features/quadro/types'

/**
 * AS MÉTRICAS DAS PESSOAS — a leitura do relatório interno.
 *
 * Toda soma vem PRONTA do banco (migration 20260929020655): a tela não conta
 * etapa nenhuma, só desenha. É a regra do relatório de despesas — "toda soma de
 * mais de um caso é do banco" — pelo mesmo motivo: a conta feita no cliente
 * dependeria de a lista ter vindo inteira.
 *
 * SEM PAGINAÇÃO, e por conta: as funções devolvem linhas por PESSOA e TIPO (ou
 * por semana e tipo), não por caso. Com a equipe de hoje são ~200 linhas no
 * pior caso; um ano inteiro de semanas por tipo fica abaixo de 700. O teto de
 * mil do PostgREST só vira assunto se a equipe passar de ~80 pessoas.
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

export interface PrazoDaSemana {
  /** Segunda-feira da semana, 'YYYY-MM-DD'. */
  semana: string
  enviados: number
  noPrazo: number
  medianaHorasAteEnvio: number | null
  medianaHorasAteConfirmacao: number | null
}

export interface VolumeDaSemana {
  semana: string
  tipo: EtapaTipo
  concluidas: number
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

export function usePrazoPorSemana({ inicio, fim }: Periodo) {
  return useQuery({
    queryKey: [CHAVE, 'prazo-semana', inicio, fim],
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<PrazoDaSemana[]> => {
      const linhas = await chamar(supabase.rpc('metricas_prazo_por_semana', { p_inicio: inicio, p_fim: fim }))
      return (linhas ?? []).map((l) => ({
        semana: l.semana,
        enviados: l.enviados,
        noPrazo: l.no_prazo,
        medianaHorasAteEnvio: numero(l.mediana_horas_ate_envio),
        medianaHorasAteConfirmacao: numero(l.mediana_horas_ate_confirmacao),
      }))
    },
  })
}

export interface PrazoDoPeriodo {
  enviados: number
  noPrazo: number
  medianaHorasAteEnvio: number | null
  medianaHorasAteConfirmacao: number | null
}

/** O mesmo prazo, numa linha para o período inteiro — a mediana verdadeira do mês. */
export function usePrazoDoPeriodo({ inicio, fim }: Periodo) {
  return useQuery({
    queryKey: [CHAVE, 'prazo-periodo', inicio, fim],
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<PrazoDoPeriodo> => {
      const linhas = await chamar(supabase.rpc('metricas_prazo_do_periodo', { p_inicio: inicio, p_fim: fim }))
      const l = linhas?.[0]
      return {
        enviados: l?.enviados ?? 0,
        noPrazo: l?.no_prazo ?? 0,
        medianaHorasAteEnvio: numero(l?.mediana_horas_ate_envio),
        medianaHorasAteConfirmacao: numero(l?.mediana_horas_ate_confirmacao),
      }
    },
  })
}

export function useVolumePorSemana({ inicio, fim }: Periodo) {
  return useQuery({
    queryKey: [CHAVE, 'volume-semana', inicio, fim],
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<VolumeDaSemana[]> => {
      const linhas = await chamar(supabase.rpc('metricas_volume_por_semana', { p_inicio: inicio, p_fim: fim }))
      return (linhas ?? []).map((l) => ({ semana: l.semana, tipo: l.tipo, concluidas: l.concluidas }))
    },
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
