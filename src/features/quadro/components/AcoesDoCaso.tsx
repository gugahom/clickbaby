import { useState } from 'react'
import clsx from 'clsx'
import { Botao } from '@/components/ui/Botao'
import { BotaoIcone } from '@/components/ui/BotaoIcone'
import { Alerta } from '@/components/ui/Alerta'
import { Dialogo } from '@/components/ui/Dialogo'
import { AnotarDialogo } from './AnotarDialogo'
import {
  IconeCaneta,
  IconeCheck,
  IconeDesfazer,
  IconeAtribuir,
  IconeHandoff,
  IconeNota,
  IconeRendicao,
  IconePause,
  IconePlay,
} from '@/components/ui/icones'
import { formatarDataHora } from '@/lib/formato'
import { useAuth } from '@/features/auth/contexto'
import {
  useAdicionarVideo,
  useAnotarEtapa,
  useReabrirEtapa,
  usePlanejarRendicao,
  useAtribuirEtapa,
  useCancelarCaso,
  useConcluirEtapa,
  useConfirmarEntrega,
  useIniciarEtapa,
  useMoverParaUti,
  usePausarEtapa,
  useRetornarDaUti,
  useTransferirEtapa,
  usePessoasAtivas,
} from '../api/useAcoes'
import {
  podeAtribuir,
  podeAdicionarVideo,
  podeCancelar,
  podeConcluir,
  podeConfirmarEntrega,
  podeIniciar,
  podeMoverParaUti,
  podePausar,
  podeRetornarDaUti,
  podePlanejarRendicao,
  podeReabrir,
  podeTransferir,
  podeEncerrarCaso,
} from '../lib/acoes'
import { mensagemDeErro } from '../lib/erros'
import { Entregaveis } from './Entregaveis'
import { useEntregaveis } from '../api/useAcoes'
import {
  ROTULO_ETAPA,
  ROTULO_RODADA,
  ROTULO_STATUS_ETAPA,
  type CasoQuadro,
  type EtapaQuadro,
} from '../types'

interface PropsAcoes {
  caso: CasoQuadro
  etapas: EtapaQuadro[]
}

type Confirmacao = { tipo: 'entrega' } | { tipo: 'cancelamento' } | null

/**
 * Etapas do caso: estado e ação na MESMA linha.
 *
 * Antes eram duas listas — "Histórico de etapas" em cima, "Ações" embaixo, com
 * os mesmos nomes repetidos e três botões de texto por etapa. A pessoa lia o
 * nome numa lista e procurava o mesmo nome na outra para agir. Agora cada etapa
 * é uma linha: o que aconteceu à esquerda, o que dá para fazer à direita.
 *
 * Isso corta metade da altura do card expandido — no mobile, a diferença entre
 * ver duas etapas e ver o caso inteiro.
 *
 * O que NÃO mudou: escrita só por RPC, invalidação da query depois, zero estado
 * local de etapa. O gating por papel também segue igual — as RPCs barram no
 * backend, a tela só evita oferecer o que será negado.
 */
export function AcoesDoCaso({ caso, etapas }: PropsAcoes) {
  const { pessoa } = useAuth()
  const papel = pessoa?.papelSistema ?? 'operador'

  const [erro, setErro] = useState<string | null>(null)
  const [confirmacao, setConfirmacao] = useState<Confirmacao>(null)
  const [motivoCancelamento, setMotivoCancelamento] = useState('')
  const [handoffDe, setHandoffDe] = useState<EtapaQuadro | null>(null)
  const [atribuirDe, setAtribuirDe] = useState<EtapaQuadro | null>(null)
  const [rendicaoDe, setRendicaoDe] = useState<EtapaQuadro | null>(null)
  const [anotarDe, setAnotarDe] = useState<EtapaQuadro | null>(null)
  const [observacaoDe, setObservacaoDe] = useState<EtapaQuadro | null>(null)

  const iniciar = useIniciarEtapa()
  const atribuir = useAtribuirEtapa()
  const pausar = usePausarEtapa()
  const concluir = useConcluirEtapa()
  const moverParaUti = useMoverParaUti()
  const retornarDaUti = useRetornarDaUti()
  const adicionarVideo = useAdicionarVideo()
  const planejarRendicao = usePlanejarRendicao()
  const anotar = useAnotarEtapa()
  const reabrir = useReabrirEtapa()
  const transferir = useTransferirEtapa()
  const confirmarEntrega = useConfirmarEntrega()
  const cancelar = useCancelarCaso()

  const ocupado =
    iniciar.isPending ||
    atribuir.isPending ||
    pausar.isPending ||
    moverParaUti.isPending ||
    retornarDaUti.isPending ||
    adicionarVideo.isPending ||
    concluir.isPending ||
    transferir.isPending ||
    confirmarEntrega.isPending ||
    cancelar.isPending

  function executar(promessa: Promise<unknown>, aoTerminar?: () => void) {
    setErro(null)
    promessa.then(
      () => aoTerminar?.(),
      (e) => setErro(mensagemDeErro(e)),
    )
  }

  // O card só renderiza AcoesDoCaso quando está aberto, então buscar aqui já é
  // "só com o card aberto" — ver useEntregaveis.
  const { data: entregaveis } = useEntregaveis(caso.id, true)
  const temEntregavel = (entregaveis ?? []).length > 0

  const entrega = podeConfirmarEntrega(caso, temEntregavel, etapas)
  const cancelamento = podeCancelar(caso, papel)
  const vaiParaUti = podeMoverParaUti(caso)
  const voltaDaUti = podeRetornarDaUti(caso)
  const novoVideo = podeAdicionarVideo(caso, etapas)

  // O VÍDEO aqui é o horizontal, que de fábrica só o MASTER tem. Serve só para
  // saber se ainda cabe ACRESCENTÁ-LO — dar play nele é como em qualquer outra
  // etapa, pela lista acima.
  const etapaVideo = etapas.find((e) => e.tipo === 'edicao_video') ?? null
  const mostraAcoesDeCaso = podeEncerrarCaso(papel)

  // Com um diálogo aberto, o erro vai DENTRO dele: o <dialog> modal inertiza o
  // painel de trás, e um alerta ali ficaria escondido atrás do backdrop.
  const temDialogo =
    confirmacao !== null ||
    handoffDe !== null ||
    observacaoDe !== null ||
    atribuirDe !== null ||
    rendicaoDe !== null ||
    anotarDe !== null

  return (
    <div className="space-y-3">
      {erro && !temDialogo && <Alerta onFechar={() => setErro(null)}>{erro}</Alerta>}

      {etapas.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {caso.faltaPacote
            ? 'Sem pacote definido — as etapas são geradas quando o pacote for confirmado.'
            : 'Nenhuma etapa gerada.'}
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-md border border-border bg-card">
          {etapas.map((etapa) => {
            const inicio = podeIniciar(etapa, etapas)
            const pausa = podePausar(etapa)
            const conclusao = podeConcluir(etapa, etapas)
            const handoff = podeTransferir(etapa)
            const designacao = podeAtribuir(etapa)
            const rendicao = podePlanejarRendicao(etapa)
            const reabertura = podeReabrir(etapa, caso)
            const encerrada =
              etapa.status === 'concluida' || etapa.status === 'dispensada'

            return (
              <li key={etapa.id} className="flex items-center gap-3 py-1 pl-3 pr-1">
                <span
                  className={clsx('size-2 flex-shrink-0 rounded-full', pontoEtapa(etapa))}
                  aria-hidden="true"
                />

                <div className="min-w-0 flex-1 py-1">
                  <div
                    className={clsx(
                      'text-sm font-medium',
                      encerrada && 'text-muted-foreground',
                    )}
                  >
                    {ROTULO_ETAPA[etapa.tipo]}
                    {/* Sem o sufixo, a lista mostraria "Edição Fotos" duas
                        vezes e não haveria como saber em qual se está
                        clicando. */}
                    {etapas.some((o) => o.tipo === etapa.tipo && o.rodada !== etapa.rodada) && (
                      <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                        {ROTULO_RODADA[etapa.rodada]}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                    <span>{ROTULO_STATUS_ETAPA[etapa.status]}</span>
                    {etapa.responsavelNome && <span>· {etapa.responsavelNome}</span>}
                    {etapa.proximoResponsavelNome && (
                      <span className="rounded bg-marca-suave px-1.5 py-0.5 font-medium text-marca">
                        rende para {etapa.proximoResponsavelNome}
                      </span>
                    )}
                    {etapa.estacao && (
                      <span className="rounded bg-muted px-1 py-0.5 font-mono">
                        {etapa.estacao}
                      </span>
                    )}
                    {etapa.concluidoEm && (
                      <span>· {formatarDataHora(etapa.concluidoEm)}</span>
                    )}
                  </div>
                  {etapa.observacao && (
                    <p className="mt-1 text-xs whitespace-pre-line text-foreground/80">
                      {etapa.observacao}
                    </p>
                  )}
                </div>

                {/* Etapa CONCLUÍDA fica só com o desfazer. Concluir é um gesto
                    de um toque, feito com uma mão num corredor — e até a
                    migration 20260827172830 era irreversível. Dispensada não
                    entra: ali não houve trabalho a devolver. */}
                {etapa.status === 'concluida' && (
                  <div className="flex flex-shrink-0 items-center">
                    <BotaoIcone
                      rotulo="Reabrir etapa"
                      motivo={reabertura.motivo}
                      disabled={ocupado || !reabertura.habilitada}
                      onClick={() =>
                        executar(reabrir.mutateAsync({ casoEtapaId: etapa.id }))
                      }
                    >
                      <IconeDesfazer className="size-[18px]" />
                    </BotaoIcone>
                  </div>
                )}

                {/* Grupo de ações na própria linha. Etapa terminada perde os
                    botões inteiros — no mobile, ícone morto é espaço perdido. */}
                {!encerrada && (
                  <div className="flex flex-shrink-0 items-center">
                    {/* Play e pause são a MESMA alavanca em estados opostos, e
                        por isso ocupam a mesma posição: em andamento mostra
                        pause, o resto mostra play (que também retoma). */}
                    {etapa.status === 'em_andamento' ? (
                      <BotaoIcone
                        rotulo="Pausar etapa"
                        tom="acao"
                        disabled={ocupado || !pausa.habilitada}
                        motivo={pausa.motivo}
                        onClick={() =>
                          executar(pausar.mutateAsync({ casoEtapaId: etapa.id }))
                        }
                      >
                        <IconePause className="size-4" />
                      </BotaoIcone>
                    ) : (
                      <BotaoIcone
                        rotulo={etapa.status === 'pausada' ? 'Retomar etapa' : 'Iniciar etapa'}
                        tom="acao"
                        disabled={ocupado || !inicio.habilitada}
                        motivo={inicio.motivo}
                        onClick={() =>
                          executar(iniciar.mutateAsync({ casoEtapaId: etapa.id }))
                        }
                      >
                        <IconePlay className="size-4" />
                      </BotaoIcone>
                    )}

                    <BotaoIcone
                      rotulo="Concluir etapa"
                      tom="positivo"
                      disabled={ocupado || !conclusao.habilitada}
                      motivo={conclusao.motivo}
                      onClick={() =>
                        executar(concluir.mutateAsync({ casoEtapaId: etapa.id }))
                      }
                    >
                      <IconeCheck className="size-[18px]" />
                    </BotaoIcone>

                    <BotaoIcone
                      rotulo="Concluir com observação"
                      disabled={ocupado || !conclusao.habilitada}
                      motivo={conclusao.motivo}
                      onClick={() => {
                        setErro(null)
                        setObservacaoDe(etapa)
                      }}
                    >
                      <IconeCaneta className="size-[18px]" />
                    </BotaoIcone>

                    {/* Mesmo slot, dois verbos. Antes de começar é ATRIBUIR
                        (designar quem vai fazer); depois é HANDOFF (passar
                        trabalho em curso, que vira linha em handoffs). A linha
                        não é o status, é se alguém já trabalhou. */}
                    {designacao.habilitada ? (
                      <BotaoIcone
                        rotulo="Atribuir responsável"
                        disabled={ocupado}
                        onClick={() => {
                          setErro(null)
                          setAtribuirDe(etapa)
                        }}
                      >
                        <IconeAtribuir className="size-[18px]" />
                      </BotaoIcone>
                    ) : (
                      <BotaoIcone
                        rotulo="Passar para outra pessoa"
                        disabled={ocupado || !handoff.habilitada}
                        motivo={handoff.motivo}
                        onClick={() => {
                          setErro(null)
                          setHandoffDe(etapa)
                        }}
                      >
                        <IconeHandoff className="size-[18px]" />
                      </BotaoIcone>
                    )}

                    {/* Slot PRÓPRIO, não compartilhado com os de cima. Atribuir
                        e handoff trocam o responsável agora; isto só anuncia
                        quem assume depois — as duas coisas convivem, e a
                        fotógrafa que sabe que sai em 15 minutos precisa das
                        duas na mesma linha. */}
                    <BotaoIcone
                      rotulo={
                        etapa.proximoResponsavelNome
                          ? `Rendição: ${etapa.proximoResponsavelNome} assume`
                          : 'Planejar rendição de turno'
                      }
                      disabled={ocupado || !rendicao.habilitada}
                      motivo={rendicao.motivo}
                      tom={etapa.proximoResponsavelNome ? 'acao' : 'neutro'}
                      onClick={() => {
                        setErro(null)
                        setRendicaoDe(etapa)
                      }}
                    >
                      <IconeRendicao className="size-[18px]" />
                    </BotaoIcone>

                    {/* Sem trava de status: anotar vale ANTES de a etapa
                        começar — é o único momento em que o aviso serve. Vale
                        até em etapa concluída, para corrigir o relato. */}
                    <BotaoIcone
                      rotulo={etapa.observacao ? 'Editar aviso' : 'Escrever aviso'}
                      disabled={ocupado}
                      tom={etapa.observacao ? 'acao' : 'neutro'}
                      onClick={() => {
                        setErro(null)
                        setAnotarDe(etapa)
                      }}
                    >
                      <IconeNota className="size-[18px]" />
                    </BotaoIcone>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {/* Ações que MOVEM o caso entre as seções da tela. Ficam separadas das
          que encerram: estas são reversíveis e do dia a dia, aquelas não têm
          desfazer. */}
      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        {caso.naUti ? (
          <Botao
            onClick={() => executar(retornarDaUti.mutateAsync({ casoId: caso.id }))}
            disabled={ocupado || !voltaDaUti.habilitada}
            title={voltaDaUti.motivo}
          >
            Voltar da UTI
          </Botao>
        ) : (
          <Botao
            onClick={() => executar(moverParaUti.mutateAsync({ casoId: caso.id }))}
            disabled={ocupado || !vaiParaUti.habilitada}
            title={vaiParaUti.motivo}
          >
            UTI
          </Botao>
        )}

        {/* Só o ACRESCENTAR, e só quando a etapa não existe.
            "Editar vídeo" saiu daqui: era um atalho para dar play na etapa de
            vídeo, e desde que cada etapa da trilha ganhou seu próprio play na
            lista acima, ele repetia um botão que já está a dois centímetros
            dali — com a desvantagem de sugerir que o vídeo é especial entre as
            três edições, o que deixou de ser verdade.
            Acrescentar continua aqui porque é ação de CASO (muda o escopo do
            trabalho), não de etapa, e não teria onde morar na lista. */}
        {!etapaVideo && (
          <Botao
            onClick={() => executar(adicionarVideo.mutateAsync({ casoId: caso.id }))}
            disabled={ocupado || !novoVideo.habilitada}
            title={novoVideo.motivo}
          >
            Adicionar vídeo
          </Botao>
        )}
      </div>

      {/* Links de entrega. A fotógrafa gera fora do sistema e cola aqui; sem ao
          menos um, confirmar entrega é recusado pela RPC. */}
      <div className="border-t border-border pt-3">
        <h5 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Links de entrega
        </h5>
        <Entregaveis caso={caso} aberto />
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        {/* Confirmar entrega não olha mais papel (migration 20260825014102):
            quem gera os links são as fotógrafas. Cancelar continua restrito —
            cancelar é decisão comercial sobre o contrato, não o fim natural do
            trabalho. */}
        <Botao
          variante="destrutivo"
          onClick={() => {
            setErro(null)
            setConfirmacao({ tipo: 'entrega' })
          }}
          disabled={ocupado || !entrega.habilitada}
          title={entrega.motivo}
        >
          Confirmar entrega
        </Botao>

        {mostraAcoesDeCaso && (
          <Botao
            variante="fantasma"
            onClick={() => {
              setErro(null)
              setMotivoCancelamento('')
              setConfirmacao({ tipo: 'cancelamento' })
            }}
            disabled={ocupado || !cancelamento.habilitada}
            title={cancelamento.motivo}
          >
            Cancelar caso
          </Botao>
        )}

        <span className="text-xs text-muted-foreground">
          Encerram o caso — sem desfazer.
        </span>
      </div>

      {observacaoDe && (
        <DialogoObservacao
          etapa={observacaoDe}
          ocupado={concluir.isPending}
          erro={erro}
          onCancelar={() => setObservacaoDe(null)}
          onConfirmar={(observacao) =>
            executar(
              concluir.mutateAsync({ casoEtapaId: observacaoDe.id, observacao }),
              () => setObservacaoDe(null),
            )
          }
        />
      )}

      {atribuirDe && (
        <DialogoPessoa
          titulo={`Atribuir ${ROTULO_ETAPA[atribuirDe.tipo]}`}
          contexto={
            atribuirDe.responsavelNome
              ? `Responsável agora: ${atribuirDe.responsavelNome}. O trabalho ainda não começou, então isto é redistribuição, não handoff.`
              : 'Ninguém designado ainda. Pode atribuir a si mesma para assumir.'
          }
          rotuloConfirmar="Atribuir"
          excluirPessoaId={atribuirDe.responsavelId}
          ocupado={atribuir.isPending}
          erro={erro}
          onCancelar={() => setAtribuirDe(null)}
          onConfirmar={(paraPessoaId) =>
            executar(
              atribuir.mutateAsync({ casoEtapaId: atribuirDe.id, paraPessoaId }),
              () => setAtribuirDe(null),
            )
          }
        />
      )}

      {anotarDe && (
        <AnotarDialogo
          etapa={anotarDe}
          ocupado={anotar.isPending}
          erro={erro}
          onCancelar={() => setAnotarDe(null)}
          onConfirmar={(observacao) =>
            executar(
              anotar.mutateAsync({ casoEtapaId: anotarDe.id, observacao }),
              () => setAnotarDe(null),
            )
          }
        />
      )}

      {rendicaoDe && (
        <DialogoPessoa
          titulo={`Quem assume ${ROTULO_ETAPA[rendicaoDe.tipo]}?`}
          contexto={
            rendicaoDe.proximoResponsavelNome
              ? `${rendicaoDe.responsavelNome ?? '—'} está com a etapa e ${rendicaoDe.proximoResponsavelNome} assume. Escolher outra pessoa substitui o combinado.`
              : `${rendicaoDe.responsavelNome ?? '—'} está com a etapa. Quem for escolhido aqui NÃO assume agora — fica anunciado para a virada de turno.`
          }
          rotuloConfirmar="Anunciar"
          excluirPessoaId={rendicaoDe.responsavelId}
          ocupado={planejarRendicao.isPending}
          erro={erro}
          onCancelar={() => setRendicaoDe(null)}
          onConfirmar={(proximaPessoaId) =>
            executar(
              planejarRendicao.mutateAsync({
                casoEtapaId: rendicaoDe.id,
                proximaPessoaId,
              }),
              () => setRendicaoDe(null),
            )
          }
        />
      )}

      {handoffDe && (
        <DialogoPessoa
          titulo={`Passar ${ROTULO_ETAPA[handoffDe.tipo]} para outra pessoa`}
          contexto={`Responsável agora: ${handoffDe.responsavelNome ?? '—'}. A passagem fica registrada no histórico.`}
          rotuloConfirmar="Transferir"
          excluirPessoaId={handoffDe.responsavelId}
          comMotivo
          ocupado={transferir.isPending}
          erro={erro}
          onCancelar={() => setHandoffDe(null)}
          onConfirmar={(paraPessoaId, motivo) =>
            executar(
              transferir.mutateAsync({
                casoEtapaId: handoffDe.id,
                paraPessoaId,
                ...(motivo ? { motivo } : {}),
              }),
              () => setHandoffDe(null),
            )
          }
        />
      )}

      {confirmacao?.tipo === 'entrega' && (
        <Dialogo
          titulo="Confirmar entrega e encerrar o caso?"
          rotuloConfirmar="Confirmar entrega"
          confirmarDestrutivo
          ocupado={confirmarEntrega.isPending}
          erro={erro}
          onCancelar={() => setConfirmacao(null)}
          onConfirmar={() =>
            executar(confirmarEntrega.mutateAsync({ casoId: caso.id }), () =>
              setConfirmacao(null),
            )
          }
        >
          <p className="text-sm text-muted-foreground">
            {caso.maeNome}
            {caso.bebeNome ? ` · ${caso.bebeNome}` : ''}. Os links passam a contar como
            confirmados e o caso é encerrado. Não há como desfazer.
          </p>
        </Dialogo>
      )}

      {confirmacao?.tipo === 'cancelamento' && (
        <Dialogo
          titulo="Cancelar este caso?"
          rotuloConfirmar="Cancelar caso"
          confirmarDestrutivo
          confirmarDesabilitado={motivoCancelamento.trim() === ''}
          ocupado={cancelar.isPending}
          erro={erro}
          onCancelar={() => setConfirmacao(null)}
          onConfirmar={() =>
            executar(
              cancelar.mutateAsync({
                casoId: caso.id,
                motivo: motivoCancelamento.trim(),
              }),
              () => setConfirmacao(null),
            )
          }
        >
          <p className="text-sm text-muted-foreground">
            {caso.maeNome}
            {caso.bebeNome ? ` · ${caso.bebeNome}` : ''}. O caso sai do fluxo e não há
            como desfazer.
          </p>
          {/* Texto livre é exceção no projeto, mas aqui é exigência de banco:
              a constraint casos_status_terminal_valido recusa cancelamento sem
              motivo preenchido. */}
          <label className="block">
            <span className="text-sm font-medium">Motivo</span>
            <input
              type="text"
              autoFocus
              value={motivoCancelamento}
              onChange={(e) => setMotivoCancelamento(e.target.value)}
              placeholder="ex.: família desistiu do pacote"
              className="mt-1 min-h-11 w-full rounded-md border border-border bg-background px-3 text-base"
            />
          </label>
        </Dialogo>
      )}
    </div>
  )
}

interface PropsObservacao {
  etapa: EtapaQuadro
  ocupado: boolean
  erro: string | null
  onCancelar: () => void
  onConfirmar: (observacao: string) => void
}

/**
 * A observação é gravada por concluir_etapa(id, observacao) — é o único caminho
 * de escrita que existe: `authenticated` não tem UPDATE em caso_etapas, e não
 * há RPC para anotar sem concluir.
 *
 * Por isso o botão diz "Concluir com observação", não "Anotar". Um rótulo que
 * prometesse só anotar estaria mentindo sobre o que o clique faz.
 */
function DialogoObservacao({
  etapa,
  ocupado,
  erro,
  onCancelar,
  onConfirmar,
}: PropsObservacao) {
  const [texto, setTexto] = useState('')

  return (
    <Dialogo
      titulo={`Concluir ${ROTULO_ETAPA[etapa.tipo]} com observação`}
      rotuloConfirmar="Concluir etapa"
      confirmarDesabilitado={texto.trim() === ''}
      ocupado={ocupado}
      erro={erro}
      onCancelar={onCancelar}
      onConfirmar={() => onConfirmar(texto.trim())}
    >
      <p className="text-sm text-muted-foreground">
        A etapa é concluída junto com a anotação — não existe anotar sem
        concluir.
      </p>
      <label className="block">
        <span className="text-sm font-medium">Observação</span>
        <textarea
          autoFocus
          rows={3}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="ex.: mãe pediu fotos com a avó"
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-base"
        />
      </label>
    </Dialogo>
  )
}

interface PropsDialogoPessoa {
  titulo: string
  contexto: string
  rotuloConfirmar: string
  /** Some da lista: a RPC recusa designar para quem já é responsável. */
  excluirPessoaId: string | null
  /** Só o handoff pede motivo — atribuir é planejamento, não precisa justificar. */
  comMotivo?: boolean
  ocupado: boolean
  erro: string | null
  onCancelar: () => void
  onConfirmar: (paraPessoaId: string, motivo: string) => void
}

/**
 * Escolha de pessoa, usada por atribuir e por handoff.
 *
 * As duas ações fazem a mesma pergunta — "quem fica com isto?" — e mudam no que
 * significam: atribuir designa trabalho que não começou, handoff registra
 * trabalho que mudou de mão. Uma tela só, dois textos.
 */
function DialogoPessoa({
  titulo,
  contexto,
  rotuloConfirmar,
  excluirPessoaId,
  comMotivo = false,
  ocupado,
  erro,
  onCancelar,
  onConfirmar,
}: PropsDialogoPessoa) {
  const { data: pessoas, isPending } = usePessoasAtivas()
  const [paraPessoaId, setParaPessoaId] = useState('')
  const [motivo, setMotivo] = useState('')

  const opcoes = (pessoas ?? []).filter((p) => p.id !== excluirPessoaId)

  return (
    <Dialogo
      titulo={titulo}
      rotuloConfirmar={rotuloConfirmar}
      confirmarDesabilitado={paraPessoaId === ''}
      ocupado={ocupado}
      erro={erro}
      onCancelar={onCancelar}
      onConfirmar={() => onConfirmar(paraPessoaId, motivo)}
    >
      <p className="text-sm text-muted-foreground">{contexto}</p>

      <label className="block">
        <span className="text-sm font-medium">Pessoa</span>
        <select
          value={paraPessoaId}
          onChange={(e) => setParaPessoaId(e.target.value)}
          className="mt-1 min-h-11 w-full rounded-md border border-border bg-background px-3 text-base"
        >
          <option value="">
            {isPending ? 'Carregando…' : 'Selecione uma pessoa'}
          </option>
          {opcoes.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>
      </label>

      {comMotivo && (
        <label className="block">
          <span className="text-sm font-medium">
            Motivo <span className="font-normal text-muted-foreground">(opcional)</span>
          </span>
          <input
            type="text"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="ex.: troca de turno"
            className="mt-1 min-h-11 w-full rounded-md border border-border bg-background px-3 text-base"
          />
        </label>
      )}
    </Dialogo>
  )
}

function pontoEtapa(etapa: EtapaQuadro): string {
  switch (etapa.status) {
    case 'concluida':
      return 'bg-concluido'
    case 'em_andamento':
      return 'bg-andamento'
    case 'atribuida':
      return 'bg-muted-foreground'
    default:
      return 'bg-muted-foreground/30'
  }
}
