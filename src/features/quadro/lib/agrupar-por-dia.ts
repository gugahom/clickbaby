import type { BlocoDia, CasoQuadro } from '../types'

/**
 * Agrupa os casos em blocos de dia.
 *
 * DUAS DIFERENÇAS DELIBERADAS EM RELAÇÃO À REFERÊNCIA DA v0:
 *
 * 1. O eixo é `dia` (previsão do parto, já convertido para America/Sao_Paulo
 *    pela view), não o vencimento do SLA. A pergunta da tela é "o que temos
 *    hoje", não "o que vence quando" (seção 7 de docs/plano.md).
 *
 * 2. Um dia sai do Quadro quando TODOS os seus casos estão em estado terminal
 *    — encerrado ou cancelado —, nunca por passagem de data (invariante 3.5).
 *    A v0 removia o dia quando não sobrava caso "ativo", tratando cancelado
 *    como inexistente e sem nunca considerar o encerramento de verdade.
 *
 * Dias sem previsão (`dia === null`) caem num bloco próprio no fim: existem no
 * banco (previsao_em é nullable) e sumir com eles esconderia trabalho.
 */
export function agruparPorDia(casos: CasoQuadro[]): BlocoDia[] {
  const porDia = new Map<string, CasoQuadro[]>()
  const semData: CasoQuadro[] = []

  for (const caso of casos) {
    if (caso.dia === null) {
      semData.push(caso)
      continue
    }
    const atuais = porDia.get(caso.dia)
    if (atuais) atuais.push(caso)
    else porDia.set(caso.dia, [caso])
  }

  const blocos: BlocoDia[] = [...porDia.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dia, doDia]) => montarBloco(dia, doDia))

  if (semData.length > 0) blocos.push(montarBloco(null, semData))

  return blocos
}

function montarBloco(dia: string | null, casos: CasoQuadro[]): BlocoDia {
  const ordenados = [...casos].sort(ordenarDentroDoDia)
  const resolvidos = ordenados.filter((c) => c.ehTerminal).length
  return {
    dia,
    casos: ordenados,
    total: ordenados.length,
    resolvidos,
    fechado: ordenados.length > 0 && resolvidos === ordenados.length,
  }
}

/** Dentro do dia: por hora prevista; sem hora vai para o fim. */
function ordenarDentroDoDia(a: CasoQuadro, b: CasoQuadro): number {
  if (a.previsaoEm && b.previsaoEm) return a.previsaoEm.localeCompare(b.previsaoEm)
  if (a.previsaoEm) return -1
  if (b.previsaoEm) return 1
  return a.maeNome.localeCompare(b.maeNome)
}

/**
 * O Quadro abre com poucos dias e cresce sob demanda.
 *
 * Motivo: hoje são 84 casos em 34 dias e nenhum terminal, então nada sai da
 * tela sozinho — abrir tudo de uma vez é uma parede. O plano já pede
 * "sempre prioriza os dias mais próximos, não é uma tela infinita"
 * (seção 7 de docs/plano.md).
 *
 * Blocos JÁ FECHADOS (todos os casos terminais) não entram na conta nem
 * aparecem: é a invariante 3.5 aplicada — o dia se resolveu, saiu.
 */
export const DIAS_INICIAIS = 5
export const DIAS_POR_PAGINA = 5

export function blocosVisiveis(blocos: BlocoDia[], quantidade: number): BlocoDia[] {
  return blocos.filter((b) => !b.fechado).slice(0, quantidade)
}

export function blocosAbertos(blocos: BlocoDia[]): BlocoDia[] {
  return blocos.filter((b) => !b.fechado)
}
