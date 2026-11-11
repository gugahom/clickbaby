import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'
import { chavesEquipe } from './useEquipe'

type EtapaTipo = Database['public']['Enums']['etapa_tipo']

/**
 * O QUE A PESSOA FEZ NO PLANTÃO (11/11/2026, pedido do gestor: "o que a pessoa
 * fez no plantão, qual foi a produção dela"). Lido das etapas, sem nada novo no
 * banco — `caso_etapas` já é legível por toda pessoa ativa.
 *
 * O CRÉDITO É DO RESPONSÁVEL, como no relatório interno: quem clicou "concluir"
 * no lugar dela não leva o trabalho. Conta o que ela CONCLUIU dentro do
 * horário do plantão, e à parte o que ela COMEÇOU ali e ficou aberto — o parto
 * que atravessou a troca de turno também é trabalho do plantão.
 *
 * É a escala PLANEJADA contra o trabalho registrado, não ponto (seção 9): campo
 * registrado depois do plantão cai fora da janela.
 */
export interface EtapaDoPlantao {
  id: string
  tipo: EtapaTipo
  rodada: number
  status: Database['public']['Enums']['status_etapa']
  concluidoEm: string | null
  casoId: string
  casoNome: string
}

export interface ProducaoDoPlantao {
  concluidas: EtapaDoPlantao[]
  abertas: EtapaDoPlantao[]
}

const CAMPOS = 'id, tipo, rodada, status, concluido_em, caso:casos!caso_etapas_caso_id_fkey(id, mae_nome, bebe_nome)'

interface Linha {
  id: string
  tipo: EtapaTipo
  rodada: number
  status: Database['public']['Enums']['status_etapa']
  concluido_em: string | null
  caso: { id: string; mae_nome: string; bebe_nome: string | null } | null
}

function paraEtapa(l: Linha): EtapaDoPlantao {
  return {
    id: l.id,
    tipo: l.tipo,
    rodada: l.rodada,
    status: l.status,
    concluidoEm: l.concluido_em,
    casoId: l.caso?.id ?? '',
    casoNome: l.caso ? (l.caso.bebe_nome ? `${l.caso.mae_nome} · ${l.caso.bebe_nome}` : l.caso.mae_nome) : 'caso sem nome',
  }
}

export function useProducaoDoPlantao(pessoaId: string, inicio: string, fim: string) {
  return useQuery({
    queryKey: [...chavesEquipe.todos, 'producao-do-plantao', pessoaId, inicio, fim] as const,
    queryFn: async (): Promise<ProducaoDoPlantao> => {
      const [concluidas, abertas] = await Promise.all([
        supabase
          .from('caso_etapas')
          .select(CAMPOS)
          .eq('responsavel_id', pessoaId)
          .eq('status', 'concluida')
          .gte('concluido_em', inicio)
          .lte('concluido_em', fim)
          .order('concluido_em')
          .order('id'),
        supabase
          .from('caso_etapas')
          .select(CAMPOS)
          .eq('responsavel_id', pessoaId)
          .not('status', 'in', '(concluida,dispensada)')
          .gte('iniciado_em', inicio)
          .lte('iniciado_em', fim)
          .order('iniciado_em')
          .order('id'),
      ])
      if (concluidas.error) throw concluidas.error
      if (abertas.error) throw abertas.error
      return {
        concluidas: (concluidas.data as unknown as Linha[]).map(paraEtapa),
        abertas: (abertas.data as unknown as Linha[]).map(paraEtapa),
      }
    },
  })
}
