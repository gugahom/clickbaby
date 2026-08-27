import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'
import { chavesQuadro } from './useQuadro'

export type TipoEntregavel = Database['public']['Enums']['tipo_entregavel']

export interface EntregavelResumo {
  id: string
  tipo: TipoEntregavel
  url: string
  criado_em: string
  confirmado_em: string | null
}

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
    onSuccess: () => {
      // As três coisas que uma ação muda: o Quadro, os links do caso e o
      // histórico. Esquecer o histórico o deixava congelado por 30s (o
      // staleTime global) — a pessoa agia e o log não mostrava a própria ação.
      void queryClient.invalidateQueries({ queryKey: chavesQuadro.todos })
      void queryClient.invalidateQueries({ queryKey: ['entregaveis'] })
      void queryClient.invalidateQueries({ queryKey: ['historico'] })
    },
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

/**
 * Designa responsável a uma etapa que ainda não começou. Distinta de
 * transferir: ali houve passagem de trabalho e vira linha em `handoffs`; aqui
 * nada foi passado porque nada começou.
 */
export function useAtribuirEtapa() {
  return useAcaoDoQuadro<{ casoEtapaId: string; paraPessoaId: string }>(
    ({ casoEtapaId, paraPessoaId }) =>
      chamar('atribuir_etapa', {
        p_caso_etapa_id: casoEtapaId,
        p_para_pessoa_id: paraPessoaId,
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
 * Confirmar entrega encerra o caso.
 *
 * Até a migration 20260825014102 esta função registrava um entregável de
 * MENTIRA antes de confirmar — a RPC exige ao menos um link e não havia tela
 * para colar o de verdade. Isso gravava uma url falsa numa tabela cujo conteúdo
 * o CLAUDE.md trata como credencial. O placeholder morreu junto com o
 * DialogoEntregaveis, que cola o link real.
 *
 * Qualquer pessoa ativa confirma: quem gera os links são as fotógrafas.
 */
export function useConfirmarEntrega() {
  return useAcaoDoQuadro<{ casoId: string }>(({ casoId }) =>
    chamar('confirmar_entrega', { p_caso_id: casoId }),
  )
}

export function useRegistrarEntregavel() {
  return useAcaoDoQuadro<{ casoId: string; tipo: TipoEntregavel; url: string }>(
    ({ casoId, tipo, url }) =>
      chamar('registrar_entregavel', {
        p_caso_id: casoId,
        p_tipo: tipo,
        p_url: url.trim(),
      }),
  )
}

/**
 * Links de UM caso, buscados só quando o card está aberto.
 *
 * Deliberadamente fora da carga principal do Quadro: `entregaveis.url` é
 * credencial de acesso à galeria da família (seção 10 do CLAUDE.md). Trazer a
 * url de 80 casos para desenhar zero delas seria manter no cliente o que a tela
 * nem mostra. Um card aberto por vez, uma query.
 */
export function useEntregaveis(casoId: string, habilitado: boolean) {
  return useQuery({
    queryKey: ['entregaveis', casoId],
    enabled: habilitado,
    queryFn: async (): Promise<EntregavelResumo[]> => {
      const { data, error } = await supabase
        .from('entregaveis')
        .select('id, tipo, url, criado_em, confirmado_em')
        .eq('caso_id', casoId)
        .order('criado_em')
      if (error) throw error
      return data ?? []
    },
  })
}

export function usePausarEtapa() {
  return useAcaoDoQuadro<{ casoEtapaId: string }>(({ casoEtapaId }) =>
    chamar('pausar_etapa', { p_caso_etapa_id: casoEtapaId }),
  )
}

export function useMoverParaUti() {
  return useAcaoDoQuadro<{ casoId: string }>(({ casoId }) =>
    chamar('mover_para_uti', { p_caso_id: casoId }),
  )
}

export function useRetornarDaUti() {
  return useAcaoDoQuadro<{ casoId: string }>(({ casoId }) =>
    chamar('retornar_da_uti', { p_caso_id: casoId }),
  )
}

export function useAdicionarVideo() {
  return useAcaoDoQuadro<{ casoId: string }>(({ casoId }) =>
    chamar('adicionar_video', { p_caso_id: casoId }),
  )
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
