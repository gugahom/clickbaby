import type { TipoEntregavel } from '../api/useAcoes'
import type { CasoQuadro, EtapaQuadro } from '../types'

/**
 * Um link que a conclusão desta etapa põe na tela.
 *
 * `rotulo` é a nomenclatura do gestor, palavra por palavra. Ele pediu assim, e
 * é como a equipe chama essas coisas entre si — traduzir para um nome mais
 * "certo" faria a tela falar uma língua que ninguém usa no corredor.
 */
export interface LinkDaConclusao {
  tipo: TipoEntregavel
  rotulo: string
  /** Uma linha de ajuda quando o rótulo sozinho não diz onde o link nasce. */
  dica?: string
  /**
   * `true` = a etapa NÃO FECHA sem ele.
   *
   * `false` = o link aparece para a pessoa subir o material dentro dele, e a
   * etapa fecha de qualquer jeito. Ver o reels do BIRTH mais abaixo: mostrar e
   * cobrar são coisas diferentes, e o projeto já pagou uma vez por confundir
   * as duas.
   */
  obrigatorio: boolean
}

/*
 * O REELS NÃO EXIGE LINK EM PACOTE NENHUM (09/09/2026, pedido do gestor).
 *
 * Entre 04/09 e 09/09, concluir o reels do BASIC e do STANDARD abria o diálogo
 * pedindo o "Link de CADEADO do reels", e não fechava sem ele. Uma semana de
 * operação mostrou que ali a trava estava no lugar errado: o cadeado do reels
 * nem sempre existe na hora em que a edição termina, e a etapa ficava presa
 * numa lista que é justamente a lista de trabalho parado — a seção REELS, onde
 * pendente é vermelho e o cartão gira.
 *
 * A DIFERENÇA PARA A EDIÇÃO DE FOTOS, que continua exigindo: lá o link nasce
 * junto com o trabalho — quem terminou de editar acabou de subir o álbum e tem
 * a URL na mão. Transformar em trava o que é sequência de outra pessoa produz
 * o pior dos dois mundos: nem o link aparece, nem a etapa fecha.
 *
 * É POR ISSO QUE O CADEADO DO REELS DO BIRTH ENTRA COMO `obrigatorio: false`
 * (11/09/2026). O gestor pediu que concluir o reels do BIRTH abra o quadro com
 * o link CADEADO, para a pessoa adicionar o reels lá dentro — e isso é MOSTRAR,
 * não cobrar. Cobrar traria de volta o beco de 09/09 por outra porta: o
 * cadeado do BIRTH nasce na conclusão da edição de FOTOS, que é etapa irmã e
 * não tem ordem garantida — as duas liberam juntas, quando o nascimento
 * conclui. Quem concluísse o reels primeiro ficaria preso pedindo um link que
 * ainda não existe.
 */

/** BIRTH e BIRTH + REELS: dois slugs, o mesmo produto. */
function ehBirth(caso: CasoQuadro): boolean {
  return caso.pacoteSlug?.startsWith('birth') ?? false
}

/**
 * O QUE A CONCLUSÃO DESTA ETAPA PÕE NA TELA, em links.
 *
 * Lista vazia = a etapa conclui com um toque, como sempre. É o caso de tudo
 * que não está na tabela abaixo: campo, vídeo do MASTER, álbum, e o reels de
 * todo pacote que não seja BIRTH.
 *
 *   | etapa       | pacote    | link         | trava? |
 *   | edicao_foto | não-BIRTH | Google       | sim    |
 *   | edicao_foto | BIRTH     | CADEADO      | sim    |
 *   | reels       | BIRTH     | CADEADO      | NÃO    |
 *
 * NO BIRTH A EDIÇÃO DE FOTOS PEDE SÓ O CADEADO (11/09/2026, pedido do gestor).
 * Até aqui ela pedia os dois — Link de Google E Link CADEADO —, e os dois eram
 * trava. O cadeado é o link único de foto+vídeo que a família do BIRTH recebe:
 * é POR ELE que a entrega acontece, e o álbum do Google separado era um
 * endereço a mais para produzir, sem ninguém do outro lado esperando por ele.
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
export function linksDaConclusao(
  etapa: EtapaQuadro,
  caso: CasoQuadro,
): LinkDaConclusao[] {
  if (etapa.tipo === 'edicao_foto') {
    return ehBirth(caso)
      ? [
          {
            tipo: 'cadeado',
            rotulo: 'Link CADEADO',
            dica: 'O link único de foto e vídeo que a família recebe.',
            obrigatorio: true,
          },
        ]
      : [
          {
            tipo: 'google_photos',
            rotulo: 'Link de Google',
            dica: 'O álbum das fotos editadas.',
            obrigatorio: true,
          },
        ]
  }

  // O reels do BIRTH mora DENTRO do cadeado que a edição de fotos criou — o
  // mesmo endereço, com o vídeo somado às fotos. Ver o bloco no alto para o
  // motivo de isto não travar.
  if (etapa.tipo === 'reels' && ehBirth(caso)) {
    return [
      {
        tipo: 'cadeado',
        rotulo: 'Link CADEADO',
        dica: 'O reels entra no mesmo link das fotos.',
        obrigatorio: false,
      },
    ]
  }

  return []
}
