import { lerValorEmReais } from '@/lib/formato'
import type { Database } from '@/types/database'

/**
 * O VALOR DA VENDA E O CONTRATO DO CASO (14/10/2026, migration 20261014104728).
 *
 * Uma LISTA por caso (decisão do gestor): o pacote numa linha, e cada venda a
 * mais — "depois ele pode vender o Reels e ir adicionando" — na sua. Não existe
 * editar uma linha: valor errado se apaga e se lança de novo, como a despesa.
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
 * A FORMA DE PAGAMENTO (26/10/2026, pedido do gestor: "em quantas vezes foi
 * parcelado, e quando for no Pix também"). Pix ou Cartão, com as parcelas — 1 é
 * à vista. As linhas lançadas antes disso não têm forma, e ficam assim.
 */
export type FormaDePagamento = Database['public']['Enums']['forma_de_pagamento']

export const FORMAS_DE_PAGAMENTO: FormaDePagamento[] = ['pix', 'cartao']

export const ROTULO_FORMA: Record<FormaDePagamento, string> = { pix: 'Pix', cartao: 'Cartão' }

/** De 1 (à vista) a 12: o que o seletor oferece. O banco aceita até 24. */
export const PARCELAS = Array.from({ length: 12 }, (_, i) => i + 1)

/** "Pix", "Pix 3x", "Cartão 10x" — nulo quando a linha é de antes da forma. */
export function rotuloDoPagamento(forma: FormaDePagamento | null, parcelas: number | null): string | null {
  if (!forma) return null
  if (forma === 'pix') return parcelas && parcelas > 1 ? `Pix ${parcelas}x` : 'Pix'
  return `Cartão ${parcelas ?? 1}x`
}

export interface LinhaDeVenda {
  id: string
  item: ItemDeVenda
  descricao: string | null
  valor: number
  forma: FormaDePagamento | null
  parcelas: number | null
  registradoPorNome: string | null
  registradoEm: string
}

/** Uma linha ainda não salva: o formulário só grava no "Salvar". */
export interface LinhaNova {
  chave: string
  item: ItemDeVenda
  descricao: string
  valor: number
  forma: FormaDePagamento
  parcelas: number
}

export interface Rascunho {
  item: ItemDeVenda
  valor: string
  descricao: string
  /** Nula até alguém escolher: a forma não tem padrão, para não ser chutada. */
  forma: FormaDePagamento | null
  parcelas: number
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

export const VENDA_INTOCADA: EstadoDaVenda = {
  contrato: null,
  removidas: [],
  novas: [],
  rascunho: { item: 'pacote', valor: '', descricao: '', forma: null, parcelas: 1 },
}

export interface MudancaDaVenda {
  /** Ausente = o contrato não mudou; vazio = tirar. */
  contrato?: string
  removidas: string[]
  novas: { item: ItemDeVenda; valor: number; descricao: string | null; forma: FormaDePagamento; parcelas: number }[]
}

/** O link tem cara de link? Espelho da checagem de `definir_contrato_do_caso`. */
export function linkValido(url: string): boolean {
  return /^https?:\/\/\S+$/i.test(url.trim())
}

/** O que falta para o rascunho virar linha, ou nulo se está pronto. */
export function problemaDoRascunho(r: Rascunho): string | null {
  if (lerValorEmReais(r.valor) === null) return 'o valor (maior que zero, como 4.500,00)'
  if (r.item === 'outro' && r.descricao.trim() === '') return 'o que foi vendido em "Outro"'
  if (r.forma === null) return 'a forma de pagamento (Pix ou Cartão)'
  return null
}

export function linhaDoRascunho(r: Rascunho): LinhaNova {
  return {
    chave: `${Date.now()}-${Math.random()}`,
    item: r.item,
    descricao: r.item === 'outro' ? r.descricao.trim() : '',
    valor: lerValorEmReais(r.valor) as number,
    forma: r.forma as FormaDePagamento,
    parcelas: r.parcelas,
  }
}

/**
 * A mudança a gravar, ou o motivo de não dar para salvar. O RASCUNHO ENTRA
 * SOZINHO quando está completo: quem digitou o valor e apertou "Salvar" sem
 * apertar "Adicionar" não pode perder a venda em silêncio. Rascunho pela
 * metade segura o Salvar, pelo mesmo motivo.
 */
export function mudancaDaVenda(
  estado: EstadoDaVenda,
  contratoAtual: string | null,
): { mudanca: MudancaDaVenda; falta: null } | { mudanca: null; falta: string } {
  const r = estado.rascunho
  const rascunhoTocado = r.valor.trim() !== '' || r.descricao.trim() !== ''
  const problema = rascunhoTocado ? problemaDoRascunho(r) : null
  if (problema) return { mudanca: null, falta: `na venda, ${problema}` }

  const contrato = estado.contrato === null ? null : estado.contrato.trim()
  if (contrato && !linkValido(contrato)) {
    return { mudanca: null, falta: 'o link do contrato completo (começando com https://)' }
  }

  const novas = [...estado.novas, ...(rascunhoTocado ? [linhaDoRascunho(r)] : [])]
  return {
    falta: null,
    mudanca: {
      ...(contrato !== null && contrato !== (contratoAtual ?? '') ? { contrato } : {}),
      removidas: estado.removidas,
      novas: novas.map((n) => ({
        item: n.item,
        valor: n.valor,
        descricao: n.descricao || null,
        forma: n.forma,
        parcelas: n.parcelas,
      })),
    },
  }
}

export function rotuloDaLinha(l: { item: ItemDeVenda; descricao: string | null }): string {
  return l.item === 'outro' && l.descricao ? l.descricao : ROTULO_ITEM_DE_VENDA[l.item]
}
