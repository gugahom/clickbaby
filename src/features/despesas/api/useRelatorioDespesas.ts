import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { buscarTudo } from '@/features/quadro/api/useQuadro'
import type { Database } from '@/types/database'

type StatusOperacional = Database['public']['Enums']['status_operacional']

/** '2026-09' -> '2026-10-01'. Conta em inteiro, sem Date, para não esbarrar em fuso. */
function primeiroDiaDoMesSeguinte(mes: string): string {
  const [ano = 1970, m = 1] = mes.split('-').map(Number)
  return m === 12 ? `${ano + 1}-01-01` : `${ano}-${String(m + 1).padStart(2, '0')}-01`
}

type TipoDespesa = Database['public']['Enums']['tipo_despesa']
type MomentoDespesa = Database['public']['Enums']['momento_despesa']

/**
 * SÓ REFEIÇÃO E "OUTRO" SE RESSARCEM (05/10/2026, correção do gestor). O Uber
 * não passa por ressarcimento, e não ganha caixa nem entra no "A ressarcir".
 * Espelho da constraint `despesas_so_refeicao_e_outro_se_ressarcem` e da trava
 * de `marcar_despesa_ressarcida` (migration 20261005063038): muda nos dois ou
 * em nenhum.
 */
export const TIPOS_RESSARCIVEIS: readonly TipoDespesa[] = ['refeicao', 'outro']

export function seRessarce(tipo: TipoDespesa): boolean {
  return TIPOS_RESSARCIVEIS.includes(tipo)
}

/**
 * UM GASTO, COM OS NOMES (05/10/2026, pedido do gestor: "o nome da pessoa que
 * lança a despesa no card vá para a aba de despesas junto com a sua despesa").
 * `pessoaNome` é DE QUEM FOI o gasto — quem o financeiro ressarce; `lancadoPor`
 * é quem digitou, e só aparece na tela quando é outra pessoa.
 */
export interface LancamentoDeDespesa {
  id: string
  casoId: string
  dia: string
  maeNome: string
  bebeNome: string | null
  pacoteNome: string | null
  maternidadeSigla: string | null
  statusOperacional: StatusOperacional | null
  tipo: TipoDespesa
  momento: MomentoDespesa | null
  valor: number
  descricao: string | null
  pessoaId: string | null
  pessoaNome: string | null
  lancadoPorId: string | null
  lancadoPor: string | null
  /** Quando o financeiro marcou o ressarcimento; nulo = a ressarcir. */
  ressarcidoEm: string | null
  ressarcidoPor: string | null
}

/**
 * OS GASTOS DE UM MÊS de atendimento ('YYYY-MM'), um por linha (`despesas_detalhe`).
 *
 * PAGINADO COM `buscarTudo` mesmo sendo poucas centenas de linhas por mês hoje:
 * relatório é justamente a consulta que alguém um dia estica para o ano, e sem
 * paginação o PostgREST devolve as mil primeiras e cala — o total sai menor,
 * com cara de certo. ORDENAÇÃO TOTAL (dia, caso, lançamento, id): sem o id no
 * fim, o corte de página pode repetir um gasto e perder outro.
 *
 * A chave começa com 'despesas': lançar ou apagar no card já invalida esse
 * prefixo, então a tela aberta em outra aba acompanha.
 */
export function useLancamentosDoMes(mes: string) {
  return useQuery({
    queryKey: ['despesas', 'lancamentos', mes],
    queryFn: async (): Promise<LancamentoDeDespesa[]> => {
      const linhas = await buscarTudo((de, ate) =>
        supabase
          .from('despesas_detalhe')
          .select(
            'id, caso_id, dia, mae_nome, bebe_nome, pacote_nome, maternidade_sigla, status_operacional, tipo, momento, valor, descricao, pessoa_id, pessoa_nome, registrado_por, registrado_por_nome, ressarcido_em, ressarcido_por_nome',
            { count: 'exact' },
          )
          .gte('dia', `${mes}-01`)
          .lt('dia', primeiroDiaDoMesSeguinte(mes))
          .order('dia')
          .order('caso_id')
          .order('registrado_em')
          .order('id')
          .range(de, ate),
      )
      return linhas.map((l) => ({
        id: l.id ?? '',
        casoId: l.caso_id ?? '',
        dia: l.dia ?? '',
        maeNome: l.mae_nome ?? '(sem nome)',
        bebeNome: l.bebe_nome,
        pacoteNome: l.pacote_nome,
        maternidadeSigla: l.maternidade_sigla,
        statusOperacional: l.status_operacional,
        tipo: l.tipo as TipoDespesa,
        momento: l.momento,
        valor: Number(l.valor ?? 0),
        descricao: l.descricao,
        pessoaId: l.pessoa_id,
        pessoaNome: l.pessoa_nome,
        lancadoPorId: l.registrado_por,
        lancadoPor: l.registrado_por_nome,
        ressarcidoEm: l.ressarcido_em,
        ressarcidoPor: l.ressarcido_por_nome,
      }))
    },
  })
}

/** MARCAR OU DESMARCAR o ressarcimento de um gasto (05/10/2026). */
export function useMarcarRessarcida() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ despesaId, ressarcida }: { despesaId: string; ressarcida: boolean }) => {
      const { error } = await supabase.rpc('marcar_despesa_ressarcida', {
        p_despesa_id: despesaId,
        p_ressarcida: ressarcida,
      })
      if (error) throw new Error(error.message)
    },
    // O prefixo 'despesas' atualiza a tela e o card aberto juntos.
    onSuccess: () => qc.invalidateQueries({ queryKey: ['despesas'] }),
  })
}
