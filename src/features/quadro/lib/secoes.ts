import { podeIniciar } from './acoes'
import { rascunhoDescartado } from './agrupar-por-dia'
import type { CasoQuadro, EtapaQuadro } from '../types'

/**
 * As seções laterais são VISÕES FILTRADAS, não estados novos.
 *
 * Um caso em edição de vídeo continua na lista da esquerda com a etapa em
 * andamento E aparece na seção REELS. Não existe "status reels" no banco, e
 * inventar um significaria duas fontes de verdade para a mesma coisa.
 *
 * UTI é diferente: `uti_desde` é estado de verdade (pausa o SLA), e por isso o
 * caso SAI do bloco do dia. Mas ele guarda o `dia`, para a seção poder dizer de
 * quando era.
 */

/** Casos na UTI, do mais antigo para o mais recente — quem está lá há mais tempo primeiro. */
export function casosNaUti(casos: CasoQuadro[]): CasoQuadro[] {
  return casos
    .filter((c) => c.naUti && !c.ehTerminal)
    .sort((a, b) => (a.utiDesde ?? '').localeCompare(b.utiDesde ?? ''))
}

/**
 * Casos cuja edição de vídeo está ABERTA — liberada para começar, em
 * andamento, ou pausada no meio.
 *
 * A REGRA MUDOU, E A ANTERIOR ESTAVA ERRADA
 * Antes entrava só `em_andamento`, com o argumento de que a seção mostrava "o
 * que está sendo editado agora" e que pausada poluiria. Isso deixava a seção
 * cega para o único momento em que ela seria útil: o vídeo que já pode ser
 * feito e que ninguém pegou. Um caso com nascimento concluído e vídeo parado
 * há 20h não aparecia em lugar nenhum além da lista do dia, misturado com os
 * que ainda nem nasceram.
 *
 * O critério certo é DISPONIBILIDADE, não atividade. A pergunta que a seção
 * responde passa a ser "que vídeo há para fazer", que é a pergunta de quem
 * senta na estação de edição.
 *
 * O QUE DEFINE "LIBERADA"
 * Reusa `podeIniciar`, a mesma regra que decide se o botão de play aparece:
 * nenhuma etapa anterior por `ordem` pode estar pendente. Sem isso, um BABY
 * REELS entraria na seção no dia em que o caso foi criado — antes do parto,
 * quando não existe imagem para editar. Reusar em vez de reescrever é o ponto:
 * se a regra de precedência mudar, ela muda nos dois lugares de uma vez.
 *
 * Pausada entra por ser exatamente o que precisa de atenção, e `em_andamento`
 * entra porque continua sendo trabalho aberto. Saem só `concluida` e
 * `dispensada`.
 *
 * A ETAPA É `reels`, NÃO `edicao_video`
 * Até a migration 20260827140400 eram a mesma coisa e o código lia
 * `edicao_video`. Não são: `reels` é o vertical, existe em TODO pacote;
 * `edicao_video` é o horizontal, só no MASTER. Manter o filtro antigo faria
 * esta seção mostrar 9 casos de 88 e chamar isso de "Reels".
 *
 * ORDEM: POR VENCIMENTO, NÃO POR CHEGADA
 * A seção 9 do CLAUDE.md manda a fila de edição ordenar por urgência de prazo.
 * Com a tela da Fila removida, esta seção passou a ser o único lugar onde o
 * trabalho de vídeo aparece — e herdar a ordem da lista do dia (`previsao_em`)
 * deixaria a regra sem dono.
 *
 * As duas ordens são parecidas e não são iguais: `vence_em` é o nascimento
 * mais o prazo DO PACOTE, então um BIRTH de 24h nascido hoje vence antes de um
 * MASTER de 7 dias nascido ontem. É o SLA virando ordenação sozinho, sem
 * hardcode de "BIRTH primeiro" — que é o que o CLAUDE.md proíbe explicitamente.
 *
 * Sem vencimento vai para o FIM. Não deveria acontecer (o vídeo só libera
 * depois do nascimento, que é o que arma o relógio), mas se acontecer, prazo
 * desconhecido não é o mesmo que prazo urgente.
 */
/**
 * O reels que a seção deve mostrar deste caso — ou null se não há nenhum
 * aberto.
 *
 * DUAS RODADAS, UM CARTÃO
 * Desde a migration 20260827172830 um caso pode ter DOIS reels: o do parto e o
 * do banho. A versão anterior usava `find`, que devolve sempre o primeiro — e
 * com a rodada 1 concluída e a 2 aberta a seção diria que não há nada a fazer,
 * escondendo exatamente o trabalho que sobrou.
 *
 * A prioridade responde "o que está acontecendo agora neste caso": o que está
 * em andamento vence; depois o pausado, que é o que precisa de atenção; por
 * fim o mais antigo disponível, porque a rodada do parto vem antes da do banho.
 */
function reelsAberto(etapas: EtapaQuadro[]): EtapaQuadro | null {
  const abertos = etapas
    .filter((e) => e.tipo === 'reels')
    .filter((e) => e.status !== 'concluida' && e.status !== 'dispensada')
    .filter(
      (e) =>
        e.status === 'em_andamento' ||
        e.status === 'pausada' ||
        podeIniciar(e, etapas).habilitada,
    )

  if (abertos.length === 0) return null

  const peso = (e: EtapaQuadro) =>
    e.status === 'em_andamento' ? 0 : e.status === 'pausada' ? 1 : 2

  return (
    [...abertos].sort((a, b) => peso(a) - peso(b) || a.rodada - b.rodada)[0] ?? null
  )
}

export function casosComVideoAberto(
  casos: CasoQuadro[],
  etapasPorCaso: Map<string, EtapaQuadro[]>,
): CasoQuadro[] {
  return casos
    .filter((caso) => {
      if (caso.ehTerminal) return false
      return reelsAberto(etapasPorCaso.get(caso.id) ?? []) !== null
    })
    .sort((a, b) => {
      if (a.venceEm === b.venceEm) return 0
      if (a.venceEm === null) return 1
      if (b.venceEm === null) return -1
      return a.venceEm.localeCompare(b.venceEm)
    })
}

/** Casos encerrados ou cancelados, do mais recente para o mais antigo. */
/**
 * TODAS as rodadas de reels ainda abertas de um caso, em ordem de rodada.
 *
 * A seção passou a listar uma linha por rodada — "Ⅰ Parto", "Ⅱ B+F" — porque
 * elas são trabalhos distintos e podem estar com pessoas diferentes, em PCs
 * diferentes. Devolver só uma esconderia metade do que há para fazer.
 *
 * `reelsAberto` (singular) continua existindo para a pergunta de ENTRADA na
 * seção: basta uma rodada aberta para o caso aparecer. As duas usam o mesmo
 * filtro, então não há como o caso entrar e a lista vir vazia.
 */
export function reelsAbertosDaSecao(etapas: EtapaQuadro[]): EtapaQuadro[] {
  return etapas
    .filter((e) => e.tipo === 'reels')
    .filter((e) => e.status !== 'concluida' && e.status !== 'dispensada')
    .filter(
      (e) =>
        e.status === 'em_andamento' ||
        e.status === 'pausada' ||
        podeIniciar(e, etapas).habilitada,
    )
    .sort((a, b) => a.rodada - b.rodada)
}

/**
 * A seção MASTER: o VÍDEO HORIZONTAL aberto.
 *
 * POR QUE É UMA SEÇÃO SEPARADA DO REELS
 * São dois trabalhos com naturezas opostas, e a migration 20260827140400 os
 * separou justamente por isso. `reels` é o vertical curto, existe em todo
 * pacote, e vence em 48h ou menos. `edicao_video` é o horizontal, só no MASTER,
 * e tem DEZ DIAS ÚTEIS. Misturados numa lista ordenada por vencimento, o vídeo
 * do MASTER afunda para sempre no fim — e "no fim de uma lista que ninguém
 * rola" é onde um prazo de dez dias vira um prazo estourado.
 *
 * SEM HARDCODE DE PACOTE. O filtro é "tem etapa `edicao_video` aberta", e só os
 * dois MASTER têm essa etapa. Se amanhã um pacote novo vender o horizontal, ele
 * entra aqui sozinho — nada a editar no código. O CLAUDE.md proíbe fixar regra
 * de pacote em código, e a mesma razão vale aqui.
 *
 * O critério de "aberta" é o mesmo do reels: em andamento, pausada, ou liberada
 * por `podeIniciar`. Um MASTER cujo parto ainda não aconteceu não aparece.
 */
export function videosMasterAbertos(etapas: EtapaQuadro[]): EtapaQuadro[] {
  return etapas
    .filter((e) => e.tipo === 'edicao_video')
    // RESOLVIDA SAI — concluída ou dispensada (03/09/2026).
    //
    // Antes a concluída FICAVA, com este argumento: "Enviado / finalizado" é
    // uma fase, não o fim, porque a família pode pedir alteração depois de
    // receber, e o caminho de volta era o próprio seletor. O argumento era bom
    // e a consequência não: enquanto o caso encerrava junto com o vídeo, o
    // filtro de `ehTerminal` limpava a seção. Quando o caso passou a encerrar
    // SEM esperar o vídeo (20260903153101), sumiu o que tirava o cartão dali —
    // e vídeos entregues em agosto continuavam na lista de trabalho a fazer.
    //
    // O gestor viu o efeito antes da causa: "fica com o status entregue mas não
    // tem como concluir e tirar dali".
    //
    // O CAMINHO DE VOLTA NÃO SE PERDEU, mudou de lugar: um vídeo resolvido
    // volta a mostrar o botão de reabrir na linha do cartão (ver AcoesDoCaso),
    // que é onde toda outra etapa resolvida se desfaz. Uma exceção a menos.
    .filter((e) => e.status !== 'dispensada' && e.status !== 'concluida')
    .filter(
      (e) =>
        e.status !== 'pendente' && e.status !== 'atribuida'
          ? // Já saiu do backlog em algum momento — segue visível em qualquer
            // fase, inclusive concluída.
            true
          : // Ainda no backlog: só aparece depois de liberado, como antes.
            podeIniciar(e, etapas).habilitada,
    )
    .sort((a, b) => a.rodada - b.rodada)
}

/**
 * O vídeo horizontal ainda por fazer, num caso já entregue.
 *
 * Desde a migration 20260903153101 o MASTER encerra sem esperar o horizontal:
 * ele leva dez dias úteis, a família já recebeu fotos e reels, e o cartão
 * ficava semanas na lista do dia por causa dele. O trabalho continua — só
 * mudou de casa.
 */
export function temVideoMasterPendente(etapas: EtapaQuadro[]): boolean {
  return etapas.some(
    (e) =>
      e.tipo === 'edicao_video' &&
      e.status !== 'concluida' &&
      e.status !== 'dispensada',
  )
}

export function casosComVideoMasterAberto(
  casos: CasoQuadro[],
  etapasPorCaso: Map<string, EtapaQuadro[]>,
): CasoQuadro[] {
  return casos
    .filter((caso) => {
      /*
       * ENCERRADO CONTINUA AQUI; CANCELADO, NÃO.
       *
       * Esta seção filtrava todo caso terminal, e isso deixou de estar certo
       * quando o encerramento parou de esperar o vídeo: o cartão sairia da
       * lista do dia E daqui no mesmo instante, e o trabalho de dez dias
       * ficaria sem lugar nenhum na tela. É o oposto do que a mudança quis.
       *
       * Cancelado sai, e por razão diferente: ali o contrato caiu e não há
       * vídeo a terminar. A RPC recusa mover a fase de um caso cancelado, então
       * mostrá-lo aqui seria oferecer botão que o banco nega.
       */
      if (caso.statusOperacional === 'cancelado') return false
      return videosMasterAbertos(etapasPorCaso.get(caso.id) ?? []).length > 0
    })
    .sort((a, b) => {
      if (a.venceEm === b.venceEm) return 0
      if (a.venceEm === null) return 1
      if (b.venceEm === null) return -1
      return a.venceEm.localeCompare(b.venceEm)
    })
}

/**
 * "Concluídos" é trabalho que ACONTECEU e terminou — entregue ou cancelado
 * depois de virar contrato de verdade. Um rascunho descartado nunca chegou
 * a ser isso (ver `rascunhoDescartado`); contá-lo aqui lotaria a aba com
 * ruído do sync, não com histórico — foi exatamente a queixa que motivou
 * este filtro (31/08/2026).
 */
export function casosConcluidos(casos: CasoQuadro[]): CasoQuadro[] {
  return casos
    .filter((c) => c.ehTerminal && !rascunhoDescartado(c))
    .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
}
