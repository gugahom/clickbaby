import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { ContextoAuth, type EstadoAuth, type PessoaLogada } from './contexto'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [carregando, setCarregando] = useState(true)
  const [session, setSession] = useState<Session | null>(null)
  const [pessoa, setPessoa] = useState<PessoaLogada | null>(null)

  useEffect(() => {
    let ativo = true

    async function resolverPessoa(s: Session | null) {
      if (!s) {
        if (ativo) {
          setPessoa(null)
          setCarregando(false)
        }
        return
      }

      const { data } = await supabase
        .from('pessoas')
        .select('id, nome, papel_sistema')
        .eq('auth_user_id', s.user.id)
        .maybeSingle()

      if (!ativo) return
      setPessoa(
        data ? { id: data.id, nome: data.nome, papelSistema: data.papel_sistema } : null,
      )
      setCarregando(false)
    }

    supabase.auth.getSession().then(({ data }) => {
      if (!ativo) return
      setSession(data.session)
      void resolverPessoa(data.session)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_evento, novaSession) => {
      setSession(novaSession)
      setCarregando(true)
      void resolverPessoa(novaSession)
    })

    return () => {
      ativo = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const valor = useMemo<EstadoAuth>(
    () => ({
      carregando,
      session,
      pessoa,
      sair: async () => {
        const { error } = await supabase.auth.signOut()
        // Sessão órfã: o JWT ainda é válido (é stateless, dura até expirar),
        // mas o usuário não existe mais no servidor — acontece sempre que um
        // `db reset` recria auth.users com ids novos. Nesse caso o /logout
        // falha e o supabase-js PRESERVA o token local, prendendo a pessoa
        // exatamente na tela que existe para tirá-la desse estado.
        // scope 'local' descarta o token sem depender do servidor.
        if (error) await supabase.auth.signOut({ scope: 'local' })
      },
    }),
    [carregando, session, pessoa],
  )

  return <ContextoAuth value={valor}>{children}</ContextoAuth>
}
