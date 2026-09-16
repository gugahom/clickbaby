import { useState } from 'react'
import clsx from 'clsx'
import { IconeNota } from '@/components/ui/icones'
import { AnotarDialogo } from './AnotarDialogo'
import { useAnotarEtapa } from '../api/useAcoes'
import { mensagemDeErro } from '../lib/erros'
import type { EtapaQuadro } from '../types'

/**
 * OS PEDIDOS DO CLIENTE SOBRE O VÍDEO (16/09/2026, pedido do gestor).
 *
 * "São feitos vários pedidos sobre os vídeos do master — prints, link de
 * músicas, entre muitas outras coisas." Hoje isso chega por WhatsApp e morre
 * lá: quem senta na estação de edição não tem onde ler o que a família pediu, e
 * quem recebeu o pedido não tem onde escrever.
 *
 * É A OBSERVAÇÃO DA ETAPA (`anotar_etapa`), e não um campo novo. O texto livre
 * por etapa já existe, já é append no histórico e já aceita qualquer coisa que
 * se cole — inclusive um link de música, que é o exemplo que ele deu. Uma tabela
 * de "pedidos" com data e autor seria mais bonita e resolveria a mesma pergunta
 * com uma migration, uma RPC e uma tela a mais.
 *
 * NÃO APARECE NA FAIXA DO CARD (decisão do gestor, mesma conversa). A faixa
 * vermelha do Quadro é chamado para quem está em campo; um pedido de música
 * dentro de um vídeo de dez dias úteis pulsando ali ensinaria a equipe a ignorar
 * a faixa. Ver o filtro em `AvisosDoCaso`.
 */
export function PedidosDaEtapa({
  etapa,
  onErro,
}: {
  etapa: EtapaQuadro
  onErro: (mensagem: string | null) => void
}) {
  const anotar = useAnotarEtapa()
  const [aberto, setAberto] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const tem = (etapa.observacao ?? '').trim() !== ''

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setErro(null)
          setAberto(true)
        }}
        aria-label={tem ? 'Ver e editar os pedidos do cliente' : 'Escrever os pedidos do cliente'}
        title={tem ? etapa.observacao ?? undefined : 'Pedidos do cliente'}
        className={clsx(
          // O alvo tem 44px (seção 6) sem a pastilha crescer: o retângulo
          // invisível do `before` é o que a mão acerta. Mesmo recurso do
          // CampoEstacao, pelo mesmo motivo — a linha do cartão é apertada.
          'relative inline-flex h-6 flex-shrink-0 cursor-pointer items-center gap-1 rounded-full px-2 text-xs font-semibold transition-colors',
          "before:absolute before:top-1/2 before:left-1/2 before:size-11 before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']",
          tem
            ? // A MESMA COR DO BLOCO que mostra o texto logo abaixo (ver
              // CartaoDeEdicao): a pastilha diz que HÁ pedido, o bloco diz
              // qual é, e uma cor só amarra as duas coisas. Era `bg-marca-
              // suave`, que é a cor de identidade do pacote — nada a ver.
              'bg-atencao/15 text-atencao-tinta'
            : 'border border-dashed border-border text-muted-foreground hover:border-marca hover:text-marca',
        )}
      >
        <IconeNota className="size-3.5" />
        Pedidos
      </button>

      {aberto && (
        <AnotarDialogo
          etapa={etapa}
          ocupado={anotar.isPending}
          erro={erro}
          onCancelar={() => setAberto(false)}
          onConfirmar={(observacao) => {
            setErro(null)
            onErro(null)
            anotar
              .mutateAsync({ casoEtapaId: etapa.id, observacao })
              .then(
                () => setAberto(false),
                (e) => setErro(mensagemDeErro(e)),
              )
          }}
        />
      )}
    </>
  )
}
