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
  /**
   * Quando o caso voltou de um encerramento, por pedido de alteração da
   * família. NULL na esmagadora maioria — e quando presente, é a base do
   * `venceEm`: a revisão ganha o prazo do pacote contado da reabertura.
   */
  reabertoEm: string | null
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
  /**
   * Hora combinada para ESTA etapa — banho e fechamento, marcados com a
   * família depois do parto. Data PLANEJADA, a única que a invariante 3.4
   * permite vir do cliente. É o que alimenta o alerta de aproximação.
   */
  previsaoEm: string | null
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
    reabertoEm: linha.reaberto_em,
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
    previsaoEm: linha.previsao_em,
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


export const ROTULO_ETAPA: Record<EtapaTipo, string> = {
  entrada: 'Entrada',
  nascimento: 'Nascimento',
  banho: 'Banho',
  fechamento: 'Fechamento',
  // SEM o prefixo "Edição": a faixa do card já se chama EDIÇÃO, e repetir a
  // palavra em cada item gastava metade da linha dizendo o que o rótulo da
  // esquerda já dizia. O que distingue os itens entre si é o resto — Foto,
  // Reels, Vídeo — e é isso que fica.
  edicao_foto: 'Foto',
  reels: 'Reels',
  edicao_video: 'Vídeo',
  album: 'Álbum',
  // Só existem via "acrescentar etapa" (31/08/2026) — nenhum pacote as
  // inclui de fábrica. Ver migration 20260831133153.
  encontro_irmaos: 'Encontro de irmãos',
  saida_uti: 'Saída de UTI',
  alta: 'Alta',
}

export const ROTULO_STATUS_ETAPA: Record<StatusEtapa, string> = {
  pendente: 'Pendente',
  atribuida: 'Atribuída',
  em_andamento: 'Em andamento',
  concluida: 'Concluída',
  dispensada: 'Dispensada',
  pausada: 'Pausada',
  // Só o vídeo do MASTER alcança estas duas (migration 20260901051229). O
  // rótulo aqui é o genérico, usado onde a etapa aparece no meio das outras;
  // no fluxo do vídeo elas têm nome próprio — ver ROTULO_FASE_VIDEO.
  em_alteracao: 'Em alteração',
  pronto_para_entrega: 'Pronto para entrega',
}

/**
 * O FLUXO DO VÍDEO DO MASTER, na ordem em que a equipe o percorre.
 *
 * QUATRO FASES, E NÃO AS CINCO DO TRELLO (01/09/2026, a pedido do gestor).
 * A coluna "VIDEOS - EDIÇÃO" de lá é a caixa de entrada do quadro — e aqui
 * ela não tem o que dizer: estar na seção MASTER JÁ significa "vídeo para
 * editar". Uma fase que repete o nome da seção não informa nada, e o gestor
 * mandou tirá-la. É o mesmo argumento que já tinha aposentado o rótulo
 * "Reels" dentro da seção de reels.
 *
 * O vídeo que ainda não começou fica SEM FASE — a tela mostra um controle
 * neutro em vez de uma pílula, e a primeira fase escolhida é a primeira
 * afirmação de verdade sobre ele. Ver FaseDoVideo.
 *
 * `pendente` continua existindo no banco (é o default da coluna) e a RPC
 * continua aceitando-o: quem decide o que a tela OFERECE é a tela, e quem
 * decide o que é LEGAL é a RPC. Ver o comentário de mover_video_master.
 *
 * Os rótulos são os DELES, não uma tradução minha: quem opera reconhece
 * "ENVIADO / FINALIZADO", não "Concluída". Esse reconhecimento é metade do
 * valor de trazer o fluxo para cá.
 *
 * A ORDEM É O DADO. Ela diz o que vem depois, e é o que permite a tela
 * oferecer o próximo passo sem que ninguém precise lembrar a sequência. A RPC
 * aceita qualquer uma em qualquer sentido, porque um vídeo volta de PRONTO
 * para ALTERAÇÕES quando a família pede mudança.
 */
export const FASES_VIDEO_MASTER = [
  'em_andamento',
  'em_alteracao',
  'pronto_para_entrega',
  'concluida',
] as const satisfies readonly StatusEtapa[]

export type FaseVideoMaster = (typeof FASES_VIDEO_MASTER)[number]

/** Os nomes como estão no Trello da equipe, menos as reticências de
 *  "Editando…" — elas sugeriam que o rótulo estava cortado. Ver
 *  FASES_VIDEO_MASTER. */
export const ROTULO_FASE_VIDEO: Record<FaseVideoMaster, string> = {
  em_andamento: 'Editando',
  em_alteracao: 'Alterações',
  pronto_para_entrega: 'Pronto para entrega',
  concluida: 'Enviado / finalizado',
}

/**
 * A fase em que este vídeo está, ou `null` se ele ainda não entrou no fluxo.
 *
 * `pausada` conta como EDITANDO: é onde o trabalho parou, e o fluxo não tem
 * fase de pausa (ver a RPC). `pendente` e `atribuida` são "ainda não
 * começou" — não são fase nenhuma desde que a caixa de entrada saiu do
 * fluxo, e devolver uma fase ali seria afirmar algo que ninguém afirmou.
 */
export function faseDoVideo(status: StatusEtapa): FaseVideoMaster | null {
  if (status === 'pausada') return 'em_andamento'
  return (FASES_VIDEO_MASTER as readonly StatusEtapa[]).includes(status)
    ? (status as FaseVideoMaster)
    : null
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
