import {
  ROTULO_ETAPA,
  ROTULO_FASE_ALBUM,
  rotuloDaRodada,
  type CasoQuadro,
  type EtapaQuadro,
} from '@/features/quadro/types'

/**
 * AS NOTIFICAÇÕES SÃO DERIVADAS, não guardadas (17/09/2026, pedido do gestor).
 *
 * A frase que decidiu o desenho foi dele: "deve manter o fluxo de quando
 * resolvido sumir nas notificações". Isso diz que a notificação não é um
 * registro — é um ESTADO VIVO. Uma tabela alimentada por gatilho obrigaria
 * toda ação do sistema a lembrar de apagar a linha correspondente, e a
 * primeira regra que alguém esquecesse viraria sino tocando por trabalho que
 * já acabou: a mesma classe de defeito de tela e banco discordando sem erro
 * que este projeto já pagou três vezes (ver seção 5 do CLAUDE.md).
 *
 * Derivado, RESOLVER É APAGAR: a etapa sai de "atribuída", o aviso é apagado,
 * o vídeo sai de "alterações" — e a notificação some porque a condição que a
 * criava deixou de ser verdade. Não há código nenhum no meio.
 *
 * SÓ "PARA VOCÊ" (30/09/2026, pedido do gestor: "vai ser só para você, e só
 * vai notificar o usuário que tiver que ser notificado mesmo"). Até aqui havia
 * duas famílias, e as GERAIS — aviso escrito num card, horário estourando,
 * edição liberada sem ninguém, prazo vencido, alteração no trabalho de outra
 * pessoa — entravam na lista de todo mundo. Elas SAÍRAM: o Quadro já mostra
 * tudo isso a quem olha, e o sino voltou a ser sobre MIM.
 *
 * O que fica:
 *   * atribuição, rendição e alteração pedida em trabalho MEU;
 *   * e, só para atendimento e adm, o trabalho do ADM — caso esperando
 *     conferência em Entregáveis, rascunho pendente, vídeo, Foto/Livro e New
 *     Born para entregar (decisão do gestor, perguntado). Não são "de uma
 *     pessoa", mas são do PAPEL de quem as recebe: é a Morgana que precisa
 *     saber. Mandar para fotógrafa seria ensinar a ignorar o sino.
 */

export type TipoNotificacao = 'atribuida' | 'rendicao' | 'alteracao_minha' | 'entrega' | 'rascunho'

export interface Notificacao {
  /** Estável entre renderizações: é o que o React usa de chave e o que o
   *  "já vi" compara. Muda quando a condição muda, não a cada segundo. */
  id: string
  tipo: TipoNotificacao
  /** Menor = mais urgente. Ver ORDEM. */
  peso: number
  titulo: string
  /** A linha de baixo: de que caso é, e o que está esperando. */
  detalhe: string
  casoId: string
  casoNome: string
  /** Quando isto passou a ser verdade — o que decide se é NOVIDADE. */
  em: string
}

/**
 * A ORDEM DA LISTA é por urgência, não por hora.
 *
 * Uma lista cronológica responde "o que aconteceu por último", e a pergunta de
 * quem abre o sino é "o que eu faço agora". O que tem dona e não começou vem
 * primeiro; o que é só informação vem por último.
 */
const ORDEM: Record<TipoNotificacao, number> = {
  atribuida: 0,
  alteracao_minha: 1,
  rendicao: 2,
  entrega: 3,
  rascunho: 4,
}

/** Papéis que recebem o trabalho de ADM: conferir entrega e resolver rascunho. */
function ehAdmOuAtendimento(papel: string): boolean {
  return papel !== 'operador'
}

/** O nome do caso como o sino mostra — mãe e bebê, como no card. */
function nomeDoCaso(caso: CasoQuadro): string {
  return caso.bebeNome ? `${caso.maeNome} · ${caso.bebeNome}` : caso.maeNome
}

/** Nome da etapa com a rodada quando ela existe ("Reels · B+F"). */
function nomeDaEtapa(etapa: EtapaQuadro): string {
  const base = ROTULO_ETAPA[etapa.tipo]
  return etapa.rodada > 1 ? `${base} · ${rotuloDaRodada(etapa.tipo, etapa.rodada)}` : base
}

/**
 * O CARIMBO DE "QUANDO ISTO COMEÇOU".
 *
 * `atualizadoEm` da etapa é aproximado (qualquer escrita o move), e basta:
 * `eventos` teria o instante exato — e é legível por toda pessoa ativa desde
 * 25/08 —, mas custaria uma consulta a mais a cada recarga do Quadro por uma
 * precisão que o sino não usa. Sem carimbo nenhum, a notificação conta como
 * ANTIGA: é melhor deixar de pulsar por algo novo do que pulsar para sempre
 * por algo que ninguém consegue silenciar.
 */
function quando(etapa: EtapaQuadro): string {
  return etapa.atualizadoEm ?? ''
}

export function derivarNotificacoes({
  casos,
  etapasPorCaso,
  pessoaId,
  papel,
}: {
  casos: CasoQuadro[]
  etapasPorCaso: Map<string, EtapaQuadro[]>
  pessoaId: string | null
  papel: string
}): Notificacao[] {
  const lista: Notificacao[] = []

  for (const caso of casos) {
    const etapas = etapasPorCaso.get(caso.id) ?? []
    const nome = nomeDoCaso(caso)
    const enviado = caso.liberadoParaEntregaEm !== null

    // Cancelado não cobra nada de ninguém, e rascunho DESCARTADO menos ainda.
    if (caso.statusOperacional === 'cancelado') continue

    /* ---------------------------------------------------------------- caso */

    // RASCUNHO PENDENTE: falta pacote ou maternidade, e sem isso o caso não
    // tem checklist. É trabalho de quem cadastra, não de quem fotografa.
    if (caso.ehRascunho && !caso.ehTerminal && ehAdmOuAtendimento(papel)) {
      lista.push({
        id: `rascunho:${caso.id}`,
        tipo: 'rascunho',
        peso: ORDEM.rascunho,
        titulo: 'Rascunho esperando confirmação',
        detalhe: caso.faltaPacote ? 'Sem pacote definido' : 'Sem maternidade definida',
        casoId: caso.id,
        casoNome: nome,
        em: caso.updatedAt ?? '',
      })
    }

    // ESPERANDO O ADM: enviado para Entregáveis e ainda não confirmado.
    if (enviado && !caso.ehTerminal && ehAdmOuAtendimento(papel)) {
      lista.push({
        id: `entrega:${caso.id}`,
        tipo: 'entrega',
        peso: ORDEM.entrega,
        titulo: 'Entrega esperando conferência',
        detalhe: caso.liberadoParaEntregaPorNome
          ? `Enviado por ${caso.liberadoParaEntregaPorNome}`
          : 'Na aba Entregáveis',
        casoId: caso.id,
        casoNome: nome,
        em: caso.liberadoParaEntregaEm ?? '',
      })
    }

    /* --------------------------------------------------------------- etapa */

    for (const etapa of etapas) {
      const resolvida = etapa.status === 'concluida' || etapa.status === 'dispensada'
      const minha = pessoaId !== null && etapa.responsavelId === pessoaId

      // ATRIBUÍDA E AINDA NÃO COMEÇOU — a pílula vermelha que pulsa no card,
      // agora também no sino. É a notificação mais importante do sistema: tem
      // dona e está parada.
      if (etapa.status === 'atribuida' && minha) {
        lista.push({
          id: `atribuida:${etapa.id}`,
          tipo: 'atribuida',
          peso: ORDEM.atribuida,
          titulo: `${nomeDaEtapa(etapa)} atribuída a você`,
          detalhe: 'Aguardando início',
          casoId: caso.id,
          casoNome: nome,
          em: quando(etapa),
        })
      }

      // RENDIÇÃO PLANEJADA: eu assumo esta etapa na virada do turno.
      if (!resolvida && pessoaId !== null && etapa.proximoResponsavelId === pessoaId) {
        lista.push({
          id: `rendicao:${etapa.id}`,
          tipo: 'rendicao',
          peso: ORDEM.rendicao,
          titulo: `Você assume ${nomeDaEtapa(etapa)} na virada`,
          detalhe: etapa.responsavelNome ? `Hoje com ${etapa.responsavelNome}` : 'Sem responsável',
          casoId: caso.id,
          casoNome: nome,
          em: quando(etapa),
        })
      }

      // VOLTOU PARA ALTERAÇÃO, no MEU trabalho. A de outra pessoa saiu com as
      // gerais (30/09/2026).
      const emAlteracao =
        etapa.status === 'em_alteracao' || etapa.faseAlbum === 'pedido_de_alteracoes'
      if (emAlteracao && !resolvida && minha) {
        lista.push({
          id: `alteracao:${etapa.id}`,
          tipo: 'alteracao_minha',
          peso: ORDEM.alteracao_minha,
          titulo: `Pediram alteração no seu ${ROTULO_ETAPA[etapa.tipo]}`,
          detalhe:
            etapa.faseAlbum !== null
              ? ROTULO_FASE_ALBUM[etapa.faseAlbum]
              : (etapa.responsavelNome ?? 'Sem responsável'),
          casoId: caso.id,
          casoNome: nome,
          em: quando(etapa),
        })
      }

      // O FOTO/LIVRO ESPERANDO O ADM (21/09/2026) — as duas passagens por
      // Entregáveis: a prova para mandar ao cliente, e o livro pronto. Mesmo
      // tipo da entrega do caso: é o mesmo trabalho, na mesma aba, do mesmo papel.
      if (etapa.tipo === 'album' && ehAdmOuAtendimento(papel)) {
        const paraAprovar =
          etapa.faseAlbum === 'aguardando_aprovacao' && etapa.fotolivroEnviadoEm === null
        const pronto = etapa.faseAlbum === 'pronto_para_entrega'
        if (paraAprovar || pronto) {
          lista.push({
            id: `fotolivro-${paraAprovar ? 'aprovacao' : 'entrega'}:${etapa.id}`,
            tipo: 'entrega',
            peso: ORDEM.entrega,
            titulo: paraAprovar ? 'Foto/Livro para mandar ao cliente' : 'Foto/Livro pronto para entregar',
            detalhe: 'Na aba Entregáveis',
            casoId: caso.id,
            casoNome: nome,
            em: quando(etapa),
          })
        }
      }

      // O VÍDEO DO MASTER TERMINADO (21/09/2026), em Entregáveis esperando o
      // ADM confirmar a entrega. Mesmo tipo da entrega do caso e do fotolivro.
      if (
        etapa.tipo === 'edicao_video' &&
        etapa.status === 'pronto_para_entrega' &&
        ehAdmOuAtendimento(papel)
      ) {
        lista.push({
          id: `video-entrega:${etapa.id}`,
          tipo: 'entrega',
          peso: ORDEM.entrega,
          titulo: 'Vídeo do MASTER pronto para entregar',
          detalhe: 'Na aba Entregáveis',
          casoId: caso.id,
          casoNome: nome,
          em: quando(etapa),
        })
      }

      // O CLICK HOME COM A GALERIA PRONTA (22/09/2026), esperando o ADM mandar
      // o link à família. Mesmo tipo dos outros dois: é o mesmo trabalho, na
      // mesma aba, do mesmo papel.
      if (
        etapa.tipo === 'click_home' &&
        etapa.faseClickHome === 'enviar_para_escolha' &&
        ehAdmOuAtendimento(papel)
      ) {
        lista.push({
          id: `click-home-entrega:${etapa.id}`,
          tipo: 'entrega',
          peso: ORDEM.entrega,
          titulo: 'Galeria do New Born para mandar à família',
          detalhe: 'Na aba Entregáveis',
          casoId: caso.id,
          casoNome: nome,
          em: quando(etapa),
        })
      }
    }
  }

  return lista.sort((a, b) => a.peso - b.peso || b.em.localeCompare(a.em))
}

/** Há notificação que nasceu depois da última vez que o sino foi aberto. */
export function temNovidade(lista: Notificacao[], vistoEm: string | null): boolean {
  return lista.some((n) => vistoEm === null || n.em > vistoEm)
}
