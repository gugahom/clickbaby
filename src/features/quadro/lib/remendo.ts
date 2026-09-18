import type { CasoQuadro, DadosQuadro } from '../types'

/**
 * COSTURAR NA LISTA O QUE O BANCO DEVOLVEU PARA ALGUNS CASOS (18/09/2026,
 * correção 4 da lentidão). A busca e a fila moram em api/atualizar-por-caso.ts;
 * aqui fica só a decisão, sem rede nenhuma.
 *
 * NA DÚVIDA, RECARREGA TUDO. Remendar é mais barato, mas uma lista remendada
 * errada é a tela discordando do banco sem erro nenhum — a pior classe de
 * defeito deste projeto (seção 5 do CLAUDE.md). O remendo só acontece quando dá
 * para PROVAR que o resultado é o de uma recarga completa.
 */

export interface Colecao {
  /** O caso pertence a esta lista? */
  pertence: (caso: CasoQuadro) => boolean
  /**
   * A mudança deste caso pode mexer em OUTROS casos da lista? Se sim, o remendo
   * não basta. `antes` é como o caso estava na memória — ausente se não estava.
   */
  exigeRecarga: (antes: CasoQuadro | undefined, depois: CasoQuadro) => boolean
}

/**
 * O QUADRO: tudo que não é arquivo (migration 20260918091859).
 *
 * O Quadro carrega o caso terminado que ainda conta no "x de y" de um dia
 * aberto, e "aberto" depende dos OUTROS casos do dia. Um caso que PASSA A ESTAR
 * aberto — criado agora, reaberto, restaurado, ou trocado de dia — pode trazer
 * consigo os terminados do dia dele, e esses não vêm numa busca por id: só uma
 * recarga completa os traz.
 *
 * O contrário não precisa. Quando um dia fecha, os terminados que ficaram na
 * memória sobram num bloco fechado, que a tela já esconde (`blocosAbertos`), e
 * saem na próxima recarga completa. Sobrar é inofensivo; faltar, não.
 */
export const DO_QUADRO: Colecao = {
  pertence: (caso) => !caso.arquivado,
  exigeRecarga: (antes, depois) =>
    !depois.ehTerminal &&
    (antes === undefined || antes.ehTerminal || antes.dia !== depois.dia),
}

/** CONCLUÍDOS: todo terminal. Pertencer depende só do próprio caso. */
export const DOS_CONCLUIDOS: Colecao = {
  pertence: (caso) => caso.ehTerminal,
  exigeRecarga: () => false,
}

/**
 * A ORDEM EM QUE A CONSULTA DEVOLVE OS CASOS, para a lista remendada ficar igual
 * a uma recarga. A lista de Rascunhos, por exemplo, é mostrada na ordem do array.
 *
 * `previsao_em` crescente com os NULOS NO FIM — o padrão do Postgres para ASC,
 * e portanto o do PostgREST — e `id` desempatando. Os dois são texto
 * comparável: o carimbo vem sempre no mesmo formato ISO, e o Postgres ordena
 * uuid byte a byte, que para hexadecimal minúsculo é a ordem da string.
 */
export function ordemDaConsulta(a: CasoQuadro, b: CasoQuadro): number {
  if (a.previsaoEm !== b.previsaoEm) {
    if (a.previsaoEm === null) return 1
    if (b.previsaoEm === null) return -1
    return a.previsaoEm < b.previsaoEm ? -1 : 1
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/**
 * A lista com os casos dados trocados pelo que o banco devolveu — ou `null`
 * quando um deles pode ter mexido em outros, e só uma recarga resolve.
 *
 * Caso que não voltou (apagado, ou que a RLS deixou de mostrar) e caso que
 * deixou de pertencer SAEM; os que pertencem entram ou são trocados, com as
 * etapas junto. A ordem final é a da consulta.
 */
export function remendar(
  atual: DadosQuadro,
  ids: string[],
  novos: DadosQuadro,
  colecao: Colecao,
): DadosQuadro | null {
  const antes = new Map(atual.casos.map((c) => [c.id, c]))
  const depois = new Map(novos.casos.map((c) => [c.id, c]))

  for (const id of ids) {
    const novo = depois.get(id)
    if (novo && colecao.exigeRecarga(antes.get(id), novo)) return null
  }

  const mudados = new Set(ids)
  const casos = atual.casos.filter((c) => !mudados.has(c.id))
  const etapasPorCaso = new Map(atual.etapasPorCaso)

  for (const id of ids) {
    etapasPorCaso.delete(id)
    const novo = depois.get(id)
    if (!novo || !colecao.pertence(novo)) continue
    casos.push(novo)
    // Caso sem etapa nenhuma (rascunho sem pacote) fica sem entrada no mapa,
    // exatamente como a carga completa o deixa.
    const etapas = novos.etapasPorCaso.get(id)
    if (etapas) etapasPorCaso.set(id, etapas)
  }

  casos.sort(ordemDaConsulta)
  return { casos, etapasPorCaso }
}
