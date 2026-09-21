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
  /**
   * Quando o caso foi ENVIADO para a aba Entregas. Nulo = ainda no fluxo do
   * Quadro.
   *
   * Não confundir com "pronto": pronto é derivado das etapas e o sistema
   * calcula sozinho; isto é o gesto de uma pessoa dizendo que pode entregar.
   * Um caso pode estar pronto há dois dias e não ter sido enviado.
   */
  liberadoParaEntregaEm: string | null
  /** Quem enviou. A resposta para "quem disse que estava pronto?". */
  liberadoParaEntregaPorNome: string | null
  /**
   * Soma das despesas lançadas no caso, feita pelo BANCO (quadro_casos). Zero
   * quando não há gasto — nunca nulo, para "sem despesa" não se confundir com
   * "não carregou".
   */
  totalDespesas: number
  /**
   * Por que foi cancelado — a tela usa para distinguir o cancelamento do SYNC
   * (restaurável) do cancelamento da equipe (decisão comercial, não se desfaz).
   */
  motivoCancelamento: string | null
  /**
   * Terminal e sem nada que o Quadro principal mostre — nem vídeo ou fotolivro
   * aberto, nem dia com caso em aberto. É o ARQUIVO: o Quadro não o carrega, e
   * só a aba Concluídos o busca. Quem decide é a view (migration
   * 20260918091859), porque a regra do dia olha os OUTROS casos.
   */
  arquivado: boolean
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
   * Onde o FOTOLIVRO está na esteira de produção. Nulo em toda etapa que não
   * seja `album`, e nulo no álbum até alguém declarar a primeira fase.
   *
   * É ORTOGONAL ao `status` acima, e essa é a diferença para o vídeo do MASTER:
   * lá a fase É o status (ver `faseDoVideo`), aqui são duas perguntas — a fase
   * diz onde o produto está, o status diz se alguém trabalha nele agora. Quem
   * mantém as duas em acordo é a RPC `mover_album`, que escreve as duas juntas.
   */
  faseAlbum: FaseAlbum | null
  /**
   * Hora combinada para ESTA etapa — banho e fechamento, marcados com a
   * família depois do parto. Data PLANEJADA, a única que a invariante 3.4
   * permite vir do cliente. É o que alimenta o alerta de aproximação.
   */
  previsaoEm: string | null
  estacao: string | null
  /**
   * Última escrita nesta etapa, pelo banco. É o carimbo que o SINO usa para
   * saber o que é NOVIDADE desde a última vez que a pessoa olhou — atribuir,
   * escrever um aviso e pedir alteração passam todos por aqui.
   *
   * É aproximado de propósito: qualquer mudança na linha o move, então ele não
   * diz "quando foi atribuída", diz "quando esta etapa mudou pela última vez".
   * Para um sino é a pergunta certa. A exata viria de `eventos` — que é
   * legível por toda pessoa ativa desde 25/08 (migration 20260825020122; o
   * texto que dizia "só adm" estava velho) —, mas custaria uma consulta a mais
   * a cada recarga do Quadro, e o sino não precisa da hora exata.
   */
  atualizadoEm: string | null
  responsavelNome: string | null
  proximoResponsavelNome: string | null
  /**
   * O MATERIAL DO ACOMPANHAMENTO (15/09/2026) — as colunas CARTÃO F, CARTÃO V,
   * BAIXOU e UPLOAD da planilha, por etapa. Nulos em toda etapa de edição: a
   * constraint `caso_etapas_material_so_no_acompanhamento` não deixa existir.
   */
  cartaoFoto: string | null
  /** O celular que filmou: "CEL CLICK 4" pela lista, ou texto livre ("CELULAR SARAH"). */
  cartaoVideo: string | null
  baixouPorId: string | null
  baixouPorNome: string | null
  uploadPorId: string | null
  uploadPorNome: string | null
  /**
   * O FOTOLIVRO EM APROVAÇÃO (21/09/2026). Link da prova que vai ao cliente, e o
   * CAMINHO da capa no bucket privado `midias` — a imagem se lê por URL
   * assinada, que não se guarda. Nulos em toda etapa que não seja `album`.
   */
  fotolivroLink: string | null
  fotolivroCapa: string | null
  /**
   * Quando a Morgana mandou a prova ao cliente ("Enviado ao cliente", em
   * Entregáveis). Nulo com a fase em aprovação = o livro está na fila do ADM.
   */
  fotolivroEnviadoEm: string | null
}

/** O que uma carga do Quadro devolve — o Quadro, a aba Concluídos, ou só alguns casos. */
export interface DadosQuadro {
  casos: CasoQuadro[]
  etapasPorCaso: Map<string, EtapaQuadro[]>
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
    liberadoParaEntregaEm: linha.liberado_para_entrega_em,
    liberadoParaEntregaPorNome: linha.liberado_para_entrega_por_nome,
    // numeric chega do PostgREST como número JSON; o Number() segura o dia em
    // que vier como texto, que é como alguns drivers serializam numeric.
    totalDespesas: Number(linha.total_despesas ?? 0),
    motivoCancelamento: linha.motivo_cancelamento,
    arquivado: linha.arquivado ?? false,
  }
}

type LinhaEtapaComResponsavel = LinhaEtapa & {
  responsavel: { nome: string } | null
  proximo_responsavel: { nome: string } | null
  baixou: { nome: string } | null
  subiu: { nome: string } | null
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
    faseAlbum: linha.fase_album,
    previsaoEm: linha.previsao_em,
    estacao: linha.estacao,
    atualizadoEm: linha.updated_at,
    responsavelNome: linha.responsavel?.nome ?? null,
    proximoResponsavelNome: linha.proximo_responsavel?.nome ?? null,
    cartaoFoto: linha.cartao_foto,
    cartaoVideo: linha.cartao_video,
    baixouPorId: linha.baixou_por,
    baixouPorNome: linha.baixou?.nome ?? null,
    // UPLOAD na tela, `subiu_por` no banco: a coluna existe desde o schema
    // inicial com esse nome, e a migration 20260915134638 a reaproveitou.
    uploadPorId: linha.subiu_por,
    uploadPorNome: linha.subiu?.nome ?? null,
    fotolivroLink: linha.fotolivro_link,
    fotolivroCapa: linha.fotolivro_capa,
    fotolivroEnviadoEm: linha.fotolivro_enviado_em,
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
/**
 * O RÓTULO DA RODADA, que NÃO é só o número.
 *
 * A tabela abaixo diz "3 = Irmãos", e isso vale para o REELS: as rodadas 3 que
 * existem hoje nele nasceram da trigger do encontro de irmãos (migration
 * 20260903193219).
 *
 * A TRIGGER MORREU EM 16/09/2026 (migration 20260916233119, pedido do gestor:
 * o encontro voltou a ser só uma etapa de acompanhamento e não gera edição). O
 * rótulo FICA assim mesmo assim, e é escolha, não esquecimento: as dez rodadas
 * já criadas SÃO o encontro — duas ainda abertas —, e chamá-las de "Revisão"
 * mentiria sobre trabalho que está na tela de alguém agora. O preço é que uma
 * revisão de reels que caia na rodada 3 daqui em diante vai aparecer como
 * "Irmãos": é a mesma imprecisão descrita no parágrafo seguinte, que já existia
 * e que agora passa a ser a única fonte de rodada 3 nova. Quando ela incomodar,
 * o conserto é olhar se o caso tem um `encontro_irmaos` — não trocar o número
 * por outro chute.
 *
 * PARA AS OUTRAS ETAPAS, rodada 3 significa outra coisa: `reabrir_caso`
 * (20260828135838) numera a revisão com `max(rodada) + 1`, então uma edição de
 * fotos reaberta depois do parto e do B+F vira rodada 3 — e a tabela a chamava
 * de "Irmãos", que é falso. O mesmo vale para qualquer rodada 4 ou acima,
 * inclusive no reels: acima da 3 só existe revisão.
 *
 * ISTO FICOU VISÍVEL EM 07/09/2026, quando o Quadro voltou a enxergar as
 * rodadas altas — elas eram cortadas pelo teto de mil linhas do PostgREST e
 * ninguém via o rótulo errado porque ninguém via a pílula.
 *
 * A regra é derivada das migrations, não de uma coluna: se um dia outra trigger
 * criar rodada por conta própria, é AQUI que ela precisa aparecer.
 */
export function rotuloDaRodada(tipo: EtapaTipo, rodada: number): string {
  if (rodada <= 2) return ROTULO_RODADA[rodada] ?? `Rodada ${rodada}`
  if (rodada === 3 && tipo === 'reels') return ROTULO_RODADA[3] ?? 'Irmãos'
  return 'Revisão'
}

export const ROTULO_RODADA: Record<number, string> = {
  1: 'Parto',
  // "B+F" e não "Banho": é como a equipe chama o bloco banho + fechamento no
  // dia a dia, e vocabulário do domínio não se traduz no caminho até a tela
  // (seção 2 do CLAUDE.md). Quando o fechamento se descolar do banho, o aviso
  // da etapa cobre a exceção — não é caso de mudar o rótulo.
  2: 'B+F',
  // A rodada do encontro de irmãos (migration 20260903193219), que nenhuma
  // trigger cria desde 16/09/2026 — ver o comentário de `rotuloDaRodada`. Era
  // SEMPRE a 3, mesmo num caso que nunca teve a 2: o número diz QUAL bloco de
  // captura, não a ordem em que apareceram.
  3: 'Irmãos',
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
  // "Foto/Livro" e não "Álbum" (10/09/2026, pedido do gestor). O sistema
  // chamava a mesma coisa de dois nomes: a etapa era "Álbum" e a seção era
  // "Foto/Livro". O nome que ficou é o que a EQUIPE usa — está assim no quadro
  // do Trello deles, e a seção 2 do CLAUDE.md manda usar o vocabulário da
  // operação na tela.
  //
  // ATENÇÃO ao renomear coisas por perto: "álbum" também significa a GALERIA
  // DO GOOGLE em vários lugares deste código ("o link do álbum", "subir as
  // fotos no álbum"). São duas coisas diferentes, e trocar aquelas por
  // "Foto/Livro" produziria frases erradas. Só a ETAPA e o ENTREGÁVEL mudaram.
  album: 'Foto/Livro',
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

/**
 * AS FASES QUE O SELETOR OFERECE (16/09/2026, pedido do gestor).
 *
 * Duas, e não quatro. "Pronto para entrega" saiu da lista porque virou o FIM:
 * escolhê-lo abre o pedido do LINK e finaliza o vídeo (`finalizar_video_master`,
 * migration 20260916180834). E "Enviado / finalizado" deixou de existir — o
 * gestor viu que os dois diziam a mesma coisa.
 *
 * `FASES_VIDEO_MASTER` continua com as quatro porque é o que o BANCO aceita, e
 * `faseDoVideo` continua sabendo ler um vídeo antigo parado em "pronto para
 * entrega".
 */
/**
 * A FASE FINAL DO VÍDEO — a que o seletor não oferece como fase, porque
 * escolhê-la é FINALIZAR: abre o pedido do link e `finalizar_video_master`
 * conclui a etapa. Ela continua nomeada aqui porque é a coluna de saída do
 * quadro por fase, e porque é onde aparece o vídeo ANTIGO que parou neste
 * estado quando ele ainda era de passagem.
 */
export const FASE_VIDEO_FINAL: FaseVideoMaster = 'pronto_para_entrega'

export const FASES_VIDEO_NA_TELA = [
  'em_andamento',
  'em_alteracao',
] as const satisfies readonly FaseVideoMaster[]

/** Os nomes como estão no Trello da equipe, menos as reticências de
 *  "Editando…" — elas sugeriam que o rótulo estava cortado. Ver
 *  FASES_VIDEO_MASTER. */
export const ROTULO_FASE_VIDEO: Record<FaseVideoMaster, string> = {
  em_andamento: 'Editando',
  em_alteracao: 'Alterações',
  pronto_para_entrega: 'Pronto para entrega',
  // Desde 16/09/2026 o fim se chama PRONTO PARA ENTREGA: a fase antiga e a
  // conclusão viraram o mesmo estado, e um vídeo concluído não aparece mais na
  // seção para ninguém ler dois nomes para a mesma coisa.
  concluida: 'Pronto para entrega',
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

/**
 * A ESTEIRA DO FOTOLIVRO — as dez fases, na ordem em que o produto anda.
 *
 * Vieram do quadro "FOTO LIVRO" do Trello da equipe, e a ORDEM importa: ela é
 * a ordem da lista no seletor, e ler as fases fora de ordem esconde de quem
 * está esperando a bola. Duas colunas do Trello não viraram fase:
 *
 *   "ESTÁ NA UTI"  já é estado do CASO aqui (`uti_desde` pausa o SLA e tem
 *                  seção própria). Repetir como fase criaria duas fontes que
 *                  podem discordar.
 *
 * A distinção entre as DUAS PRIMEIRAS é de dono: "aguardando pagamento" espera
 * o CLIENTE, "aguardando diagramação" espera a EQUIPE. Juntá-las numa fase só
 * apagaria justamente a informação que a coordenação usa para saber de quem
 * cobrar.
 */
export const FASES_ALBUM = [
  'aguardando_pagamento',
  'aguardando_diagramacao',
  'diagramando',
  'enviar_para_aprovacao',
  'aguardando_aprovacao',
  'pedido_de_alteracoes',
  'aprovado',
  'enviado_grafica',
  'pronto_para_entrega',
  'entregue',
] as const

export type FaseAlbum = (typeof FASES_ALBUM)[number]

/**
 * A LISTA QUE O SELETOR MOSTRA — todas menos `entregue` (21/09/2026, pedido do
 * gestor).
 *
 * A história tem duas voltas. Até 16/09 havia "Pronto para entrega" e "Entregue
 * / finalizado", e o gestor as juntou por redundância: a equipe marcava as duas
 * no mesmo minuto. Em 21/09 ENTRE as duas passou a existir a conferência em
 * Entregáveis — o fotolivro pronto vai para lá, e a Morgana confirma a entrega
 * do livro. Então `pronto_para_entrega` volta a ser fase de verdade (fica
 * aberta, esperando), e `entregue` deixa de ser fase que se escolhe: é o que a
 * confirmação em Entregáveis grava (`mover_album` recusa quem não for
 * atendimento ou adm, e recusa de qualquer fase que não seja a de pronto).
 */
export const FASES_ALBUM_NA_TELA: readonly FaseAlbum[] = FASES_ALBUM.filter(
  (fase) => fase !== 'entregue',
)

/**
 * A fase em que o fotolivro entra só pelo diálogo de capa e link
 * (`enviar_fotolivro_para_aprovacao`) — pelo seletor, por arrastar e pelo
 * "concluir" do cartão.
 */
export const FASE_ALBUM_APROVACAO: FaseAlbum = 'aguardando_aprovacao'

/**
 * As fases ANTES da aprovação: nelas o "concluir" do cartão significa "terminei
 * a diagramação" e abre o envio para aprovação. Depois dela o cartão não
 * conclui nada — quem anda é a fase, e o fim é a confirmação em Entregáveis.
 */
export const FASES_ALBUM_ANTES_DA_APROVACAO = new Set<FaseAlbum>([
  'aguardando_pagamento',
  'aguardando_diagramacao',
  'diagramando',
  'enviar_para_aprovacao',
  'pedido_de_alteracoes',
])

/**
 * Os nomes como estão no Trello deles, não uma tradução nossa.
 *
 * "Pago e enviado para a gráfica" é a única que se afasta do original, que diz
 * "TICCOLOR". A gráfica é fornecedor: o dia em que trocarem de fornecedor, o
 * rótulo continua certo e ninguém precisa de migration para descobrir isso.
 */
export const ROTULO_FASE_ALBUM: Record<FaseAlbum, string> = {
  aguardando_pagamento: 'Aguardando pagamento e fotos',
  aguardando_diagramacao: 'Aguardando diagramação',
  diagramando: 'Realizando diagramação',
  enviar_para_aprovacao: 'Enviar para aprovação',
  aguardando_aprovacao: 'Aguardando aprovação do cliente',
  pedido_de_alteracoes: 'Pedido de alterações',
  aprovado: 'Aprovado pelo cliente',
  enviado_grafica: 'Pago e enviado para a gráfica',
  pronto_para_entrega: 'Pronto para entrega',
  // O FIM, gravado pela confirmação em Entregáveis (21/09/2026). Entre 16/09 e
  // 21/09 tinha o mesmo rótulo de "Pronto para entrega", porque as duas eram o
  // mesmo momento; agora a conferência da Morgana as separa.
  entregue: 'Entregue',
}

/**
 * A cor da fase, e ela diz DE QUEM É A BOLA — não o quanto falta.
 *
 * Um degradê de "começou" a "terminou" seria bonito e inútil: a pergunta de
 * quem varre esta seção não é "quanto falta", é "o que depende de mim". Então
 * as fases se agrupam em três famílias:
 *
 *   NOSSA      âmbar   a equipe tem que fazer alguma coisa agora
 *   DE FORA    neutra  esperando cliente ou gráfica — não adianta cobrar
 *   ANDANDO    azul/verde  trabalho em curso, e o fim
 *
 * `pronto_para_entrega` usa `--pronto`, o mesmo token do caso que terminou o
 * trabalho e espera uma pessoa. É literalmente o mesmo estado um nível abaixo,
 * e a cor repetida é o que faz os dois se lerem como a mesma ideia — o mesmo
 * raciocínio de ESTILO_FASE no vídeo do MASTER.
 */
export const ESTILO_FASE_ALBUM: Record<FaseAlbum, string> = {
  aguardando_pagamento: 'bg-muted text-muted-foreground',
  aguardando_diagramacao: 'bg-atencao/15 text-atencao-tinta',
  diagramando: 'bg-andamento/12 text-andamento-tinta',
  enviar_para_aprovacao: 'bg-atencao/15 text-atencao-tinta',
  aguardando_aprovacao: 'bg-muted text-muted-foreground',
  pedido_de_alteracoes: 'bg-atrasado/12 text-atrasado',
  aprovado: 'bg-andamento/12 text-andamento-tinta',
  enviado_grafica: 'bg-muted text-muted-foreground',
  pronto_para_entrega: 'bg-pronto-fundo text-pronto border border-pronto-borda',
  entregue: 'bg-pronto-fundo text-pronto border border-pronto-borda',
}

/**
 * As fases em que a bola está com ALGUÉM DE FORA.
 *
 * A seção usa isto para não gritar: um fotolivro esperando a gráfica imprimir
 * não é trabalho parado por culpa de ninguém, e marcá-lo de vermelho ensinaria
 * a equipe a ignorar o vermelho. Ver o anel do cartão em CartaoDeEdicao.
 */
export const FASES_DE_ESPERA_EXTERNA = new Set<FaseAlbum>([
  'aguardando_pagamento',
  'aguardando_aprovacao',
  'enviado_grafica',
])

export const ROTULO_SITUACAO: Record<SituacaoClinica, string> = {
  aguardando: 'Aguardando',
  internada: 'Internada',
  inducao: 'Indução',
  trabalho_parto: 'Trabalho de parto',
  nasceu: 'Nasceu',
  uti: 'UTI',
  alta: 'Alta',
}
