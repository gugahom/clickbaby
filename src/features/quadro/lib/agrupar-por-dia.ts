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
 * Um dia — ou o pedaço dele — dentro de uma das colunas do modo TV.
 *
 * `continuacao` diz que este pedaço é o RESTO de um dia que começou na coluna
 * anterior. O cabeçalho usa isso para se anunciar como continuação em vez de
 * repetir o dia como se fosse outro, que é o que faria alguém contar o mesmo
 * dia duas vezes.
 */
export interface BlocoNaColuna {
  bloco: BlocoDia
  continuacao: boolean
}

/**
 * Quanto vale um cabeçalho de dia em "cartões".
 *
 * Medido na tela: cartão compacto ~137px, cabeçalho de dia ~64px mais o
 * respiro. Meio cartão erra por pouco e evita o erro grosseiro de tratar o
 * cabeçalho como se não ocupasse nada — com três dias curtos numa coluna, isso
 * daria quase dois cartões de diferença.
 */
const PESO_CABECALHO = 0.5

/**
 * Reparte os dias em DUAS colunas, mantendo a ordem cronológica.
 *
 * A ORDEM É SEQUENCIAL, e essa é a decisão que importa: a coluna da esquerda
 * fica com o começo e a da direita com o fim, nunca intercalado. Quem olha de
 * longe lê uma coluna inteira e depois a outra — é a leitura de jornal, e a
 * ordem do tempo tem que sobreviver a ela. Distribuir "o próximo dia vai para
 * a coluna mais vazia" equilibraria melhor e produziria ontem e anteontem à
 * esquerda com hoje no meio da direita.
 *
 * UM DIA PODE PARTIR ENTRE AS COLUNAS, e essa é a mudança de 01/09/2026. A
 * primeira versão só cortava ENTRE dias, e com três dias na tela — ontem com
 * cinco casos, hoje com oito, amanhã com três — os únicos cortes possíveis
 * eram 5|11 e 13|3. O escolhido, 5|11, deixava a coluna esquerda terminando na
 * metade da tela com novecentos pixels de vão enquanto a direita rolava duas
 * telas. Isto é literalmente a queixa que abriu o assunto: espaço
 * desperdiçado numa TV.
 *
 * Partir o dia não custa legibilidade porque a ordem se mantém: a esquerda
 * termina no meio de hoje e a direita retoma exatamente dali, anunciada como
 * continuação. É como uma matéria que vira de coluna.
 *
 * O QUE NÃO PARTE: um dia nunca deixa o cabeçalho sozinho no pé de uma coluna.
 * O corte só acontece DEPOIS do primeiro caso do dia — cabeçalho órfão anuncia
 * um dia que não está ali.
 *
 * As contagens do bloco (`total`, `resolvidos`, `fechado`) viajam INTEIRAS
 * para os dois pedaços de propósito: elas descrevem o dia, não o pedaço. Um
 * "0 de 3 concluídos" no pedaço da direita seria a resposta a uma pergunta que
 * ninguém fez.
 */
export function dividirEmDuasColunas(
  blocos: BlocoDia[],
): [BlocoNaColuna[], BlocoNaColuna[]] {
  if (blocos.length === 0) return [[], []]

  const total = blocos.reduce(
    (soma, b) => soma + PESO_CABECALHO + b.casos.length,
    0,
  )
  const meta = total / 2

  const esquerda: BlocoNaColuna[] = []
  const direita: BlocoNaColuna[] = []
  let acumulado = 0
  // Uma vez que a esquerda fechou, tudo o que vem depois é da direita — sem
  // isto, um dia pequeno depois do corte poderia "caber" e voltar para a
  // esquerda, quebrando a ordem de leitura.
  let fechouEsquerda = false

  for (const bloco of blocos) {
    if (fechouEsquerda) {
      direita.push({ bloco, continuacao: false })
      continue
    }

    acumulado += PESO_CABECALHO

    // Quantos casos deste dia ainda cabem na esquerda antes de passar da
    // metade. `ceil` porque atravessar a metade no meio de um cartão é melhor
    // que parar antes dela: o cartão que sobra vai para a coluna que ainda
    // tem espaço de qualquer jeito.
    const cabem = Math.max(0, Math.ceil(meta - acumulado))

    if (cabem >= bloco.casos.length) {
      esquerda.push({ bloco, continuacao: false })
      acumulado += bloco.casos.length
      continue
    }

    // O dia não cabe inteiro. Se nem um caso dele cabe, ele começa na direita
    // — melhor que um cabeçalho sozinho no pé da esquerda.
    if (cabem === 0) {
      direita.push({ bloco, continuacao: false })
      fechouEsquerda = true
      continue
    }

    esquerda.push({ bloco: comCasos(bloco, bloco.casos.slice(0, cabem)), continuacao: false })
    direita.push({ bloco: comCasos(bloco, bloco.casos.slice(cabem)), continuacao: true })
    fechouEsquerda = true
  }

  return [esquerda, direita]
}

/** O mesmo dia com outra fatia de casos. Contagens intactas — ver acima. */
function comCasos(bloco: BlocoDia, casos: CasoQuadro[]): BlocoDia {
  return { ...bloco, casos }
}
