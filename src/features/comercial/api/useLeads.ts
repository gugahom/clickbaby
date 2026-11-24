import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { buscarTudo } from '@/features/quadro/api/useQuadro'
import { telasEfetivas } from '@/features/auth/telas'
import type { Json } from '@/types/database'
import type {
  CanalContato,
  FaseDoLead,
  Lead,
  MotivoPerda,
  OrigemLead,
  Prioridade,
  ResultadoContato,
} from '../lib/leads'

/**
 * OS DADOS DA TELA COMERCIAL. Leitura pela view `leads_do_comercial` (a RLS
 * só a abre para quem tem a tela Comercial) e escrita SÓ por RPC — o
 * `authenticated` não tem INSERT nem UPDATE em `leads`.
 *
 * SEM REALTIME por ora: a tabela não está na publicação, e a fila de um
 * vendedor muda pelos gestos dele. A lista relê a cada minuto e ao voltar à
 * aba, que cobre o lead que outra pessoa passou para cá.
 */

const CHAVE = ['comercial'] as const

/**
 * O Postgres aceita nulo nesses parâmetros; o gerador de tipos, que não sabe
 * ler `default`, os declara obrigatórios e não-nulos. A conversão fica num
 * lugar só, com o nome dizendo o que é.
 */
const NULO = null as unknown as string

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

export function useLeads() {
  return useQuery({
    queryKey: [...CHAVE, 'leads'],
    queryFn: async (): Promise<Lead[]> => {
      const linhas = await buscarTudo((de, ate) =>
        supabase
          .from('leads_do_comercial')
          .select('*', { count: 'exact' })
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })
          .range(de, ate),
      )
      return linhas.flatMap((l): Lead[] =>
        l.id && l.mae_nome && l.telefone && l.origem && l.situacao && l.created_at
          ? [
              {
                id: l.id,
                maeNome: l.mae_nome,
                bebeNome: l.bebe_nome,
                telefone: l.telefone,
                dpp: l.dpp,
                maternidadeId: l.maternidade_id,
                maternidadeSigla: l.maternidade_sigla,
                maternidadeNome: l.maternidade_nome,
                origem: l.origem,
                origemDetalhe: l.origem_detalhe,
                situacao: l.situacao,
                motivoPerda: l.motivo_perda,
                motivoPerdaTexto: l.motivo_perda_texto,
                vendedorId: l.vendedor_id,
                vendedorNome: l.vendedor_nome,
                proximoRetornoEm: l.proximo_retorno_em,
                casoId: l.caso_id,
                interesseNewBorn: l.interesse_new_born ?? false,
                observacao: l.observacao,
                encerradoEm: l.encerrado_em,
                criadoEm: l.created_at,
                prazoVenda: l.prazo_venda,
                diasParaPrazo: l.dias_para_prazo,
                fase: (l.fase as FaseDoLead | null) ?? null,
                prioridade: (l.prioridade as Prioridade | null) ?? null,
                totalContatos: l.total_contatos ?? 0,
                contatosNaRepescagem: l.contatos_na_repescagem ?? 0,
                ultimoContatoEm: l.ultimo_contato_em,
                primeiroContatoEm: l.primeiro_contato_em,
              },
            ]
          : [],
      )
    },
    refetchInterval: 60_000,
  })
}

export interface PessoaDoComercial {
  id: string
  nome: string
  /** Ativa e com a tela Comercial — o mesmo teste de `pode_receber_lead`. */
  podeReceber: boolean
  fazRepescagem: boolean
}

/** As pessoas ativas, com quem pode receber lead e quem faz a repescagem. */
export function usePessoasDoComercial() {
  return useQuery({
    queryKey: [...CHAVE, 'pessoas'],
    queryFn: async (): Promise<PessoaDoComercial[]> => {
      const { data, error } = await supabase
        .from('pessoas')
        .select('id, nome, papel_sistema, telas, faz_repescagem, auth_user_id')
        .eq('ativo', true)
        .order('nome')
      if (error) throw error
      return data.map((p) => ({
        id: p.id,
        nome: p.nome,
        podeReceber: p.auth_user_id !== null && telasEfetivas(p.telas, p.papel_sistema).includes('comercial'),
        fazRepescagem: p.faz_repescagem,
      }))
    },
    staleTime: 5 * 60_000,
  })
}

export interface VendedorDaMaternidade {
  maternidadeId: string
  pessoaId: string
}

export function useVendedoresDasMaternidades() {
  return useQuery({
    queryKey: [...CHAVE, 'vendedores'],
    queryFn: async (): Promise<VendedorDaMaternidade[]> => {
      const { data, error } = await supabase.from('vendedores_da_maternidade').select('maternidade_id, pessoa_id')
      if (error) throw error
      return data.map((v) => ({ maternidadeId: v.maternidade_id, pessoaId: v.pessoa_id }))
    },
    staleTime: 5 * 60_000,
  })
}

export interface Contato {
  id: string
  canal: CanalContato
  resultado: ResultadoContato
  fase: FaseDoLead
  nota: string | null
  ocorridoEm: string
  pessoaId: string | null
}

export interface EventoDoLead {
  id: string
  tipo: string
  ocorridoEm: string
  pessoaId: string | null
  payload: Json
}

/**
 * O histórico da ficha: os contatos (com a nota, que o evento não carrega) e
 * os eventos do lead — passou de mão, perdeu, reabriu, mudou o retorno.
 */
export function useHistoricoDoLead(leadId: string | null) {
  return useQuery({
    queryKey: [...CHAVE, 'historico', leadId],
    enabled: leadId !== null,
    queryFn: async () => {
      const [contatos, eventos] = await Promise.all([
        supabase
          .from('contatos_do_lead')
          .select('id, canal, resultado, fase, nota, ocorrido_em, pessoa_id')
          .eq('lead_id', leadId as string)
          .order('ocorrido_em', { ascending: false })
          .order('id', { ascending: false }),
        supabase
          .from('eventos')
          .select('id, tipo, ocorrido_em, pessoa_id, payload')
          .eq('lead_id', leadId as string)
          .order('ocorrido_em', { ascending: false })
          .order('id', { ascending: false }),
      ])
      if (contatos.error) throw contatos.error
      if (eventos.error) throw eventos.error
      return {
        contatos: contatos.data.map(
          (c): Contato => ({
            id: c.id,
            canal: c.canal,
            resultado: c.resultado,
            fase: c.fase,
            nota: c.nota,
            ocorridoEm: c.ocorrido_em,
            pessoaId: c.pessoa_id,
          }),
        ),
        eventos: eventos.data.map(
          (e): EventoDoLead => ({
            id: e.id,
            tipo: e.tipo,
            ocorridoEm: e.ocorrido_em,
            pessoaId: e.pessoa_id,
            payload: e.payload,
          }),
        ),
      }
    },
  })
}

// ---------------------------------------------------------------------------
// Escrita — uma RPC por gesto
// ---------------------------------------------------------------------------

function useAcaoDoComercial<T>(fazer: (args: T) => Promise<void>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fazer,
    onSuccess: () => qc.invalidateQueries({ queryKey: CHAVE }),
  })
}

function falhou(error: { message: string } | null) {
  if (error) throw new Error(error.message)
}

export interface DadosDoLead {
  maeNome: string
  bebeNome: string
  telefone: string
  dpp: string
  maternidadeId: string
  origem: OrigemLead
  origemDetalhe: string
  interesseNewBorn: boolean
  observacao: string
}

const vazioParaNulo = (s: string) => (s.trim() === '' ? NULO : s.trim())

/** Cria o lead. Telefone com lead aberto devolve o existente — `jaExistia`. */
export function useCriarLead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (d: DadosDoLead & { vendedorId: string }) => {
      const { data, error } = await supabase.rpc('criar_lead', {
        p_mae_nome: d.maeNome.trim(),
        p_telefone: d.telefone,
        p_dpp: vazioParaNulo(d.dpp),
        p_maternidade_id: vazioParaNulo(d.maternidadeId),
        p_origem: d.origem,
        p_bebe_nome: vazioParaNulo(d.bebeNome),
        p_origem_detalhe: vazioParaNulo(d.origemDetalhe),
        p_vendedor_id: vazioParaNulo(d.vendedorId),
        p_interesse_new_born: d.interesseNewBorn,
        p_observacao: vazioParaNulo(d.observacao),
      })
      falhou(error)
      const r = data as { id: string; ja_existia: boolean }
      return { id: r.id, jaExistia: r.ja_existia }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CHAVE }),
  })
}

export function useEditarLead() {
  return useAcaoDoComercial(async (d: DadosDoLead & { leadId: string }) => {
    const { error } = await supabase.rpc('editar_lead', {
      p_lead_id: d.leadId,
      p_mae_nome: d.maeNome.trim(),
      p_telefone: d.telefone,
      p_dpp: vazioParaNulo(d.dpp),
      p_maternidade_id: vazioParaNulo(d.maternidadeId),
      p_origem: d.origem,
      p_bebe_nome: vazioParaNulo(d.bebeNome),
      p_origem_detalhe: vazioParaNulo(d.origemDetalhe),
      p_interesse_new_born: d.interesseNewBorn,
      p_observacao: vazioParaNulo(d.observacao),
    })
    falhou(error)
  })
}

export function useRegistrarContato() {
  return useAcaoDoComercial(
    async (a: {
      leadId: string
      canal: CanalContato
      resultado: ResultadoContato
      nota: string
      /** ISO, ou nulo para "sem retorno". */
      retorno: string | null
    }) => {
      const { error } = await supabase.rpc('registrar_contato_do_lead', {
        p_lead_id: a.leadId,
        p_canal: a.canal,
        p_resultado: a.resultado,
        p_nota: vazioParaNulo(a.nota),
        p_proximo_retorno_em: a.retorno ?? NULO,
      })
      falhou(error)
    },
  )
}

export function useAgendarRetorno() {
  return useAcaoDoComercial(async (a: { leadId: string; quando: string | null }) => {
    const { error } = await supabase.rpc('agendar_retorno_do_lead', {
      p_lead_id: a.leadId,
      p_quando: a.quando ?? NULO,
    })
    falhou(error)
  })
}

export function usePassarLead() {
  return useAcaoDoComercial(async (a: { leadId: string; paraPessoaId: string; motivo: string }) => {
    const { error } = await supabase.rpc('passar_lead', {
      p_lead_id: a.leadId,
      p_para_pessoa_id: a.paraPessoaId,
      p_motivo: vazioParaNulo(a.motivo),
    })
    falhou(error)
  })
}

export function useMarcarPerdido() {
  return useAcaoDoComercial(async (a: { leadId: string; motivo: MotivoPerda; texto: string }) => {
    const { error } = await supabase.rpc('marcar_lead_perdido', {
      p_lead_id: a.leadId,
      p_motivo: a.motivo,
      p_texto: vazioParaNulo(a.texto),
    })
    falhou(error)
  })
}

/**
 * LIGAR O LEAD A UM CASO QUE JÁ EXISTE (fase B): a família já estava na agenda.
 * Quem cria o caso novo é `useFecharLead`, em features/calendario — o mesmo
 * caminho de toda criação de caso.
 */
export function useMarcarGanho() {
  return useAcaoDoComercial(async (a: { leadId: string; casoId: string }) => {
    const { error } = await supabase.rpc('marcar_lead_ganho', { p_lead_id: a.leadId, p_caso_id: a.casoId })
    falhou(error)
  })
}

/** Um caso da agenda que pode ser o deste lead (`casos_parecidos_do_lead`). */
export interface CasoParecido {
  id: string
  maeNome: string
  bebeNome: string | null
  dia: string
  semHora: boolean
  pacote: string | null
  maternidade: string | null
  situacao: string
}

/**
 * ANTES DE CRIAR, A AGENDA: mesmo primeiro nome da mãe, perto da DPP, sem outro
 * lead. É sugestão — quem fecha escolhe ligar ou criar (seção 7 do CLAUDE.md:
 * nada se assume por nome parecido).
 */
export function useCasosParecidos(leadId: string) {
  return useQuery({
    queryKey: [...CHAVE, 'parecidos', leadId],
    staleTime: 0,
    queryFn: async (): Promise<CasoParecido[]> => {
      const { data, error } = await supabase.rpc('casos_parecidos_do_lead', { p_lead_id: leadId })
      if (error) throw new Error(error.message)
      return data.map((c) => ({
        id: c.id,
        maeNome: c.mae_nome,
        bebeNome: c.bebe_nome,
        dia: c.dia,
        semHora: c.sem_hora,
        pacote: c.pacote,
        maternidade: c.maternidade,
        situacao: c.situacao,
      }))
    },
  })
}

export function useReabrirLead() {
  return useAcaoDoComercial(async (a: { leadId: string; motivo: string }) => {
    const { error } = await supabase.rpc('reabrir_lead', { p_lead_id: a.leadId, p_motivo: a.motivo })
    falhou(error)
  })
}

/** O cadastro de quem atende cada maternidade — da tela Equipe. */
export function useDefinirVendedor() {
  return useAcaoDoComercial(async (a: { maternidadeId: string; pessoaId: string | null }) => {
    const { error } = await supabase.rpc('definir_vendedor_da_maternidade', {
      p_maternidade_id: a.maternidadeId,
      p_pessoa_id: a.pessoaId ?? NULO,
    })
    falhou(error)
  })
}

/**
 * A marca de quem faz a repescagem. É coluna de `pessoas`, cuja escrita já é
 * de quem tem a tela Equipe (policy `pessoas_escrita_equipe`) — o mesmo
 * UPDATE das marcas do sino do New Born.
 */
export function useMarcarRepescagem() {
  return useAcaoDoComercial(async (a: { pessoaId: string; ligado: boolean }) => {
    const { error } = await supabase.from('pessoas').update({ faz_repescagem: a.ligado }).eq('id', a.pessoaId)
    falhou(error)
  })
}
