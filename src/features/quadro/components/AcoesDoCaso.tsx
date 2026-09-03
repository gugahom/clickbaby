import { useState } from 'react'
import clsx from 'clsx'
import { Botao } from '@/components/ui/Botao'
import { BotaoIcone } from '@/components/ui/BotaoIcone'
import { Alerta } from '@/components/ui/Alerta'
import { Dropdown } from '@/components/ui/Dropdown'
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
  IconeDispensar,
  IconeMais,
  IconeAdicionar,
} from '@/components/ui/icones'
import { formatarDataHora } from '@/lib/formato'
import { useAuth } from '@/features/auth/contexto'
import {
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
  useDispensarEtapa,
  useAdicionarEtapa,
} from '../api/useAcoes'
import {
  podeAtribuir,
  podeCancelar,
  podeConcluir,
  podeConfirmarEntrega,
  podeIniciar,
  podeMoverParaUti,
  podePausar,
  podeRetornarDaUti,
  podePlanejarRendicao,
  podeReabrir,
  podeDispensar,
  podeAdicionarEtapa,
  etapasAdicionaveis,
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
  type EtapaTipo,
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
/** Mesma divisão de três faixas do card. Reels sai da edição por decisão de
 *  TELA, e essa decisão precisa valer aqui também — duas listas da mesma
 *  etapa dizendo trilhas diferentes seria pior que não dizer. */
const ROTULO_FAIXA_DETALHE: Record<string, string> = {
  acompanhamento: 'Acompanhamento',
  edicao: 'Edição',
  reels: 'Reels',
}

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
  const planejarRendicao = usePlanejarRendicao()
  const anotar = useAnotarEtapa()
  const reabrir = useReabrirEtapa()
  const dispensar = useDispensarEtapa()
  const transferir = useTransferirEtapa()
  const confirmarEntrega = useConfirmarEntrega()
  const cancelar = useCancelarCaso()
  const adicionarEtapa = useAdicionarEtapa()

  const ocupado =
    iniciar.isPending ||
    atribuir.isPending ||
    pausar.isPending ||
    moverParaUti.isPending ||
    retornarDaUti.isPending ||
    concluir.isPending ||
    transferir.isPending ||
    confirmarEntrega.isPending ||
    adicionarEtapa.isPending ||
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
  const adicao = podeAdicionarEtapa(caso, etapas)

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
            const dispensa = podeDispensar(etapa, caso)
            const encerrada =
              etapa.status === 'concluida' || etapa.status === 'dispensada'
            /*
              O VÍDEO DO MASTER NÃO SE OPERA DAQUI (01/09/2026, a pedido do
              gestor: "o que for foto continua no card normal, o que for vídeo
              tem um fluxo especial").

              Ele percorre cinco fases — backlog, editando, alterações, pronto,
              enviado — e nenhuma delas cabe no par play/concluir desta lista.
              Oferecer os botões genéricos aqui daria DOIS caminhos para o mesmo
              trabalho, um deles capaz de pular direto de "pendente" para
              "concluída" sem passar por nada.

              A linha CONTINUA aparecendo, com a fase por extenso: o card é o
              checklist do caso, e sumir com o vídeo esconderia o que falta
              para encerrar. O que ela perde é só o poder de agir.
            */
            /*
             * O vídeo do MASTER só se opera pela seção — ENQUANTO ESTÁ ABERTO.
             *
             * Resolvido (concluído ou dispensado), ele sai da seção
             * (`videosMasterAbertos`) e precisa recuperar o desfazer aqui: sem
             * isto não haveria lugar nenhum para reabrir um vídeo entregue
             * quando a família pede alteração, que é o caminho de volta que a
             * seção guardava antes.
             */
            const noFluxoDaSecao = etapa.tipo === 'edicao_video' && !encerrada

            return (
              <li key={etapa.id} className="flex items-center gap-3 py-1.5 pr-1 pl-3">
                <span
                  className={clsx('size-2 flex-shrink-0 rounded-full', pontoEtapa(etapa))}
                  aria-hidden="true"
                />

                <div className="min-w-0 flex-1 py-1">
                  <div
                    className={clsx(
                      'flex flex-wrap items-center gap-1.5 text-sm font-bold tracking-tight',
                      encerrada && 'text-muted-foreground',
                    )}
                  >
                    {ROTULO_ETAPA[etapa.tipo]}
                    {/* Sem o sufixo, a lista mostraria "Foto" duas vezes e não
                        haveria como saber em qual se está clicando. */}
                    {etapas.some((o) => o.tipo === etapa.tipo && o.rodada !== etapa.rodada) && (
                      <span className="rounded-full bg-muted px-1.5 py-px text-[11px] font-semibold text-muted-foreground">
                        {ROTULO_RODADA[etapa.rodada]}
                      </span>
                    )}
                  </div>
                  {/* TRILHA · STATUS na segunda linha, na cor da seção.
                  
                      A trilha não aparecia aqui, e essa lista é o único lugar
                      onde as sete etapas convivem fora das três fitas — sem
                      ela, "Foto" e "Parto" ficam lado a lado sem dizer que uma
                      é edição e a outra é reels. */}
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                    <span className="font-semibold text-acento">
                      {ROTULO_FAIXA_DETALHE[etapa.tipo === 'reels' ? 'reels' : etapa.trilha]}
                    </span>
                    <span>· {ROTULO_STATUS_ETAPA[etapa.status]}</span>
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

                {/* Etapa RESOLVIDA fica só com o desfazer. Concluir e
                    dispensar são gestos de um toque, feitos com uma mão num
                    corredor — e dispensar acabou de nascer, então nasce com o
                    caminho de volta em vez de esperar a primeira queixa. */}
                {noFluxoDaSecao ? (
                  <span className="flex-shrink-0 pr-2 text-[11px] font-semibold text-muted-foreground">
                    na seção Master
                  </span>
                ) : encerrada ? (
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
                ) : null}

                {/*
                  DOIS BOTÕES E UM MENU — e a mudança é de mobile, medida.

                  Eram SETE ícones nesta linha: play, concluir, concluir com
                  observação, atribuir/handoff, rendição, aviso, dispensar. Em
                  375px eles não cabiam ao lado do nome da etapa e do
                  responsável: o grupo encostava no texto e a linha virava uma
                  fileira de símbolos parecidos, todos do mesmo tamanho e da
                  mesma cor, sem nenhum com precedência. Foi a queixa do teste
                  no celular, e está certa.

                  O CORTE NÃO É POR IMPORTÂNCIA, É POR FREQUÊNCIA. Play e
                  concluir são o gesto do corredor — uma mão, três toques
                  (seção 6) — e acontecem em toda etapa de todo caso. Os outros
                  cinco acontecem quando algo foge do normal: passar para
                  outra pessoa, avisar, dispensar. Esses aceitam dois toques,
                  e ganham em troca um RÓTULO em vez de um pictograma que
                  ninguém decifra de primeira.

                  ITEM QUE NÃO CABE FICA APAGADO, não some: a lista mudar de
                  tamanho a cada estado obrigaria a reler o menu toda vez, e o
                  motivo (que o `title` carrega) é o que ensina a regra de
                  precedência para quem ainda não a conhece.
                */}
                {!encerrada && !noFluxoDaSecao && (
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

                    <Dropdown
                      alinhamento="direita"
                      rotulo={`Mais ações de ${ROTULO_ETAPA[etapa.tipo]}`}
                      onEscolher={(item) => {
                        setErro(null)
                        if (item.id === 'observacao') setObservacaoDe(etapa)
                        if (item.id === 'atribuir') setAtribuirDe(etapa)
                        if (item.id === 'handoff') setHandoffDe(etapa)
                        if (item.id === 'rendicao') setRendicaoDe(etapa)
                        if (item.id === 'anotar') setAnotarDe(etapa)
                        if (item.id === 'dispensar') {
                          executar(dispensar.mutateAsync({ casoEtapaId: etapa.id }))
                        }
                      }}
                      itens={[
                        {
                          id: 'observacao',
                          rotulo: 'Concluir com observação',
                          icone: <IconeCaneta className="size-4" />,
                          desabilitado: ocupado || !conclusao.habilitada,
                          motivo: conclusao.motivo,
                        },
                        /* Mesmo slot, dois verbos. Antes de começar é ATRIBUIR
                           (designar quem vai fazer); depois é HANDOFF (passar
                           trabalho em curso, que vira linha em handoffs). A
                           linha não é o status, é se alguém já trabalhou. */
                        designacao.habilitada
                          ? {
                              id: 'atribuir',
                              rotulo: 'Atribuir responsável',
                              icone: <IconeAtribuir className="size-4" />,
                              desabilitado: ocupado,
                            }
                          : {
                              id: 'handoff',
                              rotulo: 'Passar para outra pessoa',
                              icone: <IconeHandoff className="size-4" />,
                              desabilitado: ocupado || !handoff.habilitada,
                              motivo: handoff.motivo,
                            },
                        /* Item PRÓPRIO, não compartilhado com os de cima.
                           Atribuir e handoff trocam o responsável agora; isto
                           só anuncia quem assume depois — as duas coisas
                           convivem, e a fotógrafa que sabe que sai em 15
                           minutos precisa das duas à mão. */
                        {
                          id: 'rendicao',
                          rotulo: etapa.proximoResponsavelNome
                            ? `Rendição: ${etapa.proximoResponsavelNome} assume`
                            : 'Planejar rendição de turno',
                          icone: <IconeRendicao className="size-4" />,
                          desabilitado: ocupado || !rendicao.habilitada,
                          motivo: rendicao.motivo,
                        },
                        /* Sem trava de status: anotar vale ANTES de a etapa
                           começar — é o único momento em que o aviso serve. */
                        {
                          id: 'anotar',
                          rotulo: etapa.observacao ? 'Editar aviso' : 'Escrever aviso',
                          icone: <IconeNota className="size-4" />,
                          desabilitado: ocupado,
                        },
                        /* DISPENSAR por último, e em vermelho. É a única do
                           menu que REMOVE trabalho do checklist, e a que
                           destrava o encerramento de um caso — o mesmo peso
                           visual de cancelar caso, pelo mesmo motivo. */
                        {
                          id: 'dispensar',
                          rotulo: 'Dispensar etapa',
                          icone: <IconeDispensar className="size-4" />,
                          destrutivo: true,
                          desabilitado: ocupado || !dispensa.habilitada,
                          motivo: dispensa.motivo,
                        },
                      ]}
                      gatilho={
                        <span
                          className="inline-flex size-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                          <IconeMais className="size-4" />
                        </span>
                      }
                    />
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {/*
        ACRESCENTAR UMA ETAPA QUE O PACOTE NÃO PREVIA.

        O caso do gestor: um BASIC não tem banho, mas a fotógrafa está na
        maternidade e vende o banho na hora. Até aqui esse trabalho acontecia e
        o sistema não sabia — sem etapa não há play, o tempo não entra em lugar
        nenhum, e o caso fecha dizendo que teve duas etapas quando teve três.

        É O PAR DE DISPENSAR, e por isso mora colado na lista que ele muda:
        dispensar tira do checklist o que não vai acontecer, isto acrescenta o
        que passou a acontecer. Juntos, o checklist do caso deixa de ser uma
        cópia congelada do pacote e passa a ser o que de fato foi combinado com
        aquela família.

        SÓ O QUE FALTA aparece no menu, e ele some inteiro quando não há o que
        acrescentar — um botão permanentemente vazio ensinaria a ignorá-lo.
        O PACOTE CONTINUA O MESMO: ele é o registro do que foi vendido no
        contrato, e a etapa avulsa fica em `eventos` como etapa_adicionada.
      */}
      {adicao.habilitada && (
        <Dropdown
          className="w-fit"
          rotulo="Acrescentar etapa"
          onEscolher={(item) =>
            executar(
              adicionarEtapa.mutateAsync({
                casoId: caso.id,
                tipo: item.id as EtapaTipo,
              }),
            )
          }
          itens={etapasAdicionaveis(etapas).map((tipo) => ({
            id: tipo,
            rotulo: ROTULO_ETAPA[tipo],
            desabilitado: ocupado,
          }))}
          gatilho={
            <span className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-dashed border-border px-3 text-sm font-semibold text-muted-foreground transition-colors hover:border-marca hover:text-marca">
              <IconeAdicionar className="size-4" />
              Acrescentar etapa
            </span>
          }
        />
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

        {/* "Adicionar vídeo" SAIU daqui (28/08/2026, a pedido do gestor).
        
            O botão acrescentava a etapa `edicao_video` — o horizontal — a um
            caso que não a tem. A ideia era a venda avulsa do horizontal num
            pacote que não o inclui; na operação isso não acontece, e num
            MASTER a etapa já vem do pacote, então o botão aparecia justamente
            onde não servia para nada. Ficava num cartão de BASIC oferecendo um
            trabalho que ninguém vendeu.
        
            A RPC `adicionar_video` CONTINUA existindo, e o caminho para o dia
            em que a venda avulsa acontecer é outro e melhor: trocar o pacote do
            caso, que é o registro do que foi vendido. */}
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
        {/* O ÚNICO botão com gradiente da tela.
        
            Ele era `destrutivo` — vermelho, a mesma cor de cancelar caso, que
            fica dois centímetros ao lado. Confirmar entrega é o oposto de
            cancelar: é o fim BOM do trabalho. Vestir os dois de vermelho pedia
            para a pessoa ler o rótulo para saber qual era qual, num gesto que
            não se desfaz.
        
            Agora ele usa o rosa da marca em gradiente, e cancelar volta a ser
            um botão quieto de contorno. A cor mais forte da tela fica com a
            ação que a fotógrafa procura quando o trabalho acabou. */}
        <Botao
          onClick={() => {
            setErro(null)
            setConfirmacao({ tipo: 'entrega' })
          }}
          disabled={ocupado || !entrega.habilitada}
          title={entrega.motivo}
          className="superficie-acento border-0 font-bold text-white shadow-cartao-alto hover:brightness-110"
        >
          <IconeCheck className="size-4" />
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
        <DialogoConfirmarEntrega
          caso={caso}
          etapas={etapas}
          ocupado={confirmarEntrega.isPending}
          erro={erro}
          onCancelar={() => setConfirmacao(null)}
          onConfirmar={() =>
            executar(confirmarEntrega.mutateAsync({ casoId: caso.id }), () =>
              setConfirmacao(null),
            )
          }
        />
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

interface ItemChecklistEntrega {
  id: string
  rotulo: string
}

/** A única que vale para todo caso: sempre há fotos para entregar. */
const CHECKLIST_ENTREGA_BASE: ItemChecklistEntrega[] = [
  { id: 'fotos_completas', rotulo: 'Fotos completas no Google' },
]

/**
 * O reels, quando o caso TEM reels.
 *
 * Era item fixo, porque "reels existe em todos os pacotes" (seção 2 do
 * CLAUDE.md). Deixou de valer para o MASTER em 03/09/2026, por decisão do
 * gestor — e pedir a conferência de um reels que não existe é ensinar a marcar
 * caixa sem olhar, que estraga a única coisa que este checklist faz.
 *
 * A condição olha as ETAPAS DO CASO, não o slug do pacote. É mais robusto e é o
 * que o CLAUDE.md manda: um MASTER que vender o vertical ganha a etapa por
 * `adicionar_etapa` e volta a ter a caixa, sem ninguém lembrar de mexer aqui.
 */
const CHECKLIST_ENTREGA_REELS: ItemChecklistEntrega[] = [
  { id: 'reels_completo', rotulo: 'Reels completo no Google' },
]

/**
 * SÓ NO BIRTH E BIRTH+REELS (31/08/2026, a pedido do gestor).
 *
 * Os dois pacotes entregam pelo mesmo formato — link único de foto+vídeo,
 * "cadeado" — e nascem sem contrato fechado (é a tentativa de venda
 * pós-parto, seção 2 do CLAUDE.md). O "com final" é a versão que a família
 * recebe depois de decidir se compra, com o encerramento do vídeo incluso;
 * o sem final é o que sai primeiro, para apresentar o material.
 *
 * `pacoteSlug` e não `pacoteNome`: BIRTH e BIRTH+REELS são dois slugs
 * (`birth`, `birth-reels`) que começam pelo mesmo prefixo — comparar o
 * NOME exigiria listar as duas grafias e reencontrar a mesma armadilha se
 * um terceiro pacote de BIRTH nascer um dia.
 */
const CHECKLIST_ENTREGA_BIRTH: ItemChecklistEntrega[] = [
  { id: 'cadeado_fv', rotulo: 'Link CADEADO F+V no Google' },
  { id: 'cadeado_fv_final', rotulo: 'Link CADEADO F+V com final no Google' },
]

interface PropsDialogoConfirmarEntrega {
  caso: CasoQuadro
  /** Para saber se este caso tem reels — ver CHECKLIST_ENTREGA_REELS. */
  etapas: EtapaQuadro[]
  ocupado: boolean
  erro: string | null
  onCancelar: () => void
  onConfirmar: () => void
}

/**
 * O checklist que HABILITA o botão, não que registra dado nenhum.
 *
 * O gestor pediu isto depois de reparar que "Confirmar entrega" virava um
 * segundo clique de confirmação sem checar NADA — a pessoa podia confirmar
 * sem ter de fato subido as fotos. As caixas aqui são a conferência final,
 * item por item, antes do gesto que não tem volta.
 *
 * DE PROPÓSITO NÃO VIRA COLUNA NOVA NO BANCO. O que a RPC exige continua
 * sendo o mesmo de sempre — pelo menos um entregável registrado
 * (podeConfirmarEntrega, lib/acoes.ts). Este checklist é a certeza de QUEM
 * está confirmando, não um registro que o sistema audita depois; guardar
 * cada caixinha marcada criaria uma segunda fonte de verdade sobre o que
 * foi entregue, competindo com os links de `entregaveis` que já são essa
 * fonte.
 */
function DialogoConfirmarEntrega({
  caso,
  etapas,
  ocupado,
  erro,
  onCancelar,
  onConfirmar,
}: PropsDialogoConfirmarEntrega) {
  const ehBirth = caso.pacoteSlug?.startsWith('birth') ?? false
  const temReels = etapas.some((e) => e.tipo === 'reels')
  const itens = [
    ...CHECKLIST_ENTREGA_BASE,
    ...(temReels ? CHECKLIST_ENTREGA_REELS : []),
    ...(ehBirth ? CHECKLIST_ENTREGA_BIRTH : []),
  ]

  const [conferidos, setConferidos] = useState<Set<string>>(new Set())

  function alternar(id: string) {
    setConferidos((atual) => {
      const proximo = new Set(atual)
      if (proximo.has(id)) proximo.delete(id)
      else proximo.add(id)
      return proximo
    })
  }

  return (
    <Dialogo
      titulo="Confirmar entrega e encerrar o caso?"
      rotuloConfirmar="Confirmar entrega"
      confirmarDestrutivo
      confirmarDesabilitado={itens.some((item) => !conferidos.has(item.id))}
      ocupado={ocupado}
      erro={erro}
      onCancelar={onCancelar}
      onConfirmar={onConfirmar}
    >
      <p className="text-sm text-muted-foreground">
        {caso.maeNome}
        {caso.bebeNome ? ` · ${caso.bebeNome}` : ''}. Os links passam a contar como
        confirmados e o caso é encerrado. Não há como desfazer.
      </p>

      <ul className="space-y-0.5">
        {itens.map((item) => (
          <li key={item.id}>
            {/* min-h-11: a linha inteira é o alvo de toque (seção 6 do
                CLAUDE.md), não só o quadrado de 16px do checkbox. */}
            <label className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-md px-1 text-sm font-medium transition-colors hover:bg-muted">
              <input
                type="checkbox"
                checked={conferidos.has(item.id)}
                onChange={() => alternar(item.id)}
                className="size-5 flex-shrink-0 rounded border-border accent-marca"
              />
              {item.rotulo}
            </label>
          </li>
        ))}
      </ul>
    </Dialogo>
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

      <div>
        <span className="text-sm font-medium">Pessoa</span>
        <div className="mt-1">
          <Dropdown
            rotulo={isPending ? 'Carregando…' : 'Selecione uma pessoa'}
            desabilitado={isPending}
            selecionado={paraPessoaId}
            onEscolher={(item) => setParaPessoaId(item.id)}
            itens={opcoes.map((p) => ({ id: p.id, rotulo: p.nome }))}
          />
        </div>
      </div>

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
