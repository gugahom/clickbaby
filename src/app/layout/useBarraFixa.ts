import { useSyncExternalStore } from 'react'

/**
 * A barra lateral fica RECOLHIDA ou FIXA ABERTA, e quem escolhe é a pessoa.
 *
 * Mesmo arranjo do modo TV (`useModoTv`), e pelo mesmo motivo: é preferência
 * de UI daquele APARELHO, não dado de domínio — a TV da sala e o notebook da
 * gestão querem coisas diferentes, e guardar isso no banco por pessoa daria a
 * resposta errada nos dois. Uma preferência ilegível (aba anônima,
 * armazenamento bloqueado) cai no padrão em vez de estourar.
 *
 * RECOLHIDA É O PADRÃO porque o Quadro é a tela mais apertada do sistema: ele
 * tem a coluna lateral de 30rem e, no modo TV abaixo de 1536px, cada pixel de
 * largura já foi disputado uma vez (ver o histórico do modo TV na seção 13).
 * Aberta, a barra custa 13rem dali. Recolhida ela custa 3.5rem e continua
 * abrindo sozinha quando o ponteiro chega — quem quiser os nomes o tempo todo
 * fixa, e a escolha fica.
 *
 * A LOJA É DE MÓDULO (`useSyncExternalStore`) e não `useState` porque a barra
 * e o botão que a fixa vivem no mesmo componente hoje, mas a largura reservada
 * é lida pelo irmão — e porque é o primitivo que o resto do projeto já usa
 * para preferência de aparelho.
 */
const CHAVE = 'clickbaby:barra-fixa'

let fixa = lerPreferencia()
const ouvintes = new Set<() => void>()

export function useBarraFixa(): readonly [boolean, () => void] {
  const valor = useSyncExternalStore(inscrever, () => fixa, () => false)
  return [valor, alternarBarraFixa] as const
}

export function alternarBarraFixa(): void {
  fixa = !fixa
  gravarPreferencia(fixa)
  for (const avisar of ouvintes) avisar()
}

function inscrever(aoMudar: () => void): () => void {
  ouvintes.add(aoMudar)
  return () => {
    ouvintes.delete(aoMudar)
  }
}

function lerPreferencia(): boolean {
  try {
    return localStorage.getItem(CHAVE) === '1'
  } catch {
    return false
  }
}

function gravarPreferencia(valor: boolean): void {
  try {
    localStorage.setItem(CHAVE, valor ? '1' : '0')
  } catch {
    // Aba anônima ou armazenamento bloqueado: vale para esta sessão e não
    // persiste. Melhor que derrubar o clique.
  }
}
