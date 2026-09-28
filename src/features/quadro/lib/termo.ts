import type { TermoStatus } from '../types'

/**
 * O TERMO DE USO DE IMAGEM — a coluna TERMO da planilha de atendimento
 * (22/09/2026, pedido do gestor).
 *
 * Ele responde uma pergunta da MÍDIA da empresa: dá para usar as fotos deste
 * parto num post? A resposta está no contrato de cada família, quem a fecha é a
 * Morgana, e o momento em que ela a tem em mãos é o de confirmar a entrega.
 *
 * SÃO QUATRO desde 28/09/2026 (pedido do gestor), e é o que o banco aceita
 * (`registrar_termo`). "NÃO AUTORIZADO" é a que faltava: a família que RECUSOU
 * só tinha onde cair como "ass pendente" — que diz "ainda não chegou" —, e a
 * diferença entre "não respondeu" e "respondeu que não" é justamente a que
 * decide se uma foto pode ser publicada um dia.
 *
 * "AUTORIZADO" É O `assinado` DE SEMPRE, só com outro rótulo: assinar o termo É
 * autorizar, e trocar o identificador reescreveria histórico por uma palavra.
 * Mesmo arranjo de `operador`/"Fotógrafo(a)". O enum ainda tem `nao_aplicavel`,
 * que sobrou do schema inicial e a operação não usa.
 *
 * A COR diz o que a mídia pode fazer: verde é "pode usar", âmbar é "ainda não se
 * sabe", vermelho é "a família disse não". SEM CONTRATO é NEUTRO, e não vermelho
 * como era até 28/09: ali não há autorização, mas também não há recusa — um
 * BIRTH sem contrato é o normal dele, e o vermelho agora pertence ao "não".
 */
export const OPCOES_TERMO: readonly TermoStatus[] = [
  'assinado',
  'nao_autorizado',
  'pendente',
  'sem_contrato',
]

export const ROTULO_TERMO: Record<TermoStatus, string> = {
  assinado: 'Autorizado',
  nao_autorizado: 'Não autorizado',
  pendente: 'Ass pendente',
  sem_contrato: 'Sem contrato',
  // Não aparece em lugar nenhum da tela; fica aqui porque o tipo é exaustivo e
  // um caso antigo do banco pode carregar o valor.
  nao_aplicavel: 'Não se aplica',
}

/** O que a escolha significa, dito no diálogo — a pessoa marca uma vez e encerra. */
export const EXPLICACAO_TERMO: Record<TermoStatus, string> = {
  assinado: 'A família autorizou o uso das imagens.',
  nao_autorizado: 'A família NÃO autorizou — estas imagens não vão para lugar nenhum.',
  pendente: 'O contrato existe, mas a assinatura do termo ainda não veio.',
  sem_contrato: 'Não há contrato com termo — é o caso dos BIRTH, vendidos depois do parto.',
  nao_aplicavel: '',
}

/**
 * As classes do selo e do chip marcado. Ficam juntas aqui para o cartão dos
 * Concluídos e o diálogo nunca pintarem a mesma resposta de cores diferentes.
 */
export const CLASSE_TERMO: Record<TermoStatus, string> = {
  assinado: 'bg-concluido text-white',
  nao_autorizado: 'bg-atrasado text-white',
  pendente: 'bg-atencao text-atencao-tinta',
  sem_contrato: 'bg-muted text-muted-foreground',
  nao_aplicavel: 'bg-muted text-muted-foreground',
}

/**
 * O BIRTH JÁ ABRE COMO "SEM CONTRATO" (decisão do gestor): são vendidos depois
 * do parto, para apresentar as fotos aos pais, e não têm contrato assinado.
 * Marcado e não travado — um BIRTH que virou venda com contrato existe, e quem
 * está com o contrato na mão é quem responde.
 *
 * Pelo SLUG e não pelo nome, a mesma armadilha de `itensDaConferencia`: são
 * dois pacotes (`birth`, `birth-reels`) com o mesmo prefixo.
 */
export function termoSugerido(pacoteSlug: string | null): TermoStatus | null {
  return (pacoteSlug ?? '').startsWith('birth') ? 'sem_contrato' : null
}
