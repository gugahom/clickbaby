import { useAuth } from '@/features/auth/contexto'
import { useTelas } from '@/features/auth/telas'
import { podeEncerrarCaso } from '@/features/quadro/lib/acoes'

/**
 * QUEM VÊ E LANÇA A VENDA (20/10/2026, migration 20261020173657): atendimento,
 * adm — ou quem tem a tela Comercial, concedida pela gestão pessoa a pessoa.
 * Espelho da RLS de `vendas_do_caso`/`contratos_dos_casos` e das três RPCs; muda
 * nos dois lados ou em nenhum.
 */
export function usePodeVenda(): boolean {
  const { pessoa } = useAuth()
  const telas = useTelas()
  return podeEncerrarCaso(pessoa?.papelSistema ?? 'operador') || telas.has('comercial')
}
