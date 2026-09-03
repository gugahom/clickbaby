import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { ContextoAuth, type EstadoAuth, type PessoaLogada } from './contexto'

/**
 * A pessoa vinculada a um usuário — com um degrau para o dia em que o front vai
 * na frente do banco.
 *
 * ISTO NASCEU DE UMA QUEDA REAL (03/09/2026). O deploy que trouxe a foto de
 * perfil passou a pedir `pessoas.foto_path`, e o `db push` ficou para trás do
 * merge. A coluna não existia em produção; o PostgREST devolveu 42703, o
 * `data` veio nulo, e o app concluiu "esta pessoa não existe" — jogando TODAS
 * as contas na tela de "usuário sem pessoa vinculada". Ninguém entrou até a
 * migration subir.
 *
 * A leitura de coluna nova falhar não deveria trancar o sistema. Por isso a
 * segunda tentativa com o MÍNIMO — id, nome e papel, as três colunas que
 * existem desde a primeira migration e das quais a sessão depende. O que se
 * perde no degrau é o retrato; o que se ganha é que uma migration atrasada
 * volta a ser "faltou um recurso" em vez de "ninguém entra".
 *
 * NÃO É PARA VIVER COM DEFASAGEM. O degrau não conserta a defasagem, só troca o
 * modo de falha — quem conserta é o `db push` (e o workflow de CI que ainda não
 * existe, dívida #6). Se ele estiver sendo usado, alguma coisa está errada.
 */
async function buscarPessoa(authUserId: string): Promise<PessoaLogada | null> {
  const completa = await supabase
    .from('pessoas')
    .select('id, nome, papel_sistema, foto_path')
    .eq('auth_user_id', authUserId)
    .maybeSingle()

  if (!completa.error && completa.data) {
    return {
      id: completa.data.id,
      nome: completa.data.nome,
      papelSistema: completa.data.papel_sistema,
      fotoPath: completa.data.foto_path,
    }
  }

  // Sem erro e sem linha: o usuário realmente não tem pessoa vinculada. É o
  // estado que RotaProtegida explica na tela, e não deve virar degrau nenhum.
  if (!completa.error) return null

  const minima = await supabase
    .from('pessoas')
    .select('id, nome, papel_sistema')
    .eq('auth_user_id', authUserId)
    .maybeSingle()

  if (minima.error || !minima.data) return null

  return {
    id: minima.data.id,
    nome: minima.data.nome,
    papelSistema: minima.data.papel_sistema,
    fotoPath: null,
  }
}

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

      const encontrada = await buscarPessoa(s.user.id)

      if (!ativo) return
      setPessoa(encontrada)
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

    setPessoa(await buscarPessoa(s.user.id))
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
