import type { ItemDoCalendario, TipoDeItem } from '../api/useCalendario'
import { corDoParto, textoSobre } from './coresGoogle'

/**
 * OS TIPOS DE ITEM, para o filtro "Tipos" e para o texto do cartão. A COR não
 * é do tipo: todo item de um caso usa a cor do caso no Google (o banho da Ana
 * é da cor do parto da Ana), e o tipo se lê no texto, como no Google.
 */
export const TIPOS: { id: TipoDeItem; legenda: string }[] = [
  { id: 'parto', legenda: 'Partos' },
  { id: 'hora_marcada', legenda: 'Banho e fechamento' },
  { id: 'entrega_combinada', legenda: 'Vídeo, Foto/Livro e New Born' },
  { id: 'prazo', legenda: 'Prazos de entrega' },
]

/** O vermelho do atraso — o mesmo "Tomate" do Google, que já é a cor de alarme da equipe. */
const VERMELHO_DO_ATRASO = '#D50000'

export interface Aparencia {
  /** A cor do caso (ou a do atraso). */
  hex: string
  nome: string
  /** Cor cheia (o que vem pela frente) ou fundo branco com a bolinha (o que passou). */
  cheio: boolean
  /** O texto sobre a cor cheia — branco ou escuro, o de mais contraste. */
  texto: string
}

/**
 * COMO UM ITEM SE PINTA — o desenho do Google Calendar (pedido do gestor,
 * 30/09/2026, depois de ver o esmaecido: "ficou ruim, vamos mais como no
 * calendar"):
 *   * o que VEM PELA FRENTE é a pílula na COR CHEIA do caso;
 *   * o que JÁ PASSOU (ou já foi feito) fica em FUNDO BRANCO, só com a
 *     BOLINHA da cor ao lado do texto — continua legível e continua dizendo de
 *     que maternidade é, só que sem disputar o olho com a semana que vem;
 *   * o PRAZO VENCIDO SEM ENVIO é a exceção: vermelho cheio, mesmo no passado,
 *     porque é o que ainda pede alguém.
 */
export function aparencia(item: ItemDoCalendario): Aparencia {
  if (item.vencido) {
    return { hex: VERMELHO_DO_ATRASO, nome: 'Atrasado', cheio: true, texto: textoSobre(VERMELHO_DO_ATRASO) }
  }
  const cor = corDoParto(item.corDoGoogle)
  return { hex: cor.hex, nome: cor.nome, cheio: !(item.passou || item.feito), texto: textoSobre(cor.hex) }
}
