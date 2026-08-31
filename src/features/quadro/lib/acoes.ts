import { ROTULO_ETAPA, type CasoQuadro, type EtapaQuadro, type EtapaTipo } from '../types'

/**
 * Quais ações fazem sentido AGORA, para esta etapa e para este papel.
 *
 * Espelha as guardas das RPCs (migrations 20260821052601, 055425, 062000 e
 * 064027) — mas NÃO as substitui. O backend continua sendo quem decide; isto
 * existe só para a tela não oferecer o que já se sabe que será negado.
 *
 * Quando uma ação não cabe, devolve o MOTIVO junto. Botão desabilitado sem
 * explicação é pior que botão ausente: a pessoa fica tentando.
 */

/**
 * "adm" não é valor do enum papel_sistema — é o conjunto dos papéis
 * administrativos, mesma definição de public.eh_adm() (migration 20260820090536).
 */
const PAPEIS_ADM = ['comercial', 'coordenacao', 'financeiro', 'gestao']

/** Espelha `eh_atendimento() or eh_adm()`, a guarda de confirmar_entrega e cancelar_caso. */
export function podeEncerrarCaso(papelSistema: string): boolean {
  return papelSistema === 'atendimento' || PAPEIS_ADM.includes(papelSistema)
}

export interface Disponibilidade {
  habilitada: boolean
  /** Preenchido só quando habilitada = false. */
  motivo?: string
}

const OK: Disponibilidade = { habilitada: true }

/** Resolvida = não segura mais ninguém. Dispensada conta: não vai acontecer. */
function resolvida(e: EtapaQuadro): boolean {
  return e.status === 'concluida' || e.status === 'dispensada'
}

/**
 * O que precisa sair da frente antes desta etapa abrir.
 *
 * A REGRA NÃO É LINEAR, E A VERSÃO ANTERIOR ESTAVA ERRADA
 * Antes isto era "toda etapa com `ordem` menor precisa estar resolvida". Com
 * uma etapa de edição por caso e ela sempre no fim, funcionava por acidente.
 * Deixou de funcionar quando a edição virou trilha própria (migration
 * 20260827140400): `edicao_foto` tem ordem 5 e `fechamento` tem 4, então a
 * regra antiga travaria a edição das fotos do parto até o banho acontecer —
 * exatamente o contrário da operação, onde a editora começa assim que o bebê
 * nasce.
 *
 * A precedência real é por TRILHA:
 *
 *   ACOMPANHAMENTO  sequencial entre si. Entrada antes de nascimento,
 *                   nascimento antes de banho, banho antes de fechamento.
 *   EDIÇÃO          libera quando conclui a etapa que produziu o material:
 *                   nascimento para a rodada 1, fechamento para a rodada 2. As
 *                   etapas de edição não se seguram entre si — foto, reels e
 *                   vídeo podem estar com três pessoas ao mesmo tempo.
 *
 * Continua sendo trava de TELA, não de banco: `concluir_etapa` aceita qualquer
 * ordem de propósito, porque campo admite registro retroativo (seção 9 do
 * CLAUDE.md) — alguém pode ter fotografado o banho e só registrar depois. O que
 * a trava evita é o caminho fácil de sair aprovando tudo de cima para baixo sem
 * o trabalho ter acontecido.
 */
function anteriorPendente(
  etapa: EtapaQuadro,
  etapas: EtapaQuadro[],
): EtapaQuadro | null {
  if (etapa.trilha === 'edicao') {
    /*
     * De que material esta edição trata decide o que ela espera.
     *
     *   rodada 1  material do parto     -> espera o NASCIMENTO
     *   rodada 2  material do banho     -> espera o FECHAMENTO
     *
     * A rodada 2 só é criada DEPOIS de o fechamento concluir, então na prática
     * ela já nasce liberada. A regra existe para o caminho de volta: se alguém
     * reabrir o fechamento, a edição do banho volta a estar bloqueada — que é o
     * correto, porque o material que ela edita voltou a ser trabalho em curso.
     */
    const gatilho = etapa.rodada >= 2 ? 'fechamento' : 'nascimento'
    const dependencia = etapas.find((e) => e.tipo === gatilho && e.rodada === 1)

    // Sem a etapa gatilho não há o que esperar. Devolver null é o
    // comportamento seguro: a tela oferece a ação e o banco decide.
    if (!dependencia || resolvida(dependencia)) return null
    return dependencia
  }

  const anteriores = etapas
    .filter((e) => e.trilha === 'acompanhamento' && e.ordem < etapa.ordem)
    .sort((a, b) => b.ordem - a.ordem)

  return anteriores.find((e) => !resolvida(e)) ?? null
}

export function podeIniciar(
  etapa: EtapaQuadro,
  etapas: EtapaQuadro[] = [],
): Disponibilidade {
  if (etapa.status === 'em_andamento') {
    return { habilitada: false, motivo: 'Já está em andamento.' }
  }
  if (etapa.status === 'concluida') {
    return { habilitada: false, motivo: 'Já concluída.' }
  }
  if (etapa.status === 'dispensada') {
    return { habilitada: false, motivo: 'Etapa dispensada.' }
  }
  const trava = anteriorPendente(etapa, etapas)
  if (trava) {
    return { habilitada: false, motivo: `Conclua ${ROTULO_ETAPA[trava.tipo]} antes.` }
  }
  return OK
}

export function podeConcluir(
  etapa: EtapaQuadro,
  etapas: EtapaQuadro[] = [],
): Disponibilidade {
  // concluir_etapa aceita pendente, atribuida E em_andamento: o registro
  // retroativo é deliberado (seção 9 do CLAUDE.md) — em campo nem sempre dá
  // para tocar o aparelho na hora exata.
  if (etapa.status === 'concluida') {
    return { habilitada: false, motivo: 'Já concluída.' }
  }
  if (etapa.status === 'dispensada') {
    return { habilitada: false, motivo: 'Etapa dispensada.' }
  }
  const trava = anteriorPendente(etapa, etapas)
  if (trava) {
    return { habilitada: false, motivo: `Conclua ${ROTULO_ETAPA[trava.tipo]} antes.` }
  }
  return OK
}

/**
 * Atribuir vale ANTES do trabalho começar; transferir, depois. A linha não é o
 * status, é se alguém já trabalhou — e é ela que decide se existe uma passagem
 * de trabalho a registrar em `handoffs`.
 */
export function podeAtribuir(etapa: EtapaQuadro): Disponibilidade {
  if (etapa.status === 'concluida' || etapa.status === 'dispensada') {
    return { habilitada: false, motivo: 'Trabalho terminado.' }
  }
  if (etapa.status !== 'pendente' && etapa.status !== 'atribuida') {
    return { habilitada: false, motivo: 'Já começou — use o handoff.' }
  }
  return OK
}

/**
 * Anunciar quem assume na virada de turno.
 *
 * Espelha as guardas de `planejar_rendicao` (migration 20260827141600): exige
 * responsável atual, porque rendição é quem vem DEPOIS de alguém — sem isso o
 * que se quer é atribuir. Vale em qualquer status não terminal, inclusive
 * `atribuida`: a fotógrafa que sabe que sai em 15 minutos combina a troca
 * antes de começar, não depois.
 */
/**
 * Desfazer uma conclusão.
 *
 * Espelha as guardas de `reabrir_etapa` (migration 20260827172830). Existe
 * porque concluir é um gesto de UM toque, feito com uma mão, num corredor — e
 * até aqui era irreversível.
 */
export function podeReabrir(
  etapa: EtapaQuadro,
  caso: CasoQuadro,
): Disponibilidade {
  // Dispensada entra junto desde a migration 20260828211156: dispensar é um
  // toque só, e lançar um gesto de um toque sem caminho de volta repetiria o
  // problema que o próprio reabrir_etapa existe para resolver.
  if (etapa.status !== 'concluida' && etapa.status !== 'dispensada') {
    return { habilitada: false, motivo: 'Só se reabre etapa concluída ou dispensada.' }
  }
  if (caso.ehTerminal) {
    return { habilitada: false, motivo: 'Caso já encerrado ou cancelado.' }
  }
  return OK
}

/**
 * Dispensar: dizer que esta etapa NÃO VAI acontecer neste caso.
 *
 * O nascimento fica de fora porque é dele que o prazo do caso deriva — a RPC
 * também recusa, e isto aqui existe só para não oferecer o que será negado.
 */
export function podeDispensar(
  etapa: EtapaQuadro,
  caso: CasoQuadro,
): Disponibilidade {
  if (caso.ehTerminal) {
    return { habilitada: false, motivo: 'Caso já encerrado ou cancelado.' }
  }
  if (etapa.tipo === 'nascimento') {
    return { habilitada: false, motivo: 'O prazo do caso sai daqui — nascimento não se dispensa.' }
  }
  if (etapa.status === 'concluida') {
    return { habilitada: false, motivo: 'Já concluída — o trabalho aconteceu.' }
  }
  if (etapa.status === 'dispensada') {
    return { habilitada: false, motivo: 'Já dispensada.' }
  }
  return OK
}

export function podePlanejarRendicao(etapa: EtapaQuadro): Disponibilidade {
  if (etapa.status === 'concluida' || etapa.status === 'dispensada') {
    return { habilitada: false, motivo: 'Trabalho terminado.' }
  }
  if (!etapa.responsavelId) {
    return { habilitada: false, motivo: 'Atribua um responsável antes.' }
  }
  return OK
}

export function podeTransferir(etapa: EtapaQuadro): Disponibilidade {
  if (etapa.status === 'concluida' || etapa.status === 'dispensada') {
    return { habilitada: false, motivo: 'Trabalho terminado não se transfere.' }
  }
  // transferir_etapa exige responsável atual: é handoff entre DUAS pessoas, não
  // a primeira designação — para isso existe atribuir_etapa.
  if (!etapa.responsavelId) {
    return { habilitada: false, motivo: 'Atribua um responsável antes.' }
  }
  return OK
}

export function podePausar(etapa: EtapaQuadro): Disponibilidade {
  // pausar_etapa só aceita em_andamento: pausar pendente não significa nada, e
  // pausar concluída seria reabrir trabalho terminado por porta lateral.
  if (etapa.status !== 'em_andamento') {
    return { habilitada: false, motivo: 'Só pausa etapa em andamento.' }
  }
  return OK
}

export function podeMoverParaUti(caso: CasoQuadro): Disponibilidade {
  if (caso.ehTerminal) {
    return { habilitada: false, motivo: 'Caso já encerrado ou cancelado.' }
  }
  if (caso.naUti) {
    return { habilitada: false, motivo: 'Já está na UTI.' }
  }
  return OK
}

export function podeRetornarDaUti(caso: CasoQuadro): Disponibilidade {
  if (!caso.naUti) {
    return { habilitada: false, motivo: 'O caso não está na UTI.' }
  }
  return OK
}

/**
 * Ordem de leitura das etapas, a mesma de `ordem_padrao_da_etapa` no banco.
 *
 * Escrita à mão em vez de derivada de ROTULO_ETAPA: a ordem de um objeto é a
 * de inserção, e a lista existe justamente para que reordenar os rótulos por
 * qualquer outro motivo não mude silenciosamente a ordem do menu.
 */
const TIPOS_EM_ORDEM: EtapaTipo[] = [
  'entrada',
  'nascimento',
  'banho',
  'fechamento',
  'edicao_foto',
  'reels',
  'edicao_video',
  'album',
  // Sem pacote nenhum de fábrica (31/08/2026) — só chegam por aqui, no fim
  // da lista, na mesma ordem em que o gestor pediu.
  'encontro_irmaos',
  'saida_uti',
  'alta',
]

/**
 * O QUE AINDA DÁ PARA ACRESCENTAR a este caso.
 *
 * O pacote diz quais etapas o caso NASCE tendo; a realidade às vezes
 * acrescenta. O exemplo do gestor é o banho: um BASIC não o inclui, mas a
 * fotógrafa está na maternidade e vende o banho na hora. Antes disso acontecer
 * no sistema, o trabalho era feito e não existia — sem etapa não há play, e o
 * tempo dela não entrava em lugar nenhum.
 *
 * Só o que FALTA aparece. Uma etapa que já existe não se acrescenta: ela se
 * inicia, se conclui ou se dispensa, e as três coisas já estão na linha dela.
 * A rodada 2 também não entra aqui — ela nasce da trigger do fechamento.
 */
export function etapasAdicionaveis(etapas: EtapaQuadro[]): EtapaTipo[] {
  const existentes = new Set(etapas.map((e) => e.tipo))
  return TIPOS_EM_ORDEM.filter((t) => !existentes.has(t))
}

/**
 * Espelha as guardas de `adicionar_etapa` (migration 20260830063452).
 *
 * A do PACOTE não é formalidade: `gerar_caso_etapas` desiste de gerar quando o
 * caso já tem qualquer etapa, então acrescentar a um rascunho e confirmar o
 * pacote depois deixaria o caso com aquela etapa e mais nenhuma.
 */
export function podeAdicionarEtapa(
  caso: CasoQuadro,
  etapas: EtapaQuadro[],
): Disponibilidade {
  if (caso.ehTerminal) {
    return { habilitada: false, motivo: 'Caso já encerrado ou cancelado.' }
  }
  if (caso.faltaPacote) {
    return {
      habilitada: false,
      motivo: 'Rascunho sem pacote — confirme o pacote antes.',
    }
  }
  if (etapasAdicionaveis(etapas).length === 0) {
    return { habilitada: false, motivo: 'O caso já tem todas as etapas.' }
  }
  return OK
}

/**
 * Sem checagem de papel desde a migration 20260825014102: quem gera os links são
 * as fotógrafas, e prender o encerramento ao atendimento fazia da Morgana
 * gargalo de um passo que ela não executa.
 *
 * A trava que sobrou é outra e continua valendo — sem link registrado ninguém
 * encerra. Ela mora na RPC; aqui só evita oferecer o que vai ser negado.
 */
export function podeConfirmarEntrega(
  caso: CasoQuadro,
  temEntregavel: boolean,
  etapas: EtapaQuadro[] = [],
): Disponibilidade {
  if (caso.ehTerminal) {
    return { habilitada: false, motivo: 'Caso já encerrado ou cancelado.' }
  }
  if (caso.statusEntrega === 'confirmado') {
    return { habilitada: false, motivo: 'Entrega já confirmada.' }
  }

  // Espelha a trava que entrou em 20260827181322. Sem ela aqui, o botão
  // apareceria habilitado e a pessoa levaria o erro cru da RPC — e o caso
  // ficaria ainda mais confuso agora que os reels saíram da fita de edição do
  // card: quem olha o Quadro não os vê ali.
  const abertas = etapas.filter(
    (e) => e.status !== 'concluida' && e.status !== 'dispensada',
  )
  if (abertas.length > 0) {
    const nomes = abertas.map((e) => ROTULO_ETAPA[e.tipo]).join(', ')
    return {
      habilitada: false,
      motivo: `Falta concluir ou dispensar: ${nomes}.`,
    }
  }

  if (!temEntregavel) {
    return { habilitada: false, motivo: 'Registre ao menos um link antes.' }
  }
  return OK
}

export function podeCancelar(
  caso: CasoQuadro,
  papelSistema: string,
): Disponibilidade {
  if (!podeEncerrarCaso(papelSistema)) {
    return { habilitada: false, motivo: 'Só atendimento ou gestão.' }
  }
  if (caso.ehTerminal) {
    return { habilitada: false, motivo: 'Caso já encerrado ou cancelado.' }
  }
  return OK
}
