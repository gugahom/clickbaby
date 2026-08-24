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
 * Casos com a edição de vídeo EM ANDAMENTO. É a tela que a fotógrafa olha na TV
 * para saber o que está sendo editado agora.
 *
 * Pausada não entra: o trabalho parou, e misturar os dois esconderia justamente
 * o que precisa de atenção.
 */
export function casosEmEdicaoDeVideo(
  casos: CasoQuadro[],
  etapasPorCaso: Map<string, EtapaQuadro[]>,
): CasoQuadro[] {
  return casos.filter((caso) => {
    if (caso.ehTerminal) return false
    const video = etapasPorCaso.get(caso.id)?.find((e) => e.tipo === 'edicao_video')
    return video?.status === 'em_andamento'
  })
}

/** Casos encerrados ou cancelados, do mais recente para o mais antigo. */
export function casosConcluidos(casos: CasoQuadro[]): CasoQuadro[] {
  return casos
    .filter((c) => c.ehTerminal)
    .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
}
