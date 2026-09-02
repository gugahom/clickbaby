import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * A Equipe, em DUAS queries.
 *
 *   1. `pessoas` — o cadastro.
 *   2. `caso_etapas` — o trabalho, agregado por responsável em memória.
 *
 * Agregar no cliente e não no banco é escolha de tamanho, não de gosto: são
 * catorze pessoas e ~1.100 etapas. Uma view com `group by` seria mais correta
 * em escala e custaria uma migration, um GRANT e um teste pgTAP — e o número
 * que ela devolveria hoje é o mesmo. Quando a equipe crescer ou a janela virar
 * "todo o histórico", a conta muda e a view passa a valer.
 *
 * O QUE ESTA TELA NÃO CONSEGUE MOSTRAR
 * O e-mail de login vive em `auth.users`, que o cliente não alcança — e é
 * assim de propósito. Exibi-lo pede uma view `security definer` restrita a
 * `eh_adm()`, com GRANT e teste próprios. Até lá a tela diz apenas se a pessoa
 * TEM acesso. Prometer o e-mail com um palpite derivado do nome seria pior que
 * não mostrar: no dia em que um endereço fugisse do padrão, a tela mentiria
 * sem avisar.
 */

/** A janela de "trabalho recente". Um mês cobre o ciclo de cobrança e o SLA. */
export const DIAS_DE_JANELA = 30

/**
 * Onde a pessoa está trabalhando AGORA — no vocabulário da operação, não no
 * do banco.
 *
 * `campo` é a trilha `acompanhamento`: entrada, nascimento, banho, fechamento,
 * e as três avulsas. Acontece na maternidade. `ilha` é a trilha `edicao`:
 * foto, reels, vídeo, álbum. Acontece na estação de edição.
 *
 * A distinção não é cosmética — são dois lugares FÍSICOS diferentes, com
 * pessoas diferentes e horários diferentes. É a mesma divisão que governa
 * precedência no banco (coluna gerada, migration 20260827140400) e a divisão
 * do cartão no Quadro. Aqui ela responde "onde essa pessoa está".
 */
export type Lugar = 'campo' | 'ilha'

/** Uma etapa aberta na mão de alguém, com o caso a que ela pertence. */
export interface EtapaEmMaos {
  id: string
  etapa: string
  caso: string
  lugar: Lugar | null
  pausada: boolean
  /** Desde quando está com ela. `null` se nunca foi iniciada. */
  desde: string | null
}

export interface PessoaDaEquipe {
  id: string
  nome: string
  apelidos: string[]
  papelSistema: string
  ativo: boolean
  temAcesso: boolean
  /** Etapas em andamento ou pausadas agora, com ela. */
  emAndamento: number
  /**
   * Tem carga, e TODA ela está pausada.
   *
   * Não é o mesmo que estar trabalhando, e a diferença é a que mais importa
   * para quem distribui: uma pessoa com duas etapas pausadas não está ocupada,
   * está travada — e o trabalho dela está parado sem que ninguém tenha sido
   * avisado. Tratar os dois estados como "em campo" escondia exatamente o caso
   * que a tela existe para achar.
   */
  tudoPausado: boolean
  /** Onde ela está agora. `null` quando não há nada em mãos. */
  lugarAgora: Lugar | null
  /** O nome da etapa que ela está tocando agora, para a linha da lista. */
  fazendoAgora: string | null
  /** Etapas concluídas por ela na janela. */
  concluidasNaJanela: number
  /** Concluídas na janela, repartidas por lugar. */
  concluidasPorLugar: Record<Lugar, number>
  /**
   * Tempo médio entre iniciar e concluir, em minutos, na janela — já
   * descontada a pausa. É a métrica que a seção 9 do CLAUDE.md pede: evidência
   * objetiva de tempo de trabalho, carimbada pelo servidor.
   *
   * `null` quando não há amostra. Zero não é "rápido", é "não sei" — e mostrar
   * zero seria a mentira mais fácil desta tela.
   */
  cicloMedioMin: number | null
  /** Quantas etapas entraram na média. Sem isto, "3h12" não tem peso. */
  amostraDoCiclo: number
  /**
   * O que ela está segurando AGORA, com nome de caso.
   *
   * É a informação mais acionável da ficha e a razão de ela não ser só um
   * painel de estatística: quem distribui a fila não pergunta "quantas ela
   * tem", pergunta "o que ela tem". Vem do mesmo fetch — as etapas já estavam
   * sendo carregadas para a contagem; o que mudou foi embedar o caso.
   */
  emMaos: EtapaEmMaos[]
  /** Última vez que uma etapa dela começou ou terminou; null se nunca. */
  ultimaAtividade: string | null
}

export const chavesEquipe = {
  todos: ['equipe'] as const,
  lista: () => [...chavesEquipe.todos, 'lista'] as const,
}

interface LinhaPessoa {
  id: string
  nome: string
  apelidos: string[] | null
  papel_sistema: string
  ativo: boolean
  auth_user_id: string | null
}

interface LinhaEtapa {
  id: string
  responsavel_id: string | null
  tipo: string
  trilha: string | null
  status: string
  iniciado_em: string | null
  concluido_em: string | null
  pausa_acumulada: string | null
  // Embed do PostgREST. Vem `null` num caso apagado, o que não acontece
  // (`eventos` tem FK `on delete restrict`), mas o tipo não sabe disso.
  casos: { mae_nome: string; bebe_nome: string | null } | null
}

/** Nomes das etapas, na língua da equipe. Espelha ROTULO_ETAPA do Quadro. */
const ROTULO_ETAPA: Record<string, string> = {
  entrada: 'Entrada',
  nascimento: 'Nascimento',
  banho: 'Banho',
  fechamento: 'Fechamento',
  edicao_foto: 'Foto',
  reels: 'Reels',
  edicao_video: 'Vídeo',
  album: 'Álbum',
  encontro_irmaos: 'Irmãos',
  saida_uti: 'Saída de UTI',
  alta: 'Alta',
}

interface Acumulado {
  emMaos: EtapaEmMaos[]
  emAndamento: number
  lugarAgora: Lugar | null
  fazendoAgora: string | null
  concluidas: number
  porLugar: Record<Lugar, number>
  somaCicloMin: number
  amostra: number
  ultima: string | null
}

function vazio(): Acumulado {
  return {
    emMaos: [],
    emAndamento: 0,
    lugarAgora: null,
    fazendoAgora: null,
    concluidas: 0,
    porLugar: { campo: 0, ilha: 0 },
    somaCicloMin: 0,
    amostra: 0,
    ultima: null,
  }
}

async function carregarEquipe(): Promise<PessoaDaEquipe[]> {
  const { data: linhas, error } = await supabase
    .from('pessoas')
    .select('id, nome, apelidos, papel_sistema, ativo, auth_user_id')
    .order('nome')

  if (error) throw error

  const { data: etapas, error: erroEtapas } = await supabase
    .from('caso_etapas')
    .select(
      'id, responsavel_id, tipo, trilha, status, iniciado_em, concluido_em, ' +
        'pausa_acumulada, casos(mae_nome, bebe_nome)',
    )
    .not('responsavel_id', 'is', null)

  if (erroEtapas) throw erroEtapas

  const corte = new Date(Date.now() - DIAS_DE_JANELA * 24 * 60 * 60 * 1000)
  const porPessoa = new Map<string, Acumulado>()

  // `as unknown as` porque o tipo gerado do PostgREST descreve o embed como
  // uma união que inclui o formato de erro por linha. O `error` acima já
  // separou o caminho de falha; aqui só sobra dado.
  for (const e of (etapas ?? []) as unknown as LinhaEtapa[]) {
    if (!e.responsavel_id) continue
    const atual = porPessoa.get(e.responsavel_id) ?? vazio()
    const lugar = lugarDaTrilha(e.trilha)

    if (e.status === 'em_andamento' || e.status === 'pausada') {
      atual.emAndamento += 1
      atual.emMaos.push({
        id: e.id,
        etapa: ROTULO_ETAPA[e.tipo] ?? e.tipo,
        caso: nomeDoCaso(e.casos),
        lugar,
        pausada: e.status === 'pausada',
        desde: e.iniciado_em,
      })
      // A primeira que aparece manda, e `em_andamento` ganha de `pausada`:
      // a lista mostra UMA etapa por pessoa, e a que está correndo é a que
      // responde "o que ela está fazendo". Com tudo pausado sobra a primeira,
      // que é a que ela largou — e é isso que a linha deve dizer.
      if (atual.fazendoAgora === null || e.status === 'em_andamento') {
        atual.fazendoAgora = ROTULO_ETAPA[e.tipo] ?? e.tipo
        atual.lugarAgora = lugar
      }
    }

    if (e.status === 'concluida' && e.concluido_em && new Date(e.concluido_em) >= corte) {
      atual.concluidas += 1
      if (lugar) atual.porLugar[lugar] += 1

      const ciclo = cicloEmMinutos(e)
      if (ciclo !== null) {
        atual.somaCicloMin += ciclo
        atual.amostra += 1
      }
    }

    // A última atividade olha os dois carimbos: uma etapa começada hoje e não
    // concluída é atividade, e uma concluída sem `iniciado_em` (registro
    // retroativo de campo) também.
    for (const quando of [e.iniciado_em, e.concluido_em]) {
      if (quando && (atual.ultima === null || quando > atual.ultima)) atual.ultima = quando
    }

    porPessoa.set(e.responsavel_id, atual)
  }

  return ((linhas ?? []) as LinhaPessoa[]).map((p) => {
    const d = porPessoa.get(p.id) ?? vazio()
    return {
      id: p.id,
      nome: p.nome,
      apelidos: p.apelidos ?? [],
      papelSistema: p.papel_sistema,
      ativo: p.ativo,
      temAcesso: p.auth_user_id !== null,
      emAndamento: d.emAndamento,
      tudoPausado: d.emMaos.length > 0 && d.emMaos.every((e) => e.pausada),
      // Em andamento antes de pausada, e a mais antiga primeiro dentro de
      // cada grupo: o que está correndo é o que responde "onde ela está", e
      // o que está parado há mais tempo é o que precisa de alguém.
      emMaos: [...d.emMaos].sort(
        (a, b) =>
          Number(a.pausada) - Number(b.pausada) || (a.desde ?? '').localeCompare(b.desde ?? ''),
      ),
      lugarAgora: d.lugarAgora,
      fazendoAgora: d.fazendoAgora,
      concluidasNaJanela: d.concluidas,
      concluidasPorLugar: d.porLugar,
      cicloMedioMin: d.amostra > 0 ? Math.round(d.somaCicloMin / d.amostra) : null,
      amostraDoCiclo: d.amostra,
      ultimaAtividade: d.ultima,
    }
  })
}

/** "THAYANE · ALICE", ou só a mãe quando o bebê ainda não tem nome. */
function nomeDoCaso(caso: { mae_nome: string; bebe_nome: string | null } | null): string {
  if (!caso) return 'caso sem nome'
  return caso.bebe_nome ? `${caso.mae_nome} · ${caso.bebe_nome}` : caso.mae_nome
}

function lugarDaTrilha(trilha: string | null): Lugar | null {
  if (trilha === 'acompanhamento') return 'campo'
  if (trilha === 'edicao') return 'ilha'
  return null
}

/**
 * Quanto tempo a etapa levou, DESCONTADA A PAUSA.
 *
 * Descontar não é detalhe: o intervalo em que ninguém trabalhou não é tempo de
 * trabalho (seção 9 do CLAUDE.md), e uma etapa pausada de sexta a segunda
 * sozinha estragaria a média de qualquer pessoa.
 *
 * Devolve `null` — e não zero — quando a etapa foi concluída sem nunca ter
 * sido iniciada de verdade. `concluir_etapa` permite isso de propósito, porque
 * campo admite registro retroativo: a fotógrafa marca no corredor o que
 * aconteceu há vinte minutos. Contar esses casos como ciclo zero puxaria a
 * média para baixo com trabalho que existiu e não foi cronometrado, que é
 * exatamente o furo que a seção 9 avisa.
 */
function cicloEmMinutos(e: LinhaEtapa): number | null {
  if (!e.iniciado_em || !e.concluido_em) return null

  const bruto =
    (new Date(e.concluido_em).getTime() - new Date(e.iniciado_em).getTime()) / 60_000
  const liquido = bruto - intervaloEmMinutos(e.pausa_acumulada)

  // Menos de um minuto é o registro retroativo (iniciar e concluir no mesmo
  // gesto), não trabalho de um minuto.
  return liquido < 1 ? null : liquido
}

/**
 * O `interval` do Postgres como o PostgREST o entrega: "HH:MM:SS" ou
 * "N days HH:MM:SS". Só estes dois formatos aparecem aqui — `pausa_acumulada`
 * é uma soma de diferenças de `now()`, então nunca vem em meses ou anos, que
 * são as unidades ambíguas de um intervalo.
 */
function intervaloEmMinutos(texto: string | null): number {
  if (!texto) return 0

  const dias = /(-?\d+)\s+days?/.exec(texto)
  const relogio = /(-?\d+):(\d\d):(\d\d)/.exec(texto)

  const porDia = dias ? Number(dias[1]) * 24 * 60 : 0
  if (!relogio) return porDia

  const h = Number(relogio[1])
  const m = Number(relogio[2])
  const s = Number(relogio[3])
  return porDia + h * 60 + m + s / 60
}

export function useEquipe() {
  return useQuery({
    queryKey: chavesEquipe.lista(),
    queryFn: carregarEquipe,
    staleTime: 60_000,
  })
}
