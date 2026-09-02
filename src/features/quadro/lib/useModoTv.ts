import { useCallback, useState } from 'react'

/**
 * O Quadro tem DUAS apresentações, e quem escolhe é a pessoa.
 *
 * A primeira versão decidia sozinha: passou de seis cartões, vira duas
 * colunas. Errado por dois motivos. O layout de duas colunas com cartão
 * compacto existe para UMA situação — a TV de 70" pendurada na sala, lida de
 * longe, que ninguém toca. Quem está no corredor com o celular, ou na estação
 * de edição com o mouse, quer o cartão inteiro. Um heurístico não consegue
 * distinguir esses dois usos, porque a diferença não está no DADO (quantos
 * casos existem hoje), está em QUEM está olhando.
 *
 * E o segundo motivo: uma tela que se reorganiza sozinha quando o décimo caso
 * do dia chega assusta. A pessoa não pediu nada e a tela virou outra.
 *
 * Por isso é um botão, e por isso a escolha PERSISTE. A TV liga uma vez e fica
 * meses no mesmo modo; se ela voltasse ao normal a cada refresh automático
 * (que acontece de minuto em minuto, alinhado ao cron do sync), alguém teria
 * que subir numa cadeira toda manhã.
 *
 * `localStorage` é o lugar certo aqui e não fere a regra do CLAUDE.md: modo de
 * exibição é preferência de UI daquele APARELHO, não dado de domínio. A TV
 * quer o modo TV; o celular da mesma pessoa, não. Guardar isso no banco por
 * pessoa daria a resposta errada nos dois.
 */
const CHAVE = 'clickbaby:modo-tv'

export function useModoTv(): readonly [boolean, () => void] {
  const [ligado, setLigado] = useState(lerPreferencia)

  const alternar = useCallback(() => {
    setLigado((atual) => {
      const proximo = !atual
      gravarPreferencia(proximo)
      return proximo
    })
  }, [])

  return [ligado, alternar] as const
}

/**
 * Desligado por padrão: a lista de sempre é o que a maioria dos aparelhos
 * deve mostrar, e a TV é o caso especial. Uma preferência ilegível (aba
 * anônima, armazenamento bloqueado) cai no padrão em vez de estourar.
 */
function lerPreferencia(): boolean {
  try {
    return localStorage.getItem(CHAVE) === '1'
  } catch {
    return false
  }
}

function gravarPreferencia(ligado: boolean): void {
  try {
    localStorage.setItem(CHAVE, ligado ? '1' : '0')
  } catch {
    // Aba anônima ou armazenamento bloqueado: o modo vale para esta sessão e
    // não persiste. Melhor que derrubar o clique.
  }
}
