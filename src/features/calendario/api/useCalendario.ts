import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { buscarTudo } from '@/features/quadro/api/useQuadro'
import { agendarRecargaDoQuadro } from '@/features/quadro/api/recarga'
import { ROTULO_ETAPA, type EtapaTipo } from '@/features/quadro/types'
import { emBrasilia, inicioDoDiaEmBrasilia, somarDias } from '../lib/datas'

/**
 * A LEITURA DO CALENDÁRIO (30/09/2026). Nada novo no banco: tudo o que ele
 * mostra já existe e já é legível sob a RLS de sempre — a previsão do parto, a
 * hora marcada de banho e fechamento, o prazo combinado do vídeo, do
 * Foto/Livro e do New Born, o vencimento do prazo do pacote, e os feriados.
 *
 * SÓ O PERÍODO DA TELA (no máximo seis semanas), em três consultas paralelas.
 * Paginadas com `buscarTudo` e ordenação total mesmo sendo poucas linhas: é a
 * regra da seção 5 do CLAUDE.md, e um mês de muito parto não avisa antes de
 * passar de mil.
 *
 * CANCELADO NÃO APARECE: o calendário responde "o que vai acontecer", e um
 * contrato que caiu não vai. Rascunho pendente aparece, marcado — é parto de
 * verdade esperando alguém confirmar o pacote.
 */

export type TipoDeItem = 'parto' | 'hora_marcada' | 'entrega_combinada' | 'prazo'

export interface ItemDoCalendario {
  chave: string
  tipo: TipoDeItem
  /** 'YYYY-MM-DD' em Brasília. */
  dia: string
  /** "14:30", ou nulo quando é o dia todo. */
  hora: string | null
  /** O que é: "Parto previsto", "Banho", "Prazo do vídeo", "Vence o prazo". */
  titulo: string
  /** "MÃE · BEBÊ" */
  nome: string
  /** "HSC · BABY REELS", "com Sarah". */
  detalhe: string
  casoId: string
  /** O parto já nasceu; a etapa já foi concluída. */
  feito: boolean
  /** Prazo que passou sem envio. */
  vencido: boolean
  rascunho: boolean
  /** A cor do evento no Google (colorId), só nos partos — a da agenda da equipe. */
  corDoGoogle: string | null
}

export interface Feriado {
  data: string
  descricao: string
}

export interface Calendario {
  itens: ItemDoCalendario[]
  feriados: Feriado[]
}

const CHAVE = 'calendario'

const nomeDoCaso = (mae: string | null, bebe: string | null) => (bebe ? `${mae ?? '—'} · ${bebe}` : (mae ?? '—'))
const juntar = (...partes: (string | null | undefined)[]) => partes.filter(Boolean).join(' · ')

/**
 * As etapas com data que NÃO são o parto. O nascimento sai daqui porque o
 * próprio caso já é o item do parto — mostrá-lo duas vezes no mesmo horário
 * faria o dia parecer mais cheio do que é.
 */
const TITULO_DA_ENTREGA: Partial<Record<EtapaTipo, string>> = {
  edicao_video: 'Prazo do vídeo',
  album: 'Prazo do Foto/Livro',
  click_home: 'Ensaio New Born',
}

async function lerCalendario(inicio: string, fim: string): Promise<Calendario> {
  const de = inicioDoDiaEmBrasilia(inicio)
  const ate = inicioDoDiaEmBrasilia(somarDias(fim, 1))
  const agora = Date.now()

  const colunasDoCaso =
    'id, mae_nome, bebe_nome, dia, previsao_em, maternidade_sigla, pacote_nome, status_operacional, eh_rascunho, eh_terminal, nascimento_concluido_em, liberado_para_entrega_em, vence_em, na_uti, cor_calendar'

  const [partos, prazos, etapas, feriados] = await Promise.all([
    buscarTudo((a, b) =>
      supabase
        .from('quadro_casos')
        .select(colunasDoCaso, { count: 'exact' })
        .gte('dia', inicio)
        .lte('dia', fim)
        .neq('status_operacional', 'cancelado')
        .order('dia')
        .order('id')
        .range(a, b),
    ),
    // O prazo do pacote só interessa enquanto o caso não foi ENVIADO: depois
    // disso ele já foi cumprido ou estourado, e o calendário não é relatório.
    buscarTudo((a, b) =>
      supabase
        .from('quadro_casos')
        .select(colunasDoCaso, { count: 'exact' })
        .gte('vence_em', de)
        .lt('vence_em', ate)
        .eq('eh_terminal', false)
        .eq('eh_rascunho', false)
        .is('liberado_para_entrega_em', null)
        .order('vence_em')
        .order('id')
        .range(a, b),
    ),
    buscarTudo((a, b) =>
      supabase
        .from('caso_etapas')
        .select(
          'id, caso_id, tipo, trilha, status, previsao_em, caso:casos!caso_etapas_caso_id_fkey(mae_nome, bebe_nome, status_operacional), responsavel:pessoas!caso_etapas_responsavel_id_fkey(nome)',
          { count: 'exact' },
        )
        .gte('previsao_em', de)
        .lt('previsao_em', ate)
        .neq('status', 'dispensada')
        .neq('tipo', 'nascimento')
        .order('previsao_em')
        .order('id')
        .range(a, b),
    ),
    supabase.from('feriados').select('data, descricao').gte('data', inicio).lte('data', fim).order('data'),
  ])
  if (feriados.error) throw new Error(feriados.error.message)

  const itens: ItemDoCalendario[] = []

  for (const c of partos) {
    if (!c.id || !c.dia) continue
    const quando = c.previsao_em ? emBrasilia(c.previsao_em) : null
    itens.push({
      chave: `parto:${c.id}`,
      tipo: 'parto',
      // A previsão pode cair noutro dia que o `dia` do bloco (parto previsto
      // para 00h30 de um caso aberto na véspera); vale o dia do bloco, que é
      // onde o Quadro o mostra.
      dia: c.dia,
      hora: quando && quando.dia === c.dia ? quando.hora : null,
      titulo: c.eh_rascunho ? 'Parto · rascunho' : c.nascimento_concluido_em ? 'Nasceu' : 'Parto previsto',
      nome: nomeDoCaso(c.mae_nome, c.bebe_nome),
      detalhe: juntar(c.maternidade_sigla, c.pacote_nome, c.na_uti ? 'UTI' : null),
      casoId: c.id,
      feito: c.nascimento_concluido_em !== null,
      vencido: false,
      rascunho: c.eh_rascunho === true,
      corDoGoogle: c.cor_calendar,
    })
  }

  for (const c of prazos) {
    if (!c.id || !c.vence_em) continue
    const quando = emBrasilia(c.vence_em)
    itens.push({
      chave: `prazo:${c.id}`,
      tipo: 'prazo',
      dia: quando.dia,
      hora: quando.hora,
      titulo: 'Vence o prazo',
      nome: nomeDoCaso(c.mae_nome, c.bebe_nome),
      detalhe: juntar(c.maternidade_sigla, c.pacote_nome, c.na_uti ? 'na UTI, prazo parado' : null),
      casoId: c.id,
      feito: false,
      vencido: new Date(c.vence_em).getTime() < agora && !c.na_uti,
      rascunho: false,
      corDoGoogle: null,
    })
  }

  for (const e of etapas) {
    if (!e.previsao_em || e.caso?.status_operacional === 'cancelado') continue
    const quando = emBrasilia(e.previsao_em)
    const campo = e.trilha !== 'edicao'
    itens.push({
      chave: `etapa:${e.id}`,
      tipo: campo ? 'hora_marcada' : 'entrega_combinada',
      dia: quando.dia,
      hora: quando.hora,
      titulo: TITULO_DA_ENTREGA[e.tipo] ?? (campo ? ROTULO_ETAPA[e.tipo] : `Prazo: ${ROTULO_ETAPA[e.tipo]}`),
      nome: nomeDoCaso(e.caso?.mae_nome ?? null, e.caso?.bebe_nome ?? null),
      detalhe: e.responsavel?.nome ? `com ${e.responsavel.nome}` : 'sem responsável',
      casoId: e.caso_id,
      feito: e.status === 'concluida',
      vencido: false,
      rascunho: false,
      corDoGoogle: null,
    })
  }

  // Dentro do dia: o que tem hora, pela hora; o dia todo por último.
  itens.sort((a, b) => (a.dia + (a.hora ?? '99')).localeCompare(b.dia + (b.hora ?? '99')))

  return { itens, feriados: feriados.data ?? [] }
}

export function useCalendario(inicio: string, fim: string) {
  return useQuery({
    queryKey: [CHAVE, inicio, fim],
    placeholderData: keepPreviousData,
    // O calendário não tem Realtime próprio: o que muda nele muda no Quadro,
    // que é onde as pessoas trabalham. Um minuto de validade é o suficiente
    // para quem planeja a semana.
    staleTime: 60_000,
    refetchInterval: 2 * 60_000,
    queryFn: () => lerCalendario(inicio, fim),
  })
}

/**
 * FERIADO É CADASTRO, não transição de estado: a tabela já tinha a policy
 * `feriados_escrita_adm` (20260827135656) e o GRANT dos quatro verbos. O que
 * muda com ele é o PRAZO dos pacotes em dias úteis (MASTER e MASTER + ÁLBUM),
 * que `quadro_casos` recalcula na leitura — por isso o Quadro recarrega junto.
 */
export function useMarcarFeriado() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ data, descricao }: Feriado) => {
      const { error } = await supabase.from('feriados').insert({ data, descricao: descricao.trim() })
      if (error) throw new Error(error.code === '23505' ? 'Este dia já é feriado.' : error.message)
    },
    onSuccess: () => {
      agendarRecargaDoQuadro(queryClient)
      return queryClient.invalidateQueries({ queryKey: [CHAVE] })
    },
  })
}

export function useTirarFeriado() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: string) => {
      const { error } = await supabase.from('feriados').delete().eq('data', data)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      agendarRecargaDoQuadro(queryClient)
      return queryClient.invalidateQueries({ queryKey: [CHAVE] })
    },
  })
}

/**
 * CRIAR CASO PELO CALENDÁRIO (`criar_caso`, migration 20260930092734). O caso
 * nasce com as etapas do pacote e PENDENTE de ir ao Google: o sync escreve o
 * evento no ciclo seguinte (até ~25 segundos). A previsão vai com o fuso de
 * Brasília explícito — sem ele, o navegador de quem cria decidiria o horário.
 */
export interface NovoCaso {
  maeNome: string
  bebeNome: string
  pacoteId: string
  maternidadeId: string
  /** 'YYYY-MM-DD' */
  dia: string
  /** 'HH:MM' */
  hora: string
  clickHome: boolean
}

export function useCriarCaso() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (n: NovoCaso): Promise<string> => {
      const { data, error } = await supabase.rpc('criar_caso', {
        p_mae_nome: n.maeNome,
        p_bebe_nome: n.bebeNome,
        p_pacote_id: n.pacoteId,
        p_maternidade_id: n.maternidadeId,
        p_previsao_em: `${n.dia}T${n.hora}:00-03:00`,
        p_click_home: n.clickHome,
      })
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: () => {
      agendarRecargaDoQuadro(queryClient)
      return queryClient.invalidateQueries({ queryKey: [CHAVE] })
    },
  })
}
