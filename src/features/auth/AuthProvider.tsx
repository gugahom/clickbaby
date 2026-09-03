import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { ContextoAuth, type EstadoAuth, type PessoaLogada } from './contexto'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [carregando, setCarregando] = useState(true)
  const [session, setSession] = useState<Session | null>(null)
  const [pessoa, setPessoa] = useState<PessoaLogada | null>(null)

  /**
   * Qual usuário já está resolvido. Existe para separar "trocou de sessão" de
   * "renovou o token da mesma sessão" — ver o comentário em onAuthStateChange.
   */
  const usuarioResolvido = useRef<string | null>(null)

  useEffect(() => {
    let ativo = true

    async function resolverPessoa(s: Session | null) {
      if (!s) {
        if (ativo) {
          setPessoa(null)
          usuarioResolvido.current = null
          setCarregando(false)
        }
        return
      }

      const { data } = await supabase
        .from('pessoas')
        .select('id, nome, papel_sistema, foto_path')
        .eq('auth_user_id', s.user.id)
        .maybeSingle()

      if (!ativo) return
      setPessoa(
        data
          ? {
              id: data.id,
              nome: data.nome,
              papelSistema: data.papel_sistema,
              fotoPath: data.foto_path,
            }
          : null,
      )
      usuarioResolvido.current = s.user.id
      setCarregando(false)
    }

    supabase.auth.getSession().then(({ data }) => {
      if (!ativo) return
      setSession(data.session)
      void resolverPessoa(data.session)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_evento, novaSession) => {
      setSession(novaSession)

      /*
       * SÓ volta a "carregando" quando o USUÁRIO muda.
       *
       * onAuthStateChange dispara também para TOKEN_REFRESHED, que acontece
       * sozinho de tempos em tempos com a mesma pessoa logada. A versão
       * anterior fazia setCarregando(true) em todo evento — e como
       * RotaProtegida troca o <Outlet /> por "Verificando sessão…" enquanto
       * carrega, o Quadro inteiro era DESMONTADO e remontado a cada renovação
       * de token.
       *
       * O efeito: aba selecionada voltava para Lista, cards abertos fechavam,
       * e um diálogo a meio preenchimento sumia — em produção, calado, sem
       * erro em lugar nenhum. Descoberto porque a aba Reels não "grudava".
       *
       * A resolução da pessoa continua acontecendo (o vínculo pode ter mudado
       * do outro lado); o que não acontece mais é apagar a tela para isso.
       */
      const mudouDeUsuario = novaSession?.user.id !== usuarioResolvido.current
      if (mudouDeUsuario) setCarregando(true)

      void resolverPessoa(novaSession)
    })

    return () => {
      ativo = false
      sub.subscription.unsubscribe()
    }
  }, [])

  /**
   * Relê a pessoa do banco para a sessão atual.
   *
   * Fora do efeito de propósito: o efeito reage a mudança de SESSÃO, e trocar
   * a foto não muda sessão nenhuma. Sem este caminho, o retrato novo só
   * apareceria no chip do cabeçalho depois de sair e entrar.
   */
  const recarregarPessoa = useCallback(async () => {
    const { data: atual } = await supabase.auth.getSession()
    const s = atual.session
    if (!s) return

    const { data } = await supabase
      .from('pessoas')
      .select('id, nome, papel_sistema, foto_path')
      .eq('auth_user_id', s.user.id)
      .maybeSingle()

    setPessoa(
      data
        ? {
            id: data.id,
            nome: data.nome,
            papelSistema: data.papel_sistema,
            fotoPath: data.foto_path,
          }
        : null,
    )
  }, [])

  const valor = useMemo<EstadoAuth>(
    () => ({
      carregando,
      session,
      pessoa,
      recarregarPessoa,
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
    [carregando, session, pessoa, recarregarPessoa],
  )

  return <ContextoAuth value={valor}>{children}</ContextoAuth>
}
