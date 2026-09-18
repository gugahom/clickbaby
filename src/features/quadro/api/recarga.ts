import type { QueryClient } from '@tanstack/react-query'
import { chavesQuadro } from './useQuadro'

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
 */
export function agendarRecargaDoQuadro(queryClient: QueryClient): void {
  if (pendente) clearTimeout(pendente)
  pendente = setTimeout(() => {
    pendente = null
    void queryClient.invalidateQueries({ queryKey: chavesQuadro.todos })
    void queryClient.invalidateQueries({ queryKey: ['historico'] })
  }, ESPERA_MS)
}
