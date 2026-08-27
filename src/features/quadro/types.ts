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
  /** Os ids existiam na view e não eram lidos. O editor de cadastro precisa
      deles para pré-selecionar o valor atual nos seletores. */
  pacoteId: string | null
  pacoteNome: string | null
  pacoteSlug: string | null
  prazoEntregaHoras: number | null
  maternidadeId: string | null
  maternidadeNome: string | null
  maternidadeSigla: string | null
  nascimentoConcluidoEm: string | null
  venceEm: string | null
  faltaPacote: boolean
  faltaMaternidade: boolean
  ehRascunho: boolean
  ehTerminal: boolean
  /** Preenchido = está na UTI agora. Sai do bloco do dia e o SLA congela. */
  utiDesde: string | null
  naUti: boolean
  slaPausado: boolean
  utiHorasTotal: number
  etapasTotal: number
  etapasConcluidas: number
  /** Serve para ordenar a aba Concluídos pelo que foi resolvido por último. */
  updatedAt: string | null
}

/**
 * ACOMPANHAMENTO é o que a empresa faz junto da família; EDIÇÃO é o que
 * acontece na ilha. Vem GERADA do banco a partir do tipo — não é derivada aqui
 * de propósito: duas definições da mesma divisão acabariam discordando, e ela
 * decide precedência, não só layout.
 *
 * Era 'campo' até a migration 20260827155728. A palavra é do gestor, e o valor
 * mudou no banco junto com o rótulo: dois nomes para a mesma coisa é a
 * divergência de vocabulário que a seção 2 do CLAUDE.md manda evitar.
 */
export type TrilhaEtapa = 'acompanhamento' | 'edicao'

export interface EtapaQuadro {
  id: string
  casoId: string
  tipo: EtapaTipo
  trilha: TrilhaEtapa
  status: StatusEtapa
  ordem: number
  /**
   * Qual passagem de edição esta etapa é. 1 = material do parto; 2 = material
   * do banho e fechamento, criada pela trigger quando o fechamento conclui.
   * Só `edicao_foto` e `reels` chegam a ter 2 (migration 20260827172830).
   */
  rodada: number
  observacao: string | null
  /** Necessário para o handoff: transferir_etapa exige responsável atual. */
  responsavelId: string | null
  /**
   * Quem já sabe que assume esta etapa na virada de turno. NÃO é um segundo
   * responsável — só uma pessoa trabalha por vez. Ver a migration
   * 20260827141600.
   */
  proximoResponsavelId: string | null
  iniciadoEm: string | null
  concluidoEm: string | null
  /** Janela de pausa aberta. O tempo aqui não conta como trabalho. */
  pausadoEm: string | null
  estacao: string | null
  responsavelNome: string | null
  proximoResponsavelNome: string | null
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
    pacoteId: linha.pacote_id,
    pacoteNome: linha.pacote_nome,
    pacoteSlug: linha.pacote_slug,
    prazoEntregaHoras: linha.prazo_entrega_horas,
    maternidadeId: linha.maternidade_id,
    maternidadeNome: linha.maternidade_nome,
    maternidadeSigla: linha.maternidade_sigla,
    nascimentoConcluidoEm: linha.nascimento_concluido_em,
    venceEm: linha.vence_em,
    faltaPacote: linha.falta_pacote ?? false,
    faltaMaternidade: linha.falta_maternidade ?? false,
    ehRascunho: linha.eh_rascunho ?? false,
    ehTerminal: linha.eh_terminal ?? false,
    utiDesde: linha.uti_desde,
    naUti: linha.na_uti ?? false,
    slaPausado: linha.sla_pausado ?? false,
    utiHorasTotal: linha.uti_horas_total ?? 0,
    etapasTotal: linha.etapas_total ?? 0,
    etapasConcluidas: linha.etapas_concluidas ?? 0,
    updatedAt: linha.updated_at,
  }
}

type LinhaEtapaComResponsavel = LinhaEtapa & {
  responsavel: { nome: string } | null
  proximo_responsavel: { nome: string } | null
}

export function normalizarEtapa(linha: LinhaEtapaComResponsavel): EtapaQuadro {
  return {
    id: linha.id,
    casoId: linha.caso_id,
    tipo: linha.tipo,
    trilha: (linha.trilha ?? 'acompanhamento') as TrilhaEtapa,
    status: linha.status,
    ordem: linha.ordem,
    rodada: linha.rodada ?? 1,
    observacao: linha.observacao,
    responsavelId: linha.responsavel_id,
    proximoResponsavelId: linha.proximo_responsavel_id,
    iniciadoEm: linha.iniciado_em,
    concluidoEm: linha.concluido_em,
    pausadoEm: linha.pausado_em,
    estacao: linha.estacao,
    responsavelNome: linha.responsavel?.nome ?? null,
    proximoResponsavelNome: linha.proximo_responsavel?.nome ?? null,
  }
}

/**
 * Como cada rodada se chama na tela.
 *
 * Nome e não número: "Edição Fotos 2" obriga a saber o que é a 2; "Edição
 * Fotos · Banho" diz de que material se trata, que é a pergunta real de quem
 * senta na estação de edição. Os nomes vêm do que gerou o material —
 * nascimento de um lado, banho e fechamento do outro.
 */
export const ROTULO_RODADA: Record<number, string> = {
  1: 'Parto',
  // "B+F" e não "Banho": é como a equipe chama o bloco banho + fechamento no
  // dia a dia, e vocabulário do domínio não se traduz no caminho até a tela
  // (seção 2 do CLAUDE.md). Quando o fechamento se descolar do banho, o aviso
  // da etapa cobre a exceção — não é caso de mudar o rótulo.
  2: 'B+F',
}

/** O numeral que o gestor pediu no card: Ⅰ, Ⅱ. */
export const NUMERAL_RODADA: Record<number, string> = {
  1: 'I',
  2: 'II',
}

export const ROTULO_ETAPA: Record<EtapaTipo, string> = {
  entrada: 'Entrada',
  nascimento: 'Nascimento',
  banho: 'Banho',
  fechamento: 'Fechamento',
  // A trilha de EDIÇÃO é rotulada como edição, a pedido do gestor: na TV da
  // sala, "Vídeo" solto ao lado de "Banho" não dizia se era captura ou
  // pós-produção.
  edicao_foto: 'Edição Fotos',
  reels: 'Edição Reels',
  edicao_video: 'Edição Vídeo',
  album: 'Álbum',
}

export const ROTULO_STATUS_ETAPA: Record<StatusEtapa, string> = {
  pendente: 'Pendente',
  atribuida: 'Atribuída',
  em_andamento: 'Em andamento',
  concluida: 'Concluída',
  dispensada: 'Dispensada',
  pausada: 'Pausada',
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
