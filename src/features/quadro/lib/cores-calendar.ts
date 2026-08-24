/**
 * `casos.cor_calendar` guarda o `colorId` do evento no Google Calendar — a
 * paleta fixa de "1" a "11" — exatamente como veio, sem interpretação.
 *
 * Este mapa NÃO decodifica o que a cor significa (é organização interna do
 * cliente, provavelmente por maternidade ou responsável — seção 7 do
 * CLAUDE.md). Ele resolve o colorId para uma cor visível, para a barra da
 * esquerda funcionar como a agenda que a equipe já conhece.
 *
 * POR QUE EXISTEM DUAS PALETAS
 * Sete das onze cores do Google são legíveis sobre branco. Quatro não são: em
 * contraste medido contra o fundo claro (#FBFAF8), Banana dá 1.62:1, Sage
 * 2.48:1, Flamingo 2.69:1 e Peacock 2.95:1 — abaixo do mínimo de 3:1 que a
 * WCAG 1.4.11 pede para elemento gráfico não textual. Uma barra Banana sobre
 * branco praticamente não existe.
 *
 * As quatro ganham uma versão escurecida. Isso continua sendo herdar, não
 * interpretar: o matiz é o mesmo, muda só a claridade, do jeito que qualquer
 * paleta se adapta ao papel em que é impressa.
 *
 * O escurecimento não foi feito a olho. Baixar a claridade mantendo saturação
 * jogou Flamingo (#E67C73, salmão) em cima de Tomato (#D50000, vermelho) —
 * separação em OKLab caiu de 0.180 para 0.095, e dois casos de cores diferentes
 * na agenda apareceriam iguais no Quadro. Sage teve o mesmo problema contra
 * Basil (0.165 -> 0.036). Os valores abaixo foram escolhidos verificando as
 * duas coisas ao mesmo tempo: contraste contra o fundo E distância das cores
 * vizinhas.
 *
 * Lavender x Peacock ficam a 0.090 de distância, o que é apertado — mas já é
 * assim na paleta original do Google (0.090 também). Não foi introduzido aqui.
 */

/** Paleta oficial do Google. Usada pelo tema escuro, onde toda ela é legível. */
const PALETA_ESCURO: Record<string, string> = {
  '1': '#7986CB', // Lavender
  '2': '#33B679', // Sage
  '3': '#8E24AA', // Grape
  '4': '#E67C73', // Flamingo
  '5': '#F6BF26', // Banana
  '6': '#F4511E', // Tangerine
  '7': '#039BE5', // Peacock
  '8': '#616161', // Graphite
  '9': '#3F51B5', // Blueberry
  '10': '#0B8043', // Basil
  '11': '#D50000', // Tomato
}

/**
 * Paleta do tema claro. Só as quatro que falhavam mudam; as outras sete são o
 * hex do Google, intocado. Contraste medido contra #FBFAF8:
 *
 *   Lavender  #7986CB  3.31  (original)
 *   Sage      #1AA179  3.14  (era #33B679, 2.48 — escurecido para o verde-teal)
 *   Grape     #8E24AA  6.75  (original)
 *   Flamingo  #B96A72  3.75  (era #E67C73, 2.69 — rosa empoeirado, longe do Tomato)
 *   Banana    #A87C08  3.63  (era #F6BF26, 1.62 — ocre)
 *   Tangerine #F4511E  3.33  (original)
 *   Peacock   #0284C7  3.93  (era #039BE5, 2.95)
 *   Graphite  #616161  5.94  (original)
 *   Blueberry #3F51B5  6.59  (original)
 *   Basil     #0B8043  4.81  (original)
 *   Tomato    #D50000  5.26  (original)
 */
const PALETA_CLARO: Record<string, string> = {
  '1': '#7986CB',
  '2': '#1AA179',
  '3': '#8E24AA',
  '4': '#B96A72',
  '5': '#A87C08',
  '6': '#F4511E',
  '7': '#0284C7',
  '8': '#616161',
  '9': '#3F51B5',
  '10': '#0B8043',
  '11': '#D50000',
}

/** Cinza neutro para evento sem cor definida na agenda. */
const SEM_COR_CLARO = '#8A8A8A'
const SEM_COR_ESCURO = '#4B5563'

/**
 * O app roda em tema claro. A troca lê o atributo em <html>, então o dia em que
 * o tema escuro voltar (ver nota em index.css) a barra acompanha sozinha.
 */
function temaEscuroAtivo(): boolean {
  return document.documentElement.dataset['tema'] === 'escuro'
}

export function corDoCaso(corCalendar: string | null): string {
  const escuro = temaEscuroAtivo()
  const paleta = escuro ? PALETA_ESCURO : PALETA_CLARO
  const semCor = escuro ? SEM_COR_ESCURO : SEM_COR_CLARO
  if (!corCalendar) return semCor
  return paleta[corCalendar] ?? semCor
}
