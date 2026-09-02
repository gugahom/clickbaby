import type { Lugar } from '../api/useEquipe'

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

export const ROTULO_PAPEL: Record<string, string> = {
  operador: 'Operação',
  comercial: 'Comercial',
  coordenacao: 'Coordenação',
  atendimento: 'Atendimento',
  financeiro: 'Financeiro',
  gestao: 'Gestão',
}

