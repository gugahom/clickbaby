import { Navigate } from 'react-router'
import { useAuth } from '@/features/auth/contexto'
import { useTelas } from '@/features/auth/telas'
import { QuadroPage } from '@/features/quadro/QuadroPage'
import { temPaginaPropriaDoComercial } from '../layout/destinos'

/**
 * A PÁGINA INICIAL. Para quase todo mundo é o Quadro; para quem é do papel
 * comercial é o Comercial, a página própria dele (18/11/2026) — ver
 * `temPaginaPropriaDoComercial`.
 */
export function Inicio() {
  const { pessoa } = useAuth()
  const telas = useTelas()
  if (temPaginaPropriaDoComercial(telas, pessoa?.papelSistema)) return <Navigate to="/comercial" replace />
  return <QuadroPage />
}
