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
 */

export type GrupoDeLista =
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
}

export const GRUPOS_DE_LISTA: GrupoDeLista[] = [
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
export const OPCOES_FIXAS: Partial<Record<GrupoDeLista, { valor: string; rotulo: string }[]>> = {
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
  return OPCOES_FIXAS[grupo]?.find((o) => o.valor === valor)?.rotulo
}

export type Ordem = 'recentes' | 'antigos' | 'mais_horas' | 'mais_despesas' | 'maternidade'

export const ORDENS: { id: Ordem; rotulo: string }[] = [
  { id: 'recentes', rotulo: 'Mais recentes' },
  { id: 'antigos', rotulo: 'Mais antigos' },
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
  }
}

export function escreverNoEndereco(f: FiltrosDaOperacao, extras: Record<string, string | undefined>): URLSearchParams {
  const p = new URLSearchParams()
  if (f.de) p.set('de', f.de)
  if (f.ate) p.set('ate', f.ate)
  if (!f.de && !f.ate) p.set('tudo', '1')
  if (f.busca) p.set('busca', f.busca)
  for (const g of GRUPOS_DE_LISTA) if (f.listas[g].length > 0) p.set(g, f.listas[g].join(','))
  for (const g of GRUPOS_SIM_NAO) {
    const v = f.simNao[g]
    if (v !== undefined) p.set(g, v ? 'sim' : 'nao')
  }
  for (const k of ['horas_min', 'horas_max', 'despesa_min', 'despesa_max'] as const) {
    const v = f[k]
    if (v !== undefined) p.set(k, String(v))
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
