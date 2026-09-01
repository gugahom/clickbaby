import type { BlocoDia, CasoQuadro } from '../types'

/**
 * Rascunho cancelado sem NUNCA ter tido pacote e maternidade resolvidos.
 *
 * Diferente de um caso real cancelado — ali havia contrato, havia trabalho
 * planejado, cancelar é decisão comercial (seção 4 do CLAUDE.md). Um
 * rascunho que nunca saiu do limbo é só ruído do sync (evento antigo,
 * título ambíguo, o alargamento de janela corrigido em 31/08/2026) — não
 * houve caso de verdade em momento nenhum.
 *
 * `eh_rascunho` é calculado ao vivo na view (`pacote_id is null or
 * maternidade_id is null`), então continua true mesmo depois de cancelado —
 * é exatamente essa persistência que permite distinguir "nunca foi resolvido"
 * de "foi resolvido e depois cancelado".
 */
export function rascunhoDescartado(caso: CasoQuadro): boolean {
  return caso.ehRascunho && caso.ehTerminal
}

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
 *
 * Casos terminais e casos na UTI continuam vindo dentro de `casos` (a aba
 * Concluídos e a seção UTI leem daqui e precisam saber de que dia eram), mas
 * ficam fora das contagens do bloco — ver montarBloco. EXCEÇÃO: um rascunho
 * DESCARTADO (`rascunhoDescartado`) não entra nem aqui — nunca foi caso de
 * verdade, não é histórico de dia nenhum.
 */
export function agruparPorDia(casos: CasoQuadro[]): BlocoDia[] {
  const porDia = new Map<string, CasoQuadro[]>()
  const semData: CasoQuadro[] = []

  for (const caso of casos) {
    // Descartado NÃO entra no bloco do dia — nem dimmed, nem contado. Um
    // caso real terminal continua aparecendo (é histórico legítimo do dia);
    // este nunca foi caso de verdade. Um dia cujo único conteúdo era ruído
    // vira dia vazio e some sozinho por `blocosAbertos`/`fechado`.
    if (rascunhoDescartado(caso)) continue
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

  // Casos na UTI saem da conta do dia inteira, numerador e denominador: eles
  // não estão nem pendentes nem resolvidos AQUI — mudaram de seção. Contá-los
  // faria o "X de Y" nunca fechar.
  const doDia = ordenados.filter((c) => !c.naUti)
  const resolvidos = doDia.filter((c) => c.ehTerminal).length

  return {
    dia,
    casos: ordenados,
    total: doDia.length,
    resolvidos,
    // Fechado quando não sobrou nada aberto: ou tudo terminal, ou o que
    // restava foi para a UTI. Em ambos os casos não há trabalho do dia na tela.
    fechado: doDia.length === 0 || resolvidos === doDia.length,
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

/**
 * Corta o que está DEPOIS DE AMANHÃ (30/08/2026, revisto em 01/09/2026).
 *
 * A primeira versão cortava em HOJE. O motivo continua valendo — o Quadro é o
 * que precisa de ação, não uma prévia da agenda inteira, e "Carregar mais
 * dias" chegava a semanas de casos que o comercial ainda pode remarcar,
 * cancelar ou trocar de pacote. Mas cortar em hoje foi um passo longe demais:
 * o turno da noite acaba entrando no dia seguinte, e quem monta a escala
 * precisa ver o que vem logo em seguida sem trocar de tela.
 *
 * AMANHÃ, E SÓ AMANHÃ. O gestor pediu exatamente um dia de folga, então o
 * limite é `hoje + 1` e não um parâmetro configurável: um número que ninguém
 * escolhe é um número que ninguém precisa manter.
 *
 * `dia` é comparável como STRING porque é 'YYYY-MM-DD' — a mesma razão pela
 * qual `hojeNoFuso()` usa esse formato. O limite, porém, NÃO pode ser feito
 * com aritmética de string: somar 1 a "2026-08-31" tem que virar
 * "2026-09-01", e só uma data sabe disso.
 *
 * Dia sem previsão (`dia === null`) NÃO é futuro, é ausência de dado — fica.
 * Cortar um caso sem data escondido atrás de "provavelmente é futuro" seria
 * inventar uma resposta que o dado não dá.
 */
export function semFuturo(blocos: BlocoDia[], hoje: string): BlocoDia[] {
  const limite = diaSeguinte(hoje)
  return blocos.filter((b) => b.dia === null || b.dia <= limite)
}

/**
 * 'YYYY-MM-DD' + 1 dia, sem fuso nenhum no meio.
 *
 * `Date.UTC` de propósito: a conta é sobre o CALENDÁRIO, não sobre um
 * instante. Construir com `new Date(ano, mes, dia)` usaria o fuso do aparelho
 * — e nos CEL CLICK, que trocam de mão, nada garante qual é (seção 6 do
 * CLAUDE.md). Em UTC a soma de 24h nunca cruza um limite de horário de verão.
 */
function diaSeguinte(dia: string): string {
  const [ano, mes, d] = dia.split('-').map(Number)
  const data = new Date(Date.UTC(ano ?? 1970, (mes ?? 1) - 1, d ?? 1))
  data.setUTCDate(data.getUTCDate() + 1)
  return data.toISOString().slice(0, 10)
}

/**
 * Quantos cartões cabem numa coluna só antes de o Quadro precisar rolar.
 *
 * A conta vem da TV de 70" que o gestor quer deixar ligada na sala: a área da
 * lista fica perto de 750px de altura útil, um cartão mede ~120px e o
 * cabeçalho de cada dia ~60px. Dá seis cartões, e o sétimo já obriga alguém a
 * rolar uma tela que ninguém vai tocar — ela está na parede.
 *
 * É um número de CALIBRAGEM, não uma regra do domínio: se a TV mudar ou o
 * cartão encolher, muda aqui e em nenhum outro lugar.
 */
export const CARTOES_ATE_UMA_COLUNA = 6

/**
 * Os dias visíveis merecem duas colunas?
 *
 * Duas condições, e as duas importam. Precisa de mais de um DIA (não dá para
 * dividir um bloco só) e de cartão o bastante para justificar — o gestor pediu
 * explicitamente que a tela volte ao "normal" quando o movimento estiver
 * baixo, e ele tem razão: dois cartões espalhados em duas colunas de meia tela
 * leem como uma tela quebrada, não como uma tela organizada.
 */
export function mereceDuasColunas(blocos: BlocoDia[]): boolean {
  if (blocos.length < 2) return false
  const cartoes = blocos.reduce((soma, b) => soma + b.casos.length, 0)
  return cartoes > CARTOES_ATE_UMA_COLUNA
}

/**
 * Reparte os dias em DUAS colunas, mantendo a ordem cronológica.
 *
 * O CORTE É SEQUENCIAL, e essa é a decisão que importa: a coluna da esquerda
 * fica com os primeiros dias e a da direita com os últimos, nunca intercalado.
 * Distribuir "o próximo dia vai para a coluna mais vazia" equilibraria melhor
 * a altura e produziria uma tela ilegível — ontem e anteontem à esquerda, hoje
 * no meio da direita. Quem olha de longe lê uma coluna inteira e depois a
 * outra; a ordem do tempo tem que sobreviver a isso.
 *
 * Entre os cortes possíveis escolhe o mais equilibrado POR CARTÃO, não por
 * número de dias — um dia com oito casos ocupa mais tela que três dias com um
 * caso cada. Empate cai para a esquerda mais cheia, que é como a leitura
 * natural espera (o começo pesa mais).
 *
 * Devolve sempre duas listas; a segunda pode vir vazia se só houver um dia —
 * quem chama já filtrou isso por `mereceDuasColunas`, mas a função não depende
 * disso para não quebrar.
 */
export function dividirEmDuasColunas(blocos: BlocoDia[]): [BlocoDia[], BlocoDia[]] {
  if (blocos.length < 2) return [blocos, []]

  const peso = (lista: BlocoDia[]) => lista.reduce((s, b) => s + b.casos.length, 0)
  const total = peso(blocos)

  let melhorCorte = 1
  let melhorDiferenca = Number.POSITIVE_INFINITY

  // O corte vai de 1 a blocos.length - 1: as duas colunas sempre recebem ao
  // menos um dia. Um corte em 0 ou no fim seria "não dividiu".
  for (let corte = 1; corte < blocos.length; corte++) {
    const esquerda = peso(blocos.slice(0, corte))
    const diferenca = Math.abs(total - esquerda - esquerda)
    // `<` e não `<=`: no empate fica o corte MENOR, que deixa a esquerda mais
    // curta... e é o oposto do que se quer. Por isso o desempate explícito
    // abaixo, comparando quem tem mais peso à esquerda.
    if (diferenca < melhorDiferenca) {
      melhorDiferenca = diferenca
      melhorCorte = corte
    } else if (diferenca === melhorDiferenca && esquerda > peso(blocos.slice(0, melhorCorte))) {
      melhorCorte = corte
    }
  }

  return [blocos.slice(0, melhorCorte), blocos.slice(melhorCorte)]
}
