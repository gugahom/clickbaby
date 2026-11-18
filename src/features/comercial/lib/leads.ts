import type { Database } from '@/types/database'
import { FUSO } from '@/lib/formato'

/**
 * OS LEADS DO COMERCIAL — o que a tela calcula em cima da view
 * `leads_do_comercial` (18/11/2026, fase A; o desenho está em
 * docs/painel-comercial.md).
 *
 * O PRAZO, A PRIORIDADE E A FASE VÊM PRONTOS DO BANCO (prazo = DPP − 10, a
 * legenda da planilha). Aqui mora só o que é da TELA: os rótulos, a fila do
 * "Hoje" e o link do WhatsApp.
 */

type Enums = Database['public']['Enums']
export type OrigemLead = Enums['origem_lead']
export type SituacaoLead = Enums['situacao_lead']
export type MotivoPerda = Enums['motivo_perda_lead']
export type CanalContato = Enums['canal_contato_lead']
export type ResultadoContato = Enums['resultado_contato_lead']

export type Prioridade = 'normal' | 'acompanhar' | 'atencao' | 'urgente' | 'repescagem'
export type FaseDoLead = 'venda' | 'repescagem'

export interface Lead {
  id: string
  maeNome: string
  bebeNome: string | null
  telefone: string
  dpp: string | null
  maternidadeId: string | null
  maternidadeSigla: string | null
  maternidadeNome: string | null
  origem: OrigemLead
  origemDetalhe: string | null
  situacao: SituacaoLead
  motivoPerda: MotivoPerda | null
  motivoPerdaTexto: string | null
  vendedorId: string | null
  vendedorNome: string | null
  proximoRetornoEm: string | null
  casoId: string | null
  interesseNewBorn: boolean
  observacao: string | null
  encerradoEm: string | null
  criadoEm: string
  prazoVenda: string | null
  diasParaPrazo: number | null
  /** Nula no lead encerrado. */
  fase: FaseDoLead | null
  prioridade: Prioridade | null
  totalContatos: number
  contatosNaRepescagem: number
  ultimoContatoEm: string | null
  primeiroContatoEm: string | null
}

export const ROTULO_ORIGEM: Record<OrigemLead, string> = {
  cupom: 'Cupom',
  vendedor: 'Celular do vendedor',
  anuncio: 'Anúncio',
  instagram: 'Instagram',
  indicacao: 'Indicação',
  monte_seu_pacote: 'Monte seu pacote',
  outro: 'Outro',
}

export const ROTULO_SITUACAO: Record<SituacaoLead, string> = {
  novo: 'Novo',
  em_contato: 'Em contato',
  negociando: 'Negociando',
  ganho: 'Fechou',
  perdido: 'Perdido',
}

export const ROTULO_MOTIVO_PERDA: Record<MotivoPerda, string> = {
  nao_quis: 'Não quis',
  ja_nasceu: 'Já nasceu',
  sem_whatsapp: 'Sem WhatsApp',
  sem_resposta: 'Nunca respondeu',
  outro: 'Outro',
}

export const ROTULO_CANAL: Record<CanalContato, string> = {
  whatsapp: 'WhatsApp',
  ligacao: 'Ligação',
  presencial: 'Presencial',
  outro: 'Outro',
}

export const ROTULO_RESULTADO: Record<ResultadoContato, string> = {
  sem_resposta: 'Sem resposta',
  respondeu: 'Respondeu',
  pediu_retorno: 'Pediu retorno',
  mandou_proposta: 'Mandou proposta',
  outro: 'Outro',
}

/** A legenda da planilha do comercial, com a contagem de dias até o prazo. */
export const ROTULO_PRIORIDADE: Record<Prioridade, string> = {
  normal: 'Normal',
  acompanhar: 'Acompanhar',
  atencao: 'Atenção',
  urgente: 'Urgente',
  repescagem: 'Repescagem',
}

export const DESCRICAO_PRIORIDADE: Record<Prioridade, string> = {
  normal: 'Mais de 10 dias até o prazo',
  acompanhar: '6 a 10 dias até o prazo',
  atencao: '3 a 5 dias até o prazo',
  urgente: '0 a 2 dias até o prazo',
  repescagem: 'O prazo passou sem fechar',
}

/** A ordem da legenda: do mais apertado ao mais folgado. */
export const ORDEM_PRIORIDADE: Prioridade[] = ['urgente', 'atencao', 'acompanhar', 'normal', 'repescagem']

export function estaAberto(lead: Lead): boolean {
  return lead.situacao !== 'ganho' && lead.situacao !== 'perdido'
}

// ---------------------------------------------------------------------------
// Datas — sempre no fuso da operação, nunca no do aparelho.
// ---------------------------------------------------------------------------

const DIA_EM_MS = 86_400_000

/** O dia ('YYYY-MM-DD') de um instante, em Brasília. */
export function diaDoInstante(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: FUSO }).format(new Date(iso))
}

function emMs(dia: string): number {
  const [a, m, d] = dia.split('-').map(Number)
  return Date.UTC(a ?? 1970, (m ?? 1) - 1, d ?? 1)
}

export function somarDias(dia: string, dias: number): string {
  return new Date(emMs(dia) + dias * DIA_EM_MS).toISOString().slice(0, 10)
}

export function diasEntre(de: string, ate: string): number {
  return Math.round((emMs(ate) - emMs(de)) / DIA_EM_MS)
}

/**
 * O retorno se agenda por DIA, às 9h de Brasília. Brasília não tem horário de
 * verão desde 2019 — o mesmo -03:00 fixo do Calendário (`lib/datas.ts`).
 */
export function retornoNoDia(dia: string, hora = '09:00'): string {
  return `${dia}T${hora}:00-03:00`
}

const dataCurtaFmt = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit' })
const dataHoraFmt = new Intl.DateTimeFormat('pt-BR', {
  timeZone: FUSO,
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

/** '27/08' de um 'YYYY-MM-DD'. */
export function diaCurto(dia: string): string {
  const [, m, d] = dia.split('-')
  return `${d}/${m}`
}

export function dataHoraCurta(iso: string): string {
  return dataHoraFmt.format(new Date(iso))
}

export function dataCurtaDoInstante(iso: string): string {
  return dataCurtaFmt.format(new Date(iso))
}

/** "hoje", "ontem", "há 3 dias" — a distância de um contato. */
export function haQuantoTempo(iso: string, hoje: string): string {
  const dias = diasEntre(diaDoInstante(iso), hoje)
  if (dias <= 0) return 'hoje'
  if (dias === 1) return 'ontem'
  return `há ${dias} dias`
}

/** O prazo em palavras: "prazo em 4 dias", "prazo hoje", "prazo passou há 2 dias". */
export function textoDoPrazo(lead: Lead): string | null {
  if (lead.diasParaPrazo === null) return null
  const d = lead.diasParaPrazo
  if (d === 0) return 'prazo hoje'
  if (d === 1) return 'prazo amanhã'
  if (d > 1) return `prazo em ${d} dias`
  if (d === -1) return 'prazo passou ontem'
  return `prazo passou há ${-d} dias`
}

// ---------------------------------------------------------------------------
// A FILA DO "HOJE"
// ---------------------------------------------------------------------------

/**
 * TODO LEAD ABERTO TEM UM PRÓXIMO PASSO, e o "Hoje" é a lista dos que pedem
 * um gesto agora. Um retorno agendado para depois tira o lead da fila até o
 * dia dele — é isso que deixa a lista curta o bastante para ser trabalhada.
 *
 * A ordem dos grupos é a de quem cobra: primeiro o que foi PROMETIDO e
 * atrasou, depois o que foi prometido para hoje, depois quem nunca ouviu da
 * empresa, a repescagem, e por último quem ficou sem próximo passo — o lead
 * que alguém tocou e largou, que é o que a planilha deixava sumir.
 */
export type GrupoDoHoje = 'atrasado' | 'hoje' | 'novo' | 'repescagem' | 'sem_passo'

export const GRUPOS_DO_HOJE: { id: GrupoDoHoje; titulo: string; ajuda: string }[] = [
  { id: 'atrasado', titulo: 'Retorno atrasado', ajuda: 'O retorno combinado já passou.' },
  { id: 'hoje', titulo: 'Retorno para hoje', ajuda: 'Combinado para hoje.' },
  { id: 'novo', titulo: 'Novos', ajuda: 'Ainda ninguém falou com a família.' },
  { id: 'repescagem', titulo: 'Repescagem', ajuda: 'O prazo passou e a repescagem ainda não chamou.' },
  { id: 'sem_passo', titulo: 'Sem próximo passo', ajuda: 'Já houve contato, mas nenhum retorno está marcado.' },
]

export function grupoDoHoje(lead: Lead, hoje: string): GrupoDoHoje | null {
  if (!estaAberto(lead)) return null
  if (lead.proximoRetornoEm) {
    const dia = diaDoInstante(lead.proximoRetornoEm)
    if (dia < hoje) return 'atrasado'
    if (dia === hoje) return 'hoje'
    return null
  }
  if (lead.fase === 'repescagem' && lead.contatosNaRepescagem === 0) return 'repescagem'
  if (lead.totalContatos === 0) return 'novo'
  return 'sem_passo'
}

/** Dentro de um grupo, o prazo mais apertado primeiro; sem DPP, no fim. */
export function porPrazo(a: Lead, b: Lead): number {
  if (a.prazoVenda === b.prazoVenda) return a.criadoEm.localeCompare(b.criadoEm)
  if (a.prazoVenda === null) return 1
  if (b.prazoVenda === null) return -1
  return a.prazoVenda.localeCompare(b.prazoVenda)
}

/**
 * "MEUS" é a fila de quem vende. Na fase de venda, o lead é do vendedor dele;
 * passou do prazo, é de quem faz a repescagem — e, enquanto ninguém estiver
 * marcado para isso, continua com o vendedor, para nenhum lead ficar órfão.
 */
export function ehMeu(lead: Lead, pessoaId: string, euFacoRepescagem: boolean, alguemFazRepescagem: boolean): boolean {
  if (lead.fase === 'repescagem' && alguemFazRepescagem) return euFacoRepescagem
  return lead.vendedorId === pessoaId
}

// ---------------------------------------------------------------------------
// O WhatsApp
// ---------------------------------------------------------------------------

/**
 * O LINK `wa.me` abre a conversa no WhatsApp de quem clica — no computador, o
 * WhatsApp Web ou o app. Nada sai do sistema: é só um link para o número que
 * já está na tela. O telefone vem normalizado do banco ('+5541…').
 */
export function linkDoWhatsapp(telefone: string): string {
  return `https://wa.me/${telefone.replace(/\D/g, '')}`
}

/** '+5541998765432' → '(41) 99876-5432'. */
export function telefoneLegivel(telefone: string): string {
  const d = telefone.replace(/\D/g, '').replace(/^55/, '')
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return telefone
}

/** "Ana / Theo" — a mãe, e o bebê quando tem nome. */
export function nomeDoLead(lead: Pick<Lead, 'maeNome' | 'bebeNome'>): string {
  return lead.bebeNome ? `${lead.maeNome} / ${lead.bebeNome}` : lead.maeNome
}

/** Sem acento e sem caixa — a mesma busca do Calendário e das Despesas. */
export function normalizarBusca(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}
