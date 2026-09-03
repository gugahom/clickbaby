import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router'
import { Botao } from '@/components/ui/Botao'
import { Logo } from '@/components/ui/Logo'
import { ehAmbienteLocal, supabase } from '@/lib/supabase'
import { useAuth } from './contexto'
import { CampoTexto } from '@/components/ui/CampoTexto'

/**
 * Login mínimo: email + senha (fase 0 da seção 8 do CLAUDE.md).
 *
 * O login por PIN da fase 1 depende de Edge Function com service_role e não
 * entra nesta fatia.
 *
 * A tela inteira é a marca: o chão pastel do body aparece cheio aqui, sem
 * lista por cima, e o cartão branco com o logo centralizado é a única coisa
 * na tela. É o único momento do produto em que dá para respirar — o resto é
 * corredor de maternidade às 3h.
 */
export function LoginPage() {
  const { session, carregando } = useAuth()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  if (!carregando && session) return <Navigate to="/" replace />

  async function entrar(e: FormEvent) {
    e.preventDefault()
    setEnviando(true)
    setErro(null)

    const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
    if (error) setErro(error.message)
    setEnviando(false)
  }

  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <form
        onSubmit={entrar}
        className="w-full max-w-[26rem] rounded-cartao border border-border bg-card p-7 shadow-painel md:p-9"
      >
        <div className="flex flex-col items-center text-center">
          <Logo className="h-14 max-w-[15rem] md:h-16 md:max-w-[17rem]" prioridade />
          <p className="mt-5 text-sm text-muted-foreground">Entre para ver o Quadro.</p>
          {ehAmbienteLocal && (
            <span className="mt-2 rounded bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
              ambiente: LOCAL
            </span>
          )}
        </div>

        <div className="mt-7 space-y-4">
          {/* O MESMO CampoTexto do resto do app, e não um campo privado desta
              tela. Ele tinha uma cópia local idêntica, que ficou para trás
              quando o campo compartilhado ganhou o olhinho de revelar senha —
              e o login é justamente onde ele mais serve: a senha inicial da
              equipe tem maiúscula, número e arroba, digitados num teclado de
              celular que troca de layout entre as três coisas. */}
          <CampoTexto
            rotulo="Email"
            type="email"
            required
            autoComplete="username"
            valor={email}
            aoMudar={setEmail}
          />
          <CampoTexto
            rotulo="Senha"
            type="password"
            required
            autoComplete="current-password"
            valor={senha}
            aoMudar={setSenha}
          />

          {erro && (
            <p
              role="alert"
              className="rounded-md border border-atrasado/30 bg-atrasado/8 px-3 py-2 text-sm text-atrasado"
            >
              {erro}
            </p>
          )}

          <Botao type="submit" variante="primario" disabled={enviando} className="w-full">
            {enviando ? 'Entrando…' : 'Entrar'}
          </Botao>
        </div>
      </form>
    </div>
  )
}
