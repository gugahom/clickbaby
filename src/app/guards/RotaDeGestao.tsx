import { Navigate, Outlet } from 'react-router'
import { useAuth } from '@/features/auth/contexto'

/**
 * As telas administrativas, fechadas a quem opera.
 *
 * REDIRECIONA, não mostra "acesso negado". Uma fotógrafa nunca vai chegar aqui
 * por um link — a navegação da gestão não existe para ela (ver AppShell). Se
 * chegar, foi digitando o endereço ou por um link colado por alguém, e a
 * resposta útil é levá-la para o Quadro, não explicar uma porta que ela não
 * estava procurando.
 *
 * ISTO NÃO É A SEGURANÇA, É A NAVEGAÇÃO. Quem protege o dado é a RLS: um
 * operador que forçasse esta rota veria a mesma lista de pessoas que já pode
 * ler (`pessoas_select_compartilhada`) e nada além. A guarda existe para a
 * tela não oferecer o que não é dela — o mesmo princípio de `acoes.ts`.
 */
export function RotaDeGestao() {
  const { pessoa } = useAuth()

  if (pessoa?.papelSistema !== 'gestao') return <Navigate to="/" replace />

  return <Outlet />
}
