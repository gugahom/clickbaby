import type { EtapaTipo } from '@/features/quadro/types'
import type {
  MetricaDaEquipe,
  MetricaPorEtapa,
  MetricaPorPessoa,
  PrazoDaSemana,
  PrazoDoPeriodo,
  VolumeDaSemana,
} from '../api/useMetricas'
import { AMOSTRA_MINIMA, ETAPAS_COM_PRAZO } from './metricas'

/**
 * OS KPIs DA EQUIPE — poucos números que respondem "estamos bem?".
 *
 * A primeira versão do relatório (28/09) mostrava tudo o que o banco sabia, e
 * o gestor a recusou no mesmo dia: "ficou muita informação (…) o ponto
 * principal desses dashs são KPI da equipe". Esta é a segunda: SEIS números em
 * dois grupos, cada um com a variação contra o mês anterior e a tendência da
 * semana — o que um KPI precisa para ser lido sem explicação.
 *
 *   ENTREGA   prazo cumprido · do parto ao envio · voltou para ajuste
 *   PRODUÇÃO  partos · edições · tempo de edição de fotos
 *
 * A qualidade do registro, que tinha um cartão inteiro, virou UMA LINHA embaixo
 * do tempo de edição ("65% com relógio"): é lá que ela muda a leitura, e é só
 * lá que ela precisa aparecer.
 */

/** Etapas que contam como EDIÇÃO entregue. */
export const ETAPAS_DE_EDICAO: EtapaTipo[] = ['edicao_foto', 'reels', 'edicao_video', 'album', 'click_home']

export type Tom = 'bom' | 'ruim' | 'neutro'

export interface Variacao {
  texto: string
  tom: Tom
  direcao: 'sobe' | 'desce' | 'igual'
}

export interface Kpi {
  chave: string
  rotulo: string
  valor: string
  detalhe?: string | undefined
  variacao?: Variacao | undefined
  /** Semana a semana dentro do mês — a mini-linha do cartão. */
  tendencia?: (number | null)[] | undefined
}

export interface PeriodoDosKpis {
  prazo: PrazoDoPeriodo
  equipe: MetricaDaEquipe[]
  pessoas: MetricaPorPessoa[]
}

function numeros({ prazo, equipe, pessoas }: PeriodoDosKpis) {
  const de = (tipo: EtapaTipo) => equipe.find((e) => e.tipo === tipo)
  const edicoes = ETAPAS_DE_EDICAO.reduce((acc, t) => acc + (de(t)?.concluidas ?? 0), 0)
  const edicoesMedidas = ETAPAS_DE_EDICAO.reduce((acc, t) => acc + (de(t)?.medidas ?? 0), 0)
  const ajustes = pessoas.reduce((acc, p) => acc + p.voltouParaAjuste, 0)
  return {
    enviados: prazo.enviados,
    taxaPrazo: prazo.enviados > 0 ? prazo.noPrazo / prazo.enviados : null,
    partoAoEnvio: prazo.medianaHorasAteEnvio,
    esperaAdm: prazo.medianaHorasAteConfirmacao,
    partos: de('nascimento')?.concluidas ?? 0,
    edicoes,
    edicoesMedidas,
    ajustes,
    taxaAjuste: edicoes > 0 ? ajustes / edicoes : null,
    tempoFotos: de('edicao_foto')?.medianaMin ?? null,
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

/** Quantos dias da semana (segunda a domingo) caem dentro do período. */
function diasDaSemanaNoPeriodo(segunda: string, periodo: { inicio: string; fim: string }): number {
  const dia = 86_400_000
  const ini = Math.max(Date.parse(`${segunda}T12:00:00Z`), Date.parse(`${periodo.inicio}T12:00:00Z`))
  const fim = Math.min(Date.parse(`${segunda}T12:00:00Z`) + 6 * dia, Date.parse(`${periodo.fim}T12:00:00Z`))
  return Math.max(1, Math.round((fim - ini) / dia) + 1)
}

export function kpisDaEquipe(
  atual: PeriodoDosKpis,
  anterior: PeriodoDosKpis | null,
  semanas: PrazoDaSemana[],
  volume: VolumeDaSemana[],
  periodo: { inicio: string; fim: string },
): { entrega: Kpi[]; producao: Kpi[] } {
  const a = numeros(atual)
  // Sem mês anterior com dado (o primeiro mês das métricas), não há variação —
  // e um "+100%" contra zero seria mentira com cara de conquista.
  const b = anterior && anterior.prazo.enviados + numeros(anterior).partos > 0 ? numeros(anterior) : null

  // POR DIA, e não por semana: a primeira e a última semana do mês quase nunca
  // são inteiras (outubro de 2026 começa numa quinta), e a contagem crua de uma
  // semana de 4 dias desenhava uma "subida" que era só calendário.
  const porSemana = (tipos: EtapaTipo[]) => {
    const chaves = [...new Set(volume.map((v) => v.semana))].sort()
    return chaves.map((s) => {
      const total = volume
        .filter((v) => v.semana === s && tipos.includes(v.tipo))
        .reduce((acc, v) => acc + v.concluidas, 0)
      return total / diasDaSemanaNoPeriodo(s, periodo)
    })
  }

  return {
    entrega: [
      {
        chave: 'prazo',
        rotulo: 'Prazo cumprido',
        valor: pct(a.taxaPrazo),
        detalhe: a.enviados === 0 ? 'nenhum caso enviado' : `${atual.prazo.noPrazo} de ${a.enviados} casos`,
        variacao: variacao(a.taxaPrazo, b?.taxaPrazo ?? null, (d) => sinal(d, `${Math.abs(Math.round(d * 100))} p.p.`), 'bom'),
        tendencia: semanas.map((s) => (s.enviados > 0 ? s.noPrazo / s.enviados : null)),
      },
      {
        chave: 'parto-envio',
        rotulo: 'Do parto ao envio',
        valor: horas(a.partoAoEnvio),
        detalhe: a.esperaAdm === null ? 'mediana' : `mediana · mais ${horas(a.esperaAdm)} até o ADM`,
        variacao: variacao(a.partoAoEnvio, b?.partoAoEnvio ?? null, (d) => sinal(d, horas(Math.abs(d))), 'ruim'),
        tendencia: semanas.map((s) => s.medianaHorasAteEnvio),
      },
      {
        chave: 'ajuste',
        rotulo: 'Voltou para ajuste',
        valor: pct(a.taxaAjuste),
        detalhe: `${a.ajustes} de ${a.edicoes} edições`,
        variacao: variacao(a.taxaAjuste, b?.taxaAjuste ?? null, (d) => sinal(d, `${Math.abs(Math.round(d * 100))} p.p.`), 'ruim'),
      },
    ],
    producao: [
      {
        chave: 'partos',
        rotulo: 'Partos',
        valor: a.partos.toLocaleString('pt-BR'),
        variacao: variacao(a.partos, b?.partos ?? null, (d) => sinal(d, String(Math.abs(d))), 'neutro'),
        tendencia: porSemana(['nascimento']),
      },
      {
        chave: 'edicoes',
        rotulo: 'Edições entregues',
        valor: a.edicoes.toLocaleString('pt-BR'),
        detalhe: 'fotos, reels, vídeo e álbum',
        variacao: variacao(a.edicoes, b?.edicoes ?? null, (d) => sinal(d, String(Math.abs(d))), 'neutro'),
        tendencia: porSemana(ETAPAS_DE_EDICAO),
      },
      {
        chave: 'tempo-fotos',
        rotulo: 'Tempo de edição de fotos',
        valor: minutos(a.tempoFotos),
        // A QUALIDADE DO REGISTRO MORA AQUI: é o número que ela qualifica.
        detalhe: a.edicoes === 0 ? 'mediana' : `mediana · ${pct(a.edicoesMedidas / a.edicoes)} com relógio aberto`,
        variacao: variacao(a.tempoFotos, b?.tempoFotos ?? null, (d) => sinal(d, minutos(Math.abs(d))), 'neutro'),
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
