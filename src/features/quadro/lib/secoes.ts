import { podeIniciar } from './acoes'
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
export function casosComVideoAberto(
  casos: CasoQuadro[],
  etapasPorCaso: Map<string, EtapaQuadro[]>,
): CasoQuadro[] {
  return casos
    .filter((caso) => {
      if (caso.ehTerminal) return false

      const etapas = etapasPorCaso.get(caso.id) ?? []
      const video = etapas.find((e) => e.tipo === 'reels')
      if (!video) return false

      if (video.status === 'concluida' || video.status === 'dispensada') return false
      if (video.status === 'em_andamento' || video.status === 'pausada') return true

      // Ainda não começou: entra quando as etapas anteriores tiverem saído da
      // frente.
      return podeIniciar(video, etapas).habilitada
    })
    .sort((a, b) => {
      if (a.venceEm === b.venceEm) return 0
      if (a.venceEm === null) return 1
      if (b.venceEm === null) return -1
      return a.venceEm.localeCompare(b.venceEm)
    })
}

/** Como a edição está, em uma palavra — o que a seção REELS mostra por caso. */
export type SituacaoDoVideo = 'aguardando' | 'editando' | 'pausada'

export function situacaoDoVideo(etapas: EtapaQuadro[]): SituacaoDoVideo | null {
  const video = etapas.find((e) => e.tipo === 'reels')
  if (!video) return null
  if (video.status === 'em_andamento') return 'editando'
  if (video.status === 'pausada') return 'pausada'
  return 'aguardando'
}

/** Casos encerrados ou cancelados, do mais recente para o mais antigo. */
export function casosConcluidos(casos: CasoQuadro[]): CasoQuadro[] {
  return casos
    .filter((c) => c.ehTerminal)
    .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
}
