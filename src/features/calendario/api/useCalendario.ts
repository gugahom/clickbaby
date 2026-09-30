import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { buscarTudo } from '@/features/quadro/api/useQuadro'
import { agendarRecargaDoCaso, agendarRecargaDoQuadro } from '@/features/quadro/api/recarga'
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
  /** O horário (ou o dia, sem hora) já ficou para trás — ver `esmaecido`. */
  passou: boolean
  /** Prazo que passou sem envio. */
  vencido: boolean
  rascunho: boolean
  /**
   * A cor do evento do CASO no Google (colorId). Todo item de um caso usa a
   * cor dele — o banho da Ana é da cor do parto da Ana —, e o tipo se lê no
   * texto ("Banho", "Vence o prazo"), como no Google.
   */
  corDoGoogle: string | null
  /** Para os filtros. */
  maternidade: string | null
  pacote: string | null
  /** Quem está com a etapa; nulo no parto e no prazo. */
  responsavel: string | null
  /** A etapa por trás do item (hora marcada, entrega combinada); nulo no parto e no prazo. */
  etapaId: string | null
  /** O caso já foi entregue (encerrado). Cancelado nem aparece. */
  encerrado: boolean
  /**
   * O Google ainda não acompanhou o que foi feito aqui: o caso criado ainda
   * não virou evento ('enviando'), ou a edição ainda não chegou ao evento
   * ('atualizando'). O sync resolve em até um ciclo.
   */
  google: 'enviando' | 'atualizando' | null
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
    'id, mae_nome, bebe_nome, dia, previsao_em, maternidade_sigla, pacote_nome, status_operacional, eh_rascunho, eh_terminal, nascimento_concluido_em, liberado_para_entrega_em, vence_em, na_uti, cor_calendar, previsao_sem_hora'

  const [partos, prazos, etapas, feriados, naFila] = await Promise.all([
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
          'id, caso_id, tipo, trilha, status, previsao_em, caso:casos!caso_etapas_caso_id_fkey(mae_nome, bebe_nome, status_operacional, cor_calendar, maternidade:maternidades(sigla), pacote:pacotes(nome)), responsavel:pessoas!caso_etapas_responsavel_id_fkey(nome)',
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
    // O que o Google ainda não acompanhou — poucos casos, só os que alguém
    // acabou de criar ou mudar. Sem período: a marca é do caso, não do dia.
    supabase.from('casos').select('id, google_pendente, google_desatualizado').or('google_pendente.eq.true,google_desatualizado.eq.true'),
  ])
  if (feriados.error) throw new Error(feriados.error.message)
  if (naFila.error) throw new Error(naFila.error.message)
  const noGoogle = new Map(
    (naFila.data ?? []).map((c) => [c.id, c.google_pendente ? ('enviando' as const) : ('atualizando' as const)]),
  )

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
      // Hora a definir é "dia todo" no calendário, como no Google.
      hora: quando && quando.dia === c.dia && !c.previsao_sem_hora ? quando.hora : null,
      titulo: c.eh_rascunho ? 'Parto · rascunho' : c.nascimento_concluido_em ? 'Nasceu' : 'Parto previsto',
      nome: nomeDoCaso(c.mae_nome, c.bebe_nome),
      detalhe: juntar(c.maternidade_sigla, c.pacote_nome, c.na_uti ? 'UTI' : null),
      casoId: c.id,
      feito: c.nascimento_concluido_em !== null,
      vencido: false,
      rascunho: c.eh_rascunho === true,
      corDoGoogle: c.cor_calendar,
      maternidade: c.maternidade_sigla,
      pacote: c.pacote_nome,
      responsavel: null,
      etapaId: null,
      encerrado: c.status_operacional === 'encerrado',
      google: noGoogle.get(c.id) ?? null,
      passou: false,
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
      corDoGoogle: c.cor_calendar,
      maternidade: c.maternidade_sigla,
      pacote: c.pacote_nome,
      responsavel: null,
      etapaId: null,
      encerrado: false,
      google: null,
      passou: false,
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
      corDoGoogle: e.caso?.cor_calendar ?? null,
      maternidade: e.caso?.maternidade?.sigla ?? null,
      pacote: e.caso?.pacote?.nome ?? null,
      responsavel: e.responsavel?.nome ?? null,
      etapaId: e.id,
      encerrado: e.caso?.status_operacional === 'encerrado',
      google: null,
      passou: false,
    })
  }

  // O QUE JÁ PASSOU, em relação a AGORA em Brasília. Calculado na leitura, que
  // se refaz a cada 2 minutos — precisão mais que suficiente para esmaecer.
  const agoraEmBrasilia = emBrasilia(new Date(agora).toISOString())
  const marcoDeAgora = `${agoraEmBrasilia.dia} ${agoraEmBrasilia.hora}`
  for (const item of itens) item.passou = `${item.dia} ${item.hora ?? '23:59'}` < marcoDeAgora

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
  /** 'HH:MM', ou vazio = hora a definir (o evento no Google é de dia inteiro). */
  hora: string
  clickHome: boolean
}

/** A previsão que vai para o banco: com hora, o instante; sem, o dia. */
const previsao = (dia: string, hora: string) => `${dia}T${hora || '00:00'}:00-03:00`

export function useCriarCaso() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (n: NovoCaso): Promise<string> => {
      const { data, error } = await supabase.rpc('criar_caso', {
        p_mae_nome: n.maeNome,
        p_bebe_nome: n.bebeNome,
        p_pacote_id: n.pacoteId,
        p_maternidade_id: n.maternidadeId,
        p_previsao_em: previsao(n.dia, n.hora),
        p_click_home: n.clickHome,
        p_sem_hora: n.hora === '',
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

/**
 * O CASO COMO ELE ESTÁ NO BANCO, para o formulário de edição — o item do
 * calendário só traz o que a tela mostra (a sigla, o nome do pacote), e editar
 * precisa dos ids e da previsão exata.
 */
export interface CasoEditavel {
  id: string
  maeNome: string
  bebeNome: string | null
  pacoteId: string | null
  maternidadeId: string | null
  previsaoEm: string | null
  semHora: boolean
  clickHome: boolean
  /** Já tem evento no Google (a mudança vai para lá). */
  noGoogle: boolean
}

export function useCasoEditavel(casoId: string | null) {
  return useQuery({
    queryKey: [CHAVE, 'caso', casoId],
    enabled: casoId !== null,
    staleTime: 0,
    queryFn: async (): Promise<CasoEditavel> => {
      const { data, error } = await supabase
        .from('casos')
        .select(
          'id, mae_nome, bebe_nome, pacote_id, maternidade_id, previsao_em, previsao_sem_hora, click_home, google_calendar_event_id, google_pendente',
        )
        .eq('id', casoId ?? '')
        .single()
      if (error) throw new Error(error.message)
      return {
        id: data.id,
        maeNome: data.mae_nome,
        bebeNome: data.bebe_nome,
        pacoteId: data.pacote_id,
        maternidadeId: data.maternidade_id,
        previsaoEm: data.previsao_em,
        semHora: data.previsao_sem_hora,
        clickHome: data.click_home,
        noGoogle: data.google_calendar_event_id !== null || data.google_pendente,
      }
    },
  })
}

/**
 * EDITAR PELO CALENDÁRIO (`editar_caso`, migration 20260930164416). O caso
 * muda na hora; o evento do Google acompanha no ciclo seguinte do sync — e até
 * lá o sync não relê aquele evento, para o título velho não voltar por cima.
 */
export function useEditarCasoDoCalendario() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (e: NovoCaso & { casoId: string }): Promise<void> => {
      const { error } = await supabase.rpc('editar_caso', {
        p_caso_id: e.casoId,
        p_mae_nome: e.maeNome,
        p_bebe_nome: e.bebeNome,
        p_pacote_id: e.pacoteId,
        p_maternidade_id: e.maternidadeId,
        p_previsao_em: previsao(e.dia, e.hora),
        p_click_home: e.clickHome,
        p_sem_hora: e.hora === '',
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: (_r, { casoId }) => {
      agendarRecargaDoCaso(queryClient, casoId)
      return queryClient.invalidateQueries({ queryKey: [CHAVE] })
    },
  })
}

/** O calendário relê junto com o Quadro depois de uma ação feita por ele. */
export function useRecarregarCalendario() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: [CHAVE] })
}
