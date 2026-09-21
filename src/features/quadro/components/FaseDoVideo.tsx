import { useState } from 'react'
import clsx from 'clsx'
import { Dropdown } from '@/components/ui/Dropdown'
import { Dialogo } from '@/components/ui/Dialogo'
import { IconeCheck, IconeDispensar } from '@/components/ui/icones'
import { useDispensarEtapa, useMoverVideoMaster } from '../api/useAcoes'
import { mensagemDeErro } from '../lib/erros'
import { DialogoFinalizarVideo } from './DialogoFinalizarVideo'
import {
  FASES_VIDEO_NA_TELA,
  FASE_VIDEO_FINAL,
  ROTULO_FASE_VIDEO,
  faseDoVideo,
  type EtapaQuadro,
  type FaseVideoMaster,
} from '../types'

/**
 * A FASE do vídeo do MASTER — o fluxo do Trello, sem virar um Trello.
 *
 * (15/09/2026: a seção passou a abrir num modal, e o modal ganhou uma visão
 * POR FASE em colunas, para o gestor comparar com a lista antes de decidir —
 * ver SecaoEmModal. O argumento abaixo continua sendo o motivo da decisão
 * original, e a fase muda por aqui nas duas visões. Em 16/09 o gestor pediu o
 * ARRASTAR do ClickUp, que existe só no quadro de colunas e só no mouse: ele
 * cai nesta mesma RPC, e este seletor continua sendo o caminho de todo dia — o
 * único que funciona no celular e por teclado.)
 *
 * O gestor mostrou o quadro de colunas que a equipe usa hoje só para o vídeo
 * horizontal e pediu esse fluxo aqui dentro. As fases são o pedido; o QUADRO
 * não era — ele foi descartado explicitamente. E não custa nada perder: um
 * kanban é bom para ver CARGA (quantos há em cada coluna, onde está o
 * gargalo), e essa não é a pergunta desta seção. Aqui há um punhado de vídeos
 * de MASTER por vez, e a pergunta de quem senta na estação é sobre UM deles —
 * "em que pé está este, e para onde ele vai agora".
 *
 * Então a fase é uma PÍLULA na linha do vídeo, e trocá-la é abrir a lista:
 * dois toques. Arrastar é o gesto mais difícil de acertar num celular segurado
 * com uma mão num corredor (seção 6 do CLAUDE.md), e por isso ele é ATALHO no
 * PC — nunca o único caminho.
 *
 * SÃO TRÊS FASES DESDE 16/09/2026 (pedido do gestor): Editando, Alterações e
 * PRONTO PARA ENTREGA. "Enviado / finalizado" saiu — o gestor viu que os dois
 * eram redundantes, e eram: a equipe marcava um e o outro no mesmo minuto, e a
 * segunda coluna só afirmava que alguém tinha mandado o link, que é justamente
 * o que ninguém registrava.
 *
 * "PRONTO PARA ENTREGA" É TERMINAR A EDIÇÃO, e não o fim (21/09/2026, pedido do
 * gestor). Escolhê-lo abre o pedido dos DOIS links — o do vídeo e o WeTransfer
 * (DialogoFinalizarVideo) —, e o vídeo vai para Entregáveis, sinalizado como
 * VÍDEO. Ele FICA na seção, em pronto, até a Morgana confirmar a entrega; é a
 * confirmação que conclui a etapa e tira o cartão daqui. De 16/09 a 21/09 esta
 * escolha pedia um link só e concluía na hora.
 *
 * NOS DOIS SENTIDOS, e a lista inteira sempre visível. Um vídeo volta de
 * ALTERAÇÕES para EDITANDO, e um vídeo FINALIZADO volta para ALTERAÇÕES quando
 * a família pede mudança — esse caminho de volta agora é o "Pedir alteração" da
 * linha da etapa no card, sem reabrir o caso inteiro.
 *
 * SEM FASE ATÉ ALGUÉM DIZER UMA. A caixa de entrada do Trello ("VIDEOS -
 * EDIÇÃO") saiu do fluxo: estar nesta seção já é ser um vídeo para editar, e
 * uma pílula repetindo o nome da seção não informava nada.
 *
 * DISPENSAR NÃO É UMA FASE, e por isso vem separado no fim da lista, em
 * vermelho. Ele existe porque a seção é o ÚNICO lugar onde o vídeo se opera, e
 * havia um estado sem saída: um `edicao_video` que não deveria existir — quatro
 * deles ficaram em pacotes que não vendem vídeo, resíduo da janela em que o
 * checklist antigo ainda os gerava (27–31/08/2026) — aparecia na seção e não
 * podia ser tirado de lá por ninguém.
 */
const DISPENSAR = 'dispensar'

export function FaseDoVideo({
  etapa,
  nomeDoCaso,
  onErro,
}: {
  etapa: EtapaQuadro
  /** Para o diálogo de finalizar dizer de que família é o vídeo. */
  nomeDoCaso: string
  onErro: (mensagem: string | null) => void
}) {
  const mover = useMoverVideoMaster()
  const dispensar = useDispensarEtapa()
  const [dispensando, setDispensando] = useState(false)
  const [finalizando, setFinalizando] = useState(false)
  const atual = faseDoVideo(etapa.status)

  return (
    <>
      <Dropdown
        alinhamento="direita"
        rotulo={atual ? `Fase do vídeo: ${ROTULO_FASE_VIDEO[atual]}` : 'Definir a fase do vídeo'}
        {...(atual ? { selecionado: atual } : {})}
        desabilitado={mover.isPending}
        onEscolher={(item) => {
          onErro(null)
          if (item.id === DISPENSAR) {
            setDispensando(true)
            return
          }
          // PRONTO não é uma fase que se escolhe: escolhê-la é terminar a
          // edição, e terminar cobra os dois links. Já em pronto, reafirmar não
          // faz nada — o vídeo está esperando o ADM.
          if (item.id === FASE_VIDEO_FINAL) {
            if (etapa.status !== FASE_VIDEO_FINAL) setFinalizando(true)
            return
          }
          mover
            .mutateAsync({ casoEtapaId: etapa.id, fase: item.id as FaseVideoMaster })
            .catch((e) => onErro(mensagemDeErro(e)))
        }}
        itens={[
          ...FASES_VIDEO_NA_TELA.map((fase) => ({
            id: fase,
            rotulo: ROTULO_FASE_VIDEO[fase],
          })),
          {
            id: FASE_VIDEO_FINAL,
            rotulo: ROTULO_FASE_VIDEO[FASE_VIDEO_FINAL],
            icone: <IconeCheck className="size-4" />,
          },
          {
            id: DISPENSAR,
            rotulo: 'Este caso não tem vídeo',
            icone: <IconeDispensar className="size-4" />,
            destrutivo: true,
          },
        ]}
        gatilho={
          <span
            className={clsx(
              // A pílula É o alvo; o min-h-11 do Dropdown já garante os 44px
              // de altura de toque em volta dela.
              'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold transition-colors',
              atual
                ? ESTILO_FASE[atual]
                : // Sem fase: contorno tracejado e voz de convite, não de
                  // estado. É a mesma linguagem do "Acrescentar etapa" — a
                  // borda pontilhada diz "aqui falta algo" sem inventar um
                  // status que ninguém afirmou.
                  'border border-dashed border-border text-muted-foreground hover:border-marca hover:text-marca',
              mover.isPending && 'opacity-60',
            )}
          >
            {atual ? ROTULO_FASE_VIDEO[atual] : 'Definir fase'}
          </span>
        }
      />

      {finalizando && (
        <DialogoFinalizarVideo
          etapa={etapa}
          nomeDoCaso={nomeDoCaso}
          onFechar={() => setFinalizando(false)}
        />
      )}

      {dispensando && (
        <Dialogo
          titulo="Este caso não tem vídeo?"
          rotuloConfirmar={dispensar.isPending ? 'Dispensando…' : 'Dispensar o vídeo'}
          confirmarDestrutivo
          ocupado={dispensar.isPending}
          onCancelar={() => setDispensando(false)}
          onConfirmar={() => {
            onErro(null)
            dispensar
              .mutateAsync({
                casoEtapaId: etapa.id,
                motivo: 'Pacote não vende o vídeo horizontal — etapa criada por engano.',
              })
              .then(
                () => setDispensando(false),
                (e) => onErro(mensagemDeErro(e)),
              )
          }}
        >
          <p className="text-sm text-muted-foreground">
            A etapa sai desta seção e conta como resolvida — o caso deixa de
            esperar por ela para encerrar. Use quando o vídeo não faz parte do
            pacote; se ele só ainda não começou, deixe em “Editando”.
          </p>
        </Dialogo>
      )}
    </>
  )
}

/**
 * A cor diz em que pé está, e reusa os tokens que já significam isso na tela.
 *
 * PRONTO PARA ENTREGA usa `--pronto`, o token que o Quadro já usa para o caso
 * que terminou o trabalho e espera uma pessoa — e desde 21/09/2026 é exatamente
 * isso: o vídeo terminado, em Entregáveis, esperando a Morgana.
 */
const ESTILO_FASE: Record<FaseVideoMaster, string> = {
  em_andamento: 'bg-andamento/12 text-andamento-tinta',
  em_alteracao: 'bg-atencao/15 text-atencao-tinta',
  pronto_para_entrega: 'bg-pronto-fundo text-pronto border border-pronto-borda',
  concluida: 'bg-concluido/12 text-concluido-tinta',
}
