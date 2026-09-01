import clsx from 'clsx'
import { Dropdown } from '@/components/ui/Dropdown'
import { useMoverVideoMaster } from '../api/useAcoes'
import { mensagemDeErro } from '../lib/erros'
import {
  FASES_VIDEO_MASTER,
  ROTULO_FASE_VIDEO,
  faseDoVideo,
  type EtapaQuadro,
  type FaseVideoMaster,
} from '../types'

/**
 * A FASE do vídeo do MASTER — o fluxo do Trello, sem virar um Trello.
 *
 * O gestor mostrou o quadro de colunas que a equipe usa hoje só para o vídeo
 * horizontal e pediu esse fluxo aqui dentro. As cinco fases são o pedido; o
 * QUADRO não era — ele foi descartado explicitamente. E não custa nada perder:
 * um kanban é bom para ver CARGA (quantos há em cada coluna, onde está o
 * gargalo), e essa não é a pergunta desta seção. Aqui há um punhado de vídeos
 * de MASTER por vez, e a pergunta de quem senta na estação é sobre UM deles —
 * "em que pé está este, e para onde ele vai agora".
 *
 * Então a fase é uma PÍLULA na linha do vídeo, e trocá-la é abrir a lista das
 * cinco. Dois toques, sem arrastar — arrastar é o gesto mais difícil de
 * acertar num celular segurado com uma mão num corredor (seção 6 do
 * CLAUDE.md), e é exatamente o gesto que um kanban exige.
 *
 * NOS DOIS SENTIDOS, e a lista inteira sempre visível. Um vídeo volta de
 * PRONTO para ALTERAÇÕES quando a família pede mudança — isso não é desfazer,
 * é o fluxo normal. Uma lista que só oferecesse "o próximo" esconderia
 * metade do que acontece de verdade.
 *
 * Os RÓTULOS são os do Trello deles, não uma tradução: quem opera reconhece
 * "ENVIADO / FINALIZADO", não "Concluída". Ver ROTULO_FASE_VIDEO.
 */
export function FaseDoVideo({
  etapa,
  onErro,
}: {
  etapa: EtapaQuadro
  onErro: (mensagem: string | null) => void
}) {
  const mover = useMoverVideoMaster()
  const atual = faseDoVideo(etapa.status)
  const estilo = ESTILO_FASE[atual]

  return (
    <Dropdown
      alinhamento="direita"
      rotulo={`Fase do vídeo: ${ROTULO_FASE_VIDEO[atual]}`}
      selecionado={atual}
      desabilitado={mover.isPending}
      onEscolher={(item) => {
        onErro(null)
        mover
          .mutateAsync({ casoEtapaId: etapa.id, fase: item.id as FaseVideoMaster })
          .catch((e) => onErro(mensagemDeErro(e)))
      }}
      itens={FASES_VIDEO_MASTER.map((fase) => ({
        id: fase,
        rotulo: ROTULO_FASE_VIDEO[fase],
      }))}
      gatilho={
        <span
          className={clsx(
            // A pílula É o alvo; o min-h-11 do Dropdown já garante os 44px
            // de altura de toque em volta dela.
            'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold transition-colors',
            estilo,
            mover.isPending && 'opacity-60',
          )}
        >
          {ROTULO_FASE_VIDEO[atual]}
        </span>
      }
    />
  )
}

/**
 * A cor diz em que pé está, e reusa os tokens que já significam isso na tela.
 *
 * PENDENTE EM VERMELHO pelo mesmo motivo do selo da seção: um vídeo só chega
 * aqui depois de LIBERADO, então "pendente" não é "ainda não é hora", é "o
 * prazo está correndo e ninguém pegou".
 *
 * PRONTO PARA ENTREGA usa `--pronto`, o token que o Quadro já usa para o caso
 * que terminou o trabalho e espera uma pessoa. É literalmente o mesmo estado,
 * um nível abaixo — e a cor repetida é o que faz os dois se lerem como a
 * mesma ideia.
 */
const ESTILO_FASE: Record<FaseVideoMaster, string> = {
  pendente: 'bg-atrasado/12 text-atrasado',
  em_andamento: 'bg-andamento/12 text-andamento-tinta',
  em_alteracao: 'bg-atencao/15 text-atencao-tinta',
  pronto_para_entrega: 'bg-pronto-fundo text-pronto border border-pronto-borda',
  concluida: 'bg-concluido/12 text-concluido-tinta',
}
