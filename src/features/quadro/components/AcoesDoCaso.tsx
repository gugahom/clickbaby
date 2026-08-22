import { useState } from 'react'
import { Botao } from '@/components/ui/Botao'
import { Alerta } from '@/components/ui/Alerta'
import { Dialogo } from '@/components/ui/Dialogo'
import { useAuth } from '@/features/auth/contexto'
import {
  useCancelarCaso,
  useConcluirEtapa,
  useConfirmarEntrega,
  useIniciarEtapa,
  useTransferirEtapa,
  usePessoasAtivas,
} from '../api/useAcoes'
import {
  podeCancelar,
  podeConcluir,
  podeConfirmarEntrega,
  podeIniciar,
  podeTransferir,
  podeEncerrarCaso,
} from '../lib/acoes'
import { mensagemDeErro } from '../lib/erros'
import { ROTULO_ETAPA, type CasoQuadro, type EtapaQuadro } from '../types'

interface PropsAcoes {
  caso: CasoQuadro
  etapas: EtapaQuadro[]
}

type Confirmacao = { tipo: 'entrega' } | { tipo: 'cancelamento' } | null

/**
 * Ações de escrita do Quadro. Todas chamam RPC; nenhuma toca estado local de
 * etapa (a fonte da verdade é o banco depois da chamada — as mutations
 * invalidam a query do Quadro e a tela redesenha).
 *
 * Divisão de atrito, deliberada:
 *   - iniciar e concluir vão DIRETO. São o gesto frequente, feito de pé, com
 *     uma mão. Confirmação aqui empurraria a equipe de volta ao quadro branco.
 *   - confirmar entrega e cancelar pedem CONFIRMAÇÃO. Encerram o caso e as RPCs
 *     não têm desfazer.
 *
 * O gating por papel é de conveniência, não de segurança: as RPCs barram no
 * backend (confirmar_entrega e cancelar_caso exigem eh_atendimento() ou
 * eh_adm()). A tela só evita oferecer o que já se sabe que será negado.
 */
export function AcoesDoCaso({ caso, etapas }: PropsAcoes) {
  const { pessoa } = useAuth()
  const papel = pessoa?.papelSistema ?? 'operador'

  const [erro, setErro] = useState<string | null>(null)
  const [confirmacao, setConfirmacao] = useState<Confirmacao>(null)
  const [motivoCancelamento, setMotivoCancelamento] = useState('')
  const [handoffDe, setHandoffDe] = useState<EtapaQuadro | null>(null)

  const iniciar = useIniciarEtapa()
  const concluir = useConcluirEtapa()
  const transferir = useTransferirEtapa()
  const confirmarEntrega = useConfirmarEntrega()
  const cancelar = useCancelarCaso()

  const ocupado =
    iniciar.isPending ||
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
  const mostraAcoesDeCaso = podeEncerrarCaso(papel)

  // Com um diálogo aberto, o erro vai DENTRO dele: o <dialog> modal inertiza o
  // painel de trás, e um alerta ali ficaria escondido atrás do backdrop.
  const temDialogo = confirmacao !== null || handoffDe !== null

  return (
    <div className="space-y-3">
      {erro && !temDialogo && <Alerta onFechar={() => setErro(null)}>{erro}</Alerta>}

      {/* Uma linha de ações por etapa: é a etapa que se inicia, conclui e
          transfere, não o caso. */}
      {etapas.length > 0 && (
        <ul className="space-y-2">
          {etapas.map((etapa) => {
            const inicio = podeIniciar(etapa)
            const conclusao = podeConcluir(etapa)
            const handoff = podeTransferir(etapa)
            const encerrada = etapa.status === 'concluida' || etapa.status === 'dispensada'

            return (
              <li
                key={etapa.id}
                className="flex flex-wrap items-center gap-2 rounded bg-background/60 px-2 py-2"
              >
                <span
                  className={`flex-1 text-sm font-medium ${encerrada ? 'text-muted-foreground line-through' : ''}`}
                >
                  {ROTULO_ETAPA[etapa.tipo]}
                </span>

                {/* Etapa terminada não mostra botão nenhum — some, não fica
                    desabilitado ocupando espaço no mobile. */}
                {!encerrada && (
                  <>
                    <Botao
                      onClick={() =>
                        executar(iniciar.mutateAsync({ casoEtapaId: etapa.id }))
                      }
                      disabled={ocupado || !inicio.habilitada}
                      title={inicio.motivo}
                    >
                      Iniciar
                    </Botao>

                    <Botao
                      variante="primario"
                      onClick={() =>
                        executar(concluir.mutateAsync({ casoEtapaId: etapa.id }))
                      }
                      disabled={ocupado || !conclusao.habilitada}
                      title={conclusao.motivo}
                    >
                      Concluir
                    </Botao>

                    <Botao
                      variante="fantasma"
                      onClick={() => {
                        setErro(null)
                        setHandoffDe(etapa)
                      }}
                      disabled={ocupado || !handoff.habilitada}
                      title={handoff.motivo}
                    >
                      Handoff
                    </Botao>
                  </>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {/* Ações que encerram o caso. Não aparecem para operador — as RPCs
          negariam, e oferecer o que será negado é pior que não oferecer. */}
      {mostraAcoesDeCaso && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
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

interface PropsHandoff {
  etapa: EtapaQuadro
  ocupado: boolean
  erro: string | null
  onCancelar: () => void
  onConfirmar: (paraPessoaId: string, motivo: string) => void
}

function DialogoHandoff({ etapa, ocupado, erro, onCancelar, onConfirmar }: PropsHandoff) {
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
