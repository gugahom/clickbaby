import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * A Equipe, em DUAS queries.
 *
 *   1. `pessoas` — o cadastro.
 *   2. `caso_etapas` — o que cada uma tem aberto AGORA.
 *
 * O QUE SAIU DAQUI (03/09/2026): etapas concluídas na janela, tempo médio de
 * ciclo e a divisão campo × ilha. Elas foram construídas e removidas por
 * decisão do gestor, e a razão dele é boa: ainda não está acordado O QUE se
 * mede. Métrica na tela antes do acordo vira número que ninguém sabe ler e
 * que, pior, começa a ser usado para decidir coisas. Quando a tela de métricas
 * existir, ela nasce do acordo — não do que era fácil calcular.
 *
 * O que ficou é ESTADO, não medida: quem está com o quê neste instante. Isso
 * não precisa de acordo nenhum para ser verdade.
 */

/** Onde a pessoa está trabalhando agora — no vocabulário da operação. */
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
  /** Quando entrou no sistema. */
  desde: string
  /** Caminho do avatar no bucket. Não é URL — ver `useUrlsDasFotos`. */
  fotoPath: string | null
  /** Etapas em andamento ou pausadas agora, com ela. */
  emAndamento: number
  /** Tem carga, e toda ela está pausada. */
  tudoPausado: boolean
  /** Onde ela está agora. `null` quando não há nada em mãos. */
  lugarAgora: Lugar | null
  /** O que ela está segurando agora, com nome de caso. */
  emMaos: EtapaEmMaos[]
  /**
   * Já tocou em alguma coisa no sistema.
   *
   * É o que decide se ela pode ser EXCLUÍDA: as onze FKs que apontam para
   * `pessoas` são `on delete restrict`, de propósito — o histórico de quem fez
   * o quê é o produto (invariante 3.2). Quem já trabalhou não sai do cadastro,
   * sai da operação.
   *
   * É uma pista, não a garantia: aqui só se olha `caso_etapas`, e existem
   * outras dez FKs. O banco é quem recusa de verdade; isto serve para a tela
   * não oferecer o que já se sabe que vai falhar.
   */
  temHistorico: boolean
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
  created_at: string
  foto_path: string | null
}

interface LinhaEtapa {
  id: string
  responsavel_id: string | null
  tipo: string
  trilha: string | null
  status: string
  iniciado_em: string | null
  concluido_em: string | null
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
  tocouEmAlgo: boolean
  ultima: string | null
}

function vazio(): Acumulado {
  return { emMaos: [], tocouEmAlgo: false, ultima: null }
}

async function carregarEquipe(): Promise<PessoaDaEquipe[]> {
  const { data: linhas, error } = await supabase
    .from('pessoas')
    .select('id, nome, apelidos, papel_sistema, ativo, auth_user_id, created_at, foto_path')
    .order('nome')

  if (error) throw error

  const { data: etapas, error: erroEtapas } = await supabase
    .from('caso_etapas')
    .select(
      'id, responsavel_id, tipo, trilha, status, iniciado_em, concluido_em, ' +
        'casos(mae_nome, bebe_nome)',
    )
    .not('responsavel_id', 'is', null)

  if (erroEtapas) throw erroEtapas

  const porPessoa = new Map<string, Acumulado>()

  // `as unknown as` porque o tipo gerado do PostgREST descreve o embed como
  // uma união que inclui o formato de erro por linha. O `error` acima já
  // separou o caminho de falha; aqui só sobra dado.
  for (const e of (etapas ?? []) as unknown as LinhaEtapa[]) {
    if (!e.responsavel_id) continue
    const atual = porPessoa.get(e.responsavel_id) ?? vazio()
    atual.tocouEmAlgo = true

    if (e.status === 'em_andamento' || e.status === 'pausada') {
      atual.emMaos.push({
        id: e.id,
        etapa: ROTULO_ETAPA[e.tipo] ?? e.tipo,
        caso: nomeDoCaso(e.casos),
        lugar: lugarDaTrilha(e.trilha),
        pausada: e.status === 'pausada',
        desde: e.iniciado_em,
      })
    }

    for (const quando of [e.iniciado_em, e.concluido_em]) {
      if (quando && (atual.ultima === null || quando > atual.ultima)) atual.ultima = quando
    }

    porPessoa.set(e.responsavel_id, atual)
  }

  return ((linhas ?? []) as LinhaPessoa[]).map((p) => {
    const d = porPessoa.get(p.id) ?? vazio()

    // Em andamento antes de pausada, e a mais antiga primeiro dentro de cada
    // grupo: o que está correndo responde "onde ela está", e o que está parado
    // há mais tempo é o que precisa de alguém.
    const emMaos = [...d.emMaos].sort(
      (a, b) =>
        Number(a.pausada) - Number(b.pausada) ||
        (a.desde ?? '').localeCompare(b.desde ?? ''),
    )
    const correndo = emMaos.find((e) => !e.pausada)

    return {
      id: p.id,
      nome: p.nome,
      apelidos: p.apelidos ?? [],
      papelSistema: p.papel_sistema,
      ativo: p.ativo,
      temAcesso: p.auth_user_id !== null,
      desde: p.created_at,
      fotoPath: p.foto_path,
      emAndamento: emMaos.length,
      tudoPausado: emMaos.length > 0 && emMaos.every((e) => e.pausada),
      lugarAgora: (correndo ?? emMaos[0])?.lugar ?? null,
      emMaos,
      temHistorico: d.tocouEmAlgo,
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

export function useEquipe() {
  return useQuery({
    queryKey: chavesEquipe.lista(),
    queryFn: carregarEquipe,
    staleTime: 60_000,
  })
}
