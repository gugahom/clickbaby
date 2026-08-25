import { useState } from 'react'
import clsx from 'clsx'
import { Botao } from '@/components/ui/Botao'
import { BotaoIcone } from '@/components/ui/BotaoIcone'
import { Alerta } from '@/components/ui/Alerta'
import { Dialogo } from '@/components/ui/Dialogo'
import {
  IconeCaneta,
  IconeCheck,
  IconeHandoff,
  IconePause,
  IconePlay,
} from '@/components/ui/icones'
import { formatarDataHora } from '@/lib/formato'
import { useAuth } from '@/features/auth/contexto'
import {
  useAdicionarReels,
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
  podeAdicionarReels,
  podeCancelar,
  podeConcluir,
  podeConfirmarEntrega,
  podeIniciar,
  podeMoverParaUti,
  podePausar,
  podeRetornarDaUti,
  podeTransferir,
  podeEncerrarCaso,
} from '../lib/acoes'
import { mensagemDeErro } from '../lib/erros'
import {
  ROTULO_ETAPA,
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
  const [observacaoDe, setObservacaoDe] = useState<EtapaQuadro | null>(null)

  const iniciar = useIniciarEtapa()
  const pausar = usePausarEtapa()
  const concluir = useConcluirEtapa()
  const moverParaUti = useMoverParaUti()
  const retornarDaUti = useRetornarDaUti()
  const adicionarReels = useAdicionarReels()
  const transferir = useTransferirEtapa()
  const confirmarEntrega = useConfirmarEntrega()
  const cancelar = useCancelarCaso()

  const ocupado =
    iniciar.isPending ||
    pausar.isPending ||
    moverParaUti.isPending ||
    retornarDaUti.isPending ||
    adicionarReels.isPending ||
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

  const entrega = podeConfirmarEntrega(caso, papel)
  const cancelamento = podeCancelar(caso, papel)
  const vaiParaUti = podeMoverParaUti(caso)
  const voltaDaUti = podeRetornarDaUti(caso)
  const novoReels = podeAdicionarReels(caso, etapas)

  // "Editar reels" é iniciar_etapa na etapa de vídeo — não existe estado
  // "em reels" separado: o caso segue na lista da esquerda e TAMBÉM aparece na
  // seção REELS enquanto a edição está em andamento.
  const etapaVideo = etapas.find((e) => e.tipo === 'edicao_video') ?? null
  const edicaoDeVideo = etapaVideo
    ? podeIniciar(etapaVideo, etapas)
    : { habilitada: false, motivo: 'Este caso não tem etapa de vídeo.' }
  const mostraAcoesDeCaso = podeEncerrarCaso(papel)

  // Com um diálogo aberto, o erro vai DENTRO dele: o <dialog> modal inertiza o
  // painel de trás, e um alerta ali ficaria escondido atrás do backdrop.
  const temDialogo =
    confirmacao !== null || handoffDe !== null || observacaoDe !== null

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
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                    <span>{ROTULO_STATUS_ETAPA[etapa.status]}</span>
                    {etapa.responsavelNome && <span>· {etapa.responsavelNome}</span>}
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

        {/* Um botão só, dois significados, conforme o caso já tem vídeo ou não.
            Sem etapa de vídeo: cria (adicionar_reels). Com etapa: começa a
            editar (iniciar_etapa), que é o que faz o caso aparecer na seção
            REELS. */}
        {etapaVideo ? (
          <Botao
            onClick={() =>
              executar(iniciar.mutateAsync({ casoEtapaId: etapaVideo.id }))
            }
            disabled={ocupado || !edicaoDeVideo.habilitada}
            title={edicaoDeVideo.motivo}
          >
            Editar reels
          </Botao>
        ) : (
          <Botao
            onClick={() => executar(adicionarReels.mutateAsync({ casoId: caso.id }))}
            disabled={ocupado || !novoReels.habilitada}
            title={novoReels.motivo}
          >
            Adicionar reels
          </Botao>
        )}
      </div>

      {/* Ações que encerram o caso. Não aparecem para operador — as RPCs
          negariam, e oferecer o que será negado é pior que não oferecer. */}
      {mostraAcoesDeCaso && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
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

          <span className="text-xs text-muted-foreground">
            Encerram o caso — sem desfazer.
          </span>
        </div>
      )}

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

      {handoffDe && (
        <DialogoHandoff
          etapa={handoffDe}
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

interface PropsHandoff {
  etapa: EtapaQuadro
  ocupado: boolean
  erro: string | null
  onCancelar: () => void
  onConfirmar: (paraPessoaId: string, motivo: string) => void
}

function DialogoHandoff({
  etapa,
  ocupado,
  erro,
  onCancelar,
  onConfirmar,
}: PropsHandoff) {
  const { data: pessoas, isPending } = usePessoasAtivas()
  const [paraPessoaId, setParaPessoaId] = useState('')
  const [motivo, setMotivo] = useState('')

  // A RPC recusa transferir para o responsável atual; tirar da lista evita o
  // erro em vez de explicá-lo depois.
  const opcoes = (pessoas ?? []).filter((p) => p.id !== etapa.responsavelId)

  return (
    <Dialogo
      titulo={`Passar ${ROTULO_ETAPA[etapa.tipo]} para outra pessoa`}
      rotuloConfirmar="Transferir"
      confirmarDesabilitado={paraPessoaId === ''}
      ocupado={ocupado}
      erro={erro}
      onCancelar={onCancelar}
      onConfirmar={() => onConfirmar(paraPessoaId, motivo)}
    >
      <p className="text-sm text-muted-foreground">
        Responsável agora: {etapa.responsavelNome ?? '—'}. A passagem fica registrada
        no histórico.
      </p>

      <label className="block">
        <span className="text-sm font-medium">Passar para</span>
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
