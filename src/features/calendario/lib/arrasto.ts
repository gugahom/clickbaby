import { useEffect, useState, type DragEvent } from 'react'
import type { ItemDoCalendario } from '../api/useCalendario'

/**
 * ARRASTAR PARA REAGENDAR (30/09/2026, o que o exemplo do gestor já tinha e
 * ficou esperando o Google acompanhar a edição).
 *
 * SOLTAR NÃO SALVA: abre o formulário do item com o dia e a hora do lugar onde
 * ele caiu, e quem arrastou confere e salva. Um arrasto errado com o mouse não
 * pode mudar o horário de um parto — muito menos no Google da equipe inteira.
 *
 * SÓ NO MOUSE: o arrastar nativo do HTML não existe no toque. No celular o
 * caminho é tocar no item e usar "Editar caso" ou "Mudar horário", que é o
 * mesmo destino.
 *
 * O item em mãos mora aqui, fora do React: o `dataTransfer` só carrega texto,
 * e só é legível no `drop` — no `dragover`, que decide se a célula acende, ele
 * vem vazio por segurança do navegador.
 */
let emMaos: ItemDoCalendario | null = null

export function pegar(item: ItemDoCalendario, e: DragEvent) {
  emMaos = item
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', item.chave)
}

export function largar() {
  emMaos = null
}

/**
 * Uma célula que recebe itens: `props(chave, dia, hora)` devolve os handlers,
 * `sobre` diz qual célula acender. `hora` nula = mesmo horário, outro dia (o
 * mês e a faixa "dia todo").
 */
export function useAlvoDoArrasto(onSoltar: ((item: ItemDoCalendario, dia: string, hora: number | null) => void) | undefined) {
  const [sobre, setSobre] = useState<string | null>(null)

  // Soltar fora de qualquer célula (ou apertar Esc) também tem que apagar a
  // célula acesa — o `dragend` sobe do item até a janela.
  useEffect(() => {
    const apagar = () => setSobre(null)
    window.addEventListener('dragend', apagar)
    return () => window.removeEventListener('dragend', apagar)
  }, [])

  function props(chave: string, dia: string, hora: number | null) {
    if (!onSoltar) return {}
    return {
      onDragOver: (e: DragEvent) => {
        if (!emMaos) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        if (sobre !== chave) setSobre(chave)
      },
      onDragLeave: (e: DragEvent) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
        setSobre((atual) => (atual === chave ? null : atual))
      },
      onDrop: (e: DragEvent) => {
        e.preventDefault()
        setSobre(null)
        const item = emMaos
        emMaos = null
        if (item) onSoltar(item, dia, hora)
      },
    }
  }

  return { sobre, props }
}
