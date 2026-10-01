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
 * SÓ O QUE TEM O MEU NOME (01/10/2026, segunda volta do gestor: "entrei e
 * tinha 25 notificações (…) quero que seja o para você mesmo, quando o meu nome
 * é marcado em algum lugar"). Em 30/09 o sino tinha ficado só com "para você",
 * mas "para você" incluía o trabalho do PAPEL — rascunho pendente, entrega
 * esperando conferência — e para a gestão isso era a operação inteira de novo.
 * O papel saiu: "não é todo mundo que resolve os rascunhos". Fica o que aponta
 * para a pessoa:
 *   * a etapa ATRIBUÍDA a mim, a RENDIÇÃO que eu assumo, a ALTERAÇÃO pedida no
 *     meu trabalho;
 *   * e as URGÊNCIAS do meu trabalho — o pedido dele: "quando é alguma
 *     urgência". A hora chegando (ou estourada) de uma etapa de campo que é
 *     minha, o prazo do pacote vencido com edição minha aberta, e o aviso
 *     escrito numa etapa minha. As mesmas três que eram "gerais" até 30/09 —
 *     agora só para a dona.
 * O ADM continua achando a fila de Entregáveis pelo anel verde da aba, e os
 * rascunhos pela aba deles.
 */

export type TipoNotificacao = 'atribuida' | 'horario' | 'prazo' | 'alteracao_minha' | 'rendicao' | 'aviso'

export interface Notificacao {
  /** Estável entre renderizações: é o que o React usa de chave e o que o
   *  "já vi" compara. Muda quando a condição muda, não a cada segundo. */
  id: string
  tipo: TipoNotificacao
  /** Menor = mais urgente. Ver ORDEM. */
  peso: number
  /** Passou da hora ou do prazo: o sino pinta a linha de vermelho. */
  urgente: boolean
  titulo: string
  /** A linha de baixo: de que caso é, e o que está esperando. */
  detalhe: string
  casoId: string
  casoNome: string
  /** Quando isto passou a ser verdade — o que decide se é NOVIDADE. */
  em: string
}

/**
 * A ORDEM DA LISTA é por urgência, não por hora: a pergunta de quem abre o
 * sino é "o que eu faço agora". O relógio estourando vem antes de tudo.
 */
const ORDEM: Record<TipoNotificacao, number> = {
  horario: 0,
  atribuida: 1,
  prazo: 2,
  alteracao_minha: 3,
  rendicao: 4,
  aviso: 5,
}

/**
 * ESTAS NÃO VIRAM AVISO: a observação do vídeo, do fotolivro e do New Born é
 * onde moram os PEDIDOS DO CLIENTE (prints, link de música) — a mesma lista de
 * `SEM_FAIXA_NO_CARD` e de `SECAO_DA_ETAPA`.
 */
const SEM_AVISO = new Set<EtapaTipo>(['edicao_video', 'album', 'click_home'])

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
 * `eventos` teria o instante exato, mas custaria uma consulta a mais a cada
 * recarga do Quadro por uma precisão que o sino não usa. Sem carimbo nenhum, a
 * notificação conta como ANTIGA: é melhor deixar de pulsar por algo novo do que
 * pulsar para sempre por algo que ninguém consegue silenciar.
 */
function quando(etapa: EtapaQuadro): string {
  return etapa.atualizadoEm ?? ''
}

const aguardando = (e: EtapaQuadro) => e.status === 'pendente' || e.status === 'atribuida'

export function derivarNotificacoes({
  casos,
  etapasPorCaso,
  pessoaId,
  agora,
}: {
  casos: CasoQuadro[]
  etapasPorCaso: Map<string, EtapaQuadro[]>
  pessoaId: string | null
  agora: Date
}): Notificacao[] {
  const lista: Notificacao[] = []
  if (pessoaId === null) return lista

  for (const caso of casos) {
    // Cancelado não cobra nada de ninguém.
    if (caso.statusOperacional === 'cancelado') continue

    const etapas = etapasPorCaso.get(caso.id) ?? []
    const nome = nomeDoCaso(caso)
    const enviado = caso.liberadoParaEntregaEm !== null
    const minhas = etapas.filter((e) => e.responsavelId === pessoaId)
    if (minhas.length === 0 && !etapas.some((e) => e.proximoResponsavelId === pessoaId)) continue

    /*
     * HORA CHEGANDO OU ESTOURADA, de uma etapa de campo MINHA que ainda não
     * começou. A mesma função que pinta o card decide "está na hora" — uma
     * definição só, para o sino e o Quadro não discordarem. Ela diz O QUE é a
     * hora ("Banho", "Entrada"); o sino só toca se essa etapa, parada, é minha.
     */
    const alerta = alertaDeHorario(caso, etapas, agora)
    if (alerta && !enviado && (alerta.nivel === 'iminente' || alerta.atrasado)) {
      const dona = minhas.find(
        (e) => e.trilha === 'acompanhamento' && aguardando(e) && ROTULO_ETAPA[e.tipo] === alerta.oQue,
      )
      if (dona) {
        lista.push({
          id: `horario:${dona.id}`,
          tipo: 'horario',
          peso: ORDEM.horario,
          urgente: alerta.atrasado,
          titulo: alerta.atrasado ? `${alerta.oQue} atrasada — é sua` : `${alerta.oQue} ${alerta.rotulo} — é sua`,
          detalhe: caso.maternidadeSigla ?? 'Sem maternidade',
          casoId: caso.id,
          casoNome: nome,
          /*
           * QUANDO O ALERTA NASCEU, e não a hora marcada: esta fica no FUTURO
           * enquanto o alerta é iminente, e um carimbo futuro faria a
           * notificação parecer nova para sempre. Ela nasce quando entra na
           * janela vermelha: a hora marcada menos a janela.
           */
          em: (() => {
            const hora = dona.previsaoEm ?? caso.previsaoEm
            return hora ? new Date(new Date(hora).getTime() - MINUTOS_IMINENTE * 60_000).toISOString() : ''
          })(),
        })
      }
    }

    /*
     * PRAZO DO PACOTE VENCIDO com EDIÇÃO MINHA ainda aberta. Na UTI não: lá o
     * SLA está congelado de propósito. Uma linha por caso, não por etapa —
     * quem tem foto e reels abertos no mesmo caso atrasado tem UM problema.
     */
    const minhaEdicaoAberta = minhas.find(
      (e) => e.trilha === 'edicao' && e.status !== 'concluida' && e.status !== 'dispensada',
    )
    if (
      minhaEdicaoAberta &&
      caso.venceEm !== null &&
      !caso.ehTerminal &&
      !caso.naUti &&
      !enviado &&
      new Date(caso.venceEm).getTime() < agora.getTime()
    ) {
      lista.push({
        id: `prazo:${caso.id}`,
        tipo: 'prazo',
        peso: ORDEM.prazo,
        urgente: true,
        titulo: `Prazo vencido — ${nomeDaEtapa(minhaEdicaoAberta)} é sua`,
        detalhe: caso.pacoteNome ?? 'Sem pacote',
        casoId: caso.id,
        casoNome: nome,
        em: caso.venceEm,
      })
    }

    for (const etapa of etapas) {
      const resolvida = etapa.status === 'concluida' || etapa.status === 'dispensada'
      const minha = etapa.responsavelId === pessoaId

      // ATRIBUÍDA E AINDA NÃO COMEÇOU — a pílula vermelha que pulsa no card.
      // Tem dona e está parada.
      if (etapa.status === 'atribuida' && minha) {
        lista.push({
          id: `atribuida:${etapa.id}`,
          tipo: 'atribuida',
          peso: ORDEM.atribuida,
          urgente: false,
          titulo: `${nomeDaEtapa(etapa)} atribuída a você`,
          detalhe: 'Aguardando você dar play',
          casoId: caso.id,
          casoNome: nome,
          em: quando(etapa),
        })
      }

      // RENDIÇÃO PLANEJADA: eu assumo esta etapa na virada do turno.
      if (!resolvida && etapa.proximoResponsavelId === pessoaId) {
        lista.push({
          id: `rendicao:${etapa.id}`,
          tipo: 'rendicao',
          peso: ORDEM.rendicao,
          urgente: false,
          titulo: `Você assume ${nomeDaEtapa(etapa)} na virada`,
          detalhe: etapa.responsavelNome ? `Hoje com ${etapa.responsavelNome}` : 'Sem responsável',
          casoId: caso.id,
          casoNome: nome,
          em: quando(etapa),
        })
      }

      // VOLTOU PARA ALTERAÇÃO, no MEU trabalho.
      const emAlteracao = etapa.status === 'em_alteracao' || etapa.faseAlbum === 'pedido_de_alteracoes'
      if (emAlteracao && !resolvida && minha) {
        lista.push({
          id: `alteracao:${etapa.id}`,
          tipo: 'alteracao_minha',
          peso: ORDEM.alteracao_minha,
          urgente: false,
          titulo: `Pediram alteração no seu ${ROTULO_ETAPA[etapa.tipo]}`,
          detalhe: etapa.faseAlbum !== null ? ROTULO_FASE_ALBUM[etapa.faseAlbum] : 'Voltou para você',
          casoId: caso.id,
          casoNome: nome,
          em: quando(etapa),
        })
      }

      // AVISO ESCRITO NUMA ETAPA MINHA, ainda aberta — a pílula com megafone.
      if (minha && !resolvida && etapa.observacao && !SEM_AVISO.has(etapa.tipo)) {
        lista.push({
          id: `aviso:${etapa.id}`,
          tipo: 'aviso',
          peso: ORDEM.aviso,
          urgente: false,
          titulo: `Aviso na sua etapa de ${nomeDaEtapa(etapa)}`,
          detalhe: etapa.observacao,
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
