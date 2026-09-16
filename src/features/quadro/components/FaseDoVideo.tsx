import { useState } from 'react'
import clsx from 'clsx'
import { Dropdown } from '@/components/ui/Dropdown'
import { Dialogo } from '@/components/ui/Dialogo'
import { IconeCheck, IconeDispensar } from '@/components/ui/icones'
import {
  useDispensarEtapa,
  useFinalizarVideoMaster,
  useMoverVideoMaster,
} from '../api/useAcoes'
import { mensagemDeErro } from '../lib/erros'
import { CONFIRMAR_FIM_DO_VIDEO } from '../lib/fim-da-edicao'
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
 * Agora "Pronto para entrega" É o fim, e ele cobra o LINK do vídeo — a mesma
 * troca que o envio para Entregáveis faz com o link do Google. Com o link, a
 * etapa conclui e o cartão sai da seção (`finalizar_video_master`, migration
 * 20260916180834, que faz as duas coisas na mesma transação).
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
  onErro,
}: {
  etapa: EtapaQuadro
  onErro: (mensagem: string | null) => void
}) {
  const mover = useMoverVideoMaster()
  const finalizar = useFinalizarVideoMaster()
  const dispensar = useDispensarEtapa()
  const [dispensando, setDispensando] = useState(false)
  const [finalizando, setFinalizando] = useState(false)
  const [link, setLink] = useState('')
  const [erroDialogo, setErroDialogo] = useState<string | null>(null)
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
          // A FASE FINAL não é uma fase que se escolhe: escolhê-la é
          // finalizar, e finalizar cobra o link.
          if (item.id === FASE_VIDEO_FINAL) {
            setErroDialogo(null)
            setLink('')
            setFinalizando(true)
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
        <Dialogo
          titulo={CONFIRMAR_FIM_DO_VIDEO.titulo}
          rotuloConfirmar={
            finalizar.isPending ? 'Finalizando…' : CONFIRMAR_FIM_DO_VIDEO.rotuloConfirmar
          }
          confirmarDesabilitado={link.trim() === ''}
          ocupado={finalizar.isPending}
          erro={erroDialogo}
          onCancelar={() => setFinalizando(false)}
          onConfirmar={() => {
            setErroDialogo(null)
            finalizar
              .mutateAsync({ casoEtapaId: etapa.id, url: link.trim() })
              .then(
                () => setFinalizando(false),
                (e) => setErroDialogo(mensagemDeErro(e)),
              )
          }}
        >
          <p className="text-sm text-muted-foreground">{CONFIRMAR_FIM_DO_VIDEO.texto}</p>

          <label className="block">
            <span className="text-sm font-medium">{CONFIRMAR_FIM_DO_VIDEO.campo.rotulo}</span>
            <input
              type="url"
              inputMode="url"
              autoFocus
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder={CONFIRMAR_FIM_DO_VIDEO.campo.placeholder}
              className="mt-1.5 min-h-12 w-full rounded-md border border-border bg-background px-3 text-base"
            />
          </label>
        </Dialogo>
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
 * que terminou o trabalho e espera uma pessoa. Ele só aparece em vídeo antigo:
 * desde 16/09/2026 a tela não escreve mais essa fase — quem passa por "pronto
 * para entrega" já sai finalizado, com o link.
 */
const ESTILO_FASE: Record<FaseVideoMaster, string> = {
  em_andamento: 'bg-andamento/12 text-andamento-tinta',
  em_alteracao: 'bg-atencao/15 text-atencao-tinta',
  pronto_para_entrega: 'bg-pronto-fundo text-pronto border border-pronto-borda',
  concluida: 'bg-concluido/12 text-concluido-tinta',
}
