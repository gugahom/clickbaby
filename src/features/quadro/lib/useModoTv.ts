import { useSyncExternalStore } from 'react'

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
 *
 * POR QUE UMA LOJA DE MÓDULO E NÃO `useState`
 * O interruptor mora na faixa da marca (AppShell) e o layout que ele comanda
 * mora no Quadro — dois componentes que não se conhecem e não têm ancestral
 * comum além da rota. Com `useState` em cada um, apertar o botão mudaria a
 * cópia dele e o Quadro continuaria como estava. Um Context resolveria e
 * custaria um provedor para guardar um booleano; `useSyncExternalStore` sobre
 * uma variável de módulo é a mesma coisa sem a cerimônia — e é o mesmo
 * primitivo que `useTelaLarga` já usa para o matchMedia.
 */
const CHAVE = 'clickbaby:modo-tv'

let ligado = lerPreferencia()
const ouvintes = new Set<() => void>()

export function useModoTv(): readonly [boolean, () => void] {
  // O terceiro argumento é o valor do servidor. Não há SSR aqui, mas ele
  // também cobre a primeira renderização antes de qualquer inscrição.
  const valor = useSyncExternalStore(inscrever, () => ligado, () => false)
  return [valor, alternarModoTv] as const
}

export function alternarModoTv(): void {
  ligado = !ligado
  gravarPreferencia(ligado)
  for (const avisar of ouvintes) avisar()
}

function inscrever(aoMudar: () => void): () => void {
  ouvintes.add(aoMudar)
  return () => {
    ouvintes.delete(aoMudar)
  }
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

function gravarPreferencia(valor: boolean): void {
  try {
    localStorage.setItem(CHAVE, valor ? '1' : '0')
  } catch {
    // Aba anônima ou armazenamento bloqueado: o modo vale para esta sessão e
    // não persiste. Melhor que derrubar o clique.
  }
}
