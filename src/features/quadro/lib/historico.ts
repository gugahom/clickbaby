import {
  ROTULO_ETAPA,
  ROTULO_FASE_ALBUM,
  ROTULO_FASE_CLICK_HOME,
  ROTULO_FASE_VIDEO,
  type EtapaTipo,
  type FaseAlbum,
  type FaseClickHome,
  type FaseVideoMaster,
  type TermoStatus,
} from '../types'
import { ROTULO_TERMO } from './termo'

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

    case 'etapas_do_pacote_trocado': {
      // O pacote mudou e o checklist acompanhou. O NÚMERO importa aqui: é o que
      // explica por que apareceram cartões de trabalho que ninguém pediu.
      const quantas = Number(
        (evento.payload as Record<string, unknown> | null)?.['quantidade'] ?? 0,
      )
      return {
        ...base,
        acao: 'Pacote trocado — o checklist ganhou etapas',
        tom: 'sistema',
        ...(quantas > 0
          ? { detalhe: quantas === 1 ? '1 etapa nova' : quantas + ' etapas novas' }
          : {}),
      }
    }

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
    case 'entregavel_removido': {
      const motivo = texto(evento.payload, 'motivo')
      const tipoLink = texto(evento.payload, 'tipo')
      return {
        ...base,
        acao: 'Apagou um link de entrega',
        tom: 'alerta',
        ...(motivo
          ? { detalhe: `${tipoLink ? `${tipoLink.replace(/_/g, ' ')} · ` : ''}${motivo}` }
          : tipoLink
            ? { detalhe: tipoLink.replace(/_/g, ' ') }
            : {}),
      }
    }

    case 'caso_devolvido_ao_quadro': {
      const motivo = texto(evento.payload, 'motivo')
      return {
        ...base,
        acao: 'Devolveu o caso ao Quadro',
        tom: 'alerta',
        ...(motivo ? { detalhe: motivo } : {}),
      }
    }

    case 'caso_liberado_para_entrega':
      return {
        ...base,
        acao: 'Enviou o caso para Entregáveis',
        tom: 'marco',
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

    // O FOTO/LIVRO (21/09/2026). A ficha da seção mostra este histórico em
    // destaque, e "fase do album movida" cru ali seria o evento mais comum da
    // tela falando a língua do banco.
    case 'fase_do_album_movida': {
      const para = texto(evento.payload, 'para')
      const rotulo = para && para in ROTULO_FASE_ALBUM ? ROTULO_FASE_ALBUM[para as FaseAlbum] : null
      return {
        ...base,
        acao: rotulo ? `Moveu o Foto/Livro para “${rotulo}”` : 'Moveu o Foto/Livro',
        tom: para === 'entregue' ? 'marco' : 'normal',
      }
    }

    // O VÍDEO DO MASTER (21/09/2026), pela mesma razão do fotolivro: a ficha da
    // seção mostra este histórico, e o vídeo é o que mais se move nela.
    case 'video_master_movido': {
      const para = texto(evento.payload, 'para')
      const rotulo =
        para && para in ROTULO_FASE_VIDEO ? ROTULO_FASE_VIDEO[para as FaseVideoMaster] : null
      return {
        ...base,
        acao: rotulo ? `Moveu o vídeo para “${rotulo}”` : 'Moveu o vídeo',
        tom: para === 'concluida' ? 'marco' : 'normal',
      }
    }

    case 'video_enviado_para_entrega':
      return {
        ...base,
        acao: 'Finalizou a edição do vídeo e mandou para Entregáveis',
        tom: 'marco',
      }

    case 'video_entregue':
      return { ...base, acao: 'Confirmou a entrega do vídeo', tom: 'marco' }

    // O caminho antigo (16/09 a 21/09/2026), que concluía o vídeo na hora.
    case 'video_master_finalizado':
      return { ...base, acao: 'Finalizou o vídeo', tom: 'marco' }

    case 'fotolivro_para_aprovacao':
      return { ...base, acao: 'Mandou o Foto/Livro para aprovação, com capa e link', tom: 'marco' }

    // O termo de uso de imagem (22/09/2026). O rótulo do valor vem de
    // ROTULO_TERMO, e não de uma segunda tabela de nomes aqui.
    case 'termo_registrado': {
      const termo = texto(evento.payload, 'termo')
      return {
        ...base,
        acao: termo
          ? `Registrou o termo de imagem: ${ROTULO_TERMO[termo as TermoStatus] ?? termo}`
          : 'Registrou o termo de imagem',
        tom: 'sistema',
      }
    }

    // O ensaio Click Home (22/09/2026).
    case 'click_home_do_contrato':
      return { ...base, acao: 'Contrato inclui o ensaio Click Home', tom: 'sistema' }

    case 'fase_do_click_home_movida': {
      const para = texto(evento.payload, 'para')
      const rotulo =
        para && para in ROTULO_FASE_CLICK_HOME
          ? ROTULO_FASE_CLICK_HOME[para as FaseClickHome]
          : null
      return {
        ...base,
        acao: rotulo ? `Moveu o Click Home para “${rotulo}”` : 'Moveu o Click Home',
        tom: para === 'finalizado' ? 'marco' : 'normal',
      }
    }

    case 'click_home_para_escolha':
      return { ...base, acao: 'Mandou a galeria do Click Home para escolha', tom: 'marco' }

    case 'click_home_entregue':
      return { ...base, acao: 'Finalizou o Click Home', tom: 'marco' }

    case 'fotolivro_enviado_ao_cliente':
      return { ...base, acao: 'Enviou a prova do Foto/Livro ao cliente', tom: 'marco' }

    default:
      // Evento novo no backend: aparece feio, mas aparece.
      return { ...base, acao: evento.tipo.replace(/_/g, ' '), tom: 'sistema' }
  }
}
