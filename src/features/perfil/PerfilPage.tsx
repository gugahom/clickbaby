import { useRef, useState } from 'react'
import clsx from 'clsx'
import { Avatar } from '@/components/ui/Avatar'
import { Botao } from '@/components/ui/Botao'
import { CampoTexto } from '@/components/ui/CampoTexto'
import { Alerta } from '@/components/ui/Alerta'
import { IconeCaneta } from '@/components/ui/icones'
import { useAuth } from '@/features/auth/contexto'
import { ROTULO_PAPEL } from '@/features/equipe/lib/apresentacao'
import { TAMANHO_MINIMO_SENHA, useTrocarSenha } from './api/useTrocarSenha'
import { TIPOS_ACEITOS, useEnviarFoto, useUrlDaFoto } from './api/useFotoDePerfil'

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
 * A FOTO JÁ FUNCIONA (migration 20260903161526). Ela trouxe a primeira policy
 * de `storage.objects`, que até então negava tudo — o arquivo vai para o bucket
 * privado `avatares`, na pasta do próprio `auth.uid()`, e o caminho é gravado
 * por RPC porque RLS não filtra coluna. A URL nunca é guardada: bucket privado
 * se lê por link assinado de validade curta (seção 10).
 */
export function PerfilPage() {
  const { pessoa, session, recarregarPessoa } = useAuth()
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
              <RetratoComCaneta
                nome={pessoa?.nome ?? '?'}
                fotoPath={pessoa?.fotoPath ?? null}
                authUserId={session?.user.id ?? ''}
                aoTrocar={recarregarPessoa}
              />

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
 * O retrato com a canetinha.
 *
 * A canetinha É o alvo: um `<label>` amarrado a um `<input type="file">`
 * escondido. Sem o label, o input nativo apareceria como um botão de sistema
 * que não tem como ser estilizado e não caberia sobre o avatar.
 *
 * A VALIDAÇÃO ACONTECE ANTES DE SUBIR — tipo e tamanho — e depois de novo no
 * bucket, que tem os mesmos limites. Duas checagens porque a de cá dá a
 * mensagem em português na hora, e a de lá é a que vale mesmo se alguém
 * chamar o Storage por fora.
 */
function RetratoComCaneta({
  nome,
  fotoPath,
  authUserId,
  aoTrocar,
}: {
  nome: string
  fotoPath: string | null
  authUserId: string
  aoTrocar: () => Promise<void>
}) {
  const { data: url } = useUrlDaFoto(fotoPath)
  const enviar = useEnviarFoto()
  const [erro, setErro] = useState<string | null>(null)
  const entrada = useRef<HTMLInputElement>(null)

  function escolher(arquivo: File | undefined) {
    if (!arquivo) return
    setErro(null)
    enviar
      .mutateAsync({ arquivo, authUserId, anterior: fotoPath })
      .then(() => aoTrocar())
      .catch((e: unknown) => setErro(e instanceof Error ? e.message : String(e)))
      .finally(() => {
        // Sem isto, escolher o MESMO arquivo de novo depois de um erro não
        // dispara `change` — o input guarda o valor anterior.
        if (entrada.current) entrada.current.value = ''
      })
  }

  return (
    <div className="flex-shrink-0">
      <div className="relative">
        <Avatar nome={nome} fotoUrl={url ?? null} className="size-16 text-lg" />

        <label
          className={clsx(
            'absolute -right-1 -bottom-1 inline-flex size-8 cursor-pointer items-center justify-center rounded-full bg-white text-marca-forte shadow-sm transition-colors hover:bg-white/90',
            enviar.isPending && 'cursor-wait opacity-60',
          )}
          title={fotoPath ? 'Trocar a foto' : 'Adicionar uma foto'}
        >
          <IconeCaneta className="size-4" />
          <span className="sr-only">
            {fotoPath ? 'Trocar a foto de perfil' : 'Adicionar foto de perfil'}
          </span>
          <input
            ref={entrada}
            type="file"
            accept={TIPOS_ACEITOS.join(',')}
            className="sr-only"
            disabled={enviar.isPending}
            onChange={(e) => escolher(e.target.files?.[0])}
          />
        </label>
      </div>

      {(erro || enviar.isPending) && (
        <p
          className={clsx(
            'mt-2 max-w-[12rem] text-[11px]',
            erro ? 'text-atrasado' : 'text-white/70',
          )}
        >
          {erro ?? 'Enviando…'}
        </p>
      )}
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
