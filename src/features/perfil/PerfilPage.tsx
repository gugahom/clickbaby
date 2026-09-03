import { useState } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { Botao } from '@/components/ui/Botao'
import { CampoTexto } from '@/components/ui/CampoTexto'
import { Alerta } from '@/components/ui/Alerta'
import { IconeCaneta } from '@/components/ui/icones'
import { useAuth } from '@/features/auth/contexto'
import { ROTULO_PAPEL } from '@/features/equipe/lib/apresentacao'
import { TAMANHO_MINIMO_SENHA, useTrocarSenha } from './api/useTrocarSenha'

/**
 * O perfil da própria pessoa.
 *
 * Ela nasce por causa de um problema concreto: as onze contas criadas em
 * 02/09/2026 saíram com a MESMA senha combinada, que circulou no grupo. Sem um
 * lugar para trocar, "troque a senha" seria um pedido sem gesto — e o sistema
 * guarda nome de mãe, de recém-nascido e situação clínica.
 *
 * NÃO MOSTRA MÉTRICA. A versão anterior trazia os números da pessoa; saíram
 * junto com os da Equipe, pela mesma razão (ver FichaDaPessoa): ainda não está
 * acordado o que se mede.
 *
 * O QUE FALTA AQUI, e por quê — a tela diz isso em vez de deixar alguém
 * procurar um botão que não existe:
 *
 *   NOME e APELIDO. Precisam de uma RPC `atualizar_meu_perfil`. NÃO dá para
 *   resolver com policy: RLS não filtra coluna — quem filtra é o GRANT, e ele é
 *   por papel, não por policy —, então a mesma porta que deixaria alguém
 *   corrigir o próprio nome a deixaria mudar o próprio `papel_sistema`.
 *
 *   FOTO. Precisa da coluna em `pessoas`, de um bucket e da PRIMEIRA policy em
 *   `storage.objects` — que hoje nega tudo, e é o estado certo enquanto nada
 *   sobe arquivo (dívida #7). Essa primeira policy derruba de propósito o teste
 *   `buckets_privados.test.sql`: ele existe para forçar a leitura da regra
 *   antes de alguém abrir um bucket sem querer. É uma fatia com conversa, não
 *   um campo a mais.
 */
export function PerfilPage() {
  const { pessoa, session } = useAuth()
  const email = session?.user.email ?? ''

  return (
    <div className="flex h-full flex-col">
      <header className="flex-shrink-0 border-b border-border/70 bg-background/80 px-3 py-4 backdrop-blur-md md:px-5">
        <div className="mx-auto max-w-3xl">
          <p className="rotulo-sobrescrito text-acento">Seu perfil</p>
          <h1 className="mt-0.5 text-lg font-extrabold tracking-tight md:text-2xl">
            {pessoa?.nome ?? 'Perfil'}
          </h1>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 md:px-5">
        <div className="mx-auto max-w-3xl space-y-4">
          <section className="overflow-hidden rounded-cartao border border-border bg-card shadow-cartao">
            <div className="superficie-cabecalho flex items-center gap-4 px-4 py-5 text-white">
              <RetratoComCaneta nome={pessoa?.nome ?? '?'} />

              <div className="min-w-0">
                <p className="truncate text-xl font-extrabold tracking-tight">
                  {pessoa?.nome}
                </p>
                <p className="truncate text-sm text-white/70">{email}</p>
              </div>

              <span className="ml-auto flex-shrink-0 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-bold">
                {ROTULO_PAPEL[pessoa?.papelSistema ?? ''] ?? pessoa?.papelSistema}
              </span>
            </div>

            <p className="px-4 py-3 text-xs text-muted-foreground">
              Nome e apelido ainda não se editam por aqui — falta o caminho no
              banco, e ele vem na próxima fatia. Para corrigir seu nome agora,
              fale com a gestão.
            </p>
          </section>

          <TrocarSenha email={email} />
        </div>
      </div>
    </div>
  )
}

/**
 * O retrato com a canetinha — pedido do gestor, e ainda sem destino.
 *
 * A canetinha está aqui e DIZ que não funciona ainda, em vez de não existir.
 * As duas opções ruins seriam: um botão que abre um seletor de arquivo e
 * depois falha na hora de subir (a policy de `storage.objects` nega tudo hoje),
 * ou nenhum sinal de que a foto está a caminho. Um alvo desabilitado com o
 * motivo no `title` é honesto: mostra onde a função vai morar e não promete o
 * que o banco ainda não aceita.
 */
function RetratoComCaneta({ nome }: { nome: string }) {
  return (
    <div className="relative flex-shrink-0">
      <Avatar nome={nome} className="size-16 text-lg" />
      <span
        title="Foto de perfil ainda não disponível — falta a policy de upload no Storage."
        aria-label="Trocar foto (ainda não disponível)"
        className="absolute -right-1 -bottom-1 inline-flex size-7 cursor-not-allowed items-center justify-center rounded-full bg-white/90 text-marca-forte opacity-60 shadow-sm"
      >
        <IconeCaneta className="size-3.5" />
      </span>
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
  const valido = atual !== '' && nova.length >= TAMANHO_MINIMO_SENHA && nova === repetida

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

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <CampoTexto
          rotulo="Senha atual"
          valor={atual}
          aoMudar={setAtual}
          type="password"
          autoComplete="current-password"
        />
        <div className="hidden sm:block" />
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
      </div>

      <div className="mt-4 space-y-3">
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
