import { useRef, useState, type ReactNode } from 'react'
import clsx from 'clsx'
import { Avatar } from '@/components/ui/Avatar'
import { Botao } from '@/components/ui/Botao'
import { Dialogo } from '@/components/ui/Dialogo'
import { ModalAmplo } from '@/components/ui/ModalAmplo'
import { TELAS, telasEfetivas } from '@/features/auth/telas'
import { hojeNoFuso } from '@/lib/formato'
import { Dropdown } from '@/components/ui/Dropdown'
import { Alerta } from '@/components/ui/Alerta'
import { CampoTexto } from '@/components/ui/CampoTexto'
import { IconeCaneta, IconeCheck, IconeSair, IconeX } from '@/components/ui/icones'
import { useRelogioDeMinuto } from '@/lib/useRelogio'
import { formatarData } from '@/lib/formato'
import type { EtapaEmMaos, PessoaDaEquipe } from '../api/useEquipe'
import {
  useDefinirAtivo,
  useDefinirPapel,
  useEditarNome,
  useExcluirPessoa,
  useTrocarFotoDaPessoa,
} from '../api/useAcoesDaPessoa'
import { EscalaDaPessoa } from './EscalaDaPessoa'
import { somarDia, useEscalaDaPessoa } from '../api/useEscala'
import { TelasDaPessoa } from './TelasDaPessoa'
import {
  COR_LUGAR,
  PAPEIS,
  ROTULO_LUGAR,
  ROTULO_PAPEL,
  diaCurto,
  formatarDuracao,
  horaEmBrasilia,
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
 *
 * MAIS PODER PARA A GESTÃO (30/09/2026, pedido do gestor): mudar a FOTO e o
 * NOME de qualquer pessoa, as TELAS que ela vê e a ESCALA de plantão dela.
 * Quem faz tudo isso é quem tem a tela Equipe — o banco confere a mesma lista.
 *
 * E AS AÇÕES MORAM NUM MODAL (mesmo dia, segunda volta do gestor: "tudo isso
 * de ações com os funcionários pode virar um modal, ao invés desse campo à
 * direita"). A coluna ficou com o RESUMO — quem é, o que está segurando, se
 * entra, que telas vê, a escala das próximas semanas — e o botão "Gerenciar"
 * abre o modal com foto, nome, telas, escala, papel e desativar. A coluna não
 * some porque uma lista sem detalhe ao lado ficaria "vazia demais", nas
 * palavras dele; o que saiu dela foi o que se MEXE, não o que se LÊ.
 */
export function FichaDaPessoa({
  pessoa,
  foto,
}: {
  pessoa: PessoaDaEquipe
  foto: string | null
}) {
  const apelido = pessoa.apelidos[0]
  const [gerenciando, setGerenciando] = useState(false)

  return (
    <div className="space-y-3">
      <section className="overflow-hidden rounded-cartao border border-border bg-card shadow-cartao">
        <div className="superficie-cabecalho px-4 pt-4 pb-5 text-white">
          <div className="flex items-center gap-3">
            <Avatar nome={pessoa.nome} fotoUrl={foto} className="size-12 text-sm" />
            <div className="min-w-0">
              <h2 className="truncate text-xl font-extrabold tracking-tight">{pessoa.nome}</h2>
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

      <Acesso pessoa={pessoa} onGerenciar={() => setGerenciando(true)} />

      {gerenciando && <GerenciarPessoa pessoa={pessoa} foto={foto} onFechar={() => setGerenciando(false)} />}
    </div>
  )
}

/**
 * O MODAL DE GERENCIAR (30/09/2026). Tudo o que MUDA a pessoa: foto e nome no
 * alto, telas e papel de um lado, escala do outro — duas colunas para caber na
 * tela sem virar uma rolagem comprida, como o formulário de caso da agenda.
 * Os blocos são os mesmos componentes de antes, só mudaram de lugar.
 */
function GerenciarPessoa({
  pessoa,
  foto,
  onFechar,
}: {
  pessoa: PessoaDaEquipe
  foto: string | null
  onFechar: () => void
}) {
  const apelido = pessoa.apelidos[0]

  return (
    <ModalAmplo titulo="Gerenciar pessoa" tamanho="ficha" onFechar={onFechar}>
      <div className="h-full overflow-y-auto">
        <div className="superficie-cabecalho px-4 py-4 text-white md:px-5">
          <div className="flex items-center gap-3">
            <FotoEditavel pessoa={pessoa} foto={foto} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1">
                <h3 className="truncate text-xl font-extrabold tracking-tight">{pessoa.nome}</h3>
                <NomeEditavel pessoa={pessoa} />
              </div>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-white/70">
                <span>{ROTULO_PAPEL[pessoa.papelSistema] ?? pessoa.papelSistema}</span>
                {apelido && <span>· “{apelido}”</span>}
                <span>· {pessoa.ativo ? 'Ativa' : 'Inativa'}</span>
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 p-4 md:grid-cols-2 md:items-start md:p-5">
          <div className="space-y-4">
            <TelasDaPessoa pessoa={pessoa} />
          </div>
          <div className="space-y-4">
            <EscalaDaPessoa pessoa={pessoa} />
            <Acoes pessoa={pessoa} onExcluida={onFechar} />
          </div>
        </div>
      </div>
    </ModalAmplo>
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
function Acesso({ pessoa, onGerenciar }: { pessoa: PessoaDaEquipe; onGerenciar: () => void }) {
  const telas = telasEfetivas(pessoa.telas, pessoa.papelSistema)
  const hoje = hojeNoFuso()
  const { data: plantoes } = useEscalaDaPessoa(pessoa.id, hoje, somarDia(hoje, 27))
  // O relógio de minuto da casa: o "próximo" anda sozinho quando um plantão acaba.
  const agora = useRelogioDeMinuto().getTime()
  const proximo = plantoes?.find((p) => new Date(p.fim).getTime() > agora)

  return (
    <section className="rounded-cartao border border-border bg-card p-4 shadow-cartao">
      <h3 className="rotulo-sobrescrito text-acento">Acesso e escala</h3>

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

        <Linha rotulo={pessoa.telas === null ? 'Telas (padrão)' : 'Telas'}>
          <span className="font-semibold">
            {telas.length === 0 ? 'Nenhuma' : TELAS.filter((t) => telas.includes(t.id)).map((t) => t.rotulo).join(', ')}
          </span>
        </Linha>

        <Linha rotulo="Próximo plantão">
          <span className="font-semibold tabular-nums">
            {proximo ? (
              <span className="capitalize">
                {diaCurto(proximo.data)}, {horaEmBrasilia(proximo.inicio)}–{horaEmBrasilia(proximo.fim)}
              </span>
            ) : (
              <span className="text-muted-foreground">nenhum lançado</span>
            )}
          </span>
        </Linha>
        {plantoes && plantoes.length > 0 && (
          <Linha rotulo="Nas 4 semanas">
            <span className="font-semibold tabular-nums">
              {plantoes.length} {plantoes.length === 1 ? 'plantão' : 'plantões'}
            </span>
          </Linha>
        )}
      </dl>

      <Botao variante="primario" onClick={onGerenciar} className="mt-4 w-full justify-center">
        <IconeCaneta className="size-4" />
        Gerenciar {pessoa.nome.split(' ')[0]}
      </Botao>

      {/* O e-mail é a pergunta que segue naturalmente desta caixa. Dizer onde
          ele está evita que alguém conclua que o dado se perdeu. */}
      <p className="mt-3 border-t border-border/70 pt-3 text-xs text-muted-foreground">
        O e-mail de login vive em <code>auth.users</code>, fora do alcance do
        aplicativo — ainda não dá para mostrar aqui.
      </p>
    </section>
  )
}

/**
 * A FOTO, trocada pela gestão: o lápis sobre o retrato abre o seletor de
 * arquivo. A regra do arquivo (JPG, PNG ou WEBP, até 2 MB) é a da foto própria.
 */
function FotoEditavel({ pessoa, foto }: { pessoa: PessoaDaEquipe; foto: string | null }) {
  const trocar = useTrocarFotoDaPessoa()
  const entrada = useRef<HTMLInputElement>(null)
  const [erro, setErro] = useState<string | null>(null)

  return (
    <div className="relative flex-shrink-0">
      <Avatar nome={pessoa.nome} fotoUrl={foto} className={clsx('size-14 text-base', trocar.isPending && 'opacity-50')} />
      <button
        type="button"
        onClick={() => entrada.current?.click()}
        disabled={trocar.isPending}
        aria-label={`Trocar a foto de ${pessoa.nome}`}
        title={erro ?? 'Trocar a foto'}
        className={clsx(
          'absolute -right-1 -bottom-1 grid size-7 place-items-center rounded-full border-2 border-white/80 text-white shadow',
          erro ? 'bg-atrasado' : 'bg-marca-forte hover:bg-marca',
        )}
      >
        <IconeCaneta className="size-3.5" />
      </button>
      <input
        ref={entrada}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          const arquivo = e.target.files?.[0]
          e.target.value = ''
          if (!arquivo) return
          setErro(null)
          trocar.mutate(
            { pessoaId: pessoa.id, arquivo },
            { onError: (x) => setErro(x instanceof Error ? x.message : String(x)) },
          )
        }}
      />
    </div>
  )
}

/** O NOME E O APELIDO, pelo lápis ao lado do nome. */
function NomeEditavel({ pessoa }: { pessoa: PessoaDaEquipe }) {
  const editar = useEditarNome()
  const [aberto, setAberto] = useState(false)
  const [nome, setNome] = useState(pessoa.nome)
  const [apelido, setApelido] = useState(pessoa.apelidos[0] ?? '')
  const [erro, setErro] = useState<string | null>(null)

  function abrir() {
    setNome(pessoa.nome)
    setApelido(pessoa.apelidos[0] ?? '')
    setErro(null)
    setAberto(true)
  }

  function salvar() {
    setErro(null)
    const resto = pessoa.apelidos.slice(1)
    editar.mutate(
      { pessoaId: pessoa.id, nome, apelidos: apelido.trim() ? [apelido.trim(), ...resto] : resto },
      { onSuccess: () => setAberto(false), onError: (e) => setErro(e instanceof Error ? e.message : String(e)) },
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        aria-label={`Editar o nome de ${pessoa.nome}`}
        className="grid size-9 flex-shrink-0 place-items-center rounded-full text-white/70 hover:bg-white/15 hover:text-white"
      >
        <IconeCaneta className="size-4" />
      </button>
      {aberto && (
        <Dialogo
          titulo="Editar nome"
          rotuloConfirmar={editar.isPending ? 'Salvando…' : 'Salvar'}
          confirmarDesabilitado={nome.trim() === ''}
          ocupado={editar.isPending}
          erro={erro}
          onConfirmar={salvar}
          onCancelar={() => setAberto(false)}
        >
          <div className="space-y-3">
            <CampoTexto rotulo="Nome" valor={nome} aoMudar={setNome} autoFocus />
            <CampoTexto
              rotulo="Apelido"
              valor={apelido}
              aoMudar={setApelido}
              opcional
              ajuda="Como a equipe chama a pessoa no dia a dia."
            />
          </div>
        </Dialogo>
      )}
    </>
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
function Acoes({ pessoa, onExcluida }: { pessoa: PessoaDaEquipe; onExcluida: () => void }) {
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
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            O papel decide o que a pessoa FAZ nos casos (atendimento e adm
            cancelam caso e editam cadastro; operação, não) e o padrão de telas
            dela. As telas se ajustam na caixa Telas.
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
          onConfirmar={() => executar(excluir.mutateAsync({ pessoaId: pessoa.id }).then(onExcluida))}
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
