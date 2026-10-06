/**
 * TEXTO COM FORMATAÇÃO (06/10/2026, pedido do gestor: "nas observações, ter a
 * possibilidade de negrito, itálico e etc.").
 *
 * O texto formatado é guardado como HTML — o mesmo formato da descrição de um
 * evento no Google, que é para onde as observações do calendário vão. E HTML
 * vindo de fora é a porta clássica para script na página, então NADA dele
 * chega à tela sem passar por `sanitizarHtml`, que REFAZ o conteúdo do zero:
 * só as marcações da lista abaixo, SEM atributo nenhum (nem `href`, nem
 * `style`, nem `on*`), e o resto vira texto. Ela roda na digitação, no colar,
 * no carregar do banco e no mostrar — o banco aceita qualquer texto, então a
 * tela não confia no que lê dele.
 *
 * O texto escrito ANTES do editor é texto puro, com quebras de linha:
 * `paraHtml` o reconhece pela ausência de marcação e converte (escapa e troca
 * a quebra por `<br>`). Espelho do que a Edge Function faz ao mandar ao Google
 * (`observacaoEmHtml`, em sync-calendar/evento-do-caso.ts).
 */

/** O que o editor produz e a tela mostra. Chave: a tag que chega; valor: a que fica. */
const MANTIDAS: Record<string, string> = {
  B: 'b',
  STRONG: 'b',
  I: 'i',
  EM: 'i',
  U: 'u',
  S: 's',
  STRIKE: 's',
  DEL: 's',
  UL: 'ul',
  OL: 'ol',
  LI: 'li',
  BR: 'br',
}

/** Blocos viram LINHA: o Enter do editor cria um `<div>` por linha no Chrome. */
const BLOCOS = new Set(['DIV', 'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE'])

/** Somem com o conteúdo junto — o texto de um `<style>` não é texto de ninguém. */
const DESCARTADAS = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'IFRAME', 'OBJECT', 'EMBED', 'HEAD', 'TITLE', 'META', 'LINK', 'NOSCRIPT', 'SVG', 'MATH'])

/** Mesma lista da Edge Function: com alguma destas, o texto já é HTML. */
const TEM_MARCACAO = /<\/?(b|strong|i|em|u|s|strike|del|br|div|p|ul|ol|li)\b[^>]*>/i

const ELEMENTO = 1
const TEXTO = 3

function ehBloco(no: Node | null): boolean {
  return no !== null && no.nodeType === ELEMENTO && ['BR', 'UL', 'OL'].includes((no as Element).tagName.toUpperCase())
}

function copiarLimpo(origem: Node, destino: Node, doc: Document) {
  for (const filho of Array.from(origem.childNodes)) {
    if (filho.nodeType === TEXTO) {
      destino.appendChild(doc.createTextNode(filho.textContent ?? ''))
      continue
    }
    if (filho.nodeType !== ELEMENTO) continue
    const tag = (filho as Element).tagName.toUpperCase()
    if (DESCARTADAS.has(tag)) continue
    if (BLOCOS.has(tag)) {
      // Um bloco começa numa linha nova — a não ser que já se esteja numa
      // (logo depois de um <br> ou de uma lista, ou no comecinho).
      if (destino.lastChild && !ehBloco(destino.lastChild)) destino.appendChild(doc.createElement('br'))
      copiarLimpo(filho, destino, doc)
      continue
    }
    const nova = MANTIDAS[tag]
    if (nova) {
      const el = doc.createElement(nova)
      destino.appendChild(el)
      if (nova !== 'br') copiarLimpo(filho, el, doc)
      continue
    }
    // Qualquer outra marcação (span, font, a…) sai e deixa o conteúdo.
    copiarLimpo(filho, destino, doc)
  }
}

/** Só as marcações permitidas, sem atributo nenhum. O documento do DOMParser é inerte: nada roda nem carrega. */
export function sanitizarHtml(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  const saida = doc.createElement('div')
  copiarLimpo(doc.body, saida, doc)
  // Quebras sobrando no fim são o rastro do último Enter, não conteúdo.
  while (saida.lastChild && saida.lastChild.nodeName === 'BR') saida.removeChild(saida.lastChild)
  return saida.innerHTML
}

function escaparHtml(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Qualquer valor guardado, pronto para a tela: o HTML do editor limpo, ou o texto antigo convertido. */
export function paraHtml(valor: string | null | undefined): string {
  if (!valor) return ''
  return TEM_MARCACAO.test(valor) ? sanitizarHtml(valor) : escaparHtml(valor).replace(/\r?\n/g, '<br>')
}

/** O texto que sobra sem a formatação — para saber se o campo está vazio. */
export function textoDoHtml(html: string): string {
  if (!html) return ''
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  return (doc.body.textContent ?? '').trim()
}

/**
 * As listas precisam de estilo explícito: o reset do Tailwind tira o marcador
 * e o recuo de `ul`/`ol`. Usado pelo editor e por quem mostra o texto, para os
 * dois desenharem igual.
 */
export const CLASSES_DO_TEXTO_FORMATADO =
  'break-words [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5 [&_s]:opacity-80'
