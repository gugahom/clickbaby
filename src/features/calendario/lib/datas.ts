/**
 * AS CONTAS DE DATA DO CALENDÁRIO.
 *
 * Tudo aqui é 'YYYY-MM-DD' em texto, o dia de BRASÍLIA — o mesmo `dia` que o
 * Quadro usa para os blocos. A conta é feita em UTC ao meio-dia: com o
 * relógio local do navegador, a meia-noite de um dia em que o fuso muda (ou um
 * aparelho configurado em outro fuso) jogaria a data para o dia de antes.
 *
 * O Brasil não tem horário de verão desde 2019, então o fim do dia de Brasília
 * é sempre -03:00. Se ele voltar, `inicioDoDiaEmBrasilia` é o único lugar que
 * precisa saber.
 */

export const FUSO = 'America/Sao_Paulo'

const emUtc = (data: string) => new Date(`${data}T12:00:00Z`)
const paraTexto = (d: Date) => d.toISOString().slice(0, 10)

export function somarDias(data: string, dias: number): string {
  const d = emUtc(data)
  d.setUTCDate(d.getUTCDate() + dias)
  return paraTexto(d)
}

/** 0 = domingo … 6 = sábado. */
export const diaDaSemana = (data: string) => emUtc(data).getUTCDay()

/** O dia de hoje em Brasília, não no relógio do aparelho. */
export function hojeEmBrasilia(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: FUSO }).format(new Date())
}

/** Um instante do banco → o dia e a hora em Brasília ("2026-10-03", "14:30"). */
export function emBrasilia(instante: string): { dia: string; hora: string } {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(instante))
  const p = (t: string) => partes.find((x) => x.type === t)?.value ?? ''
  return { dia: `${p('year')}-${p('month')}-${p('day')}`, hora: `${p('hour')}:${p('minute')}` }
}

/** A meia-noite de Brasília daquele dia, como instante — para filtrar timestamptz. */
export const inicioDoDiaEmBrasilia = (data: string) => `${data}T00:00:00-03:00`

export type Visao = 'mes' | 'semana'

/**
 * O PERÍODO DA TELA. O mês é a GRADE inteira — de domingo a sábado, com as
 * pontas dos meses vizinhos —, porque a grade mostra esses dias e eles não
 * podem aparecer vazios só por serem de outro mês. A semana começa no
 * domingo, como no Google Calendar em português, que é o que a equipe usa.
 */
export function periodoDaVisao(visao: Visao, ancora: string): { inicio: string; fim: string; dias: string[] } {
  let inicio: string
  let total: number
  if (visao === 'semana') {
    inicio = somarDias(ancora, -diaDaSemana(ancora))
    total = 7
  } else {
    const primeiro = `${ancora.slice(0, 7)}-01`
    inicio = somarDias(primeiro, -diaDaSemana(primeiro))
    const ultimo = somarDias(`${proximoMes(ancora.slice(0, 7))}-01`, -1)
    const fim = somarDias(ultimo, 6 - diaDaSemana(ultimo))
    total = Math.round((emUtc(fim).getTime() - emUtc(inicio).getTime()) / 86_400_000) + 1
  }
  const dias = Array.from({ length: total }, (_, i) => somarDias(inicio, i))
  return { inicio, fim: dias[dias.length - 1] ?? inicio, dias }
}

export function proximoMes(mes: string): string {
  const [a, m] = mes.split('-').map(Number) as [number, number]
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`
}

/** A âncora da próxima tela: um mês ou uma semana para frente (ou para trás). */
export function deslocar(visao: Visao, ancora: string, sentido: 1 | -1): string {
  if (visao === 'semana') return somarDias(ancora, 7 * sentido)
  const mes = ancora.slice(0, 7)
  if (sentido === 1) return `${proximoMes(mes)}-01`
  const [a, m] = mes.split('-').map(Number) as [number, number]
  return m === 1 ? `${a - 1}-12-01` : `${a}-${String(m - 1).padStart(2, '0')}-01`
}

const formatar = (data: string, opcoes: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('pt-BR', { ...opcoes, timeZone: 'UTC' }).format(emUtc(data)).replace('.', '')

/** "Outubro de 2026" */
export const rotuloDoMes = (data: string) => {
  const t = formatar(data, { month: 'long', year: 'numeric' })
  return t.charAt(0).toUpperCase() + t.slice(1)
}

/** "4 a 10 de outubro", "28 de setembro a 4 de outubro" */
export function rotuloDaSemana(inicio: string, fim: string): string {
  const mesmoMes = inicio.slice(0, 7) === fim.slice(0, 7)
  return mesmoMes
    ? `${Number(inicio.slice(8))} a ${formatar(fim, { day: 'numeric', month: 'long' })}`
    : `${formatar(inicio, { day: 'numeric', month: 'long' })} a ${formatar(fim, { day: 'numeric', month: 'long' })}`
}

/** "sábado, 3 de outubro" */
export const rotuloDoDia = (data: string) => formatar(data, { weekday: 'long', day: 'numeric', month: 'long' })

/** "sáb" */
export const diaDaSemanaCurto = (data: string) => formatar(data, { weekday: 'short' })

export const NOMES_DOS_DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
