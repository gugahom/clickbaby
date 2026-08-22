import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // O Quadro vai ganhar Realtime numa fatia futura: o canal só precisará
      // chamar invalidateQueries(['quadro']). Enquanto isso, refetch ao voltar
      // para a aba cobre o caso do aparelho que ficou no bolso.
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
})
