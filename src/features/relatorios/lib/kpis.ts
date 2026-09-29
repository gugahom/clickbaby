import type { EtapaTipo } from '@/features/quadro/types'
import type { BaldeDaSerie, MetricaPorEtapa, MetricaPorPessoa } from '../api/useMetricas'
import { AMOSTRA_MINIMA, ETAPAS_COM_PRAZO, diasCorridos, rotuloDaEtapa } from './metricas'

/**
 * OS KPIs DA EQUIPE — poucos números que respondem "estamos bem?".
 *
 * A primeira versão do relatório (28/09) mostrava tudo o que o banco sabia, e
 * o gestor a recusou no mesmo dia: "ficou muita informação (…) o ponto
 * principal desses dashs são KPI da equipe". Esta é a segunda: SEIS números em
 * dois grupos, cada um com a variação contra o mês anterior e a tendência
 * dentro do mês — o que um KPI precisa para ser lido sem explicação.
 *
 *   ENTREGA   prazo cumprido · do parto ao envio · voltou para ajuste
 *   PRODUÇÃO  partos · edições · tempo de edição de fotos
 *
 * A qualidade do registro, que tinha um cartão inteiro, virou UMA LINHA embaixo
 * do tempo de edição ("65% com relógio"): é lá que ela muda a leitura, e é só
 * lá que ela precisa aparecer.
 *
 * TUDO SAI DA MESMA SÉRIE (29/09/2026): o número do cartão é o balde do mês, a
 * mini-linha e o gráfico são os blocos de 7 dias, e o valor de cada KPI num
 * balde tem UMA definição (`GRAFICO_DO_KPI`). Cartão e gráfico não discordam
 * porque não há duas contas para discordar.
 */

/** Etapas que contam como EDIÇÃO entregue. */
export const ETAPAS_DE_EDICAO: EtapaTipo[] = ['edicao_foto', 'reels', 'edicao_video', 'album', 'click_home']

export type Tom = 'bom' | 'ruim' | 'neutro'

export interface Variacao {
  texto: string
  tom: Tom
  direcao: 'sobe' | 'desce' | 'igual'
}

export type ChaveKpi = 'prazo' | 'parto-envio' | 'ajuste' | 'partos' | 'edicoes' | 'tempo-fotos'

export interface Kpi {
  chave: ChaveKpi
  rotulo: string
  valor: string
  detalhe?: string | undefined
  variacao?: Variacao | undefined
  /** Bloco a bloco dentro do mês — a mini-linha do cartão. */
  tendencia?: (number | null)[] | undefined
}

function numeros(b: BaldeDaSerie) {
  const de = (tipo: EtapaTipo) => b.porTipo[tipo]
  const edicoes = ETAPAS_DE_EDICAO.reduce((acc, t) => acc + (de(t)?.concluidas ?? 0), 0)
  const edicoesMedidas = ETAPAS_DE_EDICAO.reduce((acc, t) => acc + (de(t)?.medidas ?? 0), 0)
  return {
    enviados: b.enviados,
    noPrazo: b.noPrazo,
    taxaPrazo: b.enviados > 0 ? b.noPrazo / b.enviados : null,
    partoAoEnvio: b.medianaHorasAteEnvio,
    esperaAdm: b.medianaHorasAteConfirmacao,
    partos: de('nascimento')?.concluidas ?? 0,
    edicoes,
    edicoesMedidas,
    ajustes: b.voltouParaAjuste,
    taxaAjuste: edicoes > 0 ? b.voltouParaAjuste / edicoes : null,
    tempoFotos: de('edicao_foto')?.medianaMin ?? null,
    fotos: de('edicao_foto'),
  }
}

const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`)
const horas = (v: number | null) =>
  v === null ? '—' : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}h`
const minutos = (v: number | null) => {
  if (v === null) return '—'
  const m = Math.round(v)
  if (m < 60) return `${m}min`
  const h = Math.floor(m / 60)
  return m % 60 === 0 ? `${h}h` : `${h}h${String(m % 60).padStart(2, '0')}`
}
const decimal = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

/**
 * A variação contra o mês anterior. A COR SAI DE "SUBIR É BOM?", não do sinal:
 * prazo subindo é bom, tempo até o envio subindo é ruim. Volume e tempo de
 * edição ficam NEUTROS — mais partos é mais agenda, não mérito de ninguém, e
 * editar mais rápido não é, sozinho, editar melhor.
 */
function variacao(
  atual: number | null,
  anterior: number | null,
  formatar: (diferenca: number) => string,
  subirE: Tom,
): Variacao | undefined {
  if (atual === null || anterior === null) return undefined
  const d = atual - anterior
  const direcao = Math.abs(d) < 1e-9 ? 'igual' : d > 0 ? 'sobe' : 'desce'
  const tom: Tom =
    direcao === 'igual' || subirE === 'neutro'
      ? 'neutro'
      : (direcao === 'sobe') === (subirE === 'bom')
        ? 'bom'
        : 'ruim'
  return { texto: formatar(d), tom, direcao }
}

const sinal = (n: number, texto: string) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${texto}`

// ---------------------------------------------------------------------------
// O GRÁFICO DE CADA KPI — o que o cartão abre ao lado.
// ---------------------------------------------------------------------------

export interface GraficoDoKpi {
  /** O que o eixo mede, quando não é o próprio número do cartão: "por dia". */
  unidade?: string | undefined
  formatar: (valor: number) => string
  /** Eixo com teto fixo — taxa vai de 0 a 100%, não de 0 ao maior valor. */
  teto?: number | undefined
  /**
   * O VALOR DO KPI num pedaço do período. `dias` são os dias que já passaram
   * e contam (`diasCorridos`); zero quer dizer "sem dado" — pedaço no futuro,
   * ou antes de 01/10/2026 —, e aí o valor é nulo, não zero.
   */
  valor: (b: BaldeDaSerie, dias: number) => number | null
  /** As linhas da dica, embaixo do número. */
  detalhe: (b: BaldeDaSerie, dias: number) => string[]
}

/**
 * VOLUME É POR DIA no gráfico, e só no gráfico. O último bloco do mês tem de 7
 * a 10 dias, o mês corrente está pela metade, fevereiro tem 28: contagem crua
 * desenharia calendário, não trabalho. O cartão continua com o total do mês,
 * que é a pergunta que ele responde; a dica traz os dois.
 */
export const GRAFICO_DO_KPI: Record<ChaveKpi, GraficoDoKpi> = {
  prazo: {
    formatar: (v) => pct(v),
    teto: 1,
    valor: (b, dias) => (dias === 0 ? null : numeros(b).taxaPrazo),
    detalhe: (b) =>
      b.enviados === 0
        ? ['nenhum caso enviado']
        : [`${b.noPrazo} de ${plural(b.enviados, 'caso', 'casos')} no prazo`, `${b.enviados - b.noPrazo} depois de vencer`],
  },
  'parto-envio': {
    formatar: (v) => horas(v),
    valor: (b, dias) => (dias === 0 ? null : b.medianaHorasAteEnvio),
    detalhe: (b) => [
      `mediana de ${plural(b.enviados, 'caso', 'casos')}`,
      ...(b.medianaHorasAteConfirmacao === null ? [] : [`mais ${horas(b.medianaHorasAteConfirmacao)} até o ADM`]),
    ],
  },
  ajuste: {
    formatar: (v) => pct(v),
    valor: (b, dias) => (dias === 0 ? null : numeros(b).taxaAjuste),
    detalhe: (b) => {
      const n = numeros(b)
      return [`${n.ajustes} de ${plural(n.edicoes, 'edição', 'edições')}`]
    },
  },
  partos: {
    unidade: 'por dia',
    formatar: decimal,
    valor: (b, dias) => (dias === 0 ? null : numeros(b).partos / dias),
    detalhe: (b, dias) => [`${plural(numeros(b).partos, 'parto', 'partos')} em ${plural(dias, 'dia', 'dias')}`],
  },
  edicoes: {
    unidade: 'por dia',
    formatar: decimal,
    valor: (b, dias) => (dias === 0 ? null : numeros(b).edicoes / dias),
    detalhe: (b, dias) => {
      const partes = ETAPAS_DE_EDICAO.filter((t) => (b.porTipo[t]?.concluidas ?? 0) > 0).map(
        (t) => `${rotuloDaEtapa(t)} ${b.porTipo[t]?.concluidas ?? 0}`,
      )
      return [
        `${plural(numeros(b).edicoes, 'edição', 'edições')} em ${plural(dias, 'dia', 'dias')}`,
        ...(partes.length > 0 ? [partes.join(' · ')] : []),
      ]
    },
  },
  'tempo-fotos': {
    formatar: (v) => minutos(v),
    valor: (b, dias) => (dias === 0 ? null : numeros(b).tempoFotos),
    detalhe: (b) => {
      const f = numeros(b).fotos
      return f ? [`mediana · ${f.medidas} de ${f.concluidas} com relógio aberto`] : ['nenhuma edição de fotos']
    },
  },
}

/** A série de um KPI, pedaço a pedaço — a mini-linha e as colunas do gráfico. */
export function serieDoKpi(chave: ChaveKpi, baldes: BaldeDaSerie[], hoje: string): (number | null)[] {
  const g = GRAFICO_DO_KPI[chave]
  return baldes.map((b) => g.valor(b, diasCorridos(b, hoje)))
}

const BALDE_VAZIO: BaldeDaSerie = {
  inicio: '',
  fim: '',
  enviados: 0,
  noPrazo: 0,
  medianaHorasAteEnvio: null,
  medianaHorasAteConfirmacao: null,
  porTipo: {},
  voltouParaAjuste: 0,
}

export function kpisDaEquipe(
  atual: BaldeDaSerie | undefined,
  anterior: BaldeDaSerie | undefined,
  blocos: BaldeDaSerie[],
  hoje: string,
): { entrega: Kpi[]; producao: Kpi[] } {
  const a = numeros(atual ?? BALDE_VAZIO)
  // Sem mês anterior com dado (o primeiro mês das métricas), não há variação —
  // e um "+100%" contra zero seria mentira com cara de conquista.
  const n = anterior ? numeros(anterior) : null
  const b = n && n.enviados + n.partos > 0 ? n : null
  const tendencia = (chave: ChaveKpi) => serieDoKpi(chave, blocos, hoje)

  return {
    entrega: [
      {
        chave: 'prazo',
        rotulo: 'Prazo cumprido',
        valor: pct(a.taxaPrazo),
        detalhe: a.enviados === 0 ? 'nenhum caso enviado' : `${a.noPrazo} de ${a.enviados} casos`,
        variacao: variacao(a.taxaPrazo, b?.taxaPrazo ?? null, (d) => sinal(d, `${Math.abs(Math.round(d * 100))} p.p.`), 'bom'),
        tendencia: tendencia('prazo'),
      },
      {
        chave: 'parto-envio',
        rotulo: 'Do parto ao envio',
        valor: horas(a.partoAoEnvio),
        detalhe: a.esperaAdm === null ? 'mediana' : `mediana · mais ${horas(a.esperaAdm)} até o ADM`,
        variacao: variacao(a.partoAoEnvio, b?.partoAoEnvio ?? null, (d) => sinal(d, horas(Math.abs(d))), 'ruim'),
        tendencia: tendencia('parto-envio'),
      },
      {
        chave: 'ajuste',
        rotulo: 'Voltou para ajuste',
        valor: pct(a.taxaAjuste),
        detalhe: `${a.ajustes} de ${a.edicoes} edições`,
        variacao: variacao(a.taxaAjuste, b?.taxaAjuste ?? null, (d) => sinal(d, `${Math.abs(Math.round(d * 100))} p.p.`), 'ruim'),
        tendencia: tendencia('ajuste'),
      },
    ],
    producao: [
      {
        chave: 'partos',
        rotulo: 'Partos',
        valor: a.partos.toLocaleString('pt-BR'),
        variacao: variacao(a.partos, b?.partos ?? null, (d) => sinal(d, String(Math.abs(d))), 'neutro'),
        tendencia: tendencia('partos'),
      },
      {
        chave: 'edicoes',
        rotulo: 'Edições entregues',
        valor: a.edicoes.toLocaleString('pt-BR'),
        detalhe: 'fotos, reels, vídeo e álbum',
        variacao: variacao(a.edicoes, b?.edicoes ?? null, (d) => sinal(d, String(Math.abs(d))), 'neutro'),
        tendencia: tendencia('edicoes'),
      },
      {
        chave: 'tempo-fotos',
        rotulo: 'Tempo de edição de fotos',
        valor: minutos(a.tempoFotos),
        // A QUALIDADE DO REGISTRO MORA AQUI: é o número que ela qualifica.
        detalhe: a.edicoes === 0 ? 'mediana' : `mediana · ${pct(a.edicoesMedidas / a.edicoes)} com relógio aberto`,
        variacao: variacao(a.tempoFotos, b?.tempoFotos ?? null, (d) => sinal(d, minutos(Math.abs(d))), 'neutro'),
        tendencia: tendencia('tempo-fotos'),
      },
    ],
  }
}

// ---------------------------------------------------------------------------
// POR PESSOA — a tabela de KPIs, que é também o ranking.
// ---------------------------------------------------------------------------

export interface LinhaDaPessoa {
  pessoaId: string
  nome: string
  partos: number
  edicoes: number
  /** Fotos e reels antes do vencimento; nulo abaixo da amostra mínima. */
  taxaPrazo: number | null
  comPrazo: number
  ajustes: number
  dias: number
  /** Etapas de campo cruzadas no tempo com outra da mesma pessoa. */
  emParalelo: number
  tempoFotos: number | null
  tempoReels: number | null
  tempoParto: number | null
  edicoesMedidas: number
  materiais: number
  passagens: number
}

export function linhasDasPessoas(porEtapa: MetricaPorEtapa[], pessoas: MetricaPorPessoa[]): LinhaDaPessoa[] {
  return pessoas
    .map((p) => {
      const dela = porEtapa.filter((m) => m.pessoaId === p.pessoaId)
      const de = (tipo: EtapaTipo) => dela.find((m) => m.tipo === tipo)
      const edicao = dela.filter((m) => ETAPAS_DE_EDICAO.includes(m.tipo))
      const comPrazo = dela.filter((m) => ETAPAS_COM_PRAZO.has(m.tipo)).reduce((acc, m) => acc + m.comPrazo, 0)
      const noPrazo = dela.filter((m) => ETAPAS_COM_PRAZO.has(m.tipo)).reduce((acc, m) => acc + m.noPrazo, 0)
      return {
        pessoaId: p.pessoaId,
        nome: p.nome,
        partos: de('nascimento')?.concluidas ?? 0,
        edicoes: edicao.reduce((acc, m) => acc + m.concluidas, 0),
        taxaPrazo: comPrazo >= AMOSTRA_MINIMA ? noPrazo / comPrazo : null,
        comPrazo,
        ajustes: p.voltouParaAjuste,
        dias: p.diasComTrabalho,
        emParalelo: dela.reduce((acc, m) => acc + m.emParalelo, 0),
        tempoFotos: de('edicao_foto')?.medianaMin ?? null,
        tempoReels: de('reels')?.medianaMin ?? null,
        tempoParto: de('nascimento')?.medianaMin ?? null,
        edicoesMedidas: edicao.reduce((acc, m) => acc + m.medidas, 0),
        materiais: p.materialBaixou + p.materialSubiu,
        passagens: p.passagensDadas + p.passagensRecebidas,
      }
    })
    // Quem não fez nada no período não entra na tabela: uma linha de zeros é
    // ruído num painel de KPI.
    .filter((l) => l.partos + l.edicoes + l.dias > 0)
}
