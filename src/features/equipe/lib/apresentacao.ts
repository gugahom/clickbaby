import type { Lugar } from '../api/useEquipe'
import type { PapelSistema } from '../api/useAcoesDaPessoa'

/**
 * Como a Equipe DIZ as coisas: rótulos, cores e formatos.
 *
 * Fora dos componentes porque três telas leem daqui — a lista, a ficha e a
 * Conta — e porque o Fast Refresh do Vite recusa um arquivo que exporta
 * componente e constante junto. O motivo real de estar num lugar só, porém, é
 * outro: se cada tela tivesse a própria tabela de cor de trilha, campo seria
 * azul numa e roxo na outra no dia em que alguém mexesse em uma delas.
 */

export const ROTULO_LUGAR: Record<Lugar, string> = {
  campo: 'Campo',
  ilha: 'Ilha',
}

/**
 * As duas trilhas têm cor, e não é decoração: campo é o azul da marca, ilha é
 * o rosa do acento — as mesmas duas cores do gradiente do cabeçalho, que são
 * as duas cores do logo. A operação inteira acontece entre esses dois lugares,
 * e a tela usa a paleta da casa para dizer isso sem legenda.
 */
export const COR_LUGAR: Record<Lugar, { texto: string; fundo: string; barra: string }> = {
  campo: { texto: 'text-marca', fundo: 'bg-marca-suave', barra: 'bg-marca' },
  ilha: { texto: 'text-acento', fundo: 'bg-acento-suave', barra: 'bg-acento' },
}

/** "3h12", "45min", "2d 4h". Precisão de segundo não serve a nenhuma decisão. */
export function formatarDuracao(minutos: number): string {
  if (minutos < 60) return `${Math.round(minutos)}min`

  const horas = Math.floor(minutos / 60)
  if (horas < 24) {
    const resto = Math.round(minutos % 60)
    return resto === 0 ? `${horas}h` : `${horas}h${String(resto).padStart(2, '0')}`
  }

  const dias = Math.floor(horas / 24)
  const sobra = horas % 24
  return sobra === 0 ? `${dias}d` : `${dias}d ${sobra}h`
}

/** "agora", "há 2h", "ontem", "há 3 dias". */
export function relativo(iso: string): string {
  const minutos = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (minutos < 5) return 'agora'
  if (minutos < 60) return `há ${minutos}min`
  const horas = Math.floor(minutos / 60)
  if (horas < 24) return `há ${horas}h`
  const dias = Math.floor(horas / 24)
  return dias === 1 ? 'ontem' : `há ${dias} dias`
}

/**
 * O nome que cada papel tem NA TELA — e ele não é o valor do enum.
 *
 * `operador` aparece como "Fotógrafo(a)" desde 03/09/2026, a pedido do gestor:
 * é como a empresa chama essas pessoas, e a seção 2 do CLAUDE.md manda usar o
 * vocabulário da operação na tela.
 *
 * O VALOR NO BANCO CONTINUA `operador`, E ISSO É DELIBERADO. A invariante 3.1
 * diz que não existe usuário do tipo "fotógrafa": as mesmas pessoas circulam
 * entre campo e ilha, e quem define a função é a ETAPA que ela executa, não um
 * atributo dela. O rótulo é como a casa chama quem opera; o modelo continua
 * sem tipo de pessoa.
 *
 * Se um dia alguém quiser filtrar trabalho por este campo — "mostre só as
 * fotógrafas" —, é aí que a invariante está sendo quebrada, e o lugar de
 * quebrá-la não é aqui: é numa conversa sobre mudar o modelo.
 */
export const ROTULO_PAPEL: Record<string, string> = {
  operador: 'Fotógrafo(a)',
  comercial: 'Comercial',
  coordenacao: 'Coordenação',
  atendimento: 'Atendimento',
  financeiro: 'Financeiro',
  gestao: 'Gestão',
}

/**
 * Os papéis do sistema, na ordem em que fazem sentido escolher.
 *
 * Fotógrafo(a) primeiro porque é o caso comum — das catorze pessoas
 * cadastradas, onze são. Gestão por último porque é a que dá mais poder, e uma
 * lista que começa pelo maior privilégio convida ao clique errado.
 *
 * Espelha o enum `papel_sistema`. Se um valor novo entrar no banco sem entrar
 * aqui, ele aparece cru na tela — de propósito: `ROTULO_PAPEL` cai para o
 * próprio valor em vez de esconder o que não conhece.
 */
export const PAPEIS: { id: PapelSistema; rotulo: string }[] = [
  { id: 'operador', rotulo: 'Fotógrafo(a)' },
  { id: 'atendimento', rotulo: 'Atendimento' },
  { id: 'comercial', rotulo: 'Comercial' },
  { id: 'coordenacao', rotulo: 'Coordenação' },
  { id: 'financeiro', rotulo: 'Financeiro' },
  { id: 'gestao', rotulo: 'Gestão' },
]
