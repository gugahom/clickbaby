import { useEffect, useState } from 'react'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Base de movimento e de composição de classe, compartilhada pelos botões.
 *
 * `cn` é `clsx` passado pelo `twMerge`. A diferença importa quando um botão
 * recebe `className` de fora: com `clsx` puro, `px-3` da variante e `px-6` de
 * quem chamou entram os dois na string e quem vence é a ordem no CSS, não a
 * intenção. O `twMerge` resolve o conflito a favor do último — que é o que
 * qualquer pessoa espera ao passar uma classe.
 *
 * (O comentário antigo do Botao dizia que tailwind-merge tinha sido evitado de
 * propósito. Era verdade enquanto havia cinco usos e nenhuma sobrescrita; com
 * variantes de tamanho e forma passou a valer o custo.)
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Mola do toque. Rígida e bem amortecida de propósito: o botão tem que voltar
 * antes do dedo sair, senão a animação vira atraso percebido — e a seção 6 do
 * CLAUDE.md dá três toques para concluir uma etapa às 3h da manhã.
 */
export const MOLA_TOQUE = {
  type: 'spring',
  stiffness: 500,
  damping: 30,
  mass: 0.6,
} as const

/**
 * O aparelho tem mouse de verdade?
 *
 * `hover: hover` sozinho mente em híbridos (notebook com tela sensível ao
 * toque responde `true` e depois deixa o estado de hover grudado). O par com
 * `pointer: fine` é o que separa mouse de dedo.
 *
 * Serve para não aplicar crescimento no hover onde hover não existe: num
 * celular, `whileHover` fica preso depois do toque e o botão não volta.
 */
export function useTemHover() {
  const [temHover, setTemHover] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return

    const mq = window.matchMedia('(hover: hover) and (pointer: fine)')
    const atualizar = () => setTemHover(mq.matches)

    atualizar()
    mq.addEventListener('change', atualizar)
    return () => mq.removeEventListener('change', atualizar)
  }, [])

  return temHover
}
