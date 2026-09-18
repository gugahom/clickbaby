import type { QueryClient } from '@tanstack/react-query'
import { chavesQuadro } from './useQuadro'
import { TETO_DE_CASOS, atualizarCasos } from './atualizar-por-caso'

/**
 * Quanto esperar por mais avisos antes de recarregar.
 *
 * Um gesto na tela gera VÁRIOS avisos do Realtime (a etapa muda, o status do
 * caso é recalculado por trigger, um evento é gravado), e todos chegam em
 * poucas centenas de milissegundos. Esperar este tanto junta todos numa
 * recarga só.
 */
const ESPERA_MS = 400

let pendente: ReturnType<typeof setTimeout> | null = null
let recargaCompleta = false
const casosMudados = new Set<string>()

/**
 * O ÚNICO LUGAR QUE MANDA RECARREGAR O QUADRO (18/09/2026, diagnóstico da
 * lentidão).
 *
 * O QUE ESTAVA ACONTECENDO. Toda ação chamava `invalidateQueries(['quadro'])`
 * no próprio sucesso, e o Realtime — ao receber o aviso da mesma mudança,
 * 400ms depois — chamava de novo. Quem agia recarregava o Quadro inteiro DUAS
 * vezes por toque: dois `quadro_casos`, seis páginas de `caso_etapas`, duas
 * consultas de presença, dois históricos. Com o Quadro sendo o histórico
 * inteiro do sistema, cada recarga passava de 200kB, e as duas brigavam com as
 * recargas de todas as outras telas abertas pelo mesmo banco pequeno — o que
 * levou uma pausa de 96ms a demorar 7 segundos para aparecer.
 *
 * POR QUE UM AGENDADOR COMPARTILHADO, e não "a segunda pega carona na
 * primeira". Deixar a recarga do Realtime ser ignorada quando já há uma em
 * andamento abriria uma brecha: se OUTRA pessoa mudar algo durante aquela
 * recarga — que já leu o banco antes da mudança —, o aviso dela seria engolido
 * e a tela ficaria errada até a próxima rede de segurança, dois minutos depois.
 * Tela e banco discordando sem erro é a pior classe de defeito deste projeto
 * (seção 5 do CLAUDE.md).
 *
 * Aqui a ação e o Realtime ENTRAM NA MESMA FILA: cada um reinicia a mesma
 * espera. O eco da própria ação chega dentro dela e vira uma recarga só; e
 * toda recarga COMEÇA depois do último aviso recebido, então nenhuma mudança
 * fica de fora. Se o Realtime estiver caído, a ação ainda agenda a recarga
 * dela — o toque nunca deixa de aparecer na tela de quem tocou.
 *
 * O preço é o Quadro de quem agiu atualizar ~400ms depois, e não na hora. Na
 * hora nunca foi: a recarga que começava "na hora" levava segundos para voltar.
 *
 * DOIS TAMANHOS DE RECARGA (mesmo dia, correção 4). A fila guarda QUAIS casos
 * mudaram, e quando a espera acaba busca só esses (ver atualizar-por-caso.ts).
 * A recarga completa continua existindo para o que não diz de que caso se trata
 * — a reconexão do canal, uma ação sem caso conhecido, uma leva grande do sync —
 * e ela engole os casos que estavam na fila, porque já os traz.
 */
export function agendarRecargaDoQuadro(queryClient: QueryClient): void {
  recargaCompleta = true
  agendar(queryClient)
}

/** O caso `casoId` mudou: na fila, junto com o que mais chegar na espera. */
export function agendarRecargaDoCaso(queryClient: QueryClient, casoId: string): void {
  casosMudados.add(casoId)
  agendar(queryClient)
}

function agendar(queryClient: QueryClient): void {
  if (pendente) clearTimeout(pendente)
  pendente = setTimeout(() => {
    pendente = null
    const ids = [...casosMudados]
    const completa = recargaCompleta || ids.length > TETO_DE_CASOS
    recargaCompleta = false
    casosMudados.clear()

    if (completa) {
      void queryClient.invalidateQueries({ queryKey: chavesQuadro.todos })
      void queryClient.invalidateQueries({ queryKey: ['historico'] })
      return
    }

    // A presença recarrega junto: quem está OCUPADA muda quando as etapas
    // mudam, e a bolinha não pode andar num relógio diferente do card.
    void queryClient.invalidateQueries({ queryKey: chavesQuadro.atividade() })
    // O histórico do card aberto: uma ação de outra pessoa é fato novo no log,
    // e é o que o card deveria mostrar aparecendo. Só o dos casos que mudaram.
    for (const id of ids) {
      void queryClient.invalidateQueries({ queryKey: ['historico', id] })
    }
    void atualizarCasos(queryClient, ids)
  }, ESPERA_MS)
}
