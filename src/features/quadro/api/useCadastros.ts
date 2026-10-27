import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface PacoteOpcao {
  id: string
  nome: string
  /** Para o termo sugerido do BIRTH (`termoSugerido`), que olha o slug. */
  slug: string
  /** A cor do evento no Google, quando o pacote tem uma (os dois BIRTH). */
  cor_calendar: string | null
}

/**
 * A ORDEM DOS PACOTES NAS LISTAS DE ESCOLHA (27/10/2026, pedido do gestor): os
 * mais vendidos primeiro, e não a ordem alfabética. O BASIC REELS entra depois
 * do BASIC (perguntado). Pacote que não estiver aqui vai para o fim, por nome.
 */
const ORDEM_DOS_PACOTES = [
  'birth-reels',
  'baby-reels',
  'basic',
  'basic-reels-contrato',
  'standard',
  'master',
  'master-album',
  'birth',
  'newborn',
  'evento',
]

/**
 * FORA DA LISTA (mesmo pedido): o BASIC + REELS não é mais oferecido. Ele
 * continua no cadastro — casos antigos o têm, e a agenda ainda o escreve, então
 * o sync precisa achá-lo —, e um caso que JÁ É BASIC + REELS continua vendo o
 * próprio pacote na lista: sumir com ele trocaria o pacote sem ninguém pedir.
 */
const FORA_DA_LISTA = ['basic-reels-venda']

export function pacotesDaLista(pacotes: PacoteOpcao[], atualId?: string | null): PacoteOpcao[] {
  const posicao = (p: PacoteOpcao) => {
    const i = ORDEM_DOS_PACOTES.indexOf(p.slug)
    return i === -1 ? ORDEM_DOS_PACOTES.length : i
  }
  return pacotes
    .filter((p) => !FORA_DA_LISTA.includes(p.slug) || p.id === atualId)
    .sort((a, b) => posicao(a) - posicao(b) || a.nome.localeCompare(b.nome, 'pt-BR'))
}

export interface MaternidadeOpcao {
  id: string
  sigla: string
  nome: string
  /** A cor do evento no Google para esta maternidade. */
  cor_calendar: string | null
}

/**
 * Pacotes e maternidades para os seletores de completar rascunho e de criar
 * caso pelo calendário (que também lê a cor de cada um).
 *
 * Cadastro muda em escala de meses, então o cache é longo. Não entra na query
 * do Quadro porque não muda com ela: o Quadro invalida a cada ação, e
 * recarregar 9 pacotes junto seria desperdício a cada toque de botão.
 *
 * Só é buscado quando alguém abre o editor — daí `enabled`.
 */
export function useCadastros(ativo: boolean) {
  return useQuery({
    queryKey: ['cadastros'],
    enabled: ativo,
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const [pacotes, maternidades] = await Promise.all([
        supabase.from('pacotes').select('id, nome, slug, cor_calendar').eq('ativo', true).order('nome'),
        supabase.from('maternidades').select('id, sigla, nome, cor_calendar').eq('ativo', true).order('sigla'),
      ])
      if (pacotes.error) throw pacotes.error
      if (maternidades.error) throw maternidades.error
      return {
        pacotes: (pacotes.data ?? []) as PacoteOpcao[],
        maternidades: (maternidades.data ?? []) as MaternidadeOpcao[],
      }
    },
  })
}
