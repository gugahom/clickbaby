import { Navigate, Outlet } from 'react-router'
import { useAuth } from '@/features/auth/contexto'

/**
 * Quem RECOLHE as despesas: o financeiro, e a gestão.
 *
 * É uma guarda PRÓPRIA, e não a `RotaDeGestao` com um papel a mais, porque as
 * duas respondem perguntas diferentes: a Equipe é cadastro de pessoas e acesso,
 * que o financeiro não tem por que mexer; o relatório de gasto é exatamente o
 * trabalho dele. Juntar as duas numa guarda só abriria a Equipe para o
 * financeiro no dia em que alguém quisesse abrir o relatório.
 *
 * Como a outra, ISTO É NAVEGAÇÃO, NÃO SEGURANÇA. `despesas` tem leitura
 * compartilhada por decisão do gestor (todos lançam e todos veem); quem forçar
 * esta rota vê o que já podia ler no card. A guarda existe para a tela não
 * aparecer a quem não recolhe nada.
 */
export function RotaDoFinanceiro() {
  const { pessoa } = useAuth()
  const papel = pessoa?.papelSistema

  if (papel !== 'financeiro' && papel !== 'gestao') return <Navigate to="/" replace />

  return <Outlet />
}
