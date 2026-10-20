import type { TipoEntregavel } from '../api/useAcoes'

/**
 * O NOME DE CADA TIPO DE LINK DE ENTREGA, uma tabela só. Morava dentro de
 * `Entregaveis.tsx`; saiu em 20/10/2026 para o histórico do caso dizer
 * "Foto/Livro" em vez do identificador do banco ("album").
 */
export const ROTULO_TIPO_DE_LINK: Record<TipoEntregavel, string> = {
  google_photos: 'Google Photos',
  wetransfer: 'WeTransfer',
  cadeado: 'Cadeado',
  reels: 'Reels',
  album: 'Foto/Livro',
  // O horizontal do MASTER (16/09/2026). Tipo próprio e não "wetransfer": o
  // meio pelo qual o arquivo viaja muda com o tamanho do vídeo, e o que a
  // lista precisa dizer é O QUE é aquele link.
  video: 'Vídeo',
  // O arquivo do vídeo para baixar (21/09/2026), cobrado junto do link do vídeo
  // ao terminar a edição. Tipo próprio para não se confundir com o WeTransfer
  // das FOTOS, que a conferência do envio do caso exige.
  video_wetransfer: 'WeTransfer do vídeo',
  // A galeria de escolha do ensaio newborn (22/09/2026): é por ela que a
  // família escolhe as fotos do Click Home. Tipo próprio porque não é o álbum
  // do parto — são dois endereços, em dois momentos.
  click_home: 'Galeria do New Born',
  // O material do BIRTH vendido depois da entrega (30/09/2026).
  google_drive: 'Google Drive',
}

/** O rótulo de um tipo vindo de `eventos` — texto livre, então com recaída. */
export function rotuloDoTipoDeLink(tipo: string): string {
  return ROTULO_TIPO_DE_LINK[tipo as TipoEntregavel] ?? tipo.replace(/_/g, ' ')
}
