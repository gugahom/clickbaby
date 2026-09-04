import { useState } from 'react'
import { BotaoIcone } from '@/components/ui/BotaoIcone'
import { IconeCheck, IconePause, IconePlay } from '@/components/ui/icones'
import {
  useConcluirEtapa,
  useConcluirEtapaComEntregaveis,
  useIniciarEtapa,
  usePausarEtapa,
} from '../api/useAcoes'
import { podeConcluir, podeIniciar, podePausar } from '../lib/acoes'
import { linksExigidosNaConclusao } from '../lib/links-da-conclusao'
import { DialogoConcluirComLinks } from './DialogoConcluirComLinks'
import { mensagemDeErro } from '../lib/erros'
import type { CasoQuadro, EtapaQuadro } from '../types'

interface PropsAcoesDaEtapa {
  /** De quem é a etapa — o pacote decide se a conclusão pede link. */
  caso: CasoQuadro
  etapa: EtapaQuadro
  /** Todas as etapas do caso: a precedência depende delas, não só desta. */
  etapas: EtapaQuadro[]
  onErro: (mensagem: string | null) => void
}

/**
 * Play / pause / concluir de UMA etapa, num grupo compacto.
 *
 * Existe para as seções laterais, onde não há linha expansível: o gestor pediu
 * que a seção REELS acompanhe os botões dos cards, e sem isso ela só informava
 * — para agir era preciso achar o mesmo caso na lista da esquerda, abrir e
 * descer até a etapa. Numa sala de edição com o Quadro na TV, isso é o
 * suficiente para ninguém usar.
 *
 * NÃO traz atribuir, handoff, rendição nem aviso. A coluna tem 30rem e sete
 * ícones não caberiam sem virar alvo de 24px, abaixo do mínimo da seção 6. O
 * que fica aqui é o que a pessoa na estação de edição faz o tempo todo;
 * o resto continua no detalhe do caso.
 *
 * As regras (podeIniciar, podePausar, podeConcluir) são as MESMAS de lá — não
 * há uma segunda definição de quando um botão pode ser tocado.
 *
 * E A TRAVA DO LINK TAMBÉM É A MESMA. Este botão concluía direto pela RPC
 * antiga, o que abriria um buraco exatamente no caminho mais usado: a seção
 * REELS é onde a equipe de edição trabalha, com o Quadro na TV da sala. Uma
 * regra que vale no card e não vale aqui não é uma regra — é uma sugestão.
 */
export function AcoesDaEtapa({ caso, etapa, etapas, onErro }: PropsAcoesDaEtapa) {
  const iniciar = useIniciarEtapa()
  const pausar = usePausarEtapa()
  const concluir = useConcluirEtapa()
  const concluirComLinks = useConcluirEtapaComEntregaveis()
  const [ocupadoLocal, setOcupadoLocal] = useState(false)
  const [pedindoLinks, setPedindoLinks] = useState(false)

  const exigidos = linksExigidosNaConclusao(etapa, caso)

  const inicio = podeIniciar(etapa, etapas)
  const pausa = podePausar(etapa)
  const conclusao = podeConcluir(etapa, etapas)
  const ocupado =
    ocupadoLocal ||
    iniciar.isPending ||
    pausar.isPending ||
    concluir.isPending ||
    concluirComLinks.isPending

  function executar(promessa: Promise<unknown>) {
    onErro(null)
    setOcupadoLocal(true)
    promessa
      .catch((e) => onErro(mensagemDeErro(e)))
      .finally(() => setOcupadoLocal(false))
  }

  return (
    <div className="flex flex-shrink-0 items-center">
      {etapa.status === 'em_andamento' ? (
        <BotaoIcone
          rotulo="Pausar edição"
          tom="acao"
          disabled={ocupado || !pausa.habilitada}
          motivo={pausa.motivo}
          onClick={() => executar(pausar.mutateAsync({ casoEtapaId: etapa.id }))}
        >
          <IconePause className="size-4" />
        </BotaoIcone>
      ) : (
        <BotaoIcone
          rotulo={etapa.status === 'pausada' ? 'Retomar edição' : 'Iniciar edição'}
          tom="acao"
          disabled={ocupado || !inicio.habilitada}
          motivo={inicio.motivo}
          onClick={() => executar(iniciar.mutateAsync({ casoEtapaId: etapa.id }))}
        >
          <IconePlay className="size-4" />
        </BotaoIcone>
      )}

      <BotaoIcone
        rotulo={exigidos.length > 0 ? 'Concluir edição com o link' : 'Concluir edição'}
        tom="positivo"
        disabled={ocupado || !conclusao.habilitada}
        motivo={conclusao.motivo}
        onClick={() => {
          onErro(null)
          if (exigidos.length > 0) setPedindoLinks(true)
          else executar(concluir.mutateAsync({ casoEtapaId: etapa.id }))
        }}
      >
        <IconeCheck className="size-[18px]" />
      </BotaoIcone>

      {pedindoLinks && (
        <DialogoConcluirComLinks
          caso={caso}
          etapa={etapa}
          exigidos={exigidos}
          ocupado={concluirComLinks.isPending}
          erro={null}
          onCancelar={() => setPedindoLinks(false)}
          onConfirmar={(entregaveis, observacao) => {
            onErro(null)
            setOcupadoLocal(true)
            concluirComLinks
              .mutateAsync({
                casoEtapaId: etapa.id,
                entregaveis,
                ...(observacao === '' ? {} : { observacao }),
              })
              .then(() => setPedindoLinks(false))
              .catch((e) => onErro(mensagemDeErro(e)))
              .finally(() => setOcupadoLocal(false))
          }}
        />
      )}
    </div>
  )
}
