import type { ItemDoCalendario, TipoDeItem } from '../api/useCalendario'

/**
 * UMA COR POR TIPO DE ITEM, todas tiradas dos tokens da casa — a mesma
 * linguagem do Quadro, onde "em andamento" é azul e "atenção" é âmbar.
 *
 * A cor nunca está sozinha: toda pílula traz a hora e o nome, e a agenda do
 * dia escreve o tipo por extenso ("Parto previsto", "Vence o prazo"). A
 * legenda do alto é também o filtro — tocar num tipo esconde ou mostra.
 *
 * O PARTO É A EXCEÇÃO (30/09/2026, pedido do gestor: "as cores não foram
 * trazidas para o nosso calendário"): ele aparece na COR DO EVENTO NO GOOGLE —
 * BIRTH vermelho, HSC azul, GNDI amarelo… —, a organização que a equipe já lê
 * de relance na agenda dela. Ver `corDoParto`.
 */
export const TIPOS: {
  id: TipoDeItem
  legenda: string
  pilula: string
  marca: string
}[] = [
  { id: 'parto', legenda: 'Partos', pilula: 'bg-andamento/12 text-andamento-tinta', marca: 'bg-andamento' },
  { id: 'hora_marcada', legenda: 'Banho e fechamento', pilula: 'bg-marca-suave text-marca', marca: 'bg-marca' },
  {
    id: 'entrega_combinada',
    legenda: 'Vídeo, Foto/Livro e New Born',
    pilula: 'bg-acento-suave text-acento-forte',
    marca: 'bg-acento',
  },
  { id: 'prazo', legenda: 'Prazos de entrega', pilula: 'bg-atencao/15 text-atencao-tinta', marca: 'bg-atencao' },
]

const ATRASADO = { pilula: 'bg-atrasado/10 text-atrasado', marca: 'bg-atrasado' }

/**
 * O QUE JÁ PASSOU CHAMA MENOS ATENÇÃO, como no Google Calendar (pedido do
 * gestor, 30/09/2026): o item cujo horário ficou para trás — ou o dia inteiro,
 * quando não tem hora — perde a força; o que vem pela frente continua na cor
 * cheia. A agenda é para olhar PARA FRENTE, e um mês que já aconteceu disputava
 * o olho com a semana que vem.
 *
 * A EXCEÇÃO É O PRAZO VENCIDO SEM ENVIO: ele está no passado e é exatamente o
 * que ainda pede alguém — esmaecê-lo seria esconder o atraso.
 */
export function esmaecido(item: ItemDoCalendario): boolean {
  return (item.passou || item.feito) && !item.vencido
}

export function estiloDoItem(item: ItemDoCalendario): { pilula: string; marca: string } {
  // Prazo que passou sem envio fala a língua do atraso no Quadro: vermelho.
  if (item.vencido) return ATRASADO
  const t = TIPOS.find((x) => x.id === item.tipo) ?? TIPOS[0]!
  return { pilula: t.pilula, marca: t.marca }
}
