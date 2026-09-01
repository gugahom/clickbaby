import { useSyncExternalStore } from 'react'

/**
 * A partir de onde um cartão de caso ainda se lê bem com METADE da largura.
 *
 * 1536px é o `2xl` do Tailwind, e a conta é simples: metade disso são 768px
 * por coluna, menos a barra lateral — perto de 700px, que é mais que os
 * ~640px em que o cartão já vive confortável hoje no `md`. Abaixo daqui,
 * dividir em duas colunas espremeria a fita de etapas, que é justamente o que
 * se quer ver de longe.
 */
const CONSULTA = '(min-width: 1536px)'

/**
 * A tela é larga o bastante para duas colunas de cartão?
 *
 * POR QUE EM JS E NÃO SÓ EM CSS. A divisão dos dias entre as colunas é
 * calculada (ver `dividirEmDuasColunas`) — o React precisa saber ANTES de
 * renderizar em quantas colunas vai distribuir. Uma media query do Tailwind
 * resolveria a aparência, mas não a distribuição, e renderizar as duas versões
 * para esconder uma montaria cada bloco do dia DUAS vezes: estado de sanfona
 * duplicado, e o dobro de cartões no DOM numa tela que fica ligada o turno
 * inteiro.
 *
 * `useSyncExternalStore` e não `useState` + `useEffect`: o tamanho da janela é
 * uma fonte EXTERNA ao React, e é para exatamente isso que este hook existe.
 * A versão com efeito precisava de um `setState` no mount para cobrir a janela
 * ter mudado entre o primeiro render e o efeito — o que a regra
 * `react-hooks/set-state-in-effect` proíbe, com razão: ali o React já
 * renderizou uma vez com o valor errado. Aqui não há esse intervalo.
 */
export function useTelaLarga(): boolean {
  return useSyncExternalStore(inscrever, ler, () => false)
}

function inscrever(aoMudar: () => void): () => void {
  const consulta = window.matchMedia(CONSULTA)
  consulta.addEventListener('change', aoMudar)
  return () => consulta.removeEventListener('change', aoMudar)
}

function ler(): boolean {
  return window.matchMedia(CONSULTA).matches
}
