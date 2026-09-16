import { useState } from 'react'
import { Dialogo } from '@/components/ui/Dialogo'
import { IconeAviso, IconeOlho } from '@/components/ui/icones'
import { ROTULO_ETAPA, rotuloDaRodada, type EtapaQuadro, type EtapaTipo } from '../types'

/**
 * AS DUAS ETAPAS QUE NÃO ENTRAM NA FAIXA (16/09/2026, decisão do gestor).
 *
 * O vídeo do MASTER e o Foto/Livro ganharam um campo de PEDIDOS na seção
 * lateral — prints, link de música, o que a família pediu. É texto que a editora
 * lê sentada, num trabalho de semanas. Na faixa do card ele pulsaria em vermelho
 * no Quadro do dia, para quem está na maternidade, e ensinaria a equipe a
 * ignorar justamente o chamado que a faixa existe para dar.
 *
 * As duas são as mesmas de `SECAO_DA_ETAPA` (AcoesDoCaso), e pelo mesmo motivo:
 * são as que se operam fora do card.
 */
const SEM_FAIXA_NO_CARD = new Set<EtapaTipo>(['edicao_video', 'album'])

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
 * não cabe numa linha, e cortado no meio ele deixa de ser instrução e vira
 * enfeite. Um toque na faixa abre o texto completo de todos os avisos: o
 * `title` do navegador NÃO EXISTE no celular, que é metade da operação.
 *
 * VERMELHO PULSANDO, NO MESMO ESTILO DA ETAPA ATRIBUÍDA (15/09/2026, pedido do
 * gestor). A faixa era um lavado claro no tom do rascunho, e a equipe passou a
 * escrever os avisos com fileiras de emoji ("10:30 - Q 201 🟢🟢🟢🟢") para eles
 * chamarem atenção — a prova de que a faixa não chamava. A primeira resposta,
 * no mesmo dia, foi âmbar sólido; o gestor pediu o vermelho com a onda, igual
 * à pílula de quem foi atribuída.
 *
 * O VERMELHO AGORA É "PRECISA DE ALGUÉM", e o aviso é exatamente isso: uma
 * instrução esperando ser lida por quem vai pegar a etapa. O que continua
 * separando os três vermelhos do card é a FORMA — o horário estourando pinta o
 * cartão inteiro e gira o anel da borda; a atribuída é uma pílula com iniciais;
 * o aviso é uma pílula com megafone. A onda (`.pulso-chamado`) é a mesma nos
 * dois últimos, porque o pedido é o mesmo: olhe para cá.
 *
 * É UMA PÍLULA COM MARGEM, E NÃO UMA FAIXA DE PONTA A PONTA, por causa da onda:
 * o card tem `overflow-hidden` (é o que recorta a espinha colorida), e uma
 * sombra saindo de uma faixa encostada nas bordas seria cortada antes de
 * aparecer. Com a margem, ela tem onde crescer.
 */
export function AvisosDoCaso({ etapas }: PropsAvisosDoCaso) {
  const [aberto, setAberto] = useState(false)

  const avisos = etapas.filter(
    (e) =>
      e.observacao !== null &&
      e.observacao.trim() !== '' &&
      e.status !== 'concluida' &&
      e.status !== 'dispensada' &&
      !SEM_FAIXA_NO_CARD.has(e.tipo),
  )

  if (avisos.length === 0) return null

  const completo = avisos.map((e) => `${nomeDaEtapa(e)} — ${e.observacao}`).join('  ·  ')

  return (
    <>
      <div className="border-t border-border px-3 py-2.5 md:px-4">
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
          className="pulso-chamado flex min-h-11 w-full items-center gap-2 rounded-full bg-atrasado py-1 pr-3 pl-1 text-left text-card transition-[filter] hover:brightness-110 focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          {/* Mesmo desenho do círculo de iniciais da atribuída: um disco
              translúcido da cor do card, com o ícone no lugar das letras. */}
          <span
            aria-hidden="true"
            className="inline-flex size-8 flex-shrink-0 items-center justify-center rounded-full bg-card/25"
          >
            <IconeAviso className="size-4" />
          </span>

          <span className="min-w-0 flex-1 truncate text-[15px] leading-snug">
            {avisos.map((etapa, i) => (
              <span key={etapa.id}>
                {i > 0 && (
                  <span className="mx-2 opacity-60" aria-hidden="true">
                    ·
                  </span>
                )}
                <span className="text-xs font-extrabold tracking-wide uppercase opacity-90">
                  {nomeDaEtapa(etapa)}
                </span>
                <span className="mx-1.5 opacity-70" aria-hidden="true">
                  —
                </span>
                <span className="font-extrabold">{etapa.observacao}</span>
              </span>
            ))}
          </span>

          {/* O ícone fica FORA do `truncate`, num item que não encolhe: dentro
              dele, ele seria a primeira coisa a sumir — justamente quando o
              texto é comprido, que é quando ele precisa aparecer. */}
          <IconeOlho className="size-4 flex-shrink-0 opacity-85" aria-hidden="true" />
        </button>
      </div>

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
              do caso expandido.

              Aqui SEM pulso: o diálogo já é a resposta ao chamado, e uma onda
              em volta de um texto que a pessoa está lendo só atrapalha. */}
          <ul className="space-y-3">
            {avisos.map((etapa) => (
              <li
                key={etapa.id}
                className="rounded-md border-l-4 border-atrasado bg-atrasado/10 px-3 py-2"
              >
                <p className="rotulo-sobrescrito text-atrasado">{nomeDaEtapa(etapa)}</p>
                <p className="mt-0.5 text-base font-semibold whitespace-pre-line text-foreground">
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
