import type { TipoEntregavel } from '../api/useAcoes'
import type { CasoQuadro, EtapaQuadro } from '../types'

/**
 * Um link que a conclusão desta etapa EXIGE.
 *
 * `rotulo` é a nomenclatura do gestor, palavra por palavra. Ele pediu assim, e
 * é como a equipe chama essas coisas entre si — traduzir para um nome mais
 * "certo" faria a tela falar uma língua que ninguém usa no corredor.
 */
export interface LinkExigido {
  tipo: TipoEntregavel
  rotulo: string
  /** Uma linha de ajuda quando o rótulo sozinho não diz onde o link nasce. */
  dica?: string
}

/**
 * OS PACOTES QUE PEDEM O CADEADO DO REELS.
 *
 * Regra do gestor em 04/09/2026, e ela é uma LISTA e não uma dedução: ele
 * nomeou BASIC e STANDARD. BABY REELS, BASIC + REELS e BASIC REELS também têm
 * reels e ficaram DE FORA de propósito — foi o que ele pediu, ao pé da letra.
 *
 * Isso é deliberadamente frágil no lugar certo: se um dia a pergunta for "por
 * que não pediu o cadeado no BABY REELS?", a resposta está aqui, e a correção é
 * acrescentar um slug. A alternativa — deduzir "todo pacote com reels" — teria
 * inventado uma regra que ele não deu.
 */
const PACOTES_COM_CADEADO_DO_REELS = new Set(['basic', 'standard'])

/** BIRTH e BIRTH + REELS: dois slugs, o mesmo produto. */
function ehBirth(caso: CasoQuadro): boolean {
  return caso.pacoteSlug?.startsWith('birth') ?? false
}

/**
 * O QUE A CONCLUSÃO DESTA ETAPA EXIGE, em links.
 *
 * Lista vazia = a etapa conclui com um toque, como sempre. É o caso da imensa
 * maioria: campo, vídeo do MASTER, álbum, e o reels de todo pacote que não está
 * na lista acima.
 *
 * POR QUE A REGRA VIVE NA TELA E NÃO NO BANCO. "Quais links o BASIC exige" é
 * regra comercial, do mesmo tipo do checklist de encerramento, que também é de
 * tela por decisão explícita. A RPC garante o que é dela — link e conclusão na
 * mesma transação, carimbo do servidor, evento append-only — e não precisa
 * saber o que a empresa vende neste mês.
 *
 * A ORDEM IMPORTA: é a ordem dos campos no diálogo, e o primeiro é o que a
 * pessoa quase sempre tem na mão.
 */
export function linksExigidosNaConclusao(
  etapa: EtapaQuadro,
  caso: CasoQuadro,
): LinkExigido[] {
  if (etapa.tipo === 'edicao_foto') {
    const google: LinkExigido = {
      tipo: 'google_photos',
      rotulo: 'Link de Google',
      dica: 'O álbum das fotos editadas.',
    }

    // No BIRTH a família recebe também o link único de foto+vídeo, o
    // "cadeado" — é o formato dos dois pacotes de pós-parto, e o checklist de
    // encerramento já o reflete desde 31/08/2026.
    return ehBirth(caso)
      ? [google, { tipo: 'cadeado', rotulo: 'Link CADEADO' }]
      : [google]
  }

  if (
    etapa.tipo === 'reels' &&
    caso.pacoteSlug !== null &&
    PACOTES_COM_CADEADO_DO_REELS.has(caso.pacoteSlug)
  ) {
    return [{ tipo: 'cadeado', rotulo: 'Link de CADEADO do reels' }]
  }

  return []
}
