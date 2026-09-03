import { useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface TrocaDeSenha {
  email: string
  senhaAtual: string
  senhaNova: string
}

/** O GoTrue recusa menos que isto, e a recusa dele vem em inglês. */
export const TAMANHO_MINIMO_SENHA = 8

/**
 * Troca a senha da própria conta.
 *
 * PEDE A SENHA ATUAL, e o Supabase não exige isso — `updateUser({ password })`
 * troca com a sessão em mãos, ponto. A exigência é nossa e vem da seção 6 do
 * CLAUDE.md: os seis CEL CLICK trocam de mão a cada turno e a sessão fica
 * aberta. Sem esta conferência, qualquer pessoa que pegasse o aparelho
 * destravado trocaria a senha de quem estava logado e a trancaria para fora do
 * sistema no meio de um plantão.
 *
 * A conferência é um `signInWithPassword` com a senha atual. Ele revalida a
 * credencial no servidor — não dá para burlar pelo DevTools, como daria uma
 * comparação feita aqui — e, de quebra, renova a sessão antes da troca.
 *
 * O QUE ELA NÃO FAZ: marcar que a senha inicial foi trocada. As onze contas
 * nasceram com a mesma senha combinada, e hoje a troca é acordo, não trava. O
 * sistema não força porque o GoTrue não tem esse gesto nativo — forjá-lo pede
 * uma coluna em `pessoas` e uma guarda de rota. Está registrado como pendência.
 */
export function useTrocarSenha() {
  return useMutation({
    mutationFn: async ({ email, senhaAtual, senhaNova }: TrocaDeSenha) => {
      if (senhaNova.length < TAMANHO_MINIMO_SENHA) {
        throw new Error(
          `A senha nova precisa de pelo menos ${TAMANHO_MINIMO_SENHA} caracteres.`,
        )
      }
      if (senhaNova === senhaAtual) {
        throw new Error('A senha nova é igual à atual.')
      }

      const { error: erroConfere } = await supabase.auth.signInWithPassword({
        email,
        password: senhaAtual,
      })
      if (erroConfere) throw new Error('Senha atual incorreta.')

      const { error } = await supabase.auth.updateUser({ password: senhaNova })
      if (error) throw new Error(error.message)
    },
  })
}
