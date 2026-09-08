import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  normalizarCaso,
  normalizarEtapa,
  type CasoQuadro,
  type EtapaQuadro,
} from '../types'

/**
 * Carga do Quadro em DUAS queries fixas — não N+1.
 *
 *   1. `quadro_casos`  — casos achatados, com pacote/maternidade resolvidos e
 *      dia/vence_em/eh_rascunho derivados no banco (uma definição só).
 *   2. `caso_etapas`   — todas as etapas dos casos carregados, num único
 *      `.in('caso_id', ids)`, com o responsável embedado (join lateral do
 *      PostgREST, não uma query por etapa).
 *
 * Duas requisições independente de haver 84 ou 800 casos. As etapas são
 * indexadas num Map e coladas em memória.
 *
 * Por que as etapas não vêm dentro da view: agregá-las em jsonb impediria
 * ordenar/filtrar por etapa no PostgREST e esconderia o custo do join.
 */

export interface DadosQuadro {
  casos: CasoQuadro[]
  etapasPorCaso: Map<string, EtapaQuadro[]>
}

export const chavesQuadro = {
  todos: ['quadro'] as const,
  lista: () => [...chavesQuadro.todos, 'lista'] as const,
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
async function buscarTudo<T extends { id: string | null }>(
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

async function carregarQuadro(): Promise<DadosQuadro> {
  const linhas = await buscarTudo((de, ate) =>
    supabase
      .from('quadro_casos')
      .select('*', { count: 'exact' })
      .order('previsao_em', { ascending: true })
      // O desempate. Dois casos marcados para a mesma hora — que é o normal
      // numa agenda de maternidade — empatam aqui, e empate quebra a
      // paginação. Ver o bloco sobre ordenação total, acima.
      .order('id', { ascending: true })
      .range(de, ate),
  )

  const casos = linhas.map(normalizarCaso)
  const ids = casos.map((c) => c.id).filter((id) => id !== '')

  if (ids.length === 0) {
    return { casos, etapasPorCaso: new Map() }
  }

  const linhasEtapas = await buscarTudo((de, ate) =>
    supabase
      .from('caso_etapas')
      // Dois embeds pela MESMA tabela `pessoas`, então os dois precisam nomear
      // a FK — sem isso o PostgREST não sabe por qual coluna juntar. E precisa
      // ser um literal de uma peça só: concatenar com `+` faz o tipo do select
      // virar string genérica e a inferência do supabase-js desabar.
      .select(
        '*, responsavel:pessoas!caso_etapas_responsavel_id_fkey(nome), proximo_responsavel:pessoas!caso_etapas_proximo_responsavel_id_fkey(nome)',
        { count: 'exact' },
      )
      .in('caso_id', ids)
      // rodada ANTES de ordem: agrupa a edição do parto e a do banho em blocos,
      // que é como o trabalho se organiza. Ordenar só por `ordem` intercalaria
      // "Foto parto, Foto banho, Reels parto, Reels banho".
      // A trilha de acompanhamento é toda rodada 1, então não muda de posição.
      //
      // E ESTA ORDEM É O QUE TORNAVA O TRUNCAMENTO TÃO RUIM: cortando pelo fim,
      // sumia sempre a rodada mais alta — a revisão e o encontro de irmãos.
      .order('rodada', { ascending: true })
      .order('ordem', { ascending: true })
      // E `id` fecha a ordenação. Sem ele, (rodada 1, ordem 4) é o mesmo par
      // para TODO fechamento do sistema, e o corte de página no meio desse
      // grupo repetia umas linhas e perdia outras. Ver o bloco acima.
      .order('id', { ascending: true })
      .range(de, ate),
  )

  const etapasPorCaso = new Map<string, EtapaQuadro[]>()
  for (const linha of linhasEtapas) {
    const etapa = normalizarEtapa(linha)
    const atuais = etapasPorCaso.get(etapa.casoId)
    if (atuais) atuais.push(etapa)
    else etapasPorCaso.set(etapa.casoId, [etapa])
  }

  return { casos, etapasPorCaso }
}

export function useQuadro() {
  return useQuery({
    queryKey: chavesQuadro.lista(),
    queryFn: carregarQuadro,
    /*
     * DOIS MINUTOS — o mesmo passo do cron do sync.
     *
     * O Realtime cobre o que a EQUIPE faz: ação de alguém no banco chega aqui
     * na hora. Ele não cobre o que chega de FORA — um card criado no Google
     * Calendar entra pelo job do pg_cron a cada 2 minutos (migration
     * 20260828015512), e aí só aparecia na próxima vez que alguém recarregasse
     * a página. Numa TV que fica ligada o dia inteiro, "alguém recarregar"
     * nunca acontece.
     *
     * Alinhado com o cron de propósito: buscar mais rápido que a fonte muda só
     * gasta requisição, e mais devagar deixaria o caso novo esperando por uma
     * janela que não é a do sync.
     *
     * `refetchIntervalInBackground` fica FALSO (o padrão): aba escondida não
     * precisa ser buscada, e ao voltar o TanStack refaz a busca sozinho.
     */
    refetchInterval: 2 * 60 * 1000,
  })
}
