import type { Database } from '@/types/database'
import { useAuth } from './contexto'

export type Tela = Database['public']['Enums']['tela']

/**
 * AS TELAS QUE A GESTÃO CONCEDE, pessoa a pessoa (30/09/2026, pedido do
 * gestor). Até aqui quem via o quê era o PAPEL; agora é uma lista por pessoa,
 * e NULO quer dizer "o padrão do papel" — ver a migration 20260930232424.
 *
 * `poder` diz o que a tela libera ALÉM de mostrar: nas telas Relatórios e
 * Equipe o banco confere a tela, não o papel (decisão do gestor: "a tela dá o
 * poder junto"). Nas outras, os dados já eram de toda pessoa ativa e a tela é
 * só a porta — cancelar caso, criar caso e confirmar entrega continuam sendo
 * do papel.
 */
export const TELAS: { id: Tela; rotulo: string; descricao: string; poder?: string }[] = [
  { id: 'quadro', rotulo: 'Quadro', descricao: 'Os casos do dia, as seções e Entregáveis' },
  { id: 'concluidos', rotulo: 'Concluídos', descricao: 'A aba de casos entregues e a avaliação' },
  { id: 'calendario', rotulo: 'Calendário', descricao: 'Partos, horas marcadas, prazos e feriados' },
  {
    id: 'equipe',
    rotulo: 'Equipe',
    descricao: 'Cadastro, escala e acessos',
    poder: 'Dá o poder de mudar o cadastro, a escala e os acessos de todo mundo — inclusive o próprio.',
  },
  { id: 'despesas', rotulo: 'Despesas', descricao: 'O recolhimento do mês' },
  {
    id: 'relatorios',
    rotulo: 'Relatórios',
    descricao: 'Interno e externo',
    poder: 'Dá acesso às métricas das pessoas e à operação inteira, com nome de mãe e bebê.',
  },
  {
    id: 'comercial',
    rotulo: 'Comercial',
    descricao: 'As ofertas pós-parto: reels, New Born e Foto/Livro',
    poder:
      'Abre o relatório externo no modo comercial — os partos, com nome de mãe e bebê e os links — e deixa mudar a fase das ofertas.',
  },
]

/** Espelho literal de `telas_padrao_do_papel` no banco — muda nos dois. */
export function telasPadraoDoPapel(papel: string): Tela[] {
  if (papel === 'gestao') return ['quadro', 'concluidos', 'calendario', 'equipe', 'despesas', 'relatorios', 'comercial']
  if (papel === 'financeiro') return ['quadro', 'concluidos', 'calendario', 'despesas']
  if (papel === 'operador') return ['quadro']
  if (papel === 'comercial') return ['quadro', 'concluidos', 'calendario', 'comercial']
  return ['quadro', 'concluidos', 'calendario']
}

/** As escolhidas pela gestão, ou as do papel. */
export function telasEfetivas(telas: Tela[] | null, papel: string): Tela[] {
  return telas ?? telasPadraoDoPapel(papel)
}

/** As telas de quem está logado. Sem pessoa, nenhuma. */
export function useTelas(): Set<Tela> {
  const { pessoa } = useAuth()
  return new Set(pessoa ? telasEfetivas(pessoa.telas, pessoa.papelSistema) : [])
}
