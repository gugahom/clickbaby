import { Navigate, Outlet } from 'react-router'
import { useAuth } from '@/features/auth/contexto'
import { podeVerConcluidos } from '@/features/quadro/lib/acoes'

/**
 * TODO PAPEL MENOS `operador` — atendimento e adm. É o recorte que o gestor deu
 * para o Calendário ("todos menos as fotógrafas", 30/09/2026), e o mesmo da aba
 * Concluídos: por isso a regra é `podeVerConcluidos`, uma definição só.
 *
 * Como as outras guardas, ISTO É NAVEGAÇÃO, NÃO SEGURANÇA: o que o calendário
 * mostra já é legível pela RLS de sempre. A guarda existe para a tela não
 * aparecer a quem só opera — a regra do gestor para a navegação (28/09/2026).
 */
export function RotaAdministrativa() {
  const { pessoa } = useAuth()

  if (!podeVerConcluidos(pessoa?.papelSistema ?? '')) return <Navigate to="/" replace />

  return <Outlet />
}
