import type { CasoQuadro, EtapaQuadro } from '../types'
import { ROTULO_ETAPA } from '../types'

/**
 * O alerta de aproximação: quanto falta para a próxima hora marcada do caso.
 *
 * O PEDIDO, do gestor: "esse atendimento está agendado pras dez. Nove horas, o
 * card fica amarelo pra me alertar que falta uma hora. Faltando meia hora,
 * fica vermelho. E o vermelho sai da tela a hora que alguém der play na
 * entrada — então eu sei que esse cliente já está sendo atendido."
 *
 * A REGRA VALE PARA QUALQUER ETAPA COM HORA, não só a entrada. Ele foi
 * explícito: "essa regra se aplica também aos fechamentos, ao banho". Por isso
 * a função não conhece tipo nenhum de etapa — ela procura a próxima hora
 * marcada, seja de onde for. Quando "encontro de irmãos" virar etapa no
 * cadastro, ele entra no alerta sem uma linha de código nova.
 *
 * ONDE ESTÃO AS HORAS
 *   - `caso.previsaoEm` é a hora do atendimento, vinda do Calendar. Vale
 *     enquanto o acompanhamento não começou: é a hora de chegar na
 *     maternidade.
 *   - `etapa.previsaoEm` é a hora combinada com a família para aquela etapa
 *     (banho, fechamento), lançada por quem atende.
 *
 * POR QUE "INICIOU" APAGA O ALERTA
 * O alerta responde "alguém precisa se mover"; depois do play, alguém já se
 * moveu. Manter o vermelho ali gastaria a cor mais forte da tela num caso
 * resolvido, e a cor mais forte só funciona se for rara.
 *
 * O ATRASO ALERTA POR UM TEMPO, E DEPOIS PARA
 * O gestor não falou do caso em que a hora passa e ninguém inicia. A primeira
 * versão mantinha o vermelho para sempre, e a tela respondeu na hora: seis
 * cartões piscando "atrasado 69h" — casos de dias anteriores que continuam no
 * Quadro porque um dia só sai quando todos os seus casos resolvem (invariante
 * 3.5). O alerta que deveria achar o atendimento das 10h estava competindo com
 * seis de três dias atrás, e perdendo.
 *
 * Então o alerta é sobre IMINÊNCIA, e o atraso só conta enquanto ainda é sobre
 * isso: até duas horas depois da hora marcada, alguém ainda pode chegar. Além
 * disso não é "está na hora", é "este dia está para trás" — pergunta que o
 * próprio bloco do dia já responde, com o selo "há 3 dias" e o anéis do
 * diafragma.
 */

export type NivelAlerta = 'proximo' | 'iminente'

export interface AlertaDeHorario {
  nivel: NivelAlerta
  /** "em 45 min", "agora", "atrasado 20 min". */
  rotulo: string
  /** O que está para acontecer — "Entrada", "Banho". Vai no title, não na tela. */
  oQue: string
  /** Já passou da hora e ninguém iniciou. */
  atrasado: boolean
}

/** Âmbar a partir daqui. */
const MINUTOS_PROXIMO = 60
/** Vermelho a partir daqui. */
const MINUTOS_IMINENTE = 30
/**
 * Até quanto tempo DEPOIS da hora o alerta continua.
 *
 * Duas horas é o quanto ainda se lê como "alguém está atrasado para isso".
 * Passando disso, o caso não está atrasado — o dia dele está, e quem diz isso
 * é o bloco.
 */
const MINUTOS_ATRASO_MAXIMO = 120

/** Uma etapa "não começou" enquanto ninguém deu play nem a resolveu. */
function aguardando(etapa: EtapaQuadro): boolean {
  return etapa.status === 'pendente' || etapa.status === 'atribuida'
}

/**
 * A próxima hora marcada do caso, e o que acontece nela.
 *
 * Devolve `null` quando não há nada a alertar — caso terminal, na UTI, sem
 * hora, ou com o trabalho já em movimento.
 */
export function alertaDeHorario(
  caso: CasoQuadro,
  etapas: EtapaQuadro[],
  agora: Date,
): AlertaDeHorario | null {
  // Terminal não tem próximo passo. UTI é espera de duração desconhecida: o
  // bebê está internado e não há hora marcada para nada — é por isso que a UTI
  // também congela o SLA.
  if (caso.ehTerminal || caso.naUti) return null

  const candidatos: { quando: number; oQue: string }[] = []

  const acompanhamento = etapas.filter((e) => e.trilha === 'acompanhamento')

  /*
   * A hora do caso vale só enquanto NADA do acompanhamento começou.
   *
   * Depois que a entrada foi iniciada, `previsaoEm` vira histórico: manter o
   * alerta faria um caso em pleno atendimento piscar vermelho a tarde inteira
   * porque a hora de chegada passou. É o oposto do que o alerta serve.
   *
   * Rascunho não tem etapa nenhuma, e o `every` de uma lista vazia é true —
   * o que está certo: ele tem hora no Calendar e ninguém começou nada.
   */
  const acompanhamentoParado = acompanhamento.every(aguardando)
  if (caso.previsaoEm && acompanhamentoParado) {
    candidatos.push({
      quando: new Date(caso.previsaoEm).getTime(),
      oQue: ROTULO_ETAPA.entrada,
    })
  }

  for (const etapa of acompanhamento) {
    if (!etapa.previsaoEm || !aguardando(etapa)) continue
    candidatos.push({
      quando: new Date(etapa.previsaoEm).getTime(),
      oQue: ROTULO_ETAPA[etapa.tipo],
    })
  }

  if (candidatos.length === 0) return null

  // A mais próxima manda. Duas horas marcadas no mesmo caso é o normal (o
  // banho de manhã, o fechamento à tarde) e o card só tem um alerta — o que
  // interessa é o que vem primeiro.
  const proxima = candidatos.reduce((a, b) => (a.quando <= b.quando ? a : b))
  const minutos = (proxima.quando - agora.getTime()) / 60_000

  if (minutos > MINUTOS_PROXIMO) return null
  if (minutos < -MINUTOS_ATRASO_MAXIMO) return null

  const atrasado = minutos < 0
  const nivel: NivelAlerta = minutos <= MINUTOS_IMINENTE ? 'iminente' : 'proximo'

  return { nivel, rotulo: rotular(minutos), oQue: proxima.oQue, atrasado }
}

/**
 * "em 45 min", "agora", "atrasado 1h10".
 *
 * A janela de um minuto em torno da hora vira "agora" em vez de "em 0 min" ou
 * "atrasado 0 min", que são as duas maneiras de escrever a mesma coisa de
 * forma pior.
 */
function rotular(minutos: number): string {
  if (minutos >= -1 && minutos <= 1) return 'agora'
  if (minutos > 0) return `em ${Math.round(minutos)} min`

  const atraso = Math.round(-minutos)
  if (atraso < 60) return `atrasado ${atraso} min`
  const horas = Math.floor(atraso / 60)
  const resto = atraso % 60
  return `atrasado ${horas}h${resto > 0 ? String(resto).padStart(2, '0') : ''}`
}
