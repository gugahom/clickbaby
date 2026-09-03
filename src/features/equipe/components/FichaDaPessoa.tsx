import { useState, type ReactNode } from 'react'
import clsx from 'clsx'
import { Avatar } from '@/components/ui/Avatar'
import { Botao } from '@/components/ui/Botao'
import { Dialogo } from '@/components/ui/Dialogo'
import { Dropdown } from '@/components/ui/Dropdown'
import { Alerta } from '@/components/ui/Alerta'
import { IconeCheck, IconeSair, IconeX } from '@/components/ui/icones'
import { useRelogioDeMinuto } from '@/lib/useRelogio'
import { formatarData } from '@/lib/formato'
import type { EtapaEmMaos, PessoaDaEquipe } from '../api/useEquipe'
import {
  useDefinirAtivo,
  useDefinirPapel,
  useExcluirPessoa,
} from '../api/useAcoesDaPessoa'
import {
  COR_LUGAR,
  PAPEIS,
  ROTULO_LUGAR,
  ROTULO_PAPEL,
  formatarDuracao,
  relativo,
} from '../lib/apresentacao'

/**
 * A ficha de uma pessoa — o que ela É no sistema e o que dá para fazer com ela.
 *
 * A VERSÃO ANTERIOR MOSTRAVA MÉTRICAS e foi desfeita a pedido do gestor:
 * concluídas na janela, tempo médio de ciclo, divisão campo × ilha. A razão
 * dele é boa e vale ficar escrita, porque a tentação de recolocá-las vai
 * voltar: ainda não está acordado O QUE se mede. Número na tela antes do
 * acordo não fica parado — ele começa a ser usado para decidir, e a seção 9 do
 * CLAUDE.md é explícita de que o combinado é registro aberto com padrões
 * conhecidos por todas, não medição que aparece pronta. As métricas voltam na
 * tela própria, depois do acordo.
 *
 * O QUE SOBROU não é consolo: é cadastro e presente. "Quem é essa pessoa, ela
 * consegue entrar, o que ela está segurando agora, e o que eu posso fazer com
 * ela." Nenhuma das quatro precisa de acordo nenhum para ser verdade.
 */
export function FichaDaPessoa({ pessoa }: { pessoa: PessoaDaEquipe }) {
  const apelido = pessoa.apelidos[0]

  return (
    <div className="space-y-3">
      <section className="overflow-hidden rounded-cartao border border-border bg-card shadow-cartao">
        <div className="superficie-cabecalho px-4 pt-4 pb-5 text-white">
          <div className="flex items-center gap-3">
            <Avatar nome={pessoa.nome} className="size-12 text-sm" />
            <div className="min-w-0">
              <h2 className="truncate text-xl font-extrabold tracking-tight">
                {pessoa.nome}
              </h2>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-white/70">
                <span>{ROTULO_PAPEL[pessoa.papelSistema] ?? pessoa.papelSistema}</span>
                {apelido && <span>· “{apelido}”</span>}
              </p>
            </div>
          </div>
        </div>

        <div className="-mt-3 rounded-t-cartao bg-card px-4 pt-4 pb-4">
          <EstadoAgora pessoa={pessoa} />
        </div>
      </section>

      {pessoa.emMaos.length > 0 && <EmMaos etapas={pessoa.emMaos} />}

      <Acesso pessoa={pessoa} />
      <Acoes pessoa={pessoa} />
    </div>
  )
}

/**
 * O cadastro, em quatro linhas.
 *
 * "Consegue entrar" é a mais importante e a menos óbvia: uma pessoa pode
 * existir em `pessoas` sem conta de auth, e nesse estado ela não é bloqueada —
 * simplesmente não tem como fazer login, e quem a cadastrou não descobre até
 * alguém reclamar.
 */
function Acesso({ pessoa }: { pessoa: PessoaDaEquipe }) {
  return (
    <section className="rounded-cartao border border-border bg-card p-4 shadow-cartao">
      <h3 className="rotulo-sobrescrito text-acento">Acesso</h3>

      <dl className="mt-3 space-y-2 text-sm">
        <Linha rotulo="Consegue entrar">
          {pessoa.temAcesso ? (
            <span className="inline-flex items-center gap-1.5 font-semibold text-concluido-tinta">
              <IconeCheck className="size-4" />
              Sim
            </span>
          ) : (
            <span className="font-semibold text-rascunho">Não — sem conta vinculada</span>
          )}
        </Linha>

        <Linha rotulo="Papel">
          <span className="font-semibold">
            {ROTULO_PAPEL[pessoa.papelSistema] ?? pessoa.papelSistema}
          </span>
        </Linha>

        <Linha rotulo="No sistema desde">
          <span className="font-semibold tabular-nums">{formatarData(pessoa.desde)}</span>
        </Linha>

        <Linha rotulo="Situação">
          <span
            className={clsx('font-semibold', !pessoa.ativo && 'text-muted-foreground')}
          >
            {pessoa.ativo ? 'Ativa' : 'Inativa'}
          </span>
        </Linha>
      </dl>

      {/* O e-mail é a pergunta que segue naturalmente desta caixa. Dizer onde
          ele está evita que alguém conclua que o dado se perdeu. */}
      <p className="mt-3 border-t border-border/70 pt-3 text-xs text-muted-foreground">
        O e-mail de login vive em <code>auth.users</code>, fora do alcance do
        aplicativo — ainda não dá para mostrar aqui.
      </p>
    </section>
  )
}

function Linha({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{rotulo}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  )
}

/**
 * O que a gestão pode fazer.
 *
 * DESATIVAR PRIMEIRO, EXCLUIR ESCONDIDO. Desativar é o gesto de todo dia —
 * alguém saiu da equipe, alguém entrou de licença — e é reversível. Excluir só
 * existe para quem foi cadastrada por engano e nunca trabalhou; para todo o
 * resto o banco recusa, e recusa de propósito (ver `useExcluirPessoa`). Um
 * botão vermelho permanente que quase sempre falha ensina a errar.
 */
function Acoes({ pessoa }: { pessoa: PessoaDaEquipe }) {
  const definirAtivo = useDefinirAtivo()
  const definirPapel = useDefinirPapel()
  const excluir = useExcluirPessoa()
  const [erro, setErro] = useState<string | null>(null)
  const [confirmando, setConfirmando] = useState<'desativar' | 'excluir' | null>(null)

  const ocupado = definirAtivo.isPending || definirPapel.isPending || excluir.isPending
  const podeExcluir = !pessoa.temHistorico

  function executar(promessa: Promise<unknown>) {
    setErro(null)
    promessa.then(
      () => setConfirmando(null),
      (e: unknown) => setErro(e instanceof Error ? e.message : String(e)),
    )
  }

  return (
    <section className="rounded-cartao border border-border bg-card p-4 shadow-cartao">
      <h3 className="rotulo-sobrescrito text-acento">Ações</h3>

      {erro && !confirmando && (
        <div className="mt-3">
          <Alerta onFechar={() => setErro(null)}>{erro}</Alerta>
        </div>
      )}

      <div className="mt-3 space-y-3">
        <div>
          <span className="text-sm text-muted-foreground">Papel no sistema</span>
          <div className="mt-1.5">
            <Dropdown
              rotulo={`Papel de ${pessoa.nome}`}
              selecionado={pessoa.papelSistema}
              desabilitado={ocupado}
              larguraCheia
              onEscolher={(item) => {
                if (item.id === pessoa.papelSistema) return
                const papel = PAPEIS.find((x) => x.id === item.id)?.id
                if (!papel) return
                executar(definirPapel.mutateAsync({ pessoaId: pessoa.id, papel }))
              }}
              itens={PAPEIS}
              gatilho={
                <span className="inline-flex min-h-11 w-full items-center justify-between rounded-md border border-border bg-background/60 px-3 text-sm font-semibold">
                  {ROTULO_PAPEL[pessoa.papelSistema] ?? pessoa.papelSistema}
                </span>
              }
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Só gestão enxerga esta tela. Atendimento e adm cancelam caso e editam
            cadastro; operação, não.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-border/70 pt-3">
          {pessoa.ativo ? (
            <Botao
              variante="contorno"
              disabled={ocupado}
              onClick={() => setConfirmando('desativar')}
            >
              <IconeSair className="size-4" />
              Desativar
            </Botao>
          ) : (
            <Botao
              disabled={ocupado}
              onda
              onClick={() =>
                executar(definirAtivo.mutateAsync({ pessoaId: pessoa.id, ativo: true }))
              }
            >
              <IconeCheck className="size-4" />
              Reativar
            </Botao>
          )}

          {podeExcluir && (
            <Botao
              variante="fantasma"
              disabled={ocupado}
              onClick={() => setConfirmando('excluir')}
              className="text-atrasado hover:bg-atrasado/10"
            >
              <IconeX className="size-4" />
              Excluir
            </Botao>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          {podeExcluir
            ? 'Ela ainda não trabalhou em nenhum caso, então dá para excluir de vez — conta de acesso junto.'
            : 'Ela já trabalhou em casos, então não pode ser excluída: o histórico de quem fez o quê não pode perder uma ponta. Desativar tira do Quadro e das listas, e mantém o nome no que ela fez.'}
        </p>
      </div>

      {confirmando === 'desativar' && (
        <Dialogo
          titulo={`Desativar ${pessoa.nome}?`}
          rotuloConfirmar={definirAtivo.isPending ? 'Desativando…' : 'Desativar'}
          confirmarDestrutivo
          ocupado={definirAtivo.isPending}
          erro={erro}
          onCancelar={() => setConfirmando(null)}
          onConfirmar={() =>
            executar(definirAtivo.mutateAsync({ pessoaId: pessoa.id, ativo: false }))
          }
        >
          <p className="text-sm text-muted-foreground">
            Ela perde o acesso ao Quadro na hora e sai das listas de atribuição. O
            nome dela continua em cada etapa que executou, e dá para reativar
            depois.
          </p>
          {pessoa.emAndamento > 0 && (
            <p className="mt-2 rounded-md border border-atencao/30 bg-atencao/10 px-3 py-2 text-sm text-atencao-tinta">
              Ela está com{' '}
              {pessoa.emAndamento === 1
                ? '1 etapa aberta'
                : `${pessoa.emAndamento} etapas abertas`}
              . Elas continuam no nome dela — passe para outra pessoa antes, se o
              trabalho precisa seguir.
            </p>
          )}
        </Dialogo>
      )}

      {confirmando === 'excluir' && (
        <Dialogo
          titulo={`Excluir ${pessoa.nome}?`}
          rotuloConfirmar={excluir.isPending ? 'Excluindo…' : 'Excluir de vez'}
          confirmarDestrutivo
          ocupado={excluir.isPending}
          erro={erro}
          onCancelar={() => setConfirmando(null)}
          onConfirmar={() => executar(excluir.mutateAsync({ pessoaId: pessoa.id }))}
        >
          <p className="text-sm text-muted-foreground">
            Somem o cadastro e a conta de acesso, sem desfazer. Use isto só para
            cadastro feito por engano — para quem saiu da equipe, desativar é o
            gesto certo.
          </p>
        </Dialogo>
      )}
    </section>
  )
}

function EstadoAgora({ pessoa }: { pessoa: PessoaDaEquipe }) {
  if (!pessoa.ativo) {
    return (
      <Estado
        tom="apagado"
        titulo="Inativa"
        detalhe="Fora da operação. O histórico dela continua nos casos em que trabalhou."
      />
    )
  }

  if (!pessoa.temAcesso) {
    return (
      <Estado
        tom="rascunho"
        titulo="Sem acesso"
        detalhe="Existe no cadastro, mas nenhuma conta aponta para ela — não consegue entrar."
      />
    )
  }

  if (pessoa.emAndamento === 0) {
    return (
      <Estado
        tom="livre"
        titulo="Sem etapa aberta"
        detalhe={
          pessoa.ultimaAtividade
            ? `Última atividade ${relativo(pessoa.ultimaAtividade)}.`
            : 'Nenhuma etapa registrada ainda.'
        }
      />
    )
  }

  if (pessoa.tudoPausado) {
    return (
      <Estado
        tom="pausada"
        titulo="Tudo pausado"
        detalhe={`O trabalho parou e ninguém retomou${
          pessoa.ultimaAtividade ? ` · mexeu ${relativo(pessoa.ultimaAtividade)}` : ''
        }.`}
      />
    )
  }

  const lugar = pessoa.lugarAgora

  return (
    <div className="flex items-start gap-3">
      <span
        className={clsx(
          'mt-1.5 size-2.5 flex-shrink-0 rounded-full ring-2 ring-current/20',
          lugar ? COR_LUGAR[lugar].barra : 'bg-andamento',
          'motion-safe:animate-pulse',
        )}
        aria-hidden="true"
      />
      <div className="min-w-0">
        <p className="font-extrabold tracking-tight">
          {lugar ? ROTULO_LUGAR[lugar] : 'Trabalhando'}
        </p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {pessoa.emAndamento === 1
            ? '1 etapa em mãos'
            : `${pessoa.emAndamento} etapas em mãos`}
          {pessoa.ultimaAtividade && ` · mexeu ${relativo(pessoa.ultimaAtividade)}`}
        </p>
      </div>
    </div>
  )
}

function Estado({
  tom,
  titulo,
  detalhe,
}: {
  tom: 'livre' | 'apagado' | 'rascunho' | 'pausada'
  titulo: string
  detalhe: string
}) {
  return (
    <div className="flex items-start gap-3">
      <span
        className={clsx(
          'mt-1.5 size-2.5 flex-shrink-0 rounded-full',
          tom === 'livre' && 'border-2 border-concluido',
          tom === 'apagado' && 'bg-muted-foreground/40',
          tom === 'rascunho' && 'bg-rascunho',
          tom === 'pausada' && 'bg-atencao',
        )}
        aria-hidden="true"
      />
      <div className="min-w-0">
        <p className="font-extrabold tracking-tight">{titulo}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{detalhe}</p>
      </div>
    </div>
  )
}

/**
 * O que ela está segurando agora, caso a caso.
 *
 * É a parte da ficha que não é medida nem cadastro: é o presente. Quem
 * distribui a fila não pergunta "quantas ela tem", pergunta "o que ela tem" — e
 * a resposta precisa do nome da família. "Ingrid está no Nascimento da Thayane
 * há 3h" é uma frase sobre a qual se decide alguma coisa.
 */
function EmMaos({ etapas }: { etapas: EtapaEmMaos[] }) {
  // O mesmo relógio do Quadro: sem ele, "há 3h" congela no instante em que a
  // ficha abriu, e numa tela que a coordenação deixa aberta o turno inteiro
  // isso é a diferença entre relógio e fotografia.
  const agora = useRelogioDeMinuto().getTime()

  return (
    <section className="rounded-cartao border border-border bg-card p-4 shadow-cartao">
      <h3 className="rotulo-sobrescrito text-acento">Em mãos agora</h3>

      <ul className="mt-3 space-y-2">
        {etapas.map((e) => {
          const cor = e.lugar ? COR_LUGAR[e.lugar] : COR_LUGAR.campo
          const ha =
            e.desde === null
              ? null
              : formatarDuracao((agora - new Date(e.desde).getTime()) / 60_000)

          return (
            <li key={e.id} className="flex items-baseline gap-2.5">
              <span
                className={clsx(
                  'mt-1 size-2 flex-shrink-0 rounded-full',
                  e.pausada ? 'bg-atencao' : cor.barra,
                )}
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">
                  <span className="font-bold">{e.etapa}</span>
                  <span className="text-muted-foreground"> · {e.caso}</span>
                </p>
              </div>
              <span className="flex-shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
                {e.pausada ? 'pausada' : ha ? `há ${ha}` : 'não iniciada'}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
