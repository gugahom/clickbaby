import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { chavesQuadro } from './useQuadro'

/**
 * Toda transição de estado passa por RPC — nunca `.update()` direto
 * (seção 4 do CLAUDE.md). A escrita direta nem sequer é possível: depois da
 * migration 20260822072158, `authenticated` não tem GRANT de UPDATE em
 * caso_etapas, e em casos só nas 9 colunas de dado. A máquina de estado é
 * inalcançável fora das RPCs, por privilégio e não só por convenção.
 *
 * NENHUMA mutação mexe em estado local de etapa. Depois da RPC, a fonte da
 * verdade é o banco: invalida a query do Quadro e a tela redesenha com o que
 * voltou. É isso que faz o SLA aparecer sozinho ao concluir o nascimento —
 * `vence_em` é derivado na view, ninguém calcula no cliente.
 */

function useAcaoDoQuadro<TVars>(executar: (vars: TVars) => Promise<void>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: executar,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: chavesQuadro.todos }),
  })
}

/** Erro do PostgREST já vem tipado; só precisa virar throw para o TanStack. */
async function chamar(nome: string, args: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.rpc(
    nome as Parameters<typeof supabase.rpc>[0],
    args as never,
  )
  if (error) throw error
}

export function useIniciarEtapa() {
  return useAcaoDoQuadro<{ casoEtapaId: string }>(({ casoEtapaId }) =>
    chamar('iniciar_etapa', { p_caso_etapa_id: casoEtapaId }),
  )
}

export function useConcluirEtapa() {
  // p_observacao é opcional na RPC e a tela não pede: concluir precisa sair em
  // até 3 toques (seção 6 do CLAUDE.md). O parâmetro fica exposto aqui para
  // quando houver uma tela de detalhe do caso com campo de observação.
  return useAcaoDoQuadro<{ casoEtapaId: string; observacao?: string }>(
    ({ casoEtapaId, observacao }) =>
      chamar('concluir_etapa', {
        p_caso_etapa_id: casoEtapaId,
        p_observacao: observacao ?? null,
      }),
  )
}

export function useTransferirEtapa() {
  return useAcaoDoQuadro<{
    casoEtapaId: string
    paraPessoaId: string
    motivo?: string
  }>(({ casoEtapaId, paraPessoaId, motivo }) =>
    chamar('transferir_etapa', {
      p_caso_etapa_id: casoEtapaId,
      p_para_pessoa_id: paraPessoaId,
      p_motivo: motivo?.trim() || null,
    }),
  )
}

/**
 * confirmar_entrega recusa um caso sem nenhum entregável registrado (a RPC
 * exige pelo menos um). Decisão explícita do cliente, por hora: o link real
 * continua na planilha interna da equipe, fora do sistema — a Morgana não
 * digita URL nenhuma aqui, só confirma. Por isso o botão de confirmar
 * encadeia duas RPCs: registra um entregável placeholder e, na sequência,
 * confirma a entrega. `p_tipo` é arbitrário (nenhum dos 5 valores do enum
 * descreve "link está em outro lugar"; `google_photos` é só o mais comum).
 * Quando existir um fluxo de colar o link de verdade, isto sai daqui e vira
 * um passo explícito na tela (ver TODO em CasoDetalhe/AcoesDoCaso).
 */
const ENTREGAVEL_PLACEHOLDER_URL =
  'Link controlado na planilha interna da equipe (ainda não integrado ao sistema)'

export function useConfirmarEntrega() {
  return useAcaoDoQuadro<{ casoId: string }>(async ({ casoId }) => {
    await chamar('registrar_entregavel', {
      p_caso_id: casoId,
      p_tipo: 'google_photos',
      p_url: ENTREGAVEL_PLACEHOLDER_URL,
    })
    await chamar('confirmar_entrega', { p_caso_id: casoId })
  })
}

export function useCancelarCaso() {
  return useAcaoDoQuadro<{ casoId: string; motivo: string }>(({ casoId, motivo }) =>
    chamar('cancelar_caso', { p_caso_id: casoId, p_motivo: motivo }),
  )
}

export interface PessoaOpcao {
  id: string
  nome: string
}

/**
 * Pessoas ativas, para o seletor do handoff. Vem do banco: hoje são os usuários
 * de desenvolvimento, e quando o cadastro real do cliente entrar funciona igual,
 * sem tocar nesta tela.
 *
 * Cache longo de propósito: cadastro muda em escala de semanas, e a lista é
 * aberta no meio de um handoff — não é hora de esperar rede.
 */
export function usePessoasAtivas() {
  return useQuery({
    queryKey: ['pessoas', 'ativas'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<PessoaOpcao[]> => {
      const { data, error } = await supabase
        .from('pessoas')
        .select('id, nome')
        .eq('ativo', true)
        .order('nome')
      if (error) throw error
      return data ?? []
    },
  })
}
