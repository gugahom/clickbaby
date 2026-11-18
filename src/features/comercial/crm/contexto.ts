import { createContext, useContext } from 'react'
import type { PessoaDoComercial } from '../api/useLeads'
import type { Lead, ResultadoContato } from '../lib/leads'

/**
 * O QUE TODA PÁGINA DO CRM ENXERGA. Os leads chegam UMA vez, no layout, e
 * cada página recorta o que precisa: a fila do Início, a tabela de Leads e o
 * Funil leem a mesma lista, então não discordam entre si.
 *
 * Os GESTOS também moram aqui: abrir a ficha e registrar contato são os mesmos
 * em qualquer página, e o diálogo é um só, no layout.
 */
export type Escopo = 'meus' | 'equipe'

export interface ContextoDoCrm {
  /** Todos os leads que a RLS deixa ver. */
  leads: Lead[]
  /** Os da lente escolhida — "Meus" ou "Equipe". */
  visiveis: Lead[]
  carregando: boolean
  erro: string | null
  escopo: Escopo
  hoje: string
  pessoas: PessoaDoComercial[]
  /** O lead com a ficha aberta, para a linha dele aparecer marcada. */
  leadAberto: string | null
  abrirLead: (id: string, aviso?: string) => void
  registrarContato: (lead: Lead, resultado?: ResultadoContato) => void
  novoLead: () => void
}

export const CrmContexto = createContext<ContextoDoCrm | null>(null)

export function useCrm(): ContextoDoCrm {
  const ctx = useContext(CrmContexto)
  if (!ctx) throw new Error('useCrm fora do CrmLayout')
  return ctx
}
