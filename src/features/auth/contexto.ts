import { createContext, use } from 'react'
import type { Session } from '@supabase/supabase-js'

/** A pessoa do domínio vinculada ao usuário autenticado. */
export interface PessoaLogada {
  id: string
  nome: string
  papelSistema: string
}

export interface EstadoAuth {
  carregando: boolean
  session: Session | null
  /**
   * null com sessão ativa significa "autenticado, mas SEM linha em pessoas".
   * Esse caso precisa de tratamento explícito: a RLS (eh_pessoa_ativa) devolve
   * zero linha em vez de erro, então sem esta distinção a tela apareceria
   * simplesmente vazia — o modo de falha mais confuso possível.
   */
  pessoa: PessoaLogada | null
  sair: () => Promise<void>
}

export const ContextoAuth = createContext<EstadoAuth | null>(null)

export function useAuth(): EstadoAuth {
  const ctx = use(ContextoAuth)
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>')
  return ctx
}
