import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface PacoteOpcao {
  id: string
  nome: string
  /** Para o termo sugerido do BIRTH (`termoSugerido`), que olha o slug. */
  slug: string
  /** A cor do evento no Google, quando o pacote tem uma (os dois BIRTH). */
  cor_calendar: string | null
}

export interface MaternidadeOpcao {
  id: string
  sigla: string
  nome: string
  /** A cor do evento no Google para esta maternidade. */
  cor_calendar: string | null
}

/**
 * Pacotes e maternidades para os seletores de completar rascunho e de criar
 * caso pelo calendário (que também lê a cor de cada um).
 *
 * Cadastro muda em escala de meses, então o cache é longo. Não entra na query
 * do Quadro porque não muda com ela: o Quadro invalida a cada ação, e
 * recarregar 9 pacotes junto seria desperdício a cada toque de botão.
 *
 * Só é buscado quando alguém abre o editor — daí `enabled`.
 */
export function useCadastros(ativo: boolean) {
  return useQuery({
    queryKey: ['cadastros'],
    enabled: ativo,
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const [pacotes, maternidades] = await Promise.all([
        supabase.from('pacotes').select('id, nome, slug, cor_calendar').eq('ativo', true).order('nome'),
        supabase.from('maternidades').select('id, sigla, nome, cor_calendar').eq('ativo', true).order('sigla'),
      ])
      if (pacotes.error) throw pacotes.error
      if (maternidades.error) throw maternidades.error
      return {
        pacotes: (pacotes.data ?? []) as PacoteOpcao[],
        maternidades: (maternidades.data ?? []) as MaternidadeOpcao[],
      }
    },
  })
}
