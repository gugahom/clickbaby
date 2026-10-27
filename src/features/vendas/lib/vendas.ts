import { formatarMoeda, lerValorEmReais } from '@/lib/formato'
import type { Database } from '@/types/database'

/**
 * O VALOR DA VENDA E O CONTRATO DO CASO (14/10/2026, migration 20261014104728).
 *
 * Uma LISTA por caso (decisão do gestor): o pacote numa linha, e cada venda a
 * mais — "depois ele pode vender o Reels e ir adicionando" — na sua. Não existe
 * editar uma linha: valor errado se apaga e se lança de novo, como a despesa.
 *
 * AS DUAS CONDIÇÕES (27/10/2026, migration 20261027120001, o quadro do gestor):
 * cada linha diz "até 6x de R$ 265,00 ou R$ 1.490,00 no Pix". O `valor` é o do
 * PIX, e é ele que conta como vendido; a condição do cartão vem ao lado e é
 * opcional. O pacote vem pronto da TABELA DE PREÇOS (pacote × maternidade), e o
 * "Editar" troca os valores numa negociação.
 */
export type ItemDeVenda = Database['public']['Enums']['item_de_venda']

/** A ordem do seletor: o pacote primeiro, que é a venda de todo caso. */
export const ITENS_DE_VENDA: ItemDeVenda[] = ['pacote', 'reels', 'new_born', 'foto_livro', 'outro']

export const ROTULO_ITEM_DE_VENDA: Record<ItemDeVenda, string> = {
  pacote: 'Pacote',
  reels: 'Reels',
  new_born: 'New Born',
  foto_livro: 'Foto/Livro',
  outro: 'Outro',
}

/**
 * A FORMA EM QUE FOI PAGO (26/10/2026). Só as linhas daquele dia a têm: desde
 * 27/10 a venda guarda a CONDIÇÃO, e como o cliente pagou deixou de ser
 * perguntado. Fica para mostrar essas linhas como foram lançadas.
 */
export type FormaDePagamento = Database['public']['Enums']['forma_de_pagamento']

/** "Até 1x" a "até 12x" no seletor. O banco aceita até 24. */
export const PARCELAS = Array.from({ length: 12 }, (_, i) => i + 1)

/** A condição de uma linha da tabela de preços (`precos_dos_pacotes`). */
export interface PrecoDoPacote {
  parcelas: number
  valorParcela: number
  valorPix: number
}

export interface LinhaDeVenda {
  id: string
  item: ItemDeVenda
  descricao: string | null
  /** O do Pix, desde 27/10/2026 — o que conta como vendido. */
  valor: number
  forma: FormaDePagamento | null
  parcelas: number | null
  /** Com ele, "até `parcelas`x de tanto no cartão" (27/10/2026). */
  valorParcela: number | null
  registradoPorNome: string | null
  registradoEm: string
}

/** Uma linha ainda não salva: o formulário só grava no "Salvar". */
export interface LinhaNova {
  chave: string
  item: ItemDeVenda
  descricao: string
  valor: number
  /** Os dois juntos, ou nenhum: a condição do cartão é opcional. */
  parcelas: number | null
  valorParcela: number | null
}

export interface Rascunho {
  item: ItemDeVenda
  /** O valor no Pix. */
  valor: string
  descricao: string
  parcelas: number
  /** O valor de cada parcela no cartão; vazio = sem condição de cartão. */
  valorParcela: string
  /** Apertou "Editar": a tabela de preços deixa de preencher o pacote. */
  editado: boolean
}

/**
 * O QUE O FORMULÁRIO MUDOU, guardado à parte do que veio do banco — a lista do
 * banco chega depois do formulário abrir, e começar o estado a partir dela
 * correria contra a consulta.
 */
export interface EstadoDaVenda {
  /** Nulo = ninguém mexeu: vale o que está no banco. */
  contrato: string | null
  removidas: string[]
  novas: LinhaNova[]
  rascunho: Rascunho
}

export const RASCUNHO_VAZIO: Rascunho = {
  item: 'pacote',
  valor: '',
  descricao: '',
  parcelas: 6,
  valorParcela: '',
  editado: false,
}

export const VENDA_INTOCADA: EstadoDaVenda = {
  contrato: null,
  removidas: [],
  novas: [],
  rascunho: RASCUNHO_VAZIO,
}

export interface MudancaDaVenda {
  /** Ausente = o contrato não mudou; vazio = tirar. */
  contrato?: string
  removidas: string[]
  novas: { item: ItemDeVenda; valor: number; descricao: string | null; parcelas: number | null; valorParcela: number | null }[]
}

/** O link tem cara de link? Espelho da checagem de `definir_contrato_do_caso`. */
export function linkValido(url: string): boolean {
  return /^https?:\/\/\S+$/i.test(url.trim())
}

/** 1490 -> "1.490,00": o número no formato que o campo de valor lê de volta. */
function emCampo(valor: number): string {
  return valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/**
 * A TABELA SÓ VALE PARA O PRIMEIRO PACOTE: com uma linha de pacote já lançada
 * (no banco ou nesta tela), preencher outra igual seria convidar a venda em
 * dobro. Nula também quando o pacote não tem preço naquela maternidade.
 */
export function tabelaAplicavel(
  tabela: PrecoDoPacote | null,
  linhasDoBanco: { id: string; item: ItemDeVenda }[],
  estado: EstadoDaVenda,
): PrecoDoPacote | null {
  if (!tabela) return null
  const jaTemPacote =
    linhasDoBanco.some((l) => l.item === 'pacote' && !estado.removidas.includes(l.id)) ||
    estado.novas.some((l) => l.item === 'pacote')
  return jaTemPacote ? null : tabela
}

/** O pacote ainda segue a tabela: ninguém apertou "Editar". */
export function rascunhoDaTabela(r: Rascunho, tabela: PrecoDoPacote | null): tabela is PrecoDoPacote {
  return r.item === 'pacote' && tabela !== null && !r.editado
}

/** O rascunho como ele vale: com o pacote preenchido pela tabela, quando é o caso. */
export function rascunhoEfetivo(r: Rascunho, tabela: PrecoDoPacote | null): Rascunho {
  if (!rascunhoDaTabela(r, tabela)) return r
  return { ...r, valor: emCampo(tabela.valorPix), parcelas: tabela.parcelas, valorParcela: emCampo(tabela.valorParcela) }
}

/** "Editar": os valores da tabela viram o ponto de partida da negociação. */
export function editarRascunho(r: Rascunho, tabela: PrecoDoPacote | null): Rascunho {
  return { ...rascunhoEfetivo(r, tabela), editado: true }
}

/** O que falta para o rascunho virar linha, ou nulo se está pronto. */
export function problemaDoRascunho(r: Rascunho): string | null {
  if (lerValorEmReais(r.valor) === null) return 'o valor no Pix (maior que zero, como 1.490,00)'
  if (r.valorParcela.trim() !== '' && lerValorEmReais(r.valorParcela) === null) {
    return 'o valor da parcela (maior que zero, como 265,00)'
  }
  if (r.item === 'outro' && r.descricao.trim() === '') return 'o que foi vendido em "Outro"'
  return null
}

export function linhaDoRascunho(r: Rascunho): LinhaNova {
  const valorParcela = lerValorEmReais(r.valorParcela)
  return {
    chave: `${Date.now()}-${Math.random()}`,
    item: r.item,
    descricao: r.item === 'outro' ? r.descricao.trim() : '',
    valor: lerValorEmReais(r.valor) as number,
    parcelas: valorParcela === null ? null : r.parcelas,
    valorParcela,
  }
}

/** O rascunho limpo depois de uma linha entrar: o pacote já foi, sugere o Reels. */
export function proximoRascunho(r: Rascunho): Rascunho {
  return { ...RASCUNHO_VAZIO, item: r.item === 'pacote' ? 'reels' : r.item, parcelas: r.parcelas }
}

/**
 * A mudança a gravar, ou o motivo de não dar para salvar. O RASCUNHO ENTRA
 * SOZINHO quando está completo: quem digitou o valor e apertou "Salvar" sem
 * apertar "Adicionar" não pode perder a venda em silêncio. Rascunho pela
 * metade segura o Salvar, pelo mesmo motivo.
 *
 * O PACOTE QUE VEIO DA TABELA, sem ninguém digitar nada, só entra sozinho onde
 * salvar É lançar a venda (`entraSozinho`): o caso novo e o "Lançar venda". No
 * "Editar caso" de quem só foi trocar a hora, ele não pode virar venda sem um
 * gesto — a tela pede o "+".
 */
export function mudancaDaVenda(
  estado: EstadoDaVenda,
  contratoAtual: string | null,
  { tabela = null, entraSozinho = false }: { tabela?: PrecoDoPacote | null; entraSozinho?: boolean } = {},
): { mudanca: MudancaDaVenda; falta: null } | { mudanca: null; falta: string } {
  const bruto = estado.rascunho
  const r = rascunhoEfetivo(bruto, tabela)
  const digitado = bruto.valor.trim() !== '' || bruto.descricao.trim() !== '' || bruto.valorParcela.trim() !== ''
  const rascunhoEntra = digitado || (rascunhoDaTabela(bruto, tabela) && entraSozinho)
  const problema = rascunhoEntra ? problemaDoRascunho(r) : null
  if (problema) return { mudanca: null, falta: `na venda, ${problema}` }

  const contrato = estado.contrato === null ? null : estado.contrato.trim()
  if (contrato && !linkValido(contrato)) {
    return { mudanca: null, falta: 'o link do contrato completo (começando com https://)' }
  }

  const novas = [...estado.novas, ...(rascunhoEntra ? [linhaDoRascunho(r)] : [])]
  return {
    falta: null,
    mudanca: {
      ...(contrato !== null && contrato !== (contratoAtual ?? '') ? { contrato } : {}),
      removidas: estado.removidas,
      novas: novas.map((n) => ({
        item: n.item,
        valor: n.valor,
        descricao: n.descricao || null,
        parcelas: n.parcelas,
        valorParcela: n.valorParcela,
      })),
    },
  }
}

export function rotuloDaLinha(l: { item: ItemDeVenda; descricao: string | null }): string {
  return l.item === 'outro' && l.descricao ? l.descricao : ROTULO_ITEM_DE_VENDA[l.item]
}

type Condicao = Pick<LinhaDeVenda, 'forma' | 'parcelas' | 'valorParcela'>

/** O que vem depois do valor: "no Pix", ou como a linha de 26/10 foi paga. */
export function sufixoDoValor(l: Condicao): string | null {
  if (l.valorParcela !== null || l.forma === 'pix') {
    return l.forma === 'pix' && (l.parcelas ?? 1) > 1 ? `no Pix em ${l.parcelas}x` : 'no Pix'
  }
  if (l.forma === 'cartao') return `no cartão em ${l.parcelas ?? 1}x`
  return null
}

/** "ou até 6x de R$ 265,00 no cartão" — nulo quando a linha não tem a condição. */
export function alternativaNoCartao(l: Condicao): string | null {
  if (l.valorParcela === null) return null
  return `ou até ${l.parcelas ?? 1}x de ${formatarMoeda(l.valorParcela)} no cartão`
}
