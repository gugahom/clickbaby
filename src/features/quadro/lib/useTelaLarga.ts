import { useSyncExternalStore } from 'react'

/**
 * A largura a partir da qual o modo TV existe.
 *
 * ERA 1536px, E ESSE NÚMERO ESCONDEU O BOTÃO DA TV DO GESTOR (03/09/2026). Ele
 * mandou um vídeo da tela sem o interruptor e concluiu que era permissão de
 * conta; não era — o botão nunca teve trava de papel. Era isto aqui: uma TV de
 * 1920 com o navegador em 150% de zoom reporta 1280px de viewport, e 1280 é
 * menor que 1536. A função ficou invisível justamente no aparelho para o qual
 * foi feita.
 *
 * 1280 é o ponto em que duas colunas ainda valem a pena — com a coluna lateral
 * encolhida para 18rem no modo TV (ver QuadroPage), sobram 452px por coluna e o
 * cartão compacto fecha em 171px. Abaixo disso o cartão passa a crescer em vez
 * de encolher, e duas colunas viram um estorvo.
 */
const CONSULTA = '(min-width: 1280px)'

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
