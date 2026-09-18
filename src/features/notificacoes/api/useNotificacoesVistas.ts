import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * AS DUAS MARCAS DO SINO — uma linha por pessoa, legível só por ela (migrations
 * 20260917215442 e 20260918083153).
 *
 * A LISTA de notificações não vem daqui: ela é derivada do Quadro (ver
 * `lib/derivar.ts`). O que vem daqui são dois carimbos:
 *
 *   `vistoEm`         separa "novidade" de "eu já sei disso" — é o que acende o
 *                     contador.
 *   `geraisLimpasEm`  esconde as GERAIS nascidas até ali — é o "Limpar gerais".
 *
 * A RLS filtra para a própria linha, então `maybeSingle` é honesto: ou existe
 * a minha, ou não existe nenhuma (quem nunca abriu o sino).
 */
export interface MarcasDoSino {
  vistoEm: string | null
  geraisLimpasEm: string | null
}

const CHAVE = ['notificacoes', 'marcas'] as const

export function useMarcasDoSino() {
  return useQuery({
    queryKey: CHAVE,
    queryFn: async (): Promise<MarcasDoSino> => {
      const { data, error } = await supabase
        .from('notificacoes_vistas')
        .select('visto_em, gerais_limpas_em')
        .maybeSingle()

      if (error) throw error
      return {
        vistoEm: data?.visto_em ?? null,
        geraisLimpasEm: data?.gerais_limpas_em ?? null,
      }
    },
    // Não tem por que revalidar sozinha: quem a muda é esta aba, no gesto de
    // abrir ou limpar o sino. O carimbo de outra aba chega no próximo
    // carregamento.
    staleTime: Infinity,
  })
}

/**
 * Os carimbos voltam do SERVIDOR e são eles que entram no cache. Usar
 * `new Date()` do aparelho aqui apagaria o pulso — ou esconderia gerais — de
 * coisas que ainda nem aconteceram, num celular com a hora adiantada; e os seis
 * CEL CLICK trocam de mão o tempo todo (invariante 3.4).
 */
export function useMarcarVistas() {
  const cliente = useQueryClient()

  return useMutation({
    mutationFn: async (): Promise<string> => {
      const { data, error } = await supabase.rpc('marcar_notificacoes_vistas')
      if (error) throw error
      return data as string
    },
    onSuccess: (vistoEm) =>
      cliente.setQueryData<MarcasDoSino>(CHAVE, (atual) => ({
        geraisLimpasEm: atual?.geraisLimpasEm ?? null,
        vistoEm,
      })),
  })
}

/** "Limpar gerais": esconde as gerais que existem agora, e marca o sino como visto. */
export function useLimparGerais() {
  const cliente = useQueryClient()

  return useMutation({
    mutationFn: async (): Promise<string> => {
      const { data, error } = await supabase.rpc('limpar_notificacoes_gerais')
      if (error) throw error
      return data as string
    },
    onSuccess: (agora) =>
      cliente.setQueryData<MarcasDoSino>(CHAVE, { vistoEm: agora, geraisLimpasEm: agora }),
  })
}
