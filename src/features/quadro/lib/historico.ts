import { ROTULO_ETAPA, type EtapaTipo } from '../types'

export interface EventoHistorico {
  id: string
  tipo: string
  payload: Record<string, unknown> | null
  ocorrido_em: string
  pessoa: { nome: string } | null
}

/** Como a linha do histórico se apresenta: peso visual por importância do fato. */
export type TomEvento = 'marco' | 'normal' | 'alerta' | 'sistema'

export interface LinhaHistorico {
  id: string
  quando: string
  /** "Concluiu Nascimento", "Passou Banho para Ana" */
  acao: string
  /** Quem fez. Null nos eventos sem ator humano (trigger, sync). */
  quem: string | null
  tom: TomEvento
  detalhe?: string
}

function etapaDoPayload(payload: Record<string, unknown> | null): string | null {
  const tipo = payload?.['tipo']
  if (typeof tipo !== 'string') return null
  return ROTULO_ETAPA[tipo as EtapaTipo] ?? tipo
}

function texto(payload: Record<string, unknown> | null, chave: string): string | null {
  const valor = payload?.[chave]
  return typeof valor === 'string' && valor.trim() !== '' ? valor : null
}

/**
 * Traduz um evento do log em uma linha de histórico.
 *
 * O log é escrito para auditoria: tipo em snake_case, payload com uuid. Isso
 * não é linguagem de tela. Aqui vira frase — e a frase começa pelo VERBO, do
 * jeito que se conta o que aconteceu ("Concluiu Nascimento"), não pelo nome do
 * evento ("etapa_concluida").
 *
 * Tipo desconhecido não some nem quebra: vira o próprio nome com os underscores
 * trocados. Um evento novo no backend aparece no histórico no mesmo dia, feio
 * mas presente, em vez de sumir sem ninguém notar.
 */
export function descreverEvento(evento: EventoHistorico): LinhaHistorico {
  const etapa = etapaDoPayload(evento.payload)
  const quem = evento.pessoa?.nome ?? null

  const base = {
    id: evento.id,
    quando: evento.ocorrido_em,
    quem,
  }

  switch (evento.tipo) {
    case 'caso_criado_via_sync':
      return { ...base, acao: 'Caso criado pela agenda', tom: 'sistema' }
    case 'caso_atualizado_via_sync':
      return { ...base, acao: 'Caso atualizado pela agenda', tom: 'sistema' }
    case 'caso_cancelado_via_sync':
      return { ...base, acao: 'Cancelado pela agenda (card cinza)', tom: 'alerta' }
    case 'etapas_geradas':
      return { ...base, acao: 'Etapas geradas pelo pacote', tom: 'sistema' }

    case 'etapa_iniciada':
      return { ...base, acao: `Iniciou ${etapa ?? 'a etapa'}`, tom: 'normal' }
    case 'etapa_pausada':
      return { ...base, acao: `Pausou ${etapa ?? 'a etapa'}`, tom: 'normal' }
    case 'etapa_retomada':
      return { ...base, acao: `Retomou ${etapa ?? 'a etapa'}`, tom: 'normal' }
    case 'etapa_concluida':
      return { ...base, acao: `Concluiu ${etapa ?? 'a etapa'}`, tom: 'marco' }

    case 'etapa_transferida': {
      const motivo = texto(evento.payload, 'motivo')
      return {
        ...base,
        acao: 'Passou a etapa para outra pessoa',
        tom: 'normal',
        ...(motivo ? { detalhe: motivo } : {}),
      }
    }

    case 'reels_adicionado':
      return { ...base, acao: 'Acrescentou a etapa de vídeo', tom: 'normal' }

    case 'caso_movido_para_uti':
      return { ...base, acao: 'Moveu para a UTI', tom: 'alerta', detalhe: 'O prazo de entrega parou de correr.' }
    case 'caso_retornou_da_uti': {
      const duracao = texto(evento.payload, 'duracao_uti')
      return {
        ...base,
        acao: 'Trouxe de volta da UTI',
        tom: 'normal',
        ...(duracao ? { detalhe: `Ficou ${duracao} na UTI.` } : {}),
      }
    }

    case 'entregavel_registrado': {
      const tipoLink = texto(evento.payload, 'tipo')
      return {
        ...base,
        acao: 'Registrou um link de entrega',
        tom: 'normal',
        ...(tipoLink ? { detalhe: tipoLink.replace(/_/g, ' ') } : {}),
      }
    }
    case 'entrega_confirmada':
      return { ...base, acao: 'Confirmou a entrega e encerrou o caso', tom: 'marco' }

    case 'caso_cancelado': {
      const motivo = texto(evento.payload, 'motivo')
      return {
        ...base,
        acao: 'Cancelou o caso',
        tom: 'alerta',
        ...(motivo ? { detalhe: motivo } : {}),
      }
    }

    default:
      // Evento novo no backend: aparece feio, mas aparece.
      return { ...base, acao: evento.tipo.replace(/_/g, ' '), tom: 'sistema' }
  }
}
