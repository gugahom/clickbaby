import { ROTULO_ETAPA, type CasoQuadro, type EtapaQuadro } from '../types'

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
 *   CAMPO   sequencial entre si. Entrada antes de nascimento, nascimento antes
 *           de banho, banho antes de fechamento.
 *   EDIÇÃO  libera quando o NASCIMENTO conclui, e as etapas dela não se
 *           seguram entre si — foto, reels e vídeo podem estar com três
 *           pessoas diferentes ao mesmo tempo, que é a razão de o gestor ter
 *           pedido a separação.
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
    const nascimento = etapas.find((e) => e.tipo === 'nascimento')
    // Sem etapa de nascimento não há o que esperar. Não acontece nos pacotes
    // de hoje (todos têm), mas devolver null é o comportamento seguro: a tela
    // oferece a ação e o banco decide.
    if (!nascimento || resolvida(nascimento)) return null
    return nascimento
  }

  const anteriores = etapas
    .filter((e) => e.trilha === 'campo' && e.ordem < etapa.ordem)
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
 * O VÍDEO HORIZONTAL só existe de fábrica no MASTER e MASTER + ÁLBUM. Quando
 * falta, o botão vira "Adicionar vídeo" (adicionar_video); quando existe, vira
 * "Editar vídeo", que é iniciar_etapa naquela etapa.
 *
 * O REELS não passa por aqui: desde a migration 20260827140400 ele está em
 * TODO pacote, então não há o que adicionar. Enquanto reels e vídeo eram a
 * mesma etapa, esta função se chamava podeAdicionarReels e falava do que hoje
 * é o horizontal.
 */
export function podeAdicionarVideo(
  caso: CasoQuadro,
  etapas: EtapaQuadro[],
): Disponibilidade {
  if (caso.ehTerminal) {
    return { habilitada: false, motivo: 'Caso já encerrado ou cancelado.' }
  }
  if (caso.faltaPacote) {
    return { habilitada: false, motivo: 'Rascunho sem pacote definido.' }
  }
  if (etapas.some((e) => e.tipo === 'edicao_video')) {
    return { habilitada: false, motivo: 'Este caso já tem etapa de vídeo.' }
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
): Disponibilidade {
  if (caso.ehTerminal) {
    return { habilitada: false, motivo: 'Caso já encerrado ou cancelado.' }
  }
  if (caso.statusEntrega === 'confirmado') {
    return { habilitada: false, motivo: 'Entrega já confirmada.' }
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
