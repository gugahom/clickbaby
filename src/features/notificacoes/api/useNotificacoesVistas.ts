import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * A MARCA DE "JÁ VI" — uma linha por pessoa, legível só por ela (migration
 * 20260917215442).
 *
 * A LISTA de notificações não vem daqui: ela é derivada do Quadro (ver
 * `lib/derivar.ts`). O que vem daqui é o carimbo que separa "novidade" de "eu
 * já sei disso" — e por isso é a única coisa do sino que o banco guarda.
 *
 * A RLS filtra para a própria linha, então `maybeSingle` é honesto: ou existe
 * a minha, ou não existe nenhuma (quem nunca abriu o sino).
 */
const CHAVE = ['notificacoes', 'visto'] as const

export function useVistoEm() {
  return useQuery({
    queryKey: CHAVE,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase
        .from('notificacoes_vistas')
        .select('visto_em')
        .maybeSingle()

      if (error) throw error
      return data?.visto_em ?? null
    },
    // Não tem por que revalidar sozinha: quem a muda é esta aba, no gesto de
    // abrir o sino. O carimbo de outra aba chega no próximo carregamento.
    staleTime: Infinity,
  })
}

export function useMarcarVistas() {
  const cliente = useQueryClient()

  return useMutation({
    mutationFn: async (): Promise<string> => {
      const { data, error } = await supabase.rpc('marcar_notificacoes_vistas')
      if (error) throw error
      return data as string
    },
    // O carimbo volta do SERVIDOR e é ele que entra no cache. Usar `new Date()`
    // do aparelho aqui apagaria o pulso de coisas que ainda nem aconteceram num
    // celular com a hora adiantada — e os seis CEL CLICK trocam de mão o tempo
    // todo (invariante 3.4).
    onSuccess: (vistoEm) => cliente.setQueryData(CHAVE, vistoEm),
  })
}
