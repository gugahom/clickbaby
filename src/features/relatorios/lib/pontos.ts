import type { Database } from '@/types/database'

export type ItemDePontuacao = Database['public']['Enums']['item_de_pontuacao']

/**
 * OS ITENS DO RANKING POR PONTOS, na ordem da tabela que a gestão mandou
 * (29/09/2026) — ver a migration 20260929210556, que mapeia cada etapa
 * concluída para um destes (`item_de_pontuacao()`) e guarda o peso de cada um.
 * A lista é espelho do enum do banco: item novo lá entra aqui, ou aparece cru.
 */
export const ITENS_DE_PONTUACAO: { id: ItemDePontuacao; rotulo: string; categoria: string; detalhe: string }[] = [
  { id: 'nascimento', rotulo: 'Nascimento', categoria: 'Acompanhamento', detalhe: 'Cobertura presencial do parto.' },
  { id: 'nascimento_birth', rotulo: 'Fotografia de Birth', categoria: 'Acompanhamento', detalhe: 'O parto de um pacote da linha Birth.' },
  { id: 'entrada', rotulo: 'Entrada', categoria: 'Acompanhamento', detalhe: 'Recepção da família e fotos iniciais.' },
  { id: 'banho', rotulo: 'Banho', categoria: 'Acompanhamento', detalhe: 'Cobertura do primeiro banho.' },
  { id: 'fechamento', rotulo: 'Fechamento', categoria: 'Acompanhamento', detalhe: 'Fotos finais no quarto.' },
  { id: 'encontro_irmaos', rotulo: 'Encontro de irmãos', categoria: 'Acompanhamento', detalhe: 'Etapa acrescentada ao caso.' },
  { id: 'saida_uti', rotulo: 'Saída da UTI', categoria: 'Acompanhamento', detalhe: 'Etapa acrescentada ao caso.' },
  { id: 'alta', rotulo: 'Alta', categoria: 'Acompanhamento', detalhe: 'Etapa acrescentada ao caso.' },
  { id: 'acompanhamento', rotulo: 'Evento / ensaio', categoria: 'Acompanhamento', detalhe: 'A cobertura de um EVENTO ou o ensaio NEWBORN na casa da família.' },
  { id: 'foto_parto', rotulo: 'Foto parto', categoria: 'Edição', detalhe: 'Edição das fotos do parto (rodada 1).' },
  { id: 'foto_bf', rotulo: 'Foto B+F', categoria: 'Edição', detalhe: 'Edição das fotos de banho e fechamento (rodada 2).' },
  { id: 'foto_revisao', rotulo: 'Foto revisão', categoria: 'Edição', detalhe: 'Edição de fotos de um caso reaberto (rodada 3 em diante).' },
  { id: 'reels_parto', rotulo: 'Reels parto', categoria: 'Edição / Vídeo', detalhe: 'Reels do parto (rodada 1).' },
  { id: 'reels_bf', rotulo: 'Reels B+F', categoria: 'Edição / Vídeo', detalhe: 'Reels de banho e fechamento (rodada 2).' },
  { id: 'reels_revisao', rotulo: 'Reels revisão', categoria: 'Edição / Vídeo', detalhe: 'Reels de um caso reaberto, ou de irmãos (rodada 3 em diante).' },
  { id: 'video_master', rotulo: 'Vídeo MASTER', categoria: 'Edição / Vídeo', detalhe: 'O vídeo horizontal do MASTER.' },
  { id: 'fotolivro', rotulo: 'Foto/Livro', categoria: 'Edição', detalhe: 'Diagramação do fotolivro.' },
  { id: 'new_born', rotulo: 'New Born', categoria: 'Edição', detalhe: 'O ensaio Click Home.' },
]

export const ROTULO_DO_ITEM = Object.fromEntries(ITENS_DE_PONTUACAO.map((i) => [i.id, i.rotulo])) as Record<
  ItemDePontuacao,
  string
>

/** 3 -> "3"; 1.5 -> "1,5"; 0.25 -> "0,25". */
export function formatarPontos(pontos: number): string {
  return pontos.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
}

/** Com a unidade: "1 pt", "0,5 pt", "3 pts" — como na tabela da gestão. */
export function pontosComUnidade(pontos: number): string {
  return `${formatarPontos(pontos)} ${pontos > 1 ? 'pts' : 'pt'}`
}
