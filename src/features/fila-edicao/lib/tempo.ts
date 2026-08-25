/**
 * Interval do Postgres chega no PostgREST como texto: "02:15:00", "1 day
 * 03:00:00", "00:00:04.613". Não existe parser disso no JS, e é a segunda vez
 * que o formato aparece no projeto — a primeira levou `prazo_entrega_horas` a
 * ser convertido para número dentro da view.
 *
 * Aqui a conversão fica no cliente porque `pausa_acumulada` entra num cálculo
 * que já depende do relógio local (quanto tempo desde o início), então mandar
 * a view pré-calcular não eliminaria a conta.
 */
export function segundosDeIntervalo(intervalo: string | null): number {
  if (!intervalo) return 0

  let total = 0
  let resto = intervalo

  const dias = resto.match(/(-?\d+)\s+days?/)
  if (dias?.[1]) {
    total += Number(dias[1]) * 86_400
    resto = resto.replace(dias[0], '')
  }

  const relogio = resto.match(/(-?\d+):(\d{2}):(\d{2}(?:\.\d+)?)/)
  if (relogio) {
    const h = Number(relogio[1])
    const m = Number(relogio[2])
    const s = Number(relogio[3])
    // Horas negativas arrastam minutos e segundos junto ("-02:30:00" é -2.5h).
    const sinal = h < 0 ? -1 : 1
    total += h * 3600 + sinal * (m * 60 + s)
  }

  return total
}

/**
 * Tempo de trabalho REAL de uma etapa em curso: relógio desde o início, menos
 * as pausas fechadas, menos a pausa aberta agora.
 *
 * É a mesma conta que a métrica da seção 9 faz no banco quando a etapa fecha
 * (concluido_em - iniciado_em - pausa_acumulada). Aqui ela roda ao vivo, para a
 * fila mostrar o cronômetro andando.
 */
export function segundosTrabalhados(
  iniciadoEm: string | null,
  pausaAcumulada: string | null,
  pausadoEm: string | null,
  agora: Date,
): number | null {
  if (!iniciadoEm) return null

  const desdeInicio = (agora.getTime() - new Date(iniciadoEm).getTime()) / 1000
  const pausado = segundosDeIntervalo(pausaAcumulada)
  const pausaAberta = pausadoEm
    ? (agora.getTime() - new Date(pausadoEm).getTime()) / 1000
    : 0

  return Math.max(0, desdeInicio - pausado - pausaAberta)
}

export function formatarDuracaoCurta(segundos: number): string {
  const h = Math.floor(segundos / 3600)
  const m = Math.floor((segundos % 3600) / 60)
  if (h === 0) return `${m}min`
  return `${h}h${m.toString().padStart(2, '0')}`
}
