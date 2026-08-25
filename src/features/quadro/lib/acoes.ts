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

/**
 * A etapa anterior (por `ordem`) precisa estar resolvida antes desta abrir.
 *
 * É trava de TELA, não de banco: `concluir_etapa` continua aceitando qualquer
 * ordem de propósito, porque campo admite registro retroativo (seção 9 do
 * CLAUDE.md) — alguém pode ter fotografado o banho e só registrar depois. O que
 * a trava evita é o caminho fácil de sair aprovando tudo de cima para baixo sem
 * o trabalho ter acontecido.
 *
 * Dispensada conta como resolvida: é uma etapa que não vai acontecer, e ela não
 * pode segurar a fila atrás de si.
 */
function anteriorPendente(
  etapa: EtapaQuadro,
  etapas: EtapaQuadro[],
): EtapaQuadro | null {
  const anteriores = etapas
    .filter((e) => e.ordem < etapa.ordem)
    .sort((a, b) => b.ordem - a.ordem)

  const bloqueia = anteriores.find(
    (e) => e.status !== 'concluida' && e.status !== 'dispensada',
  )
  return bloqueia ?? null
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

export function podeTransferir(etapa: EtapaQuadro): Disponibilidade {
  if (etapa.status === 'concluida' || etapa.status === 'dispensada') {
    return { habilitada: false, motivo: 'Trabalho terminado não se transfere.' }
  }
  // transferir_etapa exige responsável atual: ela é handoff entre DUAS
  // pessoas, não a primeira atribuição. A RPC atribuir_etapa (prevista na
  // seção 4 do CLAUDE.md) ainda não existe, então na prática o responsável
  // aparece quando alguém inicia ou conclui a etapa.
  if (!etapa.responsavelId) {
    return { habilitada: false, motivo: 'Inicie a etapa antes de transferir.' }
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
 * A etapa de vídeo pode não existir: só os pacotes com reels a trazem. Quando
 * falta, o botão vira "Adicionar reels" (adicionar_reels); quando existe, vira
 * "Editar reels", que é iniciar_etapa naquela etapa.
 */
export function podeAdicionarReels(
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

export function podeConfirmarEntrega(
  caso: CasoQuadro,
  papelSistema: string,
): Disponibilidade {
  if (!podeEncerrarCaso(papelSistema)) {
    return { habilitada: false, motivo: 'Só atendimento ou gestão.' }
  }
  if (caso.ehTerminal) {
    return { habilitada: false, motivo: 'Caso já encerrado ou cancelado.' }
  }
  if (caso.statusEntrega === 'confirmado') {
    return { habilitada: false, motivo: 'Entrega já confirmada.' }
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
