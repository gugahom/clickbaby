import { useQuery, type QueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { LinhaDeVenda, MudancaDaVenda } from '../lib/vendas'

const CHAVE = 'venda-do-caso'

export interface VendaDoCaso {
  linhas: LinhaDeVenda[]
  total: number
  /** O link do contrato, ou nulo. Credencial de acesso: nunca para log. */
  contrato: string | null
}

/**
 * O VALOR VENDIDO E O CONTRATO DE UM CASO. A RLS só devolve linhas para
 * atendimento e adm — para a fotógrafa a consulta volta VAZIA, e por isso quem
 * mostra confere o papel antes, em vez de pintar "nada lançado" para quem não
 * pode ver. A soma é do cliente porque a lista inteira de UM caso está na tela
 * (a mesma regra do total de despesas do card).
 */
export function useVendaDoCaso(casoId: string | null, habilitado = true) {
  return useQuery({
    queryKey: [CHAVE, casoId],
    enabled: habilitado && casoId !== null,
    staleTime: 0,
    queryFn: async (): Promise<VendaDoCaso> => {
      const [vendas, contrato] = await Promise.all([
        supabase
          .from('vendas_do_caso')
          .select('id, item, descricao, valor, created_at, registrado:pessoas!vendas_do_caso_registrado_por_fkey(nome)')
          .eq('caso_id', casoId ?? '')
          .order('created_at', { ascending: true })
          .order('id', { ascending: true }),
        supabase.from('contratos_dos_casos').select('url').eq('caso_id', casoId ?? '').maybeSingle(),
      ])
      if (vendas.error) throw new Error(vendas.error.message)
      if (contrato.error) throw new Error(contrato.error.message)
      const linhas = vendas.data.map((v) => ({
        id: v.id,
        item: v.item,
        descricao: v.descricao,
        valor: Number(v.valor),
        registradoPorNome: v.registrado?.nome ?? null,
        registradoEm: v.created_at,
      }))
      return {
        linhas,
        // Em centavos para a soma não acumular erro de ponto flutuante.
        total: linhas.reduce((t, l) => t + Math.round(l.valor * 100), 0) / 100,
        contrato: contrato.data?.url ?? null,
      }
    },
  })
}

/**
 * Grava o que o formulário do Calendário mudou: o contrato, as linhas apagadas
 * e as novas, nessa ordem. São chamadas separadas, como o termo — o caso já
 * está salvo quando isto roda, e o erro diz que foi a venda que não entrou.
 */
export async function salvarVendaDoCaso(casoId: string, mudanca: MudancaDaVenda): Promise<void> {
  const falhou = (e: { message: string }) => new Error(`O caso foi salvo, mas a venda não: ${e.message}`)

  if (mudanca.contrato !== undefined) {
    const { error } = await supabase.rpc('definir_contrato_do_caso', { p_caso_id: casoId, p_url: mudanca.contrato })
    if (error) throw falhou(error)
  }
  for (const id of mudanca.removidas) {
    const { error } = await supabase.rpc('remover_venda_do_caso', { p_venda_id: id })
    if (error) throw falhou(error)
  }
  for (const n of mudanca.novas) {
    const { error } = await supabase.rpc('registrar_venda_do_caso', {
      p_caso_id: casoId,
      p_item: n.item,
      p_valor: n.valor,
      ...(n.descricao ? { p_descricao: n.descricao } : {}),
    })
    if (error) throw falhou(error)
  }
}

export function invalidarVendas(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: [CHAVE] })
}
