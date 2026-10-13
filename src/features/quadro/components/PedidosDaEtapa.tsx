import { useState } from 'react'
import clsx from 'clsx'
import { Dialogo } from '@/components/ui/Dialogo'
import { IconeClipe, IconeNota } from '@/components/ui/icones'
import { AnexosDosPedidos } from './AnexosDosPedidos'
import { useEnvioDeAnexos } from '../api/useEnvioDeAnexos'
import { useAnotarEtapa } from '../api/useAcoes'
import { mensagemDeErro } from '../lib/erros'
import { ROTULO_ETAPA, type EtapaQuadro } from '../types'

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
 *
 * E GANHOU ANEXOS (13/10/2026, pedido do gestor): a referência que a família
 * manda — a música, a foto, o vídeo — mora junto do texto, como no cartão do
 * Trello. A pastilha conta os anexos, e acende com eles mesmo sem texto.
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

  const temTexto = (etapa.observacao ?? '').trim() !== ''
  const tem = temTexto || etapa.anexos > 0

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setErro(null)
          setAberto(true)
        }}
        aria-label={tem ? 'Ver e editar os pedidos do cliente' : 'Escrever os pedidos do cliente'}
        title={temTexto ? etapa.observacao ?? undefined : 'Pedidos do cliente'}
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
        {etapa.anexos > 0 && (
          <span className="inline-flex items-center gap-0.5" aria-label={`${etapa.anexos} anexos`}>
            <IconeClipe className="size-3" />
            {etapa.anexos}
          </span>
        )}
      </button>

      {aberto && (
        <DialogoDosPedidos
          etapa={etapa}
          ocupado={anotar.isPending}
          erro={erro}
          onCancelar={() => setAberto(false)}
          onConfirmar={(observacao) => {
            setErro(null)
            onErro(null)
            // O texto igual ao gravado não vai ao banco: quem abriu só para
            // anexar fecha com "Salvar" sem gravar um evento de anotação à toa.
            if (observacao.trim() === (etapa.observacao ?? '').trim()) {
              setAberto(false)
              return
            }
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

/**
 * O diálogo dos pedidos: o texto e os anexos. Era o `AnotarDialogo` do aviso
 * do Quadro, com título e frase de AVISO — "aparece numa faixa no card", que é
 * justamente o que o pedido NÃO faz.
 */
function DialogoDosPedidos({
  etapa,
  ocupado,
  erro,
  onCancelar,
  onConfirmar,
}: {
  etapa: EtapaQuadro
  ocupado: boolean
  erro: string | null
  onCancelar: () => void
  onConfirmar: (observacao: string) => void
}) {
  const [texto, setTexto] = useState(etapa.observacao ?? '')
  const envio = useEnvioDeAnexos(etapa)
  const tinha = (etapa.observacao ?? '').trim() !== ''
  const vazio = texto.trim() === ''

  return (
    <Dialogo
      titulo={`Pedidos do cliente · ${ROTULO_ETAPA[etapa.tipo]}`}
      rotuloConfirmar={tinha && vazio ? 'Apagar o texto' : 'Salvar'}
      confirmarDestrutivo={tinha && vazio}
      ocupado={ocupado || envio.progresso !== null}
      erro={erro}
      onConfirmar={() => onConfirmar(texto)}
      onCancelar={onCancelar}
    >
      <div className="space-y-4" onPaste={envio.aoColar}>
        <label className="block">
          <span className="text-sm font-medium">O que a família pediu</span>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={4}
            placeholder="Trocar a música do final; a foto da vovó na capa…"
            className="mt-1.5 w-full rounded-md border border-border bg-background/60 px-3 py-2 text-base transition-colors focus:border-marca focus:bg-card"
          />
        </label>
        {tinha && vazio && (
          <p className="text-sm text-atrasado">Salvar em branco apaga o texto dos pedidos.</p>
        )}

        <AnexosDosPedidos etapa={etapa} envio={envio} />
      </div>
    </Dialogo>
  )
}
