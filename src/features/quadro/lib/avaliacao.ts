import type { CasoQuadro } from '../types'

/**
 * A AVALIAÇÃO DA FAMÍLIA — a planilha de pós-entrega dentro do sistema
 * (28/09/2026, pedido do gestor).
 *
 * A operação já fazia isto fora: quinze dias depois de entregar, alguém procura
 * a família caso a caso e pede a avaliação. A aba Concluídos passa a mostrar
 * esse caminho em três colunas, e o caso anda sozinho entre as duas primeiras.
 */
export const DIAS_ATE_A_AVALIACAO = 15

export type ColunaDoConcluido = 'entregues' | 'avaliacao' | 'concluidos'

export const ROTULO_DA_COLUNA: Record<ColunaDoConcluido, string> = {
  entregues: 'Entregues',
  avaliacao: 'Avaliação interna',
  concluidos: 'Concluídos',
}

export const EXPLICACAO_DA_COLUNA: Record<ColunaDoConcluido, string> = {
  entregues: `Entregues há menos de ${DIAS_ATE_A_AVALIACAO} dias. A família ainda está com o material fresco.`,
  avaliacao: `Passaram ${DIAS_ATE_A_AVALIACAO} dias da entrega: é a hora de procurar a família e pedir a avaliação.`,
  concluidos: 'Avaliação feita — e os casos cancelados e os BIRTH, que não passam pela avaliação.',
}

/**
 * EM QUE COLUNA ESTE CASO ESTÁ, calculado na hora de desenhar.
 *
 * NADA DISSO É GUARDADO. A passagem dos quinze dias não é um job nem um campo:
 * é uma conta entre `encerradoEm` e o relógio. Um cron que movesse casos de
 * coluna criaria um estado que pode discordar do calendário — a mesma razão
 * pela qual o sino não tem tabela de notificações (seção 13 do CLAUDE.md). O
 * que é derivado não tem como ficar velho.
 *
 * CANCELADO VAI DIRETO PARA A TERCEIRA (decisão do gestor): contrato que caiu
 * não tem família para avaliar, e deixá-lo na fila da ligação seria trabalho
 * inventado.
 *
 * SEM `encerradoEm` TAMBÉM VAI PARA A TERCEIRA. Isso só acontece em caso
 * terminal antigo cujo carimbo o backfill não achou; sem data não há como
 * contar quinze dias, e um caso sem data no meio da fila de ligação é pior que
 * um caso a menos nela.
 */
export function colunaDoConcluido(caso: CasoQuadro, agora: Date): ColunaDoConcluido {
  if (caso.statusOperacional === 'cancelado') return 'concluidos'
  // O BIRTH NÃO PASSA PELA AVALIAÇÃO (30/09/2026, pedido do gestor): ele é feito
  // sem contrato, para tentar a venda — a ligação dos quinze dias é para a
  // família que contratou. Encerrado, vai direto para a terceira coluna, e é
  // lá que o link da venda se acrescenta (ver Entregaveis).
  if ((caso.pacoteSlug ?? '').startsWith('birth')) return 'concluidos'
  if (caso.avaliacaoEm !== null) return 'concluidos'
  if (caso.encerradoEm === null) return 'concluidos'

  return diasDesde(caso.encerradoEm, agora) >= DIAS_ATE_A_AVALIACAO
    ? 'avaliacao'
    : 'entregues'
}

/**
 * Quantos dias INTEIROS se passaram. Sem arredondar para cima: o caso entregue
 * ontem à noite não completou um dia hoje de manhã, e quinze dias é um acordo
 * com a família, não um alarme.
 */
export function diasDesde(iso: string, agora: Date): number {
  const ms = agora.getTime() - new Date(iso).getTime()
  return Math.floor(ms / 86_400_000)
}

/**
 * Quanto falta para o caso entrar na fila da avaliação — o que a primeira
 * coluna diz em cada cartão. Zero ou menos não acontece ali: com quinze dias
 * cumpridos o caso já está na coluna do meio.
 */
export function diasAteAAvaliacao(caso: CasoQuadro, agora: Date): number | null {
  if (caso.encerradoEm === null) return null
  return DIAS_ATE_A_AVALIACAO - diasDesde(caso.encerradoEm, agora)
}
