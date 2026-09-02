import { useState } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { Botao } from '@/components/ui/Botao'
import { CampoTexto } from '@/components/ui/CampoTexto'
import { Alerta } from '@/components/ui/Alerta'
import { useAuth } from '@/features/auth/contexto'
import { TAMANHO_MINIMO_SENHA, useTrocarSenha } from './api/useTrocarSenha'

const ROTULO_PAPEL: Record<string, string> = {
  operador: 'Operação',
  comercial: 'Comercial',
  coordenacao: 'Coordenação',
  atendimento: 'Atendimento',
  financeiro: 'Financeiro',
  gestao: 'Gestão',
}

/**
 * A conta da própria pessoa.
 *
 * Ela nasce por causa de um problema concreto: as onze contas criadas em
 * 02/09/2026 saíram com a MESMA senha combinada, que circulou no grupo. Sem um
 * lugar para trocar, "troque a senha" seria um pedido sem gesto — e o sistema
 * guarda nome de mãe, de recém-nascido e situação clínica.
 *
 * O QUE AINDA NÃO DÁ PARA EDITAR AQUI, e o motivo, porque a tela precisa dizer
 * isso em vez de deixar a pessoa procurar um botão que não existe:
 *
 *   NOME e APELIDO. A policy de escrita em `pessoas` é `FOR ALL` para adm.
 *   Deixar cada um editar a própria linha por RLS abriria junto o
 *   `papel_sistema` — RLS não filtra coluna, quem filtra é o GRANT, e ele é
 *   por papel, não por policy. Ou seja: a mesma porta que deixaria a Ingrid
 *   corrigir o próprio nome a deixaria virar gestão. O caminho certo é uma RPC
 *   `atualizar_meu_perfil` que toca só as duas colunas — migration, não tela.
 *
 *   FOTO. Falta a coluna em `pessoas` e falta policy em `storage.objects`, que
 *   hoje nega tudo (dívida #5 do CLAUDE.md). A primeira policy de upload vai
 *   derrubar de propósito o teste `buckets_privados.test.sql` — ele existe
 *   para forçar a leitura da regra antes de alguém abrir um bucket sem querer.
 */
export function ContaPage() {
  const { pessoa, session } = useAuth()
  const email = session?.user.email ?? ''

  return (
    <div className="flex h-full flex-col">
      <header className="flex-shrink-0 border-b border-border/70 bg-background/80 px-3 py-4 backdrop-blur-md md:px-5">
        <p className="rotulo-sobrescrito text-acento">Sua conta</p>
        <h1 className="mt-0.5 text-lg font-extrabold tracking-tight md:text-2xl">
          {pessoa?.nome ?? 'Conta'}
        </h1>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 md:px-5">
        <div className="mx-auto max-w-xl space-y-4">
          <section className="rounded-cartao border border-border bg-card p-4 shadow-cartao">
            <div className="flex items-center gap-4">
              <Avatar
                nome={pessoa?.nome ?? '?'}
                tom="claro"
                className="size-14 text-base"
              />
              <div className="min-w-0">
                <p className="text-lg font-extrabold tracking-tight">
                  {pessoa?.nome}
                </p>
                <p className="truncate text-sm text-muted-foreground">{email}</p>
                <p className="mt-1">
                  <span className="rounded-full bg-marca-suave px-2 py-0.5 text-[11px] font-bold text-marca">
                    {ROTULO_PAPEL[pessoa?.papelSistema ?? ''] ?? pessoa?.papelSistema}
                  </span>
                </p>
              </div>
            </div>

            <p className="mt-4 border-t border-border/70 pt-3 text-xs text-muted-foreground">
              Nome, apelido e foto ainda não se editam por aqui — falta o
              caminho no banco para isso, e ele vem na próxima fatia. Para
              corrigir seu nome agora, fale com a gestão.
            </p>
          </section>

          <TrocarSenha email={email} />
        </div>
      </div>
    </div>
  )
}

function TrocarSenha({ email }: { email: string }) {
  const trocar = useTrocarSenha()
  const [atual, setAtual] = useState('')
  const [nova, setNova] = useState('')
  const [repetida, setRepetida] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [pronto, setPronto] = useState(false)

  const naoConfere = repetida !== '' && nova !== repetida
  const valido =
    atual !== '' && nova.length >= TAMANHO_MINIMO_SENHA && nova === repetida

  function salvar() {
    setErro(null)
    setPronto(false)
    trocar
      .mutateAsync({ email, senhaAtual: atual, senhaNova: nova })
      .then(() => {
        setPronto(true)
        setAtual('')
        setNova('')
        setRepetida('')
      })
      .catch((e: unknown) => setErro(e instanceof Error ? e.message : String(e)))
  }

  return (
    <section className="rounded-cartao border border-border bg-card p-4 shadow-cartao">
      <h2 className="font-extrabold tracking-tight">Trocar a senha</h2>
      <p className="mt-0.5 text-sm text-muted-foreground">
        Se você ainda usa a senha que a gestão entregou, troque agora — ela é a
        mesma para todo mundo.
      </p>

      <div className="mt-4 space-y-4">
        <CampoTexto
          rotulo="Senha atual"
          valor={atual}
          aoMudar={setAtual}
          type="password"
          autoComplete="current-password"
        />
        <CampoTexto
          rotulo="Senha nova"
          valor={nova}
          aoMudar={setNova}
          type="password"
          autoComplete="new-password"
          ajuda={`Pelo menos ${TAMANHO_MINIMO_SENHA} caracteres.`}
        />
        <CampoTexto
          rotulo="Repita a senha nova"
          valor={repetida}
          aoMudar={setRepetida}
          type="password"
          autoComplete="new-password"
          {...(naoConfere ? { ajuda: 'As duas não são iguais.' } : {})}
        />

        {erro && <Alerta onFechar={() => setErro(null)}>{erro}</Alerta>}

        {pronto && (
          <p className="rounded-md border border-concluido/25 bg-concluido/10 px-3 py-2 text-sm font-medium text-concluido-tinta">
            Senha trocada. Ela vale a partir do próximo login.
          </p>
        )}

        <Botao onClick={salvar} disabled={!valido || trocar.isPending} onda>
          {trocar.isPending ? 'Trocando…' : 'Trocar senha'}
        </Botao>
      </div>
    </section>
  )
}
