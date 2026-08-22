/**
 * Formatação de data/hora do Quadro.
 *
 * REGRA: o fuso da operação é America/Sao_Paulo, sempre explícito. Nunca o fuso
 * do aparelho — os CEL CLICK trocam de mão e nada garante a configuração deles.
 *
 * A view `quadro_casos` já devolve `dia` como 'YYYY-MM-DD' convertido em
 * America/Sao_Paulo, então o agrupamento não faz conta de fuso nenhuma no
 * cliente. Este módulo só formata.
 */

export const FUSO = 'America/Sao_Paulo'

/** Data de hoje no fuso da operação, no mesmo formato de `quadro_casos.dia`. */
export function hojeNoFuso(): string {
  // 'en-CA' produz YYYY-MM-DD, que é exatamente o formato de `dia`.
  return new Intl.DateTimeFormat('en-CA', { timeZone: FUSO }).format(new Date())
}

/** 'YYYY-MM-DD' -> Date na meia-noite LOCAL do navegador (só para formatar rótulo). */
function diaParaData(dia: string): Date {
  const [ano, mes, d] = dia.split('-').map(Number)
  return new Date(ano ?? 1970, (mes ?? 1) - 1, d ?? 1)
}

/** Diferença em dias-calendário entre dois 'YYYY-MM-DD'. */
function difDias(dia: string, referencia: string): number {
  const ms = diaParaData(dia).getTime() - diaParaData(referencia).getTime()
  return Math.round(ms / 86_400_000)
}

const rotuloDiaCompleto = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})

/** 'Hoje', 'Amanhã', 'Ontem' ou 'quinta-feira, 21 de agosto'. */
export function rotularDia(dia: string, hoje: string): string {
  const delta = difDias(dia, hoje)
  if (delta === 0) return 'Hoje'
  if (delta === 1) return 'Amanhã'
  if (delta === -1) return 'Ontem'
  return rotuloDiaCompleto.format(diaParaData(dia))
}

/** Quantos dias no passado (positivo) o dia está. 0 ou negativo = hoje ou futuro. */
export function diasAtras(dia: string, hoje: string): number {
  return -difDias(dia, hoje)
}

const horaCurta = new Intl.DateTimeFormat('pt-BR', {
  timeZone: FUSO,
  hour: '2-digit',
  minute: '2-digit',
})

/** Hora prevista do caso, no fuso da operação. */
export function formatarHora(iso: string | null): string | null {
  if (!iso) return null
  return horaCurta.format(new Date(iso))
}

const dataHoraCurta = new Intl.DateTimeFormat('pt-BR', {
  timeZone: FUSO,
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

export function formatarDataHora(iso: string | null): string | null {
  if (!iso) return null
  return dataHoraCurta.format(new Date(iso))
}
