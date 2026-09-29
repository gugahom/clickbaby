import { useEffect, useState, type RefObject } from 'react'

/**
 * O tamanho REAL do elemento, em pixels, acompanhando o redimensionamento.
 *
 * Os gráficos desenham o SVG no tamanho de verdade, e não num viewBox
 * esticado: esticar deformaria o texto dos eixos e engordaria as colunas na
 * tela larga — e a coluna tem teto de largura por uma regra de leitura, não de
 * estética (a sobra da faixa é ar, não tinta).
 *
 * A ALTURA ENTROU em 29/09/2026: no computador o gráfico ocupa a coluna da
 * direita inteira, da altura da lista de KPIs ao lado — quem manda na altura é
 * o layout, e o gráfico se mede por ele. Para não haver medida circular, o SVG
 * fica em posição absoluta dentro do elemento medido.
 */
export function useTamanho(ref: RefObject<HTMLElement | null>): { largura: number; altura: number } {
  const [tamanho, setTamanho] = useState({ largura: 0, altura: 0 })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observador = new ResizeObserver(([entrada]) => {
      if (!entrada) return
      const largura = Math.floor(entrada.contentRect.width)
      const altura = Math.floor(entrada.contentRect.height)
      setTamanho((atual) => (atual.largura === largura && atual.altura === altura ? atual : { largura, altura }))
    })
    observador.observe(el)
    return () => observador.disconnect()
  }, [ref])

  return tamanho
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
