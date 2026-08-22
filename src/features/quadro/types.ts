import type { Database } from '@/types/database'

type LinhaQuadro = Database['public']['Views']['quadro_casos']['Row']
type LinhaEtapa = Database['public']['Tables']['caso_etapas']['Row']

export type EtapaTipo = Database['public']['Enums']['etapa_tipo']
export type StatusEtapa = Database['public']['Enums']['status_etapa']
export type StatusOperacional = Database['public']['Enums']['status_operacional']
export type StatusEntrega = Database['public']['Enums']['status_entrega']
export type SituacaoClinica = Database['public']['Enums']['situacao_clinica']

/**
 * O gerador de tipos marca TODA coluna de view como nullable — o Postgres não
 * expõe nullability de view. Em vez de espalhar `?? ''` pela árvore de
 * componentes, a normalização acontece uma vez, aqui, na fronteira da rede.
 *
 * O que é genuinamente nulo no banco continua nulo no tipo (bebe_nome,
 * pacote_nome num rascunho, vence_em antes do nascimento). O que nunca é nulo
 * (id, mae_nome, flags) é estreitado.
 */
export interface CasoQuadro {
  id: string
  maeNome: string
  bebeNome: string | null
  dia: string | null
  previsaoEm: string | null
  corCalendar: string | null
  observacao: string | null
  situacaoClinica: SituacaoClinica
  statusOperacional: StatusOperacional
  statusEntrega: StatusEntrega
  pacoteNome: string | null
  pacoteSlug: string | null
  prazoEntregaHoras: number | null
  maternidadeNome: string | null
  maternidadeSigla: string | null
  nascimentoConcluidoEm: string | null
  venceEm: string | null
  faltaPacote: boolean
  faltaMaternidade: boolean
  ehRascunho: boolean
  ehTerminal: boolean
  etapasTotal: number
  etapasConcluidas: number
}

export interface EtapaQuadro {
  id: string
  casoId: string
  tipo: EtapaTipo
  status: StatusEtapa
  ordem: number
  observacao: string | null
  /** Necessário para o handoff: transferir_etapa exige responsável atual. */
  responsavelId: string | null
  iniciadoEm: string | null
  concluidoEm: string | null
  estacao: string | null
  responsavelNome: string | null
}

/** Um bloco de dia do Quadro, já com o contador resolvido. */
export interface BlocoDia {
  dia: string | null
  casos: CasoQuadro[]
  total: number
  /**
   * Denominador honesto do contador: conta casos em estado TERMINAL
   * (encerrado ou cancelado), não "casos com todas as etapas feitas". Cancelado
   * nunca foi concluído mas resolve o dia — é a invariante 3.5, e é onde a
   * referência da v0 errava.
   */
  resolvidos: number
  /** O dia só sai do Quadro quando todos os seus casos são terminais. */
  fechado: boolean
}

export function normalizarCaso(linha: LinhaQuadro): CasoQuadro {
  return {
    id: linha.id ?? '',
    maeNome: linha.mae_nome ?? '(sem nome)',
    bebeNome: linha.bebe_nome,
    dia: linha.dia,
    previsaoEm: linha.previsao_em,
    corCalendar: linha.cor_calendar,
    observacao: linha.observacao,
    situacaoClinica: linha.situacao_clinica ?? 'aguardando',
    statusOperacional: linha.status_operacional ?? 'agendado',
    statusEntrega: linha.status_entrega ?? 'pendente',
    pacoteNome: linha.pacote_nome,
    pacoteSlug: linha.pacote_slug,
    prazoEntregaHoras: linha.prazo_entrega_horas,
    maternidadeNome: linha.maternidade_nome,
    maternidadeSigla: linha.maternidade_sigla,
    nascimentoConcluidoEm: linha.nascimento_concluido_em,
    venceEm: linha.vence_em,
    faltaPacote: linha.falta_pacote ?? false,
    faltaMaternidade: linha.falta_maternidade ?? false,
    ehRascunho: linha.eh_rascunho ?? false,
    ehTerminal: linha.eh_terminal ?? false,
    etapasTotal: linha.etapas_total ?? 0,
    etapasConcluidas: linha.etapas_concluidas ?? 0,
  }
}

type LinhaEtapaComResponsavel = LinhaEtapa & {
  responsavel: { nome: string } | null
}

export function normalizarEtapa(linha: LinhaEtapaComResponsavel): EtapaQuadro {
  return {
    id: linha.id,
    casoId: linha.caso_id,
    tipo: linha.tipo,
    status: linha.status,
    ordem: linha.ordem,
    observacao: linha.observacao,
    responsavelId: linha.responsavel_id,
    iniciadoEm: linha.iniciado_em,
    concluidoEm: linha.concluido_em,
    estacao: linha.estacao,
    responsavelNome: linha.responsavel?.nome ?? null,
  }
}

export const ROTULO_ETAPA: Record<EtapaTipo, string> = {
  entrada: 'Entrada',
  nascimento: 'Nascimento',
  banho: 'Banho',
  fechamento: 'Fechamento',
  edicao_foto: 'Edição foto',
  edicao_video: 'Vídeo',
  reels: 'Reels',
  album: 'Álbum',
}

export const ROTULO_STATUS_ETAPA: Record<StatusEtapa, string> = {
  pendente: 'Pendente',
  atribuida: 'Atribuída',
  em_andamento: 'Em andamento',
  concluida: 'Concluída',
  dispensada: 'Dispensada',
}

export const ROTULO_SITUACAO: Record<SituacaoClinica, string> = {
  aguardando: 'Aguardando',
  internada: 'Internada',
  inducao: 'Indução',
  trabalho_parto: 'Trabalho de parto',
  nasceu: 'Nasceu',
  uti: 'UTI',
  alta: 'Alta',
}
