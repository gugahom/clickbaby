/**
 * OS ANEXOS DOS PEDIDOS DO CLIENTE (13/10/2026, migration 20261013215014).
 *
 * As regras que a tela confere ANTES de subir — o bucket `pedidos` confere de
 * novo, e é ele quem vale. A lista de formatos é ESPELHO do `allowed_mime_types`
 * do bucket: muda nos dois lados ou em nenhum.
 */

/** 50 MB, decisão do gestor. Vídeo maior entra como link no texto do pedido. */
export const TAMANHO_MAXIMO_DO_ANEXO = 50 * 1024 * 1024

export const FORMATOS_DO_ANEXO = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
  'video/mp4', 'video/quicktime', 'video/webm', 'video/3gpp',
  'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/ogg', 'audio/opus',
  'audio/wav', 'audio/x-wav', 'audio/webm',
  'application/pdf',
] as const

/**
 * O formato pela EXTENSÃO, para quando o navegador não diz: o Windows entrega
 * `.heic` e `.opus` (o áudio do WhatsApp) com o tipo vazio, e o bucket recusaria
 * um `application/octet-stream`.
 */
const FORMATO_DA_EXTENSAO: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
  heic: 'image/heic', heif: 'image/heif',
  mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', '3gp': 'video/3gpp',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', oga: 'audio/ogg',
  opus: 'audio/opus', wav: 'audio/wav',
  pdf: 'application/pdf',
}

/** O `accept` do seletor de arquivo: os tipos e as extensões. */
export const ACEITA_NO_SELETOR = [
  ...FORMATOS_DO_ANEXO,
  ...Object.keys(FORMATO_DA_EXTENSAO).map((ext) => `.${ext}`),
].join(',')

function extensao(nome: string): string {
  const ponto = nome.lastIndexOf('.')
  return ponto < 0 ? '' : nome.slice(ponto + 1).toLowerCase()
}

/** O formato que vai para o bucket, ou nulo se não é um dos aceitos. */
export function formatoDoArquivo(arquivo: { name: string; type: string }): string | null {
  const aceitos: readonly string[] = FORMATOS_DO_ANEXO
  if (arquivo.type && aceitos.includes(arquivo.type)) return arquivo.type
  return FORMATO_DA_EXTENSAO[extensao(arquivo.name)] ?? null
}

/** O porquê de um arquivo não poder subir, ou nulo se pode. */
export function problemaDoArquivo(arquivo: { name: string; type: string; size: number }): string | null {
  if (!formatoDoArquivo(arquivo)) {
    return `“${arquivo.name}”: formato não aceito. Anexe foto, vídeo, música ou PDF.`
  }
  if (arquivo.size > TAMANHO_MAXIMO_DO_ANEXO) {
    return `“${arquivo.name}” tem ${formatarTamanho(arquivo.size)} — o máximo é 50 MB. Para vídeo maior, cole o link no texto do pedido.`
  }
  if (arquivo.size === 0) return `“${arquivo.name}” está vazio.`
  return null
}

/**
 * O caminho no bucket: a pasta da etapa (é o que a policy de upload confere),
 * um carimbo de tempo e o nome sem acento nem espaço — a chave do Storage não
 * aceita qualquer caractere, e o nome ORIGINAL fica na lista, intacto.
 */
export function caminhoDoAnexo(casoEtapaId: string, nome: string, agora = Date.now()): string {
  const seguro =
    nome
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9._-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^[-.]+|-+$/g, '')
      .slice(-80) || 'arquivo'
  return `${casoEtapaId}/${agora}-${seguro}`
}

/** O print colado vem como "image.png"; vira um nome que diz o que é. */
export function nomeDoPrintColado(arquivo: File, agora = new Date()): File {
  if (arquivo.name && arquivo.name !== 'image.png') return arquivo
  const hora = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }).replace(':', 'h')
  const ext = extensao(arquivo.name) || (arquivo.type.split('/')[1] ?? 'png')
  return new File([arquivo], `print-${hora}.${ext}`, { type: arquivo.type })
}

export type GeneroDoAnexo = 'imagem' | 'video' | 'audio' | 'documento'

export function generoDoAnexo(tipoMime: string): GeneroDoAnexo {
  if (tipoMime.startsWith('image/')) return 'imagem'
  if (tipoMime.startsWith('video/')) return 'video'
  if (tipoMime.startsWith('audio/')) return 'audio'
  return 'documento'
}

export function formatarTamanho(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`
}
