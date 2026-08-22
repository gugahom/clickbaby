/**
 * `casos.cor_calendar` guarda o `colorId` do evento no Google Calendar — a
 * paleta fixa de "1" a "11" — exatamente como veio, sem interpretação.
 *
 * Este mapa NÃO decodifica o que a cor significa (é organização interna do
 * cliente, provavelmente por maternidade ou responsável — seção 7 do
 * CLAUDE.md). Ele só resolve o mesmo colorId para o mesmo hex que o Google
 * usa, para a barra da esquerda ficar visualmente igual à agenda que a equipe
 * já conhece. Herdar, não interpretar.
 */
const PALETA_GOOGLE: Record<string, string> = {
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

/** Cinza neutro para evento sem cor definida na agenda. */
const SEM_COR = '#4B5563'

export function corDoCaso(corCalendar: string | null): string {
  if (!corCalendar) return SEM_COR
  return PALETA_GOOGLE[corCalendar] ?? SEM_COR
}
