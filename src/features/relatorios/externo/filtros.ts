/**
 * OS FILTROS DO RELATÓRIO EXTERNO (29/09/2026, pedido do gestor: "como SóCarrão
 * ou Webmotors, um filtro bem completo (…) de misturar vários tipos de filtros
 * para chegar num denominador comum").
 *
 * O objeto `FiltrosDaOperacao` é o MESMO que vai ao banco (`operacao_marcas`,
 * migration 20260929233525) e o mesmo que mora no ENDEREÇO da página — um link
 * leva a busca junto, e o "voltar" do navegador desfaz o último filtro. Os
 * classificados de referência não fazem isso; aqui sai de graça.
 *
 * DENTRO DE UM GRUPO as opções somam (HSC ou HNSG); ENTRE GRUPOS, cortam (HSC e
 * atrasado). É a regra do banco, dita aqui só para quem lê a tela.
 *
 * CADA FILTRO APLICADO VIRA UMA COLUNA (30/09/2026, pedido do gestor): a lista
 * abre com quatro colunas — data, mãe/bebê, maternidade, pacote — e cada grupo
 * que ganha filtro acrescenta a sua à direita, na ORDEM em que foi aplicado. É
 * por isso que `FiltrosDaOperacao` guarda essa ordem, e o endereço a respeita.
 */
import type { Database } from '@/types/database'

export type TipoDeLink = Database['public']['Enums']['tipo_entregavel']

export type GrupoDeLista =
  | 'links'
  | 'equipamentos'
  | 'situacoes'
  | 'prazos'
  | 'maternidades'
  | 'pacotes'
  | 'pessoas'
  | 'etapas'
  | 'adicionais'
  | 'termos'
  | 'turnos'
  | 'dias_semana'

export type GrupoSimNao = 'uti' | 'handoff' | 'reaberto' | 'avaliado' | 'com_despesa'

export type Faixa = 'horas' | 'despesa'

export interface FiltrosDaOperacao {
  /** 'YYYY-MM-DD', inclusivo. Sem os dois = todo o período. */
  de?: string | undefined
  ate?: string | undefined
  busca?: string | undefined
  listas: Record<GrupoDeLista, string[]>
  simNao: Partial<Record<GrupoSimNao, boolean>>
  horas_min?: number | undefined
  horas_max?: number | undefined
  despesa_min?: number | undefined
  despesa_max?: number | undefined
  /**
   * A ORDEM em que os grupos ganharam filtro — a ordem das colunas. Guarda os
   * ids dos grupos (e 'horas' e 'despesa' para as faixas); o que saiu da lista
   * de ativos é ignorado, e o que entrou vai para o fim.
   */
  ordem?: string[] | undefined
}

export const GRUPOS_DE_LISTA: GrupoDeLista[] = [
  'links',
  'equipamentos',
  'situacoes',
  'prazos',
  'maternidades',
  'pacotes',
  'pessoas',
  'etapas',
  'adicionais',
  'termos',
  'turnos',
  'dias_semana',
]

export const GRUPOS_SIM_NAO: GrupoSimNao[] = ['uti', 'handoff', 'reaberto', 'avaliado', 'com_despesa']

export const TITULO_DO_GRUPO: Record<GrupoDeLista | GrupoSimNao, string> = {
  links: 'Links',
  equipamentos: 'Equipamento',
  situacoes: 'Situação',
  prazos: 'Prazo',
  maternidades: 'Maternidade',
  pacotes: 'Pacote',
  pessoas: 'Quem fez',
  etapas: 'Na etapa',
  adicionais: 'Adicionais',
  termos: 'Termo de imagem',
  turnos: 'Horário do parto',
  dias_semana: 'Dia da semana',
  uti: 'Passou pela UTI',
  handoff: 'Teve passagem de turno',
  reaberto: 'Voltou para ajuste',
  avaliado: 'Avaliação feita',
  com_despesa: 'Teve despesa',
}

/**
 * As opções dos grupos que o banco não rotula (os outros — maternidade, pacote,
 * pessoa — vêm com o nome na contagem). A ORDEM é a de leitura, não a de
 * contagem: situação e prazo contam uma história, do começo ao fim.
 */
/** Os tipos de link, com o nome da lista de links do caso (`Entregaveis`). */
export const ROTULO_DO_LINK: Record<TipoDeLink, string> = {
  google_photos: 'Google Photos',
  wetransfer: 'WeTransfer',
  cadeado: 'Cadeado',
  reels: 'Reels',
  album: 'Foto/Livro',
  video: 'Vídeo',
  video_wetransfer: 'WeTransfer do vídeo',
  click_home: 'Galeria do New Born',
  google_drive: 'Google Drive',
}

export const OPCOES_FIXAS: Partial<Record<GrupoDeLista, { valor: string; rotulo: string }[]>> = {
  links: [
    ...(Object.entries(ROTULO_DO_LINK) as [TipoDeLink, string][]).map(([valor, rotulo]) => ({ valor, rotulo })),
    { valor: 'nenhum', rotulo: 'Sem nenhum link' },
  ],
  situacoes: [
    { valor: 'aberto', rotulo: 'Em andamento' },
    { valor: 'em_entregaveis', rotulo: 'Em Entregáveis' },
    { valor: 'encerrado', rotulo: 'Entregue' },
    { valor: 'cancelado_equipe', rotulo: 'Cancelado pela equipe' },
    { valor: 'cancelado_agenda', rotulo: 'Cancelado pela agenda' },
    { valor: 'rascunho', rotulo: 'Rascunho pendente' },
  ],
  prazos: [
    { valor: 'no_prazo', rotulo: 'Enviado no prazo' },
    { valor: 'atrasado', rotulo: 'Enviado atrasado' },
    { valor: 'vencido', rotulo: 'Vencido sem envio' },
    { valor: 'correndo', rotulo: 'Dentro do prazo' },
    { valor: 'sem_prazo', rotulo: 'Sem prazo' },
  ],
  adicionais: [
    { valor: 'new_born', rotulo: 'New Born' },
    { valor: 'fotolivro', rotulo: 'Foto/Livro' },
    { valor: 'video_master', rotulo: 'Vídeo MASTER' },
  ],
  termos: [
    { valor: 'assinado', rotulo: 'Autorizado' },
    { valor: 'nao_autorizado', rotulo: 'Não autorizado' },
    { valor: 'pendente', rotulo: 'Ass pendente' },
    { valor: 'sem_contrato', rotulo: 'Sem contrato' },
    { valor: 'sem_resposta', rotulo: 'Sem resposta' },
  ],
  turnos: [
    { valor: 'madrugada', rotulo: 'Madrugada (0h–6h)' },
    { valor: 'manha', rotulo: 'Manhã (6h–12h)' },
    { valor: 'tarde', rotulo: 'Tarde (12h–18h)' },
    { valor: 'noite', rotulo: 'Noite (18h–24h)' },
  ],
  dias_semana: [
    { valor: '1', rotulo: 'Segunda' },
    { valor: '2', rotulo: 'Terça' },
    { valor: '3', rotulo: 'Quarta' },
    { valor: '4', rotulo: 'Quinta' },
    { valor: '5', rotulo: 'Sexta' },
    { valor: '6', rotulo: 'Sábado' },
    { valor: '7', rotulo: 'Domingo' },
  ],
}

export function rotuloFixo(grupo: GrupoDeLista, valor: string): string | undefined {
  if (grupo === 'equipamentos') return rotuloDoEquipamento(valor)
  return OPCOES_FIXAS[grupo]?.find((o) => o.valor === valor)?.rotulo
}

/** "cel:CEL CLICK 3" -> "Celular · CEL CLICK 3"; "cartao:14 HSC" -> "Cartão · 14 HSC". */
export function rotuloDoEquipamento(valor: string): string {
  if (valor.startsWith('cel:')) return `Celular · ${valor.slice(4)}`
  if (valor.startsWith('cartao:')) return `Cartão · ${valor.slice(7)}`
  return valor
}

export type Ordem = 'recentes' | 'antigos' | 'mais_horas' | 'mais_despesas' | 'maternidade'

/** O padrão da tela desde 30/09/2026 (pedido do gestor): do mais antigo ao mais recente. */
export const ORDEM_PADRAO: Ordem = 'antigos'

export const ORDENS: { id: Ordem; rotulo: string }[] = [
  { id: 'antigos', rotulo: 'Mais antigos' },
  { id: 'recentes', rotulo: 'Mais recentes' },
  { id: 'mais_horas', rotulo: 'Mais horas até o envio' },
  { id: 'mais_despesas', rotulo: 'Mais despesas' },
  { id: 'maternidade', rotulo: 'Maternidade' },
]

// ---------------------------------------------------------------------------
// O ENDEREÇO DA PÁGINA
// ---------------------------------------------------------------------------
//
// Listas viram "a,b,c"; sim/não, "sim"/"nao". Sem `de` nem `ate` no endereço, a
// tela usa o mês corrente — e "todo o período" se escreve `tudo=1`, para não se
// confundir com "ninguém escolheu ainda".

const vazios = (): Record<GrupoDeLista, string[]> =>
  Object.fromEntries(GRUPOS_DE_LISTA.map((g) => [g, []])) as unknown as Record<GrupoDeLista, string[]>

const numero = (texto: string | null): number | undefined => {
  if (texto === null || texto.trim() === '') return undefined
  const n = Number(texto.replace(',', '.'))
  return Number.isFinite(n) ? n : undefined
}

export function lerDoEndereco(
  params: URLSearchParams,
  periodoPadrao: { inicio: string; fim: string },
): FiltrosDaOperacao {
  const listas = vazios()
  for (const g of GRUPOS_DE_LISTA) {
    const v = params.get(g)
    if (v) listas[g] = v.split(',').filter(Boolean)
  }
  const simNao: Partial<Record<GrupoSimNao, boolean>> = {}
  for (const g of GRUPOS_SIM_NAO) {
    const v = params.get(g)
    if (v === 'sim') simNao[g] = true
    if (v === 'nao') simNao[g] = false
  }
  // A ordem das colunas é a ordem dos parâmetros no endereço — ver
  // `escreverNoEndereco`, que a preserva.
  const ordem: string[] = []
  for (const k of params.keys()) {
    const chave = k.startsWith('horas_') ? 'horas' : k.startsWith('despesa_') ? 'despesa' : k
    if (!ordem.includes(chave)) ordem.push(chave)
  }
  const tudo = params.get('tudo') === '1'
  const de = params.get('de') ?? undefined
  const ate = params.get('ate') ?? undefined
  const semData = !tudo && de === undefined && ate === undefined
  return {
    de: semData ? periodoPadrao.inicio : de,
    ate: semData ? periodoPadrao.fim : ate,
    busca: params.get('busca') ?? undefined,
    listas,
    simNao,
    horas_min: numero(params.get('horas_min')),
    horas_max: numero(params.get('horas_max')),
    despesa_min: numero(params.get('despesa_min')),
    despesa_max: numero(params.get('despesa_max')),
    ordem,
  }
}

/** Os grupos (e faixas) com filtro aplicado, na ordem em que foram aplicados. */
export function gruposAtivos(f: FiltrosDaOperacao): string[] {
  const ativos = [
    ...GRUPOS_DE_LISTA.filter((g) => f.listas[g].length > 0),
    ...GRUPOS_SIM_NAO.filter((g) => f.simNao[g] !== undefined),
    ...(f.horas_min !== undefined || f.horas_max !== undefined ? ['horas'] : []),
    ...(f.despesa_min !== undefined || f.despesa_max !== undefined ? ['despesa'] : []),
  ]
  const antes = (f.ordem ?? []).filter((g) => ativos.includes(g))
  return [...antes, ...ativos.filter((g) => !antes.includes(g))]
}

export function escreverNoEndereco(f: FiltrosDaOperacao, extras: Record<string, string | undefined>): URLSearchParams {
  const p = new URLSearchParams()
  if (f.de) p.set('de', f.de)
  if (f.ate) p.set('ate', f.ate)
  if (!f.de && !f.ate) p.set('tudo', '1')
  if (f.busca) p.set('busca', f.busca)
  // Na ORDEM em que os grupos foram aplicados: é ela que ordena as colunas.
  for (const g of gruposAtivos(f)) {
    if ((GRUPOS_DE_LISTA as string[]).includes(g)) p.set(g, f.listas[g as GrupoDeLista].join(','))
    else if ((GRUPOS_SIM_NAO as string[]).includes(g)) p.set(g, f.simNao[g as GrupoSimNao] ? 'sim' : 'nao')
    else {
      for (const k of g === 'horas' ? (['horas_min', 'horas_max'] as const) : (['despesa_min', 'despesa_max'] as const)) {
        const v = f[k]
        if (v !== undefined) p.set(k, String(v))
      }
    }
  }
  for (const [k, v] of Object.entries(extras)) if (v) p.set(k, v)
  return p
}

/** O objeto que o banco lê (`operacao_marcas`). */
export function paraOBanco(f: FiltrosDaOperacao): Record<string, unknown> {
  return {
    de: f.de ?? null,
    ate: f.ate ?? null,
    busca: f.busca ?? '',
    ...f.listas,
    ...f.simNao,
    horas_min: f.horas_min ?? null,
    horas_max: f.horas_max ?? null,
    despesa_min: f.despesa_min ?? null,
    despesa_max: f.despesa_max ?? null,
  }
}

/** Quantos filtros estão marcados, fora o período — o número do "Filtros (3)". */
export function quantosFiltros(f: FiltrosDaOperacao): number {
  return (
    GRUPOS_DE_LISTA.reduce((acc, g) => acc + f.listas[g].length, 0) +
    Object.keys(f.simNao).length +
    (f.busca ? 1 : 0) +
    (f.horas_min !== undefined || f.horas_max !== undefined ? 1 : 0) +
    (f.despesa_min !== undefined || f.despesa_max !== undefined ? 1 : 0)
  )
}

export function semFiltros(f: FiltrosDaOperacao): FiltrosDaOperacao {
  return { de: f.de, ate: f.ate, listas: vazios(), simNao: {} }
}

/**
 * AS COLUNAS QUE OS FILTROS ACRESCENTAM, na ordem em que foram aplicados.
 *   * cada TIPO DE LINK marcado é uma coluna — o link do Google numa, o do
 *     WeTransfer em outra (o exemplo do gestor); "sem nenhum link" não tem o
 *     que mostrar;
 *   * "Quem fez" e "Na etapa" são uma condição só, e uma coluna só;
 *   * maternidade e pacote já são colunas fixas;
 *   * período e busca por nome não acrescentam nada — a data e o nome já estão.
 */
export type ColunaDoFiltro =
  | { tipo: 'link'; link: TipoDeLink }
  | { tipo: 'trabalho' }
  | { tipo: 'grupo'; grupo: Exclude<GrupoDeLista, 'links' | 'maternidades' | 'pacotes' | 'pessoas' | 'etapas'> }
  | { tipo: 'simNao'; grupo: GrupoSimNao }
  | { tipo: 'faixa'; faixa: Faixa }

export function colunasDosFiltros(f: FiltrosDaOperacao): ColunaDoFiltro[] {
  const colunas: ColunaDoFiltro[] = []
  for (const g of gruposAtivos(f)) {
    if (g === 'links') {
      for (const l of f.listas.links) if (l !== 'nenhum') colunas.push({ tipo: 'link', link: l as TipoDeLink })
    } else if (g === 'pessoas' || g === 'etapas') {
      if (!colunas.some((c) => c.tipo === 'trabalho')) colunas.push({ tipo: 'trabalho' })
    } else if (g === 'maternidades' || g === 'pacotes') {
      continue
    } else if (g === 'horas' || g === 'despesa') {
      colunas.push({ tipo: 'faixa', faixa: g })
    } else if ((GRUPOS_SIM_NAO as string[]).includes(g)) {
      colunas.push({ tipo: 'simNao', grupo: g as GrupoSimNao })
    } else {
      colunas.push({ tipo: 'grupo', grupo: g as Exclude<GrupoDeLista, 'links' | 'maternidades' | 'pacotes' | 'pessoas' | 'etapas'> })
    }
  }
  return colunas
}
