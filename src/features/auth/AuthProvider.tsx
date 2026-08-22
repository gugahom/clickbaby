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
        await supabase.auth.signOut()
      },
    }),
    [carregando, session, pessoa],
  )

  return <ContextoAuth value={valor}>{children}</ContextoAuth>
}
