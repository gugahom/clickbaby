import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  normalizarCaso,
  normalizarEtapa,
  type CasoQuadro,
  type EtapaQuadro,
} from '../types'

/**
 * Carga do Quadro em DUAS queries fixas — não N+1.
 *
 *   1. `quadro_casos`  — casos achatados, com pacote/maternidade resolvidos e
 *      dia/vence_em/eh_rascunho derivados no banco (uma definição só).
 *   2. `caso_etapas`   — todas as etapas dos casos carregados, num único
 *      `.in('caso_id', ids)`, com o responsável embedado (join lateral do
 *      PostgREST, não uma query por etapa).
 *
 * Duas requisições independente de haver 84 ou 800 casos. As etapas são
 * indexadas num Map e coladas em memória.
 *
 * Por que as etapas não vêm dentro da view: agregá-las em jsonb impediria
 * ordenar/filtrar por etapa no PostgREST e esconderia o custo do join.
 */

export interface DadosQuadro {
  casos: CasoQuadro[]
  etapasPorCaso: Map<string, EtapaQuadro[]>
}

export const chavesQuadro = {
  todos: ['quadro'] as const,
  lista: () => [...chavesQuadro.todos, 'lista'] as const,
}

async function carregarQuadro(): Promise<DadosQuadro> {
  const { data: linhas, error } = await supabase
    .from('quadro_casos')
    .select('*')
    .order('previsao_em', { ascending: true })

  if (error) throw error

  const casos = (linhas ?? []).map(normalizarCaso)
  const ids = casos.map((c) => c.id).filter((id) => id !== '')

  if (ids.length === 0) {
    return { casos, etapasPorCaso: new Map() }
  }

  const { data: linhasEtapas, error: erroEtapas } = await supabase
    .from('caso_etapas')
    // Dois embeds pela MESMA tabela `pessoas`, então os dois precisam nomear a
    // FK — sem isso o PostgREST não sabe por qual coluna juntar. E precisa ser
    // um literal de uma peça só: concatenar com `+` faz o tipo do select virar
    // string genérica e a inferência do supabase-js desabar.
    .select(
      '*, responsavel:pessoas!caso_etapas_responsavel_id_fkey(nome), proximo_responsavel:pessoas!caso_etapas_proximo_responsavel_id_fkey(nome)',
    )
    .in('caso_id', ids)
    .order('ordem', { ascending: true })

  if (erroEtapas) throw erroEtapas

  const etapasPorCaso = new Map<string, EtapaQuadro[]>()
  for (const linha of linhasEtapas ?? []) {
    const etapa = normalizarEtapa(linha)
    const atuais = etapasPorCaso.get(etapa.casoId)
    if (atuais) atuais.push(etapa)
    else etapasPorCaso.set(etapa.casoId, [etapa])
  }

  return { casos, etapasPorCaso }
}

export function useQuadro() {
  return useQuery({
    queryKey: chavesQuadro.lista(),
    queryFn: carregarQuadro,
  })
}
