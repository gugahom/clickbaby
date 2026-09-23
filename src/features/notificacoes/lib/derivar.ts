import { MINUTOS_IMINENTE, alertaDeHorario } from '@/features/quadro/lib/alerta-horario'
import {
  ROTULO_ETAPA,
  ROTULO_FASE_ALBUM,
  rotuloDaRodada,
  type CasoQuadro,
  type EtapaQuadro,
  type EtapaTipo,
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
 * DUAS FAMÍLIAS, e é a divisão que o gestor pediu:
 *   MINHAS   — atribuição, rendição, alteração pedida em trabalho meu. São as
 *              que acendem o pulso: é trabalho esperando por MIM.
 *   GERAIS   — aviso escrito num card, horário estourando, trabalho liberado
 *              que ninguém pegou, prazo vencido, alteração pedida em trabalho
 *              de outra pessoa. Todo mundo vê (o Quadro já é de todo mundo),
 *              e elas entram SEM GRITAR.
 *
 * DUAS SÃO POR PAPEL: caso esperando confirmação em Entregáveis e rascunho
 * pendente são trabalho de atendimento e adm. Mandar para fotógrafa seria
 * ensinar a ignorar o sino — que é o único jeito de estragar um.
 */
export type FamiliaNotificacao = 'minha' | 'geral'

export type TipoNotificacao =
  | 'atribuida'
  | 'rendicao'
  | 'alteracao_minha'
  | 'aviso'
  | 'horario'
  | 'alteracao'
  | 'parada'
  | 'prazo'
  | 'entrega'
  | 'rascunho'

export interface Notificacao {
  /** Estável entre renderizações: é o que o React usa de chave e o que o
   *  "já vi" compara. Muda quando a condição muda, não a cada segundo. */
  id: string
  tipo: TipoNotificacao
  familia: FamiliaNotificacao
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
  horario: 1,
  alteracao_minha: 2,
  rendicao: 3,
  aviso: 4,
  prazo: 5,
  parada: 6,
  alteracao: 7,
  entrega: 8,
  rascunho: 9,
}

/**
 * ESTAS DUAS NÃO VIRAM AVISO, pela mesma razão que já as tirou da faixa
 * vermelha do card: a observação do vídeo e do fotolivro é onde moram os
 * PEDIDOS DO CLIENTE (prints, link de música), e um pedido de música dentro de
 * um vídeo de dez dias úteis tocando o sino ensinaria a equipe a ignorá-lo.
 * A lista é a mesma de `SEM_FAIXA_NO_CARD` e de `SECAO_DA_ETAPA`.
 */
const SEM_AVISO = new Set<EtapaTipo>(['edicao_video', 'album', 'click_home'])

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
  agora,
}: {
  casos: CasoQuadro[]
  etapasPorCaso: Map<string, EtapaQuadro[]>
  pessoaId: string | null
  papel: string
  agora: Date
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
        familia: 'geral',
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
        familia: 'geral',
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

    // HORÁRIO CHEGANDO OU ESTOURADO. A mesma função que pinta o card — uma
    // definição só de "está na hora", para o sino e o Quadro não discordarem.
    const alerta = alertaDeHorario(caso, etapas, agora)
    if (alerta && !enviado && (alerta.nivel === 'iminente' || alerta.atrasado)) {
      lista.push({
        id: `horario:${caso.id}:${alerta.oQue}`,
        tipo: 'horario',
        familia: 'geral',
        peso: ORDEM.horario,
        titulo: alerta.atrasado ? `${alerta.oQue} atrasada` : `${alerta.oQue} ${alerta.rotulo}`,
        detalhe: caso.maternidadeSigla ?? 'Sem maternidade',
        casoId: caso.id,
        casoNome: nome,
        /*
         * QUANDO O ALERTA NASCEU, e não a hora marcada. A hora marcada está no
         * FUTURO enquanto o alerta é iminente — e um carimbo futuro faria esta
         * notificação parecer nova para sempre e escapar de "Limpar gerais",
         * que esconde o que nasceu ATÉ o instante do clique. Ela nasce quando
         * entra na janela vermelha: a hora marcada menos a janela.
         */
        em: caso.previsaoEm
          ? new Date(
              new Date(caso.previsaoEm).getTime() - MINUTOS_IMINENTE * 60_000,
            ).toISOString()
          : '',
      })
    }

    // PRAZO DO PACOTE VENCIDO com trabalho ainda aberto. Na UTI não: lá o SLA
    // está congelado de propósito, e cobrar um prazo parado seria mentira.
    if (
      caso.venceEm !== null &&
      !caso.ehTerminal &&
      !caso.naUti &&
      !enviado &&
      new Date(caso.venceEm).getTime() < agora.getTime()
    ) {
      lista.push({
        id: `prazo:${caso.id}`,
        tipo: 'prazo',
        familia: 'geral',
        peso: ORDEM.prazo,
        titulo: 'Prazo de entrega vencido',
        detalhe: caso.pacoteNome ?? 'Sem pacote',
        casoId: caso.id,
        casoNome: nome,
        em: caso.venceEm,
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
          familia: 'minha',
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
          familia: 'minha',
          peso: ORDEM.rendicao,
          titulo: `Você assume ${nomeDaEtapa(etapa)} na virada`,
          detalhe: etapa.responsavelNome ? `Hoje com ${etapa.responsavelNome}` : 'Sem responsável',
          casoId: caso.id,
          casoNome: nome,
          em: quando(etapa),
        })
      }

      // VOLTOU PARA ALTERAÇÃO. Minha ou de outra pessoa: as duas existem, e a
      // diferença é só quem pulsa. Um vídeo em alterações sem dono nenhum é
      // trabalho que a coordenação precisa distribuir.
      const emAlteracao =
        etapa.status === 'em_alteracao' || etapa.faseAlbum === 'pedido_de_alteracoes'
      if (emAlteracao && !resolvida) {
        lista.push({
          id: `alteracao:${etapa.id}`,
          tipo: minha ? 'alteracao_minha' : 'alteracao',
          familia: minha ? 'minha' : 'geral',
          peso: minha ? ORDEM.alteracao_minha : ORDEM.alteracao,
          titulo: minha
            ? `Pediram alteração no seu ${ROTULO_ETAPA[etapa.tipo]}`
            : `${ROTULO_ETAPA[etapa.tipo]} voltou para alteração`,
          detalhe:
            etapa.faseAlbum !== null
              ? ROTULO_FASE_ALBUM[etapa.faseAlbum]
              : (etapa.responsavelNome ?? 'Sem responsável'),
          casoId: caso.id,
          casoNome: nome,
          em: quando(etapa),
        })
      }

      // AVISO ESCRITO NUMA ETAPA ABERTA — a pílula vermelha com megafone.
      if (!resolvida && etapa.observacao && !SEM_AVISO.has(etapa.tipo)) {
        lista.push({
          id: `aviso:${etapa.id}`,
          tipo: 'aviso',
          familia: 'geral',
          peso: ORDEM.aviso,
          titulo: `Aviso em ${nomeDaEtapa(etapa)}`,
          detalhe: etapa.observacao,
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
            familia: 'geral',
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
          familia: 'geral',
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
          familia: 'geral',
          peso: ORDEM.entrega,
          titulo: 'Galeria do New Born para mandar à família',
          detalhe: 'Na aba Entregáveis',
          casoId: caso.id,
          casoNome: nome,
          em: quando(etapa),
        })
      }

      // EDIÇÃO LIBERADA QUE NINGUÉM PEGOU — o anel vermelho da seção REELS.
      // Só edição: em campo, "pendente" é o estado normal de quem ainda vai
      // acontecer, e o alerta de horário já cobre a hora marcada.
      if (
        etapa.trilha === 'edicao' &&
        etapa.status === 'pendente' &&
        etapa.responsavelId === null &&
        !enviado &&
        caso.nascimentoConcluidoEm !== null
      ) {
        lista.push({
          id: `parada:${etapa.id}`,
          tipo: 'parada',
          familia: 'geral',
          peso: ORDEM.parada,
          titulo: `${nomeDaEtapa(etapa)} sem ninguém`,
          detalhe: 'Liberada para editar',
          casoId: caso.id,
          casoNome: nome,
          em: quando(etapa),
        })
      }
    }
  }

  return lista.sort((a, b) => a.peso - b.peso || b.em.localeCompare(a.em))
}

/**
 * O PULSO É SÓ DAS MINHAS (decisão do gestor).
 *
 * "Todo mundo vê, mas só as minhas pulsam." O sino fica vermelho e pulsando
 * quando existe notificação MINHA que nasceu depois da última vez que olhei;
 * as gerais entram na lista e no contador sem acender nada. Um sino que grita
 * por qualquer urgência da operação inteira grita o dia todo — e um alerta que
 * toca o dia todo é um alerta que ninguém olha, que é exatamente o defeito que
 * a faixa de avisos do card já teve.
 */
export function temNovidade(lista: Notificacao[], vistoEm: string | null): boolean {
  return lista.some((n) => n.familia === 'minha' && (vistoEm === null || n.em > vistoEm))
}
