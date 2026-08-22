import { useEffect, useState } from 'react'

/**
 * Faz o componente redesenhar de minuto em minuto, para o rótulo de SLA
 * ("Vence em 12h", "Atrasado 3h") andar sozinho.
 *
 * Sem isto, `estadoSla` só recalcularia quando algo mais causasse render — um
 * caso aberto na tela mostraria um prazo congelado no instante em que carregou.
 * Num turno de 12h isso é a diferença entre a tela ser um relógio e ser uma
 * foto.
 *
 * Um minuto basta: a menor unidade que o rótulo exibe é o minuto, e só na
 * última hora.
 */
export function useRelogioDeMinuto(): Date {
  const [agora, setAgora] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setAgora(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  return agora
}
