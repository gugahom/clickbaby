import type { CasoQuadro, EtapaQuadro } from '../types'

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

export function podeIniciar(etapa: EtapaQuadro): Disponibilidade {
  if (etapa.status === 'em_andamento') {
    return { habilitada: false, motivo: 'Já está em andamento.' }
  }
  if (etapa.status === 'concluida') {
    return { habilitada: false, motivo: 'Já concluída.' }
  }
  if (etapa.status === 'dispensada') {
    return { habilitada: false, motivo: 'Etapa dispensada.' }
  }
  return OK
}

export function podeConcluir(etapa: EtapaQuadro): Disponibilidade {
  // concluir_etapa aceita pendente, atribuida E em_andamento: o registro
  // retroativo é deliberado (seção 9 do CLAUDE.md) — em campo nem sempre dá
  // para tocar o aparelho na hora exata.
  if (etapa.status === 'concluida') {
    return { habilitada: false, motivo: 'Já concluída.' }
  }
  if (etapa.status === 'dispensada') {
    return { habilitada: false, motivo: 'Etapa dispensada.' }
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
