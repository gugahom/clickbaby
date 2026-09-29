import type { EntregavelResumo, TipoEntregavel } from '../api/useAcoes'

/**
 * OS LINKS DO CASO EM QUE O VÍDEO DO MASTER PODE ENTRAR (29/09/2026, pedido do
 * gestor: "se já existirem links ele só deve pedir para adicionar o vídeo a
 * esses links"). Os do vídeo de uma entrega anterior primeiro, depois os das
 * fotos — é a mesma lista que `enviar_video_nos_links_do_caso` confere no banco
 * (migration 20260929183438). Mudou lá, muda aqui.
 */
export const TIPOS_DOS_LINKS_DO_VIDEO: readonly TipoEntregavel[] = [
  'video',
  'video_wetransfer',
  'google_photos',
  'wetransfer',
]

export const ROTULO_DO_LINK_DO_VIDEO: Partial<Record<TipoEntregavel, string>> = {
  video: 'Link do vídeo',
  video_wetransfer: 'WeTransfer do vídeo',
  google_photos: 'Google Photos (o álbum das fotos)',
  wetransfer: 'WeTransfer das fotos',
}

/** O link mais recente de cada tipo, na ordem acima. */
export function linksDoCasoParaOVideo(links: EntregavelResumo[]): EntregavelResumo[] {
  return TIPOS_DOS_LINKS_DO_VIDEO.map((tipo) =>
    links.filter((l) => l.tipo === tipo).sort((a, b) => b.criado_em.localeCompare(a.criado_em))[0],
  ).filter((l): l is EntregavelResumo => l !== undefined)
}
