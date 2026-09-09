import { useState } from 'react'
import { Dialogo } from '@/components/ui/Dialogo'
import { IconeOlho } from '@/components/ui/icones'
import { ROTULO_ETAPA, rotuloDaRodada, type EtapaQuadro } from '../types'

interface PropsAvisosDoCaso {
  etapas: EtapaQuadro[]
}

/**
 * As observações das etapas ABERTAS, na faixa de baixo do card.
 *
 * POR QUE ISTO EXISTE
 * `caso_etapas.observacao` só era escrita ao concluir, e só aparecia dentro do
 * caso expandido. Servia para contar como foi. O gestor precisa do contrário:
 * a coordenação sabe de manhã que o banho vai ser no quarto 115 às 14h, e quem
 * chega no plantão tem que ver isso no Quadro — sem abrir caso nenhum, de
 * longe, na TV da sala.
 *
 * POR QUE SÓ AS ETAPAS ABERTAS
 * Um aviso é sobre trabalho que vem. Depois que a etapa fecha ele cumpriu o
 * papel, e a observação que `concluir_etapa` grava é de outra natureza — é
 * relato do que aconteceu, que pertence ao histórico e não à faixa de destaque.
 * Mostrar as duas juntas acumularia texto no card a cada etapa concluída, até
 * a faixa virar ruído permanente e ninguém mais ler.
 *
 * UMA LINHA, NUNCA DUAS
 * Com dois avisos a faixa virava um bloco e passava a competir com o card em
 * vez de acompanhá-lo. Os avisos entram lado a lado numa linha só, com corte
 * por reticências.
 *
 * E A LINHA ABRE (09/09/2026, pedido do gestor). O motivo de uma reabertura
 * — "quer o momento do expulsivo incluso no vídeo e tem que arrumar o início,
 * que está com a data errada" — não cabe numa linha, e cortado no meio ele
 * deixa de ser instrução e vira enfeite. O texto inteiro existia em dois
 * lugares e nenhum servia: o `title` do navegador NÃO EXISTE no celular, que é
 * metade da operação, e o card expandido obriga a abrir o caso e procurar a
 * etapa certa numa lista.
 *
 * Um toque na faixa abre o texto completo de todos os avisos. A faixa continua
 * de uma linha só — o que ela sempre foi é um chamado, não o conteúdo.
 *
 * POR QUE FORA DAS TRILHAS
 * O texto é livre e comprido; dentro da trilha ele quebraria a leitura em
 * coluna que faz as duas linhas funcionarem. Aqui embaixo, com fundo próprio,
 * ele é o que salta depois do estado — que é a ordem em que a pessoa lê.
 */
export function AvisosDoCaso({ etapas }: PropsAvisosDoCaso) {
  const [aberto, setAberto] = useState(false)

  const avisos = etapas.filter(
    (e) =>
      e.observacao !== null &&
      e.observacao.trim() !== '' &&
      e.status !== 'concluida' &&
      e.status !== 'dispensada',
  )

  if (avisos.length === 0) return null

  const completo = avisos.map((e) => `${nomeDaEtapa(e)} — ${e.observacao}`).join('  ·  ')

  return (
    <>
      {/*
        BOTÃO, e não um `div` com onClick: a faixa passou a ser acionável, e
        acionável por teclado é o que separa um controle de um enfeite que só
        funciona no mouse. Ele mora FORA do <button> do cabeçalho do card (ver
        CasoLinha), então abrir o aviso não expande o caso junto.
      */}
      <button
        type="button"
        onClick={() => setAberto(true)}
        title={completo}
        aria-label={`Ver os avisos por extenso: ${completo}`}
        className="flex w-full items-center gap-2 border-t border-rascunho-borda bg-rascunho-fundo px-3 py-2 text-left text-sm text-rascunho transition-colors hover:bg-rascunho-borda/25 focus-visible:ring-2 focus-visible:ring-rascunho focus-visible:outline-none md:px-4"
      >
        <span className="min-w-0 flex-1 truncate">
          {avisos.map((etapa, i) => (
            <span key={etapa.id}>
              {i > 0 && (
                <span className="mx-2 opacity-40" aria-hidden="true">
                  ·
                </span>
              )}
              <span className="font-bold tracking-wide uppercase">
                {nomeDaEtapa(etapa)}
              </span>
              <span className="mx-1.5 opacity-60" aria-hidden="true">
                —
              </span>
              <span className="font-medium">{etapa.observacao}</span>
            </span>
          ))}
        </span>

        {/* O ícone fica FORA do `truncate`, num item que não encolhe: dentro
            dele, ele seria a primeira coisa a sumir — justamente quando o
            texto é comprido, que é quando ele precisa aparecer. */}
        <IconeOlho className="size-4 flex-shrink-0 opacity-70" aria-hidden="true" />
      </button>

      {aberto && (
        <Dialogo
          titulo={avisos.length > 1 ? 'Avisos do caso' : 'Aviso do caso'}
          rotuloConfirmar="Fechar"
          soFechar
          onConfirmar={() => setAberto(false)}
          onCancelar={() => setAberto(false)}
        >
          {/* `whitespace-pre-line` porque o aviso é texto que alguém digitou:
              a quebra de linha que ela pôs para separar dois pedidos é parte
              do que ela quis dizer. É o mesmo tratamento da observação dentro
              do caso expandido. */}
          <ul className="space-y-3">
            {avisos.map((etapa) => (
              <li key={etapa.id}>
                <p className="rotulo-sobrescrito text-acento">{nomeDaEtapa(etapa)}</p>
                <p className="mt-0.5 text-sm whitespace-pre-line text-foreground">
                  {etapa.observacao}
                </p>
              </li>
            ))}
          </ul>
        </Dialogo>
      )}
    </>
  )
}

/**
 * "Reels" ou "Reels · Revisão".
 *
 * A rodada entra no nome porque o aviso mais comprido do sistema é justamente
 * o motivo de uma REABERTURA, e ali dizer só "Reels" esconde a única coisa que
 * distingue o trabalho novo do que já foi entregue. Nas etapas de rodada 1 —
 * a imensa maioria — `rotuloDaRodada` devolve o bloco ("Parto"), que não
 * acrescenta nada numa faixa de uma linha; por isso o sufixo só aparece da
 * rodada 2 em diante.
 */
function nomeDaEtapa(etapa: EtapaQuadro): string {
  if (etapa.rodada <= 1) return ROTULO_ETAPA[etapa.tipo]
  return `${ROTULO_ETAPA[etapa.tipo]} · ${rotuloDaRodada(etapa.tipo, etapa.rodada)}`
}
