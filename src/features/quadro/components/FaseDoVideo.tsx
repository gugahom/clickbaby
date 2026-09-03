import { useState } from 'react'
import clsx from 'clsx'
import { Dropdown } from '@/components/ui/Dropdown'
import { Dialogo } from '@/components/ui/Dialogo'
import { IconeDispensar } from '@/components/ui/icones'
import { useDispensarEtapa, useMoverVideoMaster } from '../api/useAcoes'
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
 * SEM FASE ATÉ ALGUÉM DIZER UMA. A caixa de entrada do Trello ("VIDEOS -
 * EDIÇÃO") saiu do fluxo: estar nesta seção já é ser um vídeo para editar, e
 * uma pílula repetindo o nome da seção não informava nada. Enquanto ninguém
 * escolhe, o controle é neutro e diz o que ele faz — não finge um estado.
 *
 * Os RÓTULOS são os do Trello deles, não uma tradução: quem opera reconhece
 * "ENVIADO / FINALIZADO", não "Concluída". Ver ROTULO_FASE_VIDEO.
 *
 * DISPENSAR NÃO É UMA FASE, e por isso vem separado no fim da lista, em
 * vermelho. Ele existe porque a seção é o ÚNICO lugar onde o vídeo se opera, e
 * havia um estado sem saída: um `edicao_video` que não deveria existir — quatro
 * deles ficaram em pacotes que não vendem vídeo, resíduo da janela em que o
 * checklist antigo ainda os gerava (27–31/08/2026) — aparecia na seção e não
 * podia ser tirado de lá por ninguém. "Não vai acontecer" é exatamente o que
 * `dispensar_etapa` diz, e ele conta como resolvido na trava de encerramento.
 */
const DISPENSAR = 'dispensar'
export function FaseDoVideo({
  etapa,
  onErro,
}: {
  etapa: EtapaQuadro
  onErro: (mensagem: string | null) => void
}) {
  const mover = useMoverVideoMaster()
  const dispensar = useDispensarEtapa()
  const [dispensando, setDispensando] = useState(false)
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
        mover
          .mutateAsync({ casoEtapaId: etapa.id, fase: item.id as FaseVideoMaster })
          .catch((e) => onErro(mensagemDeErro(e)))
      }}
      itens={[
        ...FASES_VIDEO_MASTER.map((fase) => ({
          id: fase,
          rotulo: ROTULO_FASE_VIDEO[fase],
        })),
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
 * que terminou o trabalho e espera uma pessoa. É literalmente o mesmo estado,
 * um nível abaixo — e a cor repetida é o que faz os dois se lerem como a
 * mesma ideia.
 */
const ESTILO_FASE: Record<FaseVideoMaster, string> = {
  em_andamento: 'bg-andamento/12 text-andamento-tinta',
  em_alteracao: 'bg-atencao/15 text-atencao-tinta',
  pronto_para_entrega: 'bg-pronto-fundo text-pronto border border-pronto-borda',
  concluida: 'bg-concluido/12 text-concluido-tinta',
}
