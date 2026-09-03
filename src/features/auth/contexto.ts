import { createContext, use } from 'react'
import type { Session } from '@supabase/supabase-js'

/** A pessoa do domínio vinculada ao usuário autenticado. */
export interface PessoaLogada {
  id: string
  nome: string
  papelSistema: string
  /**
   * Caminho do avatar no bucket, não URL — o bucket é privado e a URL se
   * assina na hora (ver `useUrlDaFoto`). `null` enquanto ninguém subiu foto.
   */
  fotoPath: string | null
}

/** Recarrega a pessoa do banco. Depois de trocar a foto, é o que atualiza o chip. */
export type Recarregar = () => Promise<void>

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
  /**
   * Relê `pessoas` para a sessão atual. Existe porque a foto de perfil muda
   * fora deste provedor e o chip do cabeçalho lê daqui — sem isto, trocar o
   * retrato só apareceria no próximo login.
   */
  recarregarPessoa: Recarregar
  sair: () => Promise<void>
}

export const ContextoAuth = createContext<EstadoAuth | null>(null)

export function useAuth(): EstadoAuth {
  const ctx = use(ContextoAuth)
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>')
  return ctx
}
