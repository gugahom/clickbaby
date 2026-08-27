import { createBrowserRouter, Navigate } from 'react-router'
import { AppShell } from './layout/AppShell'
import { RotaProtegida } from './guards/RotaProtegida'
import { LoginPage } from '@/features/auth/LoginPage'
import { QuadroPage } from '@/features/quadro/QuadroPage'
import { FilaPage } from '@/features/fila-edicao/FilaPage'

/**
 * Rotas do MVP. As telas do plano (seção 7 de docs/plano.md) entram como irmãs
 * do Quadro dentro de RotaProtegida: A (Quadro) e C (Fila de edição) existem;
 * faltam B (detalhe do caso), D (novo caso manual) e F (painel).
 *
 * BASENAME
 * O app é publicado sob /quadro/, com a raiz reservada para uma landing. O
 * basename absorve esse prefixo, então os caminhos aqui são relativos a ele:
 * '/' é o Quadro em /quadro, '/fila' é a Fila em /quadro/fila.
 *
 * Por isso NÃO existe mais uma rota '/quadro' aqui — ela viraria
 * /quadro/quadro. Os três lados desta decisão (base do Vite, outDir e este
 * basename) precisam concordar; ver o comentário em vite.config.ts.
 */
export const router = createBrowserRouter(
  [
    { path: '/login', element: <LoginPage /> },
    {
      element: <RotaProtegida />,
      children: [
        {
          element: <AppShell />,
          children: [
            { index: true, element: <QuadroPage /> },
            { path: '/fila', element: <FilaPage /> },
          ],
        },
      ],
    },
    { path: '*', element: <Navigate to="/" replace /> },
  ],
  { basename: '/quadro' },
)
