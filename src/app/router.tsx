import { createBrowserRouter, Navigate } from 'react-router'
import { AppShell } from './layout/AppShell'
import { RotaProtegida } from './guards/RotaProtegida'
import { LoginPage } from '@/features/auth/LoginPage'
import { QuadroPage } from '@/features/quadro/QuadroPage'

/**
 * Rotas do MVP. Só /quadro e /login existem nesta fatia; as demais telas do
 * plano (caso, fila de edição, entrega, painel — seção 7 de docs/plano.md)
 * entram como irmãs de /quadro dentro de RotaProtegida.
 */
export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <RotaProtegida />,
    children: [
      {
        element: <AppShell />,
        children: [
          { path: '/', element: <Navigate to="/quadro" replace /> },
          { path: '/quadro', element: <QuadroPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/quadro" replace /> },
])
