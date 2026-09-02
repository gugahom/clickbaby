import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { chavesEquipe } from './useEquipe'

export interface NovaPessoa {
  nome: string
  email: string
  apelidos: string[]
  papelSistema: string
}

/**
 * Cadastra pessoa pela Edge Function `admin-pessoas`.
 *
 * NÃO é `.insert()` em `pessoas`, e não é por capricho: uma linha em `pessoas`
 * sem `auth_user_id` é uma pessoa que existe no cadastro e não consegue entrar.
 * A conta de auth só nasce com a `service_role`, que não pode chegar ao front —
 * por isso a função. Ela cria as duas coisas na mesma chamada e desfaz a conta
 * se o cadastro falhar, para não sobrar usuário órfão.
 *
 * `functions.invoke` já manda o JWT da sessão no Authorization; é com ele que a
 * função confere se quem pede é da gestão.
 */
export function useCriarPessoa() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (nova: NovaPessoa) => {
      const { data, error } = await supabase.functions.invoke('admin-pessoas', {
        body: nova,
      })

      if (error) {
        // O corpo da resposta traz a mensagem em português que a função
        // escreveu ("Já existe uma conta com…"). Sem isto o usuário lê
        // "Edge Function returned a non-2xx status code", que não diz nada.
        const detalhe = await extrairErro(error)
        throw new Error(detalhe ?? error.message)
      }

      return data as { pessoa: { id: string; nome: string }; email: string }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: chavesEquipe.todos })
    },
  })
}

/** A mensagem que a função devolveu, se der para lê-la. */
async function extrairErro(error: unknown): Promise<string | null> {
  const contexto = (error as { context?: unknown }).context
  if (!(contexto instanceof Response)) return null
  try {
    const corpo = (await contexto.json()) as { erro?: unknown }
    return typeof corpo.erro === 'string' ? corpo.erro : null
  } catch {
    return null
  }
}
