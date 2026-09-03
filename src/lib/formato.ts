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

/**
 * '27/08' — a data crua, para acompanhar um rótulo relativo.
 *
 * SÓ faz sentido ao lado de 'Hoje'/'Amanhã'/'Ontem'. Os outros rótulos já
 * trazem dia e mês por extenso, e repetir viraria "quinta-feira, 21 de agosto
 * 21/08".
 */
export function dataCurta(dia: string): string {
  const [, mes, d] = dia.split('-')
  return `${d}/${mes}`
}

/** Um rótulo relativo esconde a data; estes três são os que precisam dela ao lado. */
export function ehRotuloRelativo(dia: string, hoje: string): boolean {
  const delta = difDias(dia, hoje)
  return delta === 0 || delta === 1 || delta === -1
}

const diaPorExtenso = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})

/**
 * "Sexta, 29 de agosto" — o sobrescrito acima do título da tela.
 *
 * Difere de `rotularDia`: aquele é relativo ("Hoje") porque nomeia um BLOCO
 * dentro de uma lista de vários dias, e ali o que importa é a distância até
 * hoje. Este nomeia o dia em que a pessoa está, e aí "Hoje" seria uma
 * tautologia.
 */
export function dataPorExtenso(dia: string): string {
  const [ano, mes, d] = dia.split('-').map(Number)
  const texto = diaPorExtenso.format(new Date(ano ?? 1970, (mes ?? 1) - 1, d ?? 1))
  // O Intl devolve "sexta-feira, 29 de agosto"; o "-feira" é ruído num rótulo
  // que existe para ser lido de canto de olho.
  return (texto.charAt(0).toUpperCase() + texto.slice(1)).replace('-feira', '')
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

const dataComAno = new Intl.DateTimeFormat('pt-BR', {
  timeZone: FUSO,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

/**
 * Um TIMESTAMP como data, com ano — "03/09/2026".
 *
 * Não confundir com `dataCurta`, que recebe um DIA ('YYYY-MM-DD') e devolve
 * "03/09" sem ano. As duas são fáceis de trocar e a troca não dá erro: passar
 * um timestamp para `dataCurta` produz lixo silencioso, porque ela reparte a
 * string em hífens e o horário sobrevive no terceiro pedaço. Foi o que
 * aconteceu com "no sistema desde" na Equipe.
 *
 * O ano fica porque esta função existe para datas VELHAS — entrada no sistema,
 * cadastro —, onde "12/03" sem ano não responde nada.
 */
export function formatarData(iso: string | null): string | null {
  if (!iso) return null
  return dataComAno.format(new Date(iso))
}
