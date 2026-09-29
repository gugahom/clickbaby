import { ROTULO_ETAPA, type EtapaTipo } from '@/features/quadro/types'
import { hojeNoFuso } from '@/lib/formato'

/**
 * AS MÉTRICAS COMEÇAM EM 01/10/2026 (decisão do gestor, 28/09).
 *
 * ESPELHO de `inicio_das_metricas()` no banco (migration 20260929020655). Quem
 * garante é o banco — toda função de métrica aplica o piso por dentro, e pedir
 * setembro devolve vazio. Esta constante existe só para a TELA não oferecer um
 * mês que o banco vai recusar, e para dizer em voz alta desde quando conta.
 * Mudou lá, muda aqui.
 */
export const INICIO_DAS_METRICAS = '2026-10-01'

/**
 * O "HOJE" DO RELATÓRIO. Em produção é hoje, e ponto.
 *
 * SÓ EM DESENVOLVIMENTO, a tela abre como se fosse o ÚLTIMO DIA DOS DADOS
 * FICTÍCIOS (29/09/2026, pedido do gestor: "coloca dados fictícios pra eu
 * poder analisar" e, depois, "quero os dados fictícios" — com a data real eles
 * não apareciam). Os dados do banco local vão de outubro de 2026 a dezembro de
 * 2027, no futuro, e o gráfico só desenha o que já passou.
 *   `?hoje=2027-06-15` simula outro dia;
 *   `?hoje=real` volta à data de verdade.
 * Um selo no topo diz sempre qual está valendo.
 * `import.meta.env.DEV` vira `false` no build, e o ramo inteiro some do bundle
 * publicado: em produção não existe data simulada, nem por engano.
 */
export function hojeDoRelatorio(): { hoje: string; simulado: boolean } {
  if (import.meta.env.DEV) {
    const pedido = new URLSearchParams(window.location.search).get('hoje')
    if (pedido === 'real') return { hoje: hojeNoFuso(), simulado: false }
    if (pedido && /^\d{4}-\d{2}-\d{2}$/.test(pedido)) return { hoje: pedido, simulado: true }
    return { hoje: FIM_DOS_DADOS_FICTICIOS, simulado: true }
  }
  return { hoje: hojeNoFuso(), simulado: false }
}

/** Último dia de `scripts/seed-metricas-ficticias.sql`. Mudou lá, muda aqui. */
const FIM_DOS_DADOS_FICTICIOS = '2027-12-31'

/**
 * Amostra mínima para uma taxa entrar em ranking. Com um mês de dados, a
 * diferença entre 3 de 4 e 4 de 4 é sorte, não desempenho.
 */
export const AMOSTRA_MINIMA = 5

/**
 * A ORDEM DE LEITURA das etapas no relatório: campo primeiro, na ordem em que
 * acontecem, depois a edição. Tipos que ninguém fez no período não aparecem.
 */
export const ORDEM_DAS_ETAPAS: EtapaTipo[] = [
  'entrada',
  'nascimento',
  'banho',
  'fechamento',
  'encontro_irmaos',
  'saida_uti',
  'alta',
  'edicao_foto',
  'reels',
  'edicao_video',
  'album',
  'click_home',
]

/**
 * As que têm PRAZO contado contra o vencimento do caso. Espelho do filtro de
 * `metricas_por_etapa`: vídeo, Foto/Livro e New Born têm prazo combinado caso
 * a caso, e o vencimento do pacote não diz nada sobre eles.
 */
export const ETAPAS_COM_PRAZO = new Set<EtapaTipo>(['edicao_foto', 'reels'])

/** O rótulo da etapa no relatório — o mesmo do Quadro, com uma exceção curta. */
export function rotuloDaEtapa(tipo: EtapaTipo): string {
  // "Edição de fotos" é longo demais para uma coluna de ranking e para a
  // legenda de um gráfico; "Fotos" é como a equipe fala.
  if (tipo === 'edicao_foto') return 'Fotos'
  if (tipo === 'edicao_video') return 'Vídeo'
  return ROTULO_ETAPA[tipo]
}

/** 95 -> "1h35"; 42 -> "42min"; 0,4 -> "<1min". */
export function formatarMinutos(minutos: number | null): string {
  if (minutos === null || Number.isNaN(minutos)) return '—'
  if (minutos < 1) return '<1min'
  const inteiro = Math.round(minutos)
  if (inteiro < 60) return `${inteiro}min`
  const h = Math.floor(inteiro / 60)
  const m = inteiro % 60
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`
}

/** Horas com uma casa: 29,5h. */
export function formatarHoras(horas: number | null): string {
  if (horas === null || Number.isNaN(horas)) return '—'
  return `${horas.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}h`
}

/** 0,84 -> "84%". Nulo quando não há base. */
export function formatarPercentual(parte: number, todo: number): string {
  if (todo === 0) return '—'
  return `${Math.round((100 * parte) / todo)}%`
}

// ---------------------------------------------------------------------------
// O PERÍODO: um mês por vez, como no relatório de despesas.
// ---------------------------------------------------------------------------

/** 'YYYY-MM' do mês em que as métricas começam. */
export const MES_INICIAL = INICIO_DAS_METRICAS.slice(0, 7)

/**
 * O mês que a tela abre: o atual, mas nunca antes do piso. Antes de 01/10 a
 * tela já abre em outubro — vazio em produção, e com os dados fictícios no
 * banco local, que são de outubro exatamente por isso.
 */
export function mesPadrao(hoje: string): string {
  const atual = hoje.slice(0, 7)
  return atual < MES_INICIAL ? MES_INICIAL : atual
}

export function deslocarMes(mes: string, delta: number): string {
  const [ano = 1970, m = 1] = mes.split('-').map(Number)
  const total = ano * 12 + (m - 1) + delta
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
}

/** '2026-10' -> { inicio: '2026-10-01', fim: '2026-10-31' } — fim INCLUSIVO, como o banco pede. */
export function periodoDoMes(mes: string): { inicio: string; fim: string } {
  const [ano = 1970, m = 1] = mes.split('-').map(Number)
  const ultimo = new Date(Date.UTC(ano, m, 0)).getUTCDate()
  return { inicio: `${mes}-01`, fim: `${mes}-${String(ultimo).padStart(2, '0')}` }
}

/** '2026-10' -> 'Outubro de 2026'. Meio-dia UTC para nenhum fuso empurrar o mês. */
export function rotuloDoMes(mes: string): string {
  const texto = new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${mes}-01T12:00:00Z`))
  return texto.replace(/^./, (l) => l.toUpperCase())
}

const DIA = 86_400_000
const emMs = (data: string) => Date.parse(`${data}T12:00:00Z`)

/**
 * Quantos dias do pedaço JÁ PASSARAM e contam: do mais tarde entre o começo e o
 * piso das métricas ao mais cedo entre o fim e hoje. Zero para um pedaço
 * inteiro no futuro ou antes de 01/10/2026 — e é o zero que faz a tela
 * desenhar "sem dado" em vez de uma coluna rasa.
 */
export function diasCorridos(periodo: { inicio: string; fim: string }, hoje: string): number {
  const de = Math.max(emMs(periodo.inicio), emMs(INICIO_DAS_METRICAS))
  const ate = Math.min(emMs(periodo.fim), emMs(hoje))
  return ate < de ? 0 : Math.round((ate - de) / DIA) + 1
}

function nomeDoMes(data: string, formato: 'short' | 'long'): string {
  return new Intl.DateTimeFormat('pt-BR', { month: formato, timeZone: 'UTC' })
    .format(new Date(`${data}T12:00:00Z`))
    .replace('.', '')
}

const paraData = (ms: number) => new Date(ms).toISOString().slice(0, 10)

/** '2027-12-31' + 1 -> '2028-01-01'. */
export function somarDias(data: string, dias: number): string {
  return paraData(emMs(data) + dias * DIA)
}

/** '2027-12-31' - 1 ano -> '2026-12-31'. 29/02 cai em 28/02. */
export function somarAnos(data: string, anos: number): string {
  const ano = Number(data.slice(0, 4)) + anos
  const resto = data.slice(4) === '-02-29' ? '-02-28' : data.slice(4)
  return `${ano}${resto}`
}

/** '2027-12-31' -> '31/12/2027'. */
export const dataCurta = (data: string) => data.split('-').reverse().join('/')

export type Janela = 'semana' | '30dias' | 'ano'

/**
 * AS JANELAS DO GRÁFICO (29/09/2026, pedido do gestor: "última semana, últimos
 * 30 dias, último ano", no lugar das comparações mês a mês). Todas terminam na
 * ÂNCORA — hoje, ou o último dia do mês escolhido no topo quando ele já passou,
 * para o gráfico continuar falando do mês que está na tela.
 *
 * A anterior é a janela de mesmo tamanho logo antes: é contra ela que o selo
 * do gráfico diz "subiu" ou "caiu".
 */
export function janelaDoGrafico(
  janela: Janela,
  ancora: string,
): { atual: { inicio: string; fim: string }; anterior: { inicio: string; fim: string }; grao: 'dia' | 'mes' } {
  if (janela === 'ano') {
    // Doze meses de calendário, o último até a âncora.
    const inicio = `${deslocarMes(ancora.slice(0, 7), -11)}-01`
    return {
      atual: { inicio, fim: ancora },
      anterior: { inicio: `${deslocarMes(inicio.slice(0, 7), -12)}-01`, fim: somarDias(inicio, -1) },
      grao: 'mes',
    }
  }
  const dias = janela === 'semana' ? 7 : 30
  const inicio = somarDias(ancora, -(dias - 1))
  return {
    atual: { inicio, fim: ancora },
    anterior: { inicio: somarDias(inicio, -dias), fim: somarDias(inicio, -1) },
    grao: 'dia',
  }
}

/** No eixo: "15/12" num dia, "out" num mês, "1–7" num bloco. */
export function rotuloCurtoDoPedaco(pedaco: { inicio: string; fim: string }, grao: 'dia' | 'bloco' | 'mes'): string {
  if (grao === 'mes') return nomeDoMes(pedaco.inicio, 'short')
  if (grao === 'dia') return `${pedaco.inicio.slice(8)}/${pedaco.inicio.slice(5, 7)}`
  return `${Number(pedaco.inicio.slice(8))}–${Number(pedaco.fim.slice(8))}`
}

/** Na dica: "ter, 15 de dezembro", "Outubro de 2026", "1 a 7 de outubro". */
export function rotuloLongoDoPedaco(pedaco: { inicio: string; fim: string }, grao: 'dia' | 'bloco' | 'mes'): string {
  if (grao === 'mes') return rotuloDoMes(pedaco.inicio.slice(0, 7))
  if (grao === 'dia') {
    return new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: 'numeric', month: 'long', timeZone: 'UTC' })
      .format(new Date(`${pedaco.inicio}T12:00:00Z`))
      .replace('.', '')
  }
  return `${Number(pedaco.inicio.slice(8))} a ${Number(pedaco.fim.slice(8))} de ${nomeDoMes(pedaco.inicio, 'long')}`
}

/** Só o primeiro nome, que é como a equipe se chama no corredor e no ranking. */
export function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? nome
}
