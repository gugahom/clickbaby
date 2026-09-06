/**
 * OS ESTADOS DE PRESENÇA, e a razão de serem tão poucos.
 *
 * O pedido veio como "online, ocupada etc", com o menu do Discord de
 * referência — que tem quatro estados. O gestor escolheu DOIS manuais, e a
 * escolha é boa: cada estado a mais é uma pergunta a mais para alguém de pé num
 * corredor às três da manhã, e "Não perturbar" e "Invisível" resolvem problemas
 * de um chat com trinta canais, não de uma equipe de catorze pessoas que
 * precisa saber quem pode atender a próxima maternidade.
 *
 * DOIS EIXOS, e não um. A confusão que o gestor mesmo apontou some quando se
 * separa o que a pessoa DECLARA do que ela está FAZENDO:
 *
 *   - DISPONIBILIDADE é declarada por ela: disponível ou ausente. Responde
 *     "posso ser chamada agora?".
 *   - ATIVIDADE é derivada do trabalho: quem tem etapa em andamento aparece
 *     como ocupada, sozinha, sem ninguém apertar nada. Responde "o que ela está
 *     fazendo?".
 *
 * É por isso que o estado muda "de acordo com as movimentações nos cards", como
 * ele pediu, sem que a pessoa precise mexer no menu de novo: ela diz que chegou,
 * e o resto o próprio trabalho conta.
 *
 * NADA DISTO É GRAVADO. Presença vive no canal do Realtime enquanto a aba está
 * aberta, e some quando ela fecha. A régua de trabalho continua sendo etapa
 * iniciada e concluída, com carimbo do servidor (invariante 3.4) — aba aberta
 * não é trabalho, e um relógio de presença seria espelho de ponto, que a seção
 * 9 do CLAUDE.md põe fora de escopo de propósito.
 */

/** O que a pessoa escolhe no menu. */
export type EstadoDeclarado = 'disponivel' | 'ausente'

/** O que a bolinha mostra — os dois declarados mais o derivado do trabalho. */
export type EstadoVisivel = EstadoDeclarado | 'ocupada'

export const ROTULO_ESTADO: Record<EstadoVisivel, string> = {
  disponivel: 'Disponível',
  ausente: 'Ausente',
  ocupada: 'Ocupada',
}

/**
 * A cor de cada estado, em classe do Tailwind.
 *
 * Reaproveita os tokens que a tela já usa para dizer as mesmas coisas: o verde
 * do caso pronto, o âmbar do alerta que se aproxima. Uma paleta nova para
 * presença faria a mesma cor significar duas coisas diferentes em duas partes
 * do Quadro.
 */
export const COR_ESTADO: Record<EstadoVisivel, string> = {
  disponivel: 'bg-pronto',
  // AZUL DO LOGO, e não `--marca`. A marca é o azul-marinho escuro, feito para
  // texto sobre fundo claro; na faixa do cabeçalho, que é escura, a bolinha
  // sumia. Este é o azul claro da própria marca, e ele se lê nos dois fundos.
  // Azul e não rosa: o rosa do acento fica na vizinhança do vermelho de
  // atraso, e duas coisas sem relação não podem parecer a mesma.
  ocupada: 'bg-logo-azul',
  ausente: 'bg-atencao',
}

/**
 * O estado que a bolinha mostra: o trabalho fala, MENOS quando ela disse que
 * saiu.
 *
 * A ordem importa e é uma decisão. "Ausente" ganha de "ocupada" porque o caso
 * real é quem começou uma edição e foi almoçar sem pausar: a etapa continua em
 * andamento no banco, e mostrar "ocupada" mandaria a coordenação esperar por
 * alguém que não está lá. O contrário — ausente sumindo porque a etapa está
 * rodando — é o erro que faz alguém ser chamada no meio do almoço.
 */
export function estadoVisivel(
  declarado: EstadoDeclarado,
  temTrabalhoEmAndamento: boolean,
): EstadoVisivel {
  if (declarado === 'ausente') return 'ausente'
  return temTrabalhoEmAndamento ? 'ocupada' : 'disponivel'
}
