import { useState } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { Botao } from '@/components/ui/Botao'
import { CampoTexto } from '@/components/ui/CampoTexto'
import { Alerta } from '@/components/ui/Alerta'
import { useAuth } from '@/features/auth/contexto'
import { useEquipe } from '@/features/equipe/api/useEquipe'
import { NumerosDaJanela } from '@/features/equipe/components/FichaDaPessoa'
import { ROTULO_PAPEL } from '@/features/equipe/lib/apresentacao'
import { TAMANHO_MINIMO_SENHA, useTrocarSenha } from './api/useTrocarSenha'

/**
 * A conta da própria pessoa.
 *
 * Ela nasce por causa de um problema concreto: as onze contas criadas em
 * 02/09/2026 saíram com a MESMA senha combinada, que circulou no grupo. Sem um
 * lugar para trocar, "troque a senha" seria um pedido sem gesto — e o sistema
 * guarda nome de mãe, de recém-nascido e situação clínica.
 *
 * MAS ELA NÃO É SÓ UM FORMULÁRIO DE SENHA. Uma tela que a pessoa visita uma
 * vez na vida não merece existir; esta mostra também OS NÚMEROS DELA, os
 * mesmos que a gestão vê na Equipe. É a seção 9 do CLAUDE.md levada a sério:
 * a visibilidade é compartilhada de propósito, porque a produtividade subiu
 * com a presença dos sócios e o acordo foi registro aberto, com padrões
 * conhecidos por todas — não vigilância silenciosa. Uma métrica que a chefia
 * enxerga e a pessoa não seria exatamente a outra coisa.
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
 *   hoje nega tudo (dívida #7 do CLAUDE.md). A primeira policy de upload vai
 *   derrubar de propósito o teste `buckets_privados.test.sql` — ele existe
 *   para forçar a leitura da regra antes de alguém abrir um bucket sem querer.
 */
export function ContaPage() {
  const { pessoa, session } = useAuth()
  const { data: equipe } = useEquipe()
  const email = session?.user.email ?? ''

  const minhaFicha = equipe?.find((p) => p.id === pessoa?.id)

  return (
    <div className="flex h-full flex-col">
      <header className="flex-shrink-0 border-b border-border/70 bg-background/80 px-3 py-4 backdrop-blur-md md:px-5">
        <div className="mx-auto max-w-5xl">
          <p className="rotulo-sobrescrito text-acento">Sua conta</p>
          <h1 className="mt-0.5 text-lg font-extrabold tracking-tight md:text-2xl">
            {pessoa?.nome ?? 'Conta'}
          </h1>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 md:px-5">
        <div className="mx-auto grid max-w-5xl gap-4 lg:grid-cols-2 lg:items-start">
          <div className="space-y-4">
            <section className="overflow-hidden rounded-cartao border border-border bg-card shadow-cartao">
              <div className="superficie-cabecalho flex items-center gap-4 px-4 py-4 text-white">
                <Avatar nome={pessoa?.nome ?? '?'} className="size-14 text-base" />
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
                Nome, apelido e foto ainda não se editam por aqui — falta o
                caminho no banco, e ele vem na próxima fatia. Para corrigir seu
                nome agora, fale com a gestão.
              </p>
            </section>

            <TrocarSenha email={email} />
          </div>

          <div className="space-y-4">
            {minhaFicha ? (
              <NumerosDaJanela
                pessoa={minhaFicha}
                titulo="Seus últimos 30 dias"
                rotuloDivisao="Onde você trabalha"
              />
            ) : (
              <section className="rounded-cartao border border-border bg-card p-4 shadow-cartao">
                <h3 className="rotulo-sobrescrito text-acento">Seus últimos 30 dias</h3>
                <p className="mt-2 text-sm text-muted-foreground">Carregando…</p>
              </section>
            )}

            <p className="px-1 text-xs text-muted-foreground">
              Estes são os mesmos números que a gestão vê. O tempo de ciclo sai
              dos carimbos do servidor, desconta as pausas, e ignora etapa
              concluída sem ter sido iniciada — o registro retroativo de campo
              não vira “ciclo zero”.
            </p>
          </div>
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
