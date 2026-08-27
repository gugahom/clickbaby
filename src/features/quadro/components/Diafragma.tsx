import clsx from 'clsx'

interface PropsDiafragma {
  total: number
  feitos: number
  /** Dia atrasado: as pás que faltam ficam vermelhas em vez de apagadas. */
  emAtraso?: boolean
  className?: string
}

/** Acima disso vira anel pontilhado ilegível; cai para arco cheio. */
const MAX_PAS = 12

const RAIO = 15
const CIRC = 2 * Math.PI * RAIO
/** Vão entre pás, em unidades de comprimento de arco. */
const VAO = 3.2

/**
 * O progresso do dia como o diafragma do logo.
 *
 * Uma pá por caso do dia, alternando o rosa e o azul da lente — que é
 * exatamente como as pás se alternam na marca. Cada caso resolvido acende a
 * sua. Um dia inteiro fechado é o anel completo.
 *
 * A escolha de fazer disto o elemento de assinatura, e não um enfeite: ele
 * carrega informação que já existia em texto ("0 de 5 concluídos") e que
 * ninguém lê rolando a lista. Aqui dá para ver de longe — inclusive da TV da
 * sala de edição, que é um dos usos reais.
 *
 * Acima de 12 casos as pás viram tracinhos indistinguíveis, então o desenho
 * degrada para dois arcos (feito / falta). É o mesmo objeto, com menos
 * resolução — não um segundo componente.
 */
export function Diafragma({ total, feitos, emAtraso = false, className }: PropsDiafragma) {
  if (total <= 0) return null

  const pas = total <= MAX_PAS ? total : 2
  const acesas = total <= MAX_PAS ? feitos : feitos > 0 ? 1 : 0
  const arco = CIRC / pas

  const segmentos = Array.from({ length: pas }, (_, i) => {
    const acesa = total <= MAX_PAS ? i < acesas : i === 0 && feitos > 0
    // No modo degradado o primeiro arco tem o tamanho da fração concluída.
    const comprimento =
      total <= MAX_PAS
        ? arco - VAO
        : (i === 0 ? feitos / total : 1 - feitos / total) * CIRC - VAO
    const inicio =
      total <= MAX_PAS ? i * arco : i === 0 ? 0 : (feitos / total) * CIRC

    return { acesa, comprimento: Math.max(comprimento, 0.5), inicio, i }
  })

  const rotulo = `${feitos} de ${total} ${total === 1 ? 'caso resolvido' : 'casos resolvidos'}`

  return (
    <svg
      viewBox="0 0 36 36"
      role="img"
      aria-label={rotulo}
      className={clsx('flex-shrink-0', className)}
    >
      {segmentos.map(({ acesa, comprimento, inicio, i }) => (
        <circle
          key={i}
          cx="18"
          cy="18"
          r={RAIO}
          fill="none"
          strokeWidth="5"
          // -90deg: a primeira pá começa no topo, como um mostrador.
          transform="rotate(-90 18 18)"
          strokeDasharray={`${comprimento} ${CIRC - comprimento}`}
          strokeDashoffset={-inicio}
          stroke={
            acesa
              ? i % 2 === 0
                ? 'var(--logo-rosa)'
                : 'var(--logo-azul)'
              : emAtraso
                ? 'var(--atrasado)'
                : 'var(--border)'
          }
          opacity={acesa || !emAtraso ? 1 : 0.45}
        />
      ))}
    </svg>
  )
}
