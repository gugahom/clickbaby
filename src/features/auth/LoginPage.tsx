import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router'
import { Botao } from '@/components/ui/Botao'
import { Logo } from '@/components/ui/Logo'
import { ehAmbienteLocal, supabase } from '@/lib/supabase'
import { useAuth } from './contexto'
import { CampoTexto } from '@/components/ui/CampoTexto'

/**
 * O domínio de todas as contas da empresa.
 *
 * Ele é SUFIXO FIXO no campo, não texto a digitar: quem entra escreve "ingrid"
 * e pronto. Catorze pessoas digitando "@clickbaby.com.br" num teclado de
 * celular, de pé num corredor, é catorze chances por turno de errar um ponto e
 * levar "credenciais inválidas" sem entender por quê.
 *
 * MAS UM E-MAIL COMPLETO CONTINUA PASSANDO: se o que foi digitado já tem "@",
 * ele vale como está. Sem essa saída, as contas de desenvolvimento
 * (`@clickbaby.local`) ficariam inalcançáveis, e no dia em que uma pessoa
 * entrar com endereço de outro domínio a tela não teria como aceitá-la.
 */
const DOMINIO = 'clickbaby.com.br'

function enderecoCompleto(digitado: string): string {
  const limpo = digitado.trim()
  return limpo.includes('@') ? limpo : `${limpo}@${DOMINIO}`
}

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

    const { error } = await supabase.auth.signInWithPassword({
      email: enderecoCompleto(email),
      password: senha,
    })
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
          <label className="block">
            <span className="text-sm font-medium">Email</span>
            <div className="mt-1.5 flex items-stretch">
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                // `text` e não `email`: com o domínio fora do campo, o valor
                // digitado não é um e-mail válido e a validação nativa recusaria
                // o envio de "ingrid". Quem monta o endereço é
                // `enderecoCompleto`, e quem o valida é o GoTrue.
                type="text"
                inputMode="email"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className="min-h-12 min-w-0 flex-1 rounded-l-md border border-r-0 border-border bg-background/60 px-3 text-base transition-colors focus:border-marca focus:bg-card"
              />
              <span className="inline-flex min-h-12 flex-shrink-0 items-center rounded-r-md border border-border bg-muted px-3 text-sm text-muted-foreground">
                @{DOMINIO}
              </span>
            </div>
            {/* Só no ambiente local: é onde as contas fogem do domínio, e onde
                alguém precisa saber que dá para escrever o endereço inteiro. */}
            {ehAmbienteLocal && (
              <span className="mt-1 block text-xs text-muted-foreground">
                Com “@” no que você digitar, o endereço vale como está.
              </span>
            )}
          </label>
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
