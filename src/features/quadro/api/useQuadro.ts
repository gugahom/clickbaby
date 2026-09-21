import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  normalizarCaso,
  normalizarEtapa,
  type DadosQuadro,
  type EtapaQuadro,
} from '../types'

/**
 * Carga do Quadro em DUAS queries fixas — não N+1.
 *
 *   1. `quadro_casos`  — casos achatados, com pacote/maternidade resolvidos e
 *      dia/vence_em/eh_rascunho derivados no banco (uma definição só).
 *   2. `caso_etapas`   — todas as etapas dos casos carregados, por
 *      `.in('caso_id', ids)`, com o responsável embedado (join lateral do
 *      PostgREST, não uma query por etapa).
 *
 * As etapas são indexadas num Map e coladas em memória.
 *
 * Por que as etapas não vêm dentro da view: agregá-las em jsonb impediria
 * ordenar/filtrar por etapa no PostgREST e esconderia o custo do join.
 *
 * -------------------------------------------------------------------------
 * O QUADRO NÃO CARREGA O ARQUIVO (18/09/2026, correção 4 da lentidão).
 *
 * Até aqui a consulta 1 não tinha filtro: o Quadro era o histórico INTEIRO do
 * sistema — 266 casos e 1.431 etapas no dia do diagnóstico, 239 deles já
 * encerrados ou cancelados —, baixado por toda tela aberta a cada mudança de
 * qualquer pessoa, e crescendo ~135 casos por mês. Agora são TRÊS recortes da
 * mesma view, cada um com o seu dono:
 *
 *   - o QUADRO carrega `arquivado = false`: o que está aberto, mais o pouco de
 *     terminado que ele ainda mostra (vídeo/fotolivro em andamento, e a conta
 *     "x de y" dos dias abertos). A regra mora na view — ver a migration
 *     20260918091859. Eram 76 casos no dia, e o número não cresce com o tempo;
 *   - a aba CONCLUÍDOS carrega `eh_terminal = true`, e só quando é aberta;
 *   - o REALTIME busca só os casos que mudaram (ver atualizar-por-caso.ts).
 */

export type { DadosQuadro }

export const chavesQuadro = {
  todos: ['quadro'] as const,
  lista: () => [...chavesQuadro.todos, 'lista'] as const,
  concluidos: () => [...chavesQuadro.todos, 'concluidos'] as const,
  // Mora debaixo de `todos` de propósito — ver useAtividadeDaEquipe.
  atividade: () => [...chavesQuadro.todos, 'atividade'] as const,
}

/**
 * O TETO DE MIL LINHAS DO POSTGREST, e por que ele mordeu em silêncio.
 *
 * O PostgREST recusa devolver mais de `db-max-rows` numa resposta — mil, no
 * Supabase. Ele não erra: devolve as mil primeiras e cala. Em 07/09/2026 a
 * tabela `caso_etapas` passou de mil linhas (1009), e o Quadro parou de
 * enxergar as nove últimas NA ORDEM DA CONSULTA — que ordena por `rodada`.
 * Ou seja, sumiram justamente as rodadas mais altas: as revisões criadas por
 * `reabrir_caso` e a rodada do encontro de irmãos.
 *
 * O SINTOMA foi um caso que a tela mostrava completo e que o banco recusava
 * enviar para Entregáveis, dizendo que `edicao_foto` estava em aberto. Estava:
 * a rodada 3, pausada, existia no banco e nunca chegava ao navegador. É a pior
 * classe de bug — a tela e o banco discordando, sem erro em lugar nenhum.
 *
 * A PÁGINA É COBRADA CONTRA O `count` DO SERVIDOR, e não contra o tamanho da
 * página. "Vieram menos linhas que eu pedi, então acabou" é a heurística
 * óbvia e ela é falsa: se o teto do servidor for MENOR que a página pedida,
 * toda página chega curta e o laço para na primeira — truncando de novo, do
 * mesmo jeito e com a mesma cara de sucesso. O total dito pelo servidor é a
 * única resposta que não depende de adivinhar o teto dele.
 *
 * -------------------------------------------------------------------------
 * E TODA CONSULTA PAGINADA PRECISA DE ORDENAÇÃO TOTAL (08/09/2026).
 *
 * Paginar consertou o truncamento e destapou o defeito seguinte, que é da
 * mesma família e ainda mais silencioso. `LIMIT/OFFSET` só devolve cada linha
 * uma vez se a ordenação for TOTAL — se não houver empate. `rodada, ordem`
 * empata às centenas: todo `fechamento` do sistema é (1, 4). Quando o corte
 * de 500 cai no meio de um grupo empatado, o Postgres é livre para escolher
 * membros diferentes do grupo em cada consulta, e escolhe: medido no remoto,
 * 1028 linhas chegaram, 1000 eram distintas. VINTE E OITO vieram duas vezes —
 * e outras VINTE E OITO não vieram nenhuma.
 *
 * O SINTOMA foi um card com "Fechamento" duas vezes na fita e 5/5 numa trilha
 * de quatro etapas. O card estava certo: a lista tinha mesmo a linha repetida.
 * O caro não é o que aparece duas vezes — é o que não aparece, que é a mesma
 * discordância entre tela e banco de ontem, com outra causa.
 *
 * A CORREÇÃO é acrescentar `id` como último critério de ordenação. Ele é
 * único, então desempata sempre e a ordem passa a ser a mesma em toda
 * consulta. Não muda o que se vê: o `id` só decide entre linhas que já eram
 * indistinguíveis para a tela.
 *
 * A DEDUPLICAÇÃO aqui embaixo é cinto de segurança, não a correção. Ela impede
 * que uma consulta futura sem desempate repita linha no React; não devolve a
 * linha que ficou faltando, e nada consegue devolver — o servidor nunca a
 * mandou.
 */
const PAGINA = 500

// `id: string | null` porque `quadro_casos` é uma VIEW, e coluna de view nasce
// anulável nos tipos gerados mesmo vindo de uma PK. Linha sem `id` não dá para
// deduplicar; ela passa direto, e `normalizarCaso` já lida com esse caso.
export async function buscarTudo<T extends { id: string | null }>(
  consulta: (
    de: number,
    ate: number,
  ) => PromiseLike<{ data: T[] | null; error: unknown; count: number | null }>,
): Promise<T[]> {
  const tudo: T[] = []
  const vistos = new Set<string>()
  let recebidas = 0

  for (let de = 0; ; de += PAGINA) {
    const { data, error, count } = await consulta(de, de + PAGINA - 1)
    if (error) throw error

    const pagina = data ?? []
    recebidas += pagina.length

    for (const linha of pagina) {
      if (linha.id !== null) {
        if (vistos.has(linha.id)) continue
        vistos.add(linha.id)
      }
      tudo.push(linha)
    }

    // Página vazia encerra sempre — é a saída que impede laço infinito se o
    // servidor devolver um `count` maior do que ele consegue paginar.
    if (pagina.length === 0) return tudo
    if (count === null) return tudo
    // Conta o que CHEGOU, não o que sobrou depois de deduplicar. Se um dia
    // voltar a vir repetido, `tudo` nunca alcançaria `count` e o laço só
    // pararia na página vazia — pedindo faixas além do fim a cada carga.
    if (recebidas >= count) return tudo
  }
}

/**
 * Quantos casos cabem num `.in('caso_id', ...)`.
 *
 * A lista de ids viaja NA URL, e URL tem teto — o proxy na frente do Supabase
 * recusa endereço grande demais. Um uuid ocupa ~39 caracteres codificado, então
 * 150 dão uns 6kB, com folga. Até 18/09 o Quadro mandava TODOS os casos do
 * sistema numa lista só (266 no dia, ~10kB, e crescendo ~135 por mês); a aba
 * Concluídos herdou esse volume, e é ela que precisa do lote.
 */
const CASOS_POR_LOTE = 150

/**
 * As etapas dos casos dados, agrupadas por caso e na ordem da tela.
 *
 * Os lotes rodam em paralelo, e cada caso cai inteiro num lote só — por isso a
 * ordem das etapas DENTRO de um caso é a da consulta, que é o que importa.
 */
async function buscarEtapas(ids: string[]): Promise<Map<string, EtapaQuadro[]>> {
  const etapasPorCaso = new Map<string, EtapaQuadro[]>()
  const validos = ids.filter((id) => id !== '')
  if (validos.length === 0) return etapasPorCaso

  const lotes: string[][] = []
  for (let i = 0; i < validos.length; i += CASOS_POR_LOTE) {
    lotes.push(validos.slice(i, i + CASOS_POR_LOTE))
  }

  const resultados = await Promise.all(
    lotes.map((lote) =>
      buscarTudo((de, ate) =>
        supabase
          .from('caso_etapas')
          // Quatro embeds pela MESMA tabela `pessoas` — responsável, rendição, e
          // quem baixou e subiu o material (15/09/2026) —, então todos precisam
          // nomear a FK: sem isso o PostgREST não sabe por qual coluna juntar. E
          // precisa ser um literal de uma peça só: concatenar com `+` faz o tipo
          // do select virar string genérica e a inferência do supabase-js desabar.
          .select(
            '*, responsavel:pessoas!caso_etapas_responsavel_id_fkey(nome), proximo_responsavel:pessoas!caso_etapas_proximo_responsavel_id_fkey(nome), baixou:pessoas!caso_etapas_baixou_por_fkey(nome), subiu:pessoas!caso_etapas_subiu_por_fkey(nome), fotolivro_enviado:pessoas!caso_etapas_fotolivro_enviado_por_fkey(nome)',
            { count: 'exact' },
          )
          .in('caso_id', lote)
          // rodada ANTES de ordem: agrupa a edição do parto e a do banho em
          // blocos, que é como o trabalho se organiza. Ordenar só por `ordem`
          // intercalaria "Foto parto, Foto banho, Reels parto, Reels banho".
          // A trilha de acompanhamento é toda rodada 1, então não muda de posição.
          //
          // E ESTA ORDEM É O QUE TORNAVA O TRUNCAMENTO TÃO RUIM: cortando pelo
          // fim, sumia sempre a rodada mais alta — a revisão e o encontro de
          // irmãos.
          .order('rodada', { ascending: true })
          .order('ordem', { ascending: true })
          // E `id` fecha a ordenação. Sem ele, (rodada 1, ordem 4) é o mesmo par
          // para TODO fechamento do sistema, e o corte de página no meio desse
          // grupo repetia umas linhas e perdia outras. Ver o bloco acima.
          .order('id', { ascending: true })
          .range(de, ate),
      ),
    ),
  )

  for (const linha of resultados.flat()) {
    const etapa = normalizarEtapa(linha)
    const atuais = etapasPorCaso.get(etapa.casoId)
    if (atuais) atuais.push(etapa)
    else etapasPorCaso.set(etapa.casoId, [etapa])
  }

  return etapasPorCaso
}

/**
 * O que o Quadro mostra: tudo que NÃO é arquivo. Ver a migration 20260918091859.
 *
 * A ORDEM (`previsao_em`, `id`) é a que `ordemDaConsulta` (lib/remendo.ts)
 * repete na memória — mudar uma sem a outra faz a lista remendada e a
 * recarregada saírem em ordens diferentes.
 */
async function carregarQuadro(): Promise<DadosQuadro> {
  const linhas = await buscarTudo((de, ate) =>
    supabase
      .from('quadro_casos')
      .select('*', { count: 'exact' })
      .eq('arquivado', false)
      .order('previsao_em', { ascending: true })
      // O desempate. Dois casos marcados para a mesma hora — que é o normal
      // numa agenda de maternidade — empatam aqui, e empate quebra a
      // paginação. Ver o bloco sobre ordenação total, acima.
      .order('id', { ascending: true })
      .range(de, ate),
  )

  const casos = linhas.map(normalizarCaso)
  return { casos, etapasPorCaso: await buscarEtapas(casos.map((c) => c.id)) }
}

/**
 * A aba Concluídos: todo caso encerrado ou cancelado. É o recorte que CRESCE
 * com o tempo, e por isso só é buscado quando alguém abre a aba.
 */
async function carregarConcluidos(): Promise<DadosQuadro> {
  const linhas = await buscarTudo((de, ate) =>
    supabase
      .from('quadro_casos')
      .select('*', { count: 'exact' })
      .eq('eh_terminal', true)
      .order('previsao_em', { ascending: true })
      .order('id', { ascending: true })
      .range(de, ate),
  )

  const casos = linhas.map(normalizarCaso)
  return { casos, etapasPorCaso: await buscarEtapas(casos.map((c) => c.id)) }
}

/**
 * Só os casos dados, SEM recorte nenhum — quem decide se cada um entra na lista
 * é quem remenda (atualizar-por-caso.ts). As duas consultas saem juntas: os ids
 * já são conhecidos, então as etapas não precisam esperar pelos casos.
 */
export async function carregarCasos(ids: string[]): Promise<DadosQuadro> {
  const [linhas, etapasPorCaso] = await Promise.all([
    buscarTudo((de, ate) =>
      supabase
        .from('quadro_casos')
        .select('*', { count: 'exact' })
        .in('id', ids)
        .order('previsao_em', { ascending: true })
        .order('id', { ascending: true })
        .range(de, ate),
    ),
    buscarEtapas(ids),
  ])

  return { casos: linhas.map(normalizarCaso), etapasPorCaso }
}

export function useQuadro() {
  return useQuery({
    queryKey: chavesQuadro.lista(),
    queryFn: carregarQuadro,
    /*
     * DOIS MINUTOS, e DE PROPÓSITO fora do passo do cron do sync.
     *
     * Este número já foi "o mesmo passo do cron", quando o sync rodava de dois
     * em dois minutos. Não é mais: o cron desceu para um minuto em 31/08 e para
     * 25 SEGUNDOS em 09/09, e este intervalo ficou onde está.
     *
     * O motivo é que este refetch NÃO é o caminho pelo qual um card novo chega
     * à tela. Quem faz isso é o Realtime, que escuta INSERT em `casos` e
     * recarrega no instante em que o sync escreve — inclusive numa TV que
     * ninguém recarrega o dia inteiro. Este laço é a REDE DE SEGURANÇA para
     * quando o canal cai sem avisar.
     *
     * Persegui-lo até os 25s multiplicaria por cinco o tráfego do Quadro
     * inteiro — 194 casos e 1.030 etapas, em páginas de 500 — para cobrir mais
     * depressa uma falha que é rara. O intervalo certo aqui é o da falha, não o
     * da fonte.
     *
     * `refetchIntervalInBackground` fica FALSO (o padrão): aba escondida não
     * precisa ser buscada, e ao voltar o TanStack refaz a busca sozinho.
     */
    refetchInterval: 2 * 60 * 1000,
    /*
     * VOLTAR PARA A ABA NÃO RECARREGA A CADA 30 SEGUNDOS (18/09/2026).
     *
     * O padrão global é `refetchOnWindowFocus` com 30s de validade, e no
     * celular — que troca de app e bloqueia a tela o tempo todo — isso virava
     * uma recarga do Quadro inteiro a cada desbloqueio. Foi um dos
     * multiplicadores da lentidão de 18/09: 1.300 recargas completas por dia.
     *
     * Com a mesma validade do laço de segurança, a volta só recarrega se os
     * dados tiverem mais de dois minutos — e dado recente é o normal, porque
     * toda mudança já recarrega pelo Realtime. Invalidar ignora a validade,
     * então o Realtime e as ações continuam recarregando na hora.
     *
     * O celular que passou horas no bolso ganha a recarga do mesmo jeito: ao
     * acordar, o canal se reconecta e o próprio Realtime recarrega (ver o
     * `SUBSCRIBED` em useRealtimeQuadro).
     */
    staleTime: 2 * 60 * 1000,
  })
}

/**
 * A ABA CONCLUÍDOS, buscada quando é aberta (18/09/2026).
 *
 * Até aqui ela lia do Quadro, e o Quadro carregava o arquivo inteiro para todo
 * mundo, a cada mudança, para uma aba que quase ninguém abre. O preço de agora é
 * um instante de "carregando" na primeira abertura.
 *
 * SEM `refetchInterval`: quem mantém a aba em dia é o Realtime, remendando caso a
 * caso (atualizar-por-caso.ts), e uma recarga completa a cada dois minutos seria
 * justamente o arquivo inteiro. Ao voltar para o aparelho depois de dois minutos,
 * a busca se refaz sozinha, pela validade.
 */
export function useConcluidos(habilitado: boolean) {
  return useQuery({
    queryKey: chavesQuadro.concluidos(),
    queryFn: carregarConcluidos,
    enabled: habilitado,
    staleTime: 2 * 60 * 1000,
  })
}
