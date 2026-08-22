import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router'
import { Botao } from '@/components/ui/Botao'
import { ehAmbienteLocal, supabase } from '@/lib/supabase'
import { useAuth } from './contexto'

/**
 * Login mínimo: email + senha (fase 0 da seção 8 do CLAUDE.md).
 *
 * O login por PIN da fase 1 depende de Edge Function com service_role e não
 * entra nesta fatia.
 */
export function LoginPage() {
  const { session, carregando } = useAuth()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  if (!carregando && session) return <Navigate to="/quadro" replace />

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
        className="w-full max-w-sm space-y-4 rounded-md border border-border bg-card p-6"
      >
        <div>
          <h1 className="text-xl font-bold">Clickbaby</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Entre para ver o Quadro.
            {ehAmbienteLocal && (
              <span className="mt-1 block font-mono text-xs">ambiente: LOCAL</span>
            )}
          </p>
        </div>

        <label className="block">
          <span className="text-sm font-medium">Email</span>
          <input
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 min-h-11 w-full rounded-md border border-border bg-background px-3 text-base"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium">Senha</span>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            className="mt-1 min-h-11 w-full rounded-md border border-border bg-background px-3 text-base"
          />
        </label>

        {erro && <p className="text-sm text-atrasado">{erro}</p>}

        <Botao
          type="submit"
          variante="primario"
          disabled={enviando}
          className="w-full"
        >
          {enviando ? 'Entrando…' : 'Entrar'}
        </Botao>
      </form>
    </div>
  )
}
