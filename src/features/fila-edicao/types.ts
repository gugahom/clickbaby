import type { Database } from '@/types/database'
import type { StatusEtapa } from '@/features/quadro/types'

type LinhaFila = Database['public']['Views']['fila_edicao']['Row']

/**
 * Um item da fila. Mesma normalização de `features/quadro/types.ts` e pelo mesmo
 * motivo: o gerador marca toda coluna de view como nullable porque o Postgres
 * não expõe nullability de view, e espalhar `?? ''` pela árvore de componentes
 * seria pior que estreitar uma vez, aqui, na fronteira da rede.
 */
export interface ItemFila {
  casoId: string
  casoEtapaId: string
  maeNome: string
  bebeNome: string | null
  dia: string | null
  corCalendar: string | null
  pacoteNome: string | null
  maternidadeSigla: string | null
  prazoEntregaHoras: number | null
  /** NULL enquanto o nascimento não foi concluído: o prazo ainda não começou. */
  venceEm: string | null
  slaPausado: boolean
  naUti: boolean
  etapaStatus: StatusEtapa
  responsavelId: string | null
  responsavelNome: string | null
  atribuidoEm: string | null
  atribuidoPorNome: string | null
  iniciadoEm: string | null
  pausadoEm: string | null
  /** Interval do Postgres em texto ("02:15:00"). Ver segundosDeIntervalo. */
  pausaAcumulada: string | null
  estacao: string | null
}

export function normalizarItem(linha: LinhaFila): ItemFila {
  return {
    casoId: linha.caso_id ?? '',
    casoEtapaId: linha.caso_etapa_id ?? '',
    maeNome: linha.mae_nome ?? '(sem nome)',
    bebeNome: linha.bebe_nome,
    dia: linha.dia,
    corCalendar: linha.cor_calendar,
    pacoteNome: linha.pacote_nome,
    maternidadeSigla: linha.maternidade_sigla,
    prazoEntregaHoras: linha.prazo_entrega_horas,
    venceEm: linha.vence_em,
    slaPausado: linha.sla_pausado ?? false,
    naUti: linha.na_uti ?? false,
    etapaStatus: linha.etapa_status ?? 'pendente',
    responsavelId: linha.responsavel_id,
    responsavelNome: linha.responsavel_nome,
    atribuidoEm: linha.atribuido_em,
    atribuidoPorNome: linha.atribuido_por_nome,
    iniciadoEm: linha.iniciado_em,
    pausadoEm: linha.pausado_em,
    pausaAcumulada: linha.pausa_acumulada,
    estacao: linha.estacao,
  }
}
