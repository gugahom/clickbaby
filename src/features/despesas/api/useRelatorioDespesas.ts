import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { buscarTudo } from '@/features/quadro/api/useQuadro'
import type { Database } from '@/types/database'

type StatusOperacional = Database['public']['Enums']['status_operacional']

/** Uma linha do relatório: um caso com gasto, já somado pelo banco. */
export interface LinhaDoRelatorio {
  casoId: string
  /** 'YYYY-MM-DD', dia do CASO em São Paulo — não o do lançamento. */
  dia: string
  maeNome: string
  bebeNome: string | null
  pacoteNome: string | null
  maternidadeSigla: string | null
  statusOperacional: StatusOperacional | null
  total: number
  uberIda: number
  uberVolta: number
  refeicao: number
  outro: number
  lancamentos: number
}

/** '2026-09' -> '2026-10-01'. Conta em inteiro, sem Date, para não esbarrar em fuso. */
function primeiroDiaDoMesSeguinte(mes: string): string {
  const [ano = 1970, m = 1] = mes.split('-').map(Number)
  return m === 12 ? `${ano + 1}-01-01` : `${ano}-${String(m + 1).padStart(2, '0')}-01`
}

/**
 * O RELATÓRIO DE UM MÊS de atendimento ('YYYY-MM').
 *
 * PAGINADO COM `buscarTudo` mesmo sendo ~135 casos por mês hoje. A regra da
 * seção 5 é "consulta que PODE passar de mil linhas", e um relatório é
 * exatamente o tipo de consulta que alguém um dia estica para o ano inteiro. Se
 * isso acontecer sem paginação, o PostgREST devolve as mil primeiras e cala — e
 * o total do ano sai menor, com cara de certo.
 *
 * `id:caso_id` é só o apelido que o `buscarTudo` usa para deduplicar; a view é
 * uma linha por caso, então o id do caso é a chave natural.
 *
 * ORDENAÇÃO TOTAL (dia, caso_id): vários casos no mesmo dia empatam em `dia`, e
 * sem o desempate o corte de página pode repetir um caso e perder outro.
 */
export function useRelatorioDespesas(mes: string) {
  return useQuery({
    // Começa com 'despesas': toda mutação do Quadro já invalida esse prefixo, então
    // lançar ou apagar uma despesa num card atualiza o relatório aberto em outra aba.
    queryKey: ['despesas', 'relatorio', mes],
    queryFn: async (): Promise<LinhaDoRelatorio[]> => {
      const inicio = `${mes}-01`
      const fim = primeiroDiaDoMesSeguinte(mes)

      const linhas = await buscarTudo((de, ate) =>
        supabase
          .from('despesas_por_caso')
          .select(
            'id:caso_id, dia, mae_nome, bebe_nome, pacote_nome, maternidade_sigla, status_operacional, total, total_uber_ida, total_uber_volta, total_refeicao, total_outro, lancamentos',
            { count: 'exact' },
          )
          .gte('dia', inicio)
          .lt('dia', fim)
          .order('dia')
          .order('caso_id')
          .range(de, ate),
      )

      return linhas.map((l) => ({
        casoId: l.id ?? '',
        dia: l.dia ?? '',
        maeNome: l.mae_nome ?? '(sem nome)',
        bebeNome: l.bebe_nome,
        pacoteNome: l.pacote_nome,
        maternidadeSigla: l.maternidade_sigla,
        statusOperacional: l.status_operacional,
        total: Number(l.total ?? 0),
        uberIda: Number(l.total_uber_ida ?? 0),
        uberVolta: Number(l.total_uber_volta ?? 0),
        refeicao: Number(l.total_refeicao ?? 0),
        outro: Number(l.total_outro ?? 0),
        lancamentos: l.lancamentos ?? 0,
      }))
    },
  })
}
