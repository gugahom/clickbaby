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

/*
 * O REELS NÃO EXIGE MAIS NADA (09/09/2026, pedido do gestor).
 *
 * Entre 04/09 e hoje, concluir o reels do BASIC e do STANDARD abria o diálogo
 * pedindo o "Link de CADEADO do reels", e não fechava sem ele. Uma semana de
 * operação mostrou que ali a trava estava no lugar errado: o cadeado do reels
 * nem sempre existe na hora em que a edição termina, e a etapa ficava presa
 * numa lista que é justamente a lista de trabalho parado — a seção REELS, onde
 * pendente é vermelho e o cartão gira.
 *
 * A DIFERENÇA PARA A EDIÇÃO DE FOTOS, que continua exigindo: lá o link nasce
 * junto com o trabalho — quem terminou de editar acabou de subir o álbum e tem
 * a URL na mão. Aqui não é assim, e transformar em trava o que é sequência de
 * outra pessoa produz o pior dos dois mundos: nem o link aparece, nem a etapa
 * fecha.
 *
 * ONDE O LINK ENTRA AGORA: pelo "Adicionar link" na lista de entregáveis do
 * card, e de novo na conferência da aba Entregáveis — que é onde o cadeado é
 * conferido de qualquer forma, pela pessoa que faz a entrega. O que se perdeu
 * foi a cobrança antecipada, não o registro.
 *
 * Se um dia isto voltar, volta como LISTA de slugs (era `basic` e `standard`,
 * nomeados pelo gestor) e não como dedução do tipo "todo pacote com reels" —
 * essa regra ele nunca deu.
 */

/** BIRTH e BIRTH + REELS: dois slugs, o mesmo produto. */
function ehBirth(caso: CasoQuadro): boolean {
  return caso.pacoteSlug?.startsWith('birth') ?? false
}

/**
 * O QUE A CONCLUSÃO DESTA ETAPA EXIGE, em links.
 *
 * Lista vazia = a etapa conclui com um toque, como sempre. É o caso de tudo
 * menos a edição de FOTOS: campo, reels, vídeo do MASTER e álbum.
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

  // O reels conclui com um toque, em todo pacote. Ver o bloco no alto.
  return []
}
