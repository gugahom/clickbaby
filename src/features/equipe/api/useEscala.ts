import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'
import { chavesEquipe } from './useEquipe'

type Turno = Database['public']['Enums']['turno']

/**
 * A ESCALA DE PLANTÃO (30/09/2026, pedido do gestor: "a possibilidade de
 * colocar o plantão desse funcionário (…) vai ajudar nas métricas, quando o
 * gestor quiser ver que tal funcionário tem tantas horas e na verdade só fez
 * tantas horas de trabalho de fato").
 *
 * Mora na tabela `escalas`, que existe vazia desde o schema inicial. Um
 * plantão é um DIA com INÍCIO e FIM; o noturno termina no dia seguinte. É a
 * escala PLANEJADA — não é ponto (seção 9 do CLAUDE.md), e o sistema não
 * calcula jornada nem hora extra com ela.
 *
 * Escrita por INSERT e DELETE direto, como todo cadastro: a policy é de quem
 * tem a tela Equipe (migration 20260930232424). Não existe editar — plantão
 * trocado se apaga e se lança de novo, que é um toque em cada.
 */
export interface Plantao {
  id: string
  /** 'YYYY-MM-DD' do início. */
  data: string
  inicio: string
  fim: string
  turno: Turno
}

export const chavesEscala = {
  daPessoa: (pessoaId: string, de: string, ate: string) => [...chavesEquipe.todos, 'escala', pessoaId, de, ate] as const,
}

export function useEscalaDaPessoa(pessoaId: string, de: string, ate: string) {
  return useQuery({
    queryKey: chavesEscala.daPessoa(pessoaId, de, ate),
    queryFn: async (): Promise<Plantao[]> => {
      const { data, error } = await supabase
        .from('escalas')
        .select('id, data, inicio, fim, turno')
        .eq('pessoa_id', pessoaId)
        .gte('data', de)
        .lte('data', ate)
        .order('inicio')
        .order('id')
      if (error) throw error
      return data ?? []
    },
  })
}

/** Um plantão a lançar: o dia e as horas 'HH:MM' de Brasília. */
export interface NovoPlantao {
  data: string
  horaInicio: string
  horaFim: string
}

/** '2026-10-01' + 1 -> '2026-10-02'. Meio-dia UTC para o fuso não empurrar. */
export function somarDia(data: string, dias: number): string {
  const d = new Date(`${data}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

/**
 * O TURNO É DERIVADO do começo: de 6h às 17h59 é diurno, o resto é noturno. A
 * coluna existe desde o schema inicial (é parte da chave única — uma pessoa
 * não tem dois plantões diurnos no mesmo dia) e ninguém precisa escolhê-la.
 */
export function turnoDoInicio(horaInicio: string): Turno {
  const hora = Number(horaInicio.slice(0, 2))
  return hora >= 6 && hora < 18 ? 'diurno' : 'noturno'
}

/** Minutos do plantão; fim antes (ou igual) do início é no dia seguinte. */
export function duracaoEmMinutos(horaInicio: string, horaFim: string): number {
  const min = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5))
  const d = min(horaFim) - min(horaInicio)
  return d > 0 ? d : d + 24 * 60
}

export function useLancarPlantoes() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ pessoaId, plantoes }: { pessoaId: string; plantoes: NovoPlantao[] }) => {
      const linhas = plantoes.map((p) => {
        // 'HH:MM' compara como texto: fim antes do início é no dia seguinte.
        const viraODia = p.horaFim <= p.horaInicio
        return {
          pessoa_id: pessoaId,
          data: p.data,
          turno: turnoDoInicio(p.horaInicio),
          // Brasília não tem horário de verão desde 2019: o -03:00 é fixo.
          inicio: `${p.data}T${p.horaInicio}:00-03:00`,
          fim: `${viraODia ? somarDia(p.data, 1) : p.data}T${p.horaFim}:00-03:00`,
        }
      })
      // O que já existe (mesma pessoa, dia e turno) fica como está: repetir
      // um lançamento não duplica nem sobrescreve.
      const { error } = await supabase
        .from('escalas')
        .upsert(linhas, { onConflict: 'pessoa_id,data,turno', ignoreDuplicates: true })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [...chavesEquipe.todos, 'escala'] }),
  })
}

export function useRemoverPlantao() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('escalas').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [...chavesEquipe.todos, 'escala'] }),
  })
}
