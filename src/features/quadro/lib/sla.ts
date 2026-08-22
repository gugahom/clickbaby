import type { CasoQuadro } from '../types'

/**
 * Apresentação do SLA. O CÁLCULO não está aqui: `vence_em` vem derivado da
 * view (`nascimento.concluido_em + pacotes.prazo_entrega`), para a Fila de
 * Edição e o Painel usarem exatamente a mesma régua. Este módulo só traduz o
 * instante em rótulo e urgência.
 *
 * Nada de prazo hardcoded: o número vem do seed, via `prazo_entrega_horas`.
 */

export type Urgencia = 'atrasado' | 'urgente' | 'atencao' | 'tranquilo' | 'sem_prazo'

export interface EstadoSla {
  urgencia: Urgencia
  /** 'Atrasado 3h', 'Vence em 12h', ou null quando o relógio ainda não começou. */
  rotulo: string | null
  /** Texto explicativo para o painel expandido. */
  detalhe: string
}

export function estadoSla(caso: CasoQuadro, agora: Date = new Date()): EstadoSla {
  if (!caso.venceEm) {
    const prazo = caso.prazoEntregaHoras
    return {
      urgencia: 'sem_prazo',
      rotulo: null,
      detalhe:
        prazo === null
          ? 'Sem pacote definido — não há prazo de entrega.'
          : `SLA de ${formatarPrazo(prazo)}. O relógio começa quando a etapa de nascimento for concluída.`,
    }
  }

  const restanteMs = new Date(caso.venceEm).getTime() - agora.getTime()
  const restanteHoras = restanteMs / 3_600_000

  if (restanteHoras < 0) {
    return {
      urgencia: 'atrasado',
      rotulo: `Atrasado ${formatarDuracao(-restanteHoras)}`,
      detalhe: `Venceu em ${caso.venceEm}.`,
    }
  }

  // As faixas são relativas ao prazo do próprio pacote, não a um corte fixo de
  // horas: 12h restantes num BIRTH (24h) é metade do prazo; num MASTER (168h)
  // é quase nada. Sem isso, "BIRTH primeiro" viraria hardcode — o que a seção
  // 12 do CLAUDE.md proíbe.
  const prazoTotal = caso.prazoEntregaHoras ?? 48
  const fracao = restanteHoras / prazoTotal

  const urgencia: Urgencia =
    fracao <= 0.25 ? 'urgente' : fracao <= 0.5 ? 'atencao' : 'tranquilo'

  return {
    urgencia,
    rotulo: `Vence em ${formatarDuracao(restanteHoras)}`,
    detalhe: `SLA de ${formatarPrazo(prazoTotal)}, contado da conclusão do nascimento.`,
  }
}

export const CLASSE_URGENCIA: Record<Urgencia, string> = {
  atrasado: 'text-atrasado font-semibold',
  urgente: 'text-atrasado',
  atencao: 'text-atencao',
  tranquilo: 'text-muted-foreground',
  sem_prazo: 'text-muted-foreground',
}

function formatarDuracao(horas: number): string {
  if (horas < 1) return `${Math.round(horas * 60)}min`
  if (horas < 48) return `${Math.round(horas)}h`
  return `${Math.round(horas / 24)}d`
}

function formatarPrazo(horas: number): string {
  // Em dias só a partir de 3: os prazos do seed são 24h, 48h e 7 dias, e
  // "2 dias" para o SLA de 48h não é como a equipe fala.
  if (horas >= 72 && horas % 24 === 0) {
    const dias = horas / 24
    return `${dias} ${dias === 1 ? 'dia' : 'dias'}`
  }
  return `${horas}h`
}
