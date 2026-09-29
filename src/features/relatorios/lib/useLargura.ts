import { useEffect, useState, type RefObject } from 'react'

/**
 * A largura REAL do elemento, em pixels, acompanhando o redimensionamento.
 *
 * Os gráficos desenham o SVG na largura de verdade, e não num viewBox
 * esticado: esticar deformaria o texto dos eixos e engordaria as colunas na
 * tela larga — e a coluna tem teto de 24px por uma regra de leitura, não de
 * estética (a sobra da faixa é ar, não tinta).
 */
export function useLargura(ref: RefObject<HTMLElement | null>): number {
  const [largura, setLargura] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observador = new ResizeObserver(([entrada]) => {
      if (entrada) setLargura(Math.floor(entrada.contentRect.width))
    })
    observador.observe(el)
    return () => observador.disconnect()
  }, [ref])

  return largura
}

/**
 * O topo "redondo" do eixo: 33 -> 40, 120 -> 150, 8 -> 8. Os ticks (0, metade,
 * topo) caem em números limpos, que é o que o olho usa para ler o que não tem
 * rótulo direto. Os passos são miúdos de propósito: com só 1, 2, 5 e 10, um
 * máximo de 33 subia o eixo para 50 e o gráfico perdia um terço da altura
 * desenhando ar.
 */
export function topoRedondo(maximo: number): number {
  if (maximo <= 0) return 1
  const ordem = 10 ** Math.floor(Math.log10(maximo))
  for (const passo of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
    if (passo * ordem >= maximo) return passo * ordem
  }
  return 10 * ordem
}
