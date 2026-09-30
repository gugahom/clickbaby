import { formatarMoeda } from '@/lib/formato'
import type { PontoDoGrafico } from '../components/GraficoDoKpi'
import { rotuloDoMes, rotuloLongoDoPedaco, somarDias } from '../lib/metricas'
import { OPCOES_FIXAS, rotuloFixo, type FiltrosDaOperacao, type GrupoDeLista } from './filtros'

/**
 * O GRÁFICO DO RECORTE (30/09/2026, pedido do gestor: "todo filtro colocado
 * virar gráfico e planilha para exportar").
 *
 * O que se desenha são os MESMOS seis números dos cartões do recorte — casos,
 * partos, % no prazo, parto→envio, despesas, cancelados —, quebrados no tempo
 * ou por uma dimensão. Tocar num cartão escolhe o número; o eixo escolhe a
 * quebra. Os números vêm prontos do banco (`operacao_grafico`), pedaço a pedaço:
 * a mediana não se compõe, e somar aqui dois dias daria outro número.
 */

export type Metrica = 'casos' | 'partos' | 'no_prazo' | 'parto_envio' | 'despesas' | 'cancelados'

export type Eixo = 'tempo' | 'maternidade' | 'pacote' | 'situacao' | 'prazo' | 'parto_por' | 'turno' | 'dia_semana' | 'termo'

export const EIXOS: { id: Eixo; rotulo: string }[] = [
  { id: 'tempo', rotulo: 'No tempo' },
  { id: 'maternidade', rotulo: 'Por maternidade' },
  { id: 'pacote', rotulo: 'Por pacote' },
  { id: 'situacao', rotulo: 'Por situação' },
  { id: 'prazo', rotulo: 'Por prazo' },
  { id: 'parto_por', rotulo: 'Por quem fez o parto' },
  { id: 'turno', rotulo: 'Por horário do parto' },
  { id: 'dia_semana', rotulo: 'Por dia da semana' },
  { id: 'termo', rotulo: 'Por termo de imagem' },
]

/** O título da coluna na planilha. */
export const COLUNA_DO_EIXO: Record<Exclude<Eixo, 'tempo'>, string> = {
  maternidade: 'Maternidade',
  pacote: 'Pacote',
  situacao: 'Situação',
  prazo: 'Prazo',
  parto_por: 'Parto por',
  turno: 'Horário do parto',
  dia_semana: 'Dia da semana',
  termo: 'Termo de imagem',
}

/**
 * A dimensão que é também um FILTRO: tocar numa barra marca aquela opção. Quem
 * fez o parto fica de fora — o banco agrupa pelo nome, e o filtro é por pessoa.
 */
export const GRUPO_DO_EIXO: Partial<Record<Eixo, GrupoDeLista>> = {
  maternidade: 'maternidades',
  pacote: 'pacotes',
  situacao: 'situacoes',
  prazo: 'prazos',
  turno: 'turnos',
  dia_semana: 'dias_semana',
  termo: 'termos',
}

export interface LinhaDoGrafico {
  chave: string
  rotulo: string | null
  casos: number
  partos: number
  enviados: number
  noPrazo: number
  medianaHorasAteEnvio: number | null
  totalDespesas: number
  cancelados: number
}

interface DefinicaoDaMetrica {
  rotulo: string
  valor: (l: LinhaDoGrafico) => number | null
  formatar: (v: number) => string
  teto?: number
  /** As linhas da dica, embaixo do número. */
  detalhe: (l: LinhaDoGrafico) => string[]
  /** Número de volume: um dia sem caso é ZERO, não buraco. */
  volume: boolean
}

const inteiro = (v: number) => Math.round(v).toLocaleString('pt-BR')
const plural = (n: number, um: string, varios: string) => `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`

export const METRICAS: Record<Metrica, DefinicaoDaMetrica> = {
  casos: {
    rotulo: 'Casos',
    valor: (l) => l.casos,
    formatar: inteiro,
    detalhe: (l) => [plural(l.partos, 'parto', 'partos'), plural(l.cancelados, 'cancelado', 'cancelados')],
    volume: true,
  },
  partos: {
    rotulo: 'Partos',
    valor: (l) => l.partos,
    formatar: inteiro,
    detalhe: (l) => [`de ${plural(l.casos, 'caso', 'casos')}`],
    volume: true,
  },
  no_prazo: {
    rotulo: 'No prazo',
    valor: (l) => (l.enviados > 0 ? (100 * l.noPrazo) / l.enviados : null),
    formatar: (v) => `${Math.round(v)}%`,
    teto: 100,
    detalhe: (l) => [`${l.noPrazo} de ${plural(l.enviados, 'enviado', 'enviados')}`],
    volume: false,
  },
  parto_envio: {
    rotulo: 'Do parto ao envio',
    valor: (l) => l.medianaHorasAteEnvio,
    formatar: (v) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}h`,
    detalhe: (l) => [`mediana de ${plural(l.enviados, 'envio', 'envios')}`],
    volume: false,
  },
  despesas: {
    rotulo: 'Despesas',
    valor: (l) => l.totalDespesas,
    formatar: formatarMoeda,
    detalhe: (l) => [`em ${plural(l.casos, 'caso', 'casos')}`],
    volume: true,
  },
  cancelados: {
    rotulo: 'Cancelados',
    valor: (l) => l.cancelados,
    formatar: inteiro,
    detalhe: (l) => [`de ${plural(l.casos, 'caso', 'casos')}`],
    volume: true,
  },
}

const VAZIA = (chave: string): LinhaDoGrafico => ({
  chave,
  rotulo: null,
  casos: 0,
  partos: 0,
  enviados: 0,
  noPrazo: 0,
  medianaHorasAteEnvio: null,
  totalDespesas: 0,
  cancelados: 0,
})

// ---------------------------------------------------------------------------
// NO TEMPO
// ---------------------------------------------------------------------------

/** Até dois meses, um ponto por dia; mais que isso (ou "todo o período"), por mês. */
export const DIAS_NO_GRAFICO_DIARIO = 62

export function graoDoTempo(f: FiltrosDaOperacao): 'dia' | 'mes' {
  if (!f.de || !f.ate) return 'mes'
  const dias = (Date.parse(`${f.ate}T00:00:00Z`) - Date.parse(`${f.de}T00:00:00Z`)) / 86_400_000 + 1
  return dias <= DIAS_NO_GRAFICO_DIARIO ? 'dia' : 'mes'
}

const proximoMes = (mes: string) => {
  const [a, m] = mes.split('-').map(Number) as [number, number]
  return m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, '0')}-01`
}

/**
 * O eixo inteiro, com os pedaços SEM caso preenchidos: o banco só manda o que
 * tem, e um dia sem parto some da linha sem isto. Sem período ("tudo"), o eixo
 * vai do primeiro ao último mês com caso.
 */
export function linhasNoTempo(linhas: LinhaDoGrafico[], f: FiltrosDaOperacao, grao: 'dia' | 'mes'): LinhaDoGrafico[] {
  const porChave = new Map(linhas.map((l) => [l.chave, l]))
  const chaves = linhas.map((l) => l.chave).sort()
  const primeira = grao === 'dia' ? f.de : f.de ? `${f.de.slice(0, 7)}-01` : chaves[0]
  const ultima = grao === 'dia' ? f.ate : f.ate ? `${f.ate.slice(0, 7)}-01` : chaves[chaves.length - 1]
  if (!primeira || !ultima) return []
  const eixo: LinhaDoGrafico[] = []
  for (let c = primeira; c <= ultima && eixo.length < 400; c = grao === 'dia' ? somarDias(c, 1) : proximoMes(c)) {
    eixo.push(porChave.get(c) ?? VAZIA(c))
  }
  return eixo
}

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

export function pontosNoTempo(eixo: LinhaDoGrafico[], grao: 'dia' | 'mes', metrica: Metrica): PontoDoGrafico[] {
  const m = METRICAS[metrica]
  // O ano entra no rótulo só quando o eixo atravessa a virada: "out/26".
  const variosAnos = new Set(eixo.map((l) => l.chave.slice(0, 4))).size > 1
  return eixo.map((l) => ({
    rotulo:
      grao === 'dia'
        ? `${l.chave.slice(8)}/${l.chave.slice(5, 7)}`
        : `${MESES_CURTOS[Number(l.chave.slice(5, 7)) - 1]}${variosAnos ? `/${l.chave.slice(2, 4)}` : ''}`,
    rotuloLongo: grao === 'dia' ? rotuloLongoDoPedaco({ inicio: l.chave, fim: l.chave }, 'dia') : rotuloDoMes(l.chave.slice(0, 7)),
    valor: m.valor(l) ?? (m.volume ? 0 : null),
    detalhe: l.casos > 0 ? m.detalhe(l) : ['nenhum caso'],
  }))
}

// ---------------------------------------------------------------------------
// POR DIMENSÃO
// ---------------------------------------------------------------------------

const SEM: Partial<Record<Eixo, string>> = { turno: 'Sem horário' }

export function rotuloDaLinha(eixo: Eixo, l: LinhaDoGrafico): string {
  if (l.rotulo) return l.rotulo
  const grupo = GRUPO_DO_EIXO[eixo]
  if (l.chave === 'sem') return SEM[eixo] ?? '—'
  return (grupo && rotuloFixo(grupo, l.chave)) ?? l.chave
}

/**
 * A ORDEM das barras: as dimensões que contam uma história (situação, prazo,
 * turno, dia da semana, termo) ficam na ordem de leitura dos filtros; as
 * abertas (maternidade, pacote, pessoa), do maior para o menor.
 */
export function ordenarPorDimensao(eixo: Eixo, linhas: LinhaDoGrafico[], metrica: Metrica): LinhaDoGrafico[] {
  const grupo = GRUPO_DO_EIXO[eixo]
  const fixa = grupo ? OPCOES_FIXAS[grupo]?.map((o) => o.valor) : undefined
  if (fixa) {
    const ordem = (c: string) => {
      const i = fixa.indexOf(c)
      return i === -1 ? 99 : i
    }
    return [...linhas].sort((a, b) => ordem(a.chave) - ordem(b.chave))
  }
  const v = (l: LinhaDoGrafico) => METRICAS[metrica].valor(l) ?? -1
  return [...linhas].sort((a, b) => v(b) - v(a) || rotuloDaLinha(eixo, a).localeCompare(rotuloDaLinha(eixo, b), 'pt-BR'))
}
