import { createBrowserRouter, Navigate } from 'react-router'
import { AppShell } from './layout/AppShell'
import { RotaProtegida } from './guards/RotaProtegida'
import { RotaDeGestao } from './guards/RotaDeGestao'
import { LoginPage } from '@/features/auth/LoginPage'
import { QuadroPage } from '@/features/quadro/QuadroPage'
import { EquipePage } from '@/features/equipe/EquipePage'
import { ContaPage } from '@/features/conta/ContaPage'

/**
 * Rotas do MVP. As telas do plano (seção 7 de docs/plano.md) entram como irmãs
 * do Quadro dentro de RotaProtegida. Hoje existem o Quadro e a Equipe;
 * faltam B (detalhe do caso), D (novo caso manual) e F (painel).
 *
 * A Fila de edição (tela C) foi REMOVIDA a pedido do gestor — ele não a pediu
 * e ela não tinha uso na operação atual. A trava da seção 9 do CLAUDE.md
 * (iniciar antes de concluir, sem a qual o tempo de ciclo dá zero) NÃO some
 * junto: ela vive na migration 20260825051226, no banco. A view `fila_edicao`
 * e os testes pgTAP também continuam. O que saiu foi só a tela.
 *
 * BASENAME
 * O app é publicado sob /quadro/, com a raiz reservada para uma landing. O
 * basename absorve esse prefixo, então os caminhos aqui são relativos a ele:
 * '/' é o Quadro, servido em /quadro.
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
            // A conta é de qualquer pessoa logada — inclusive, e sobretudo,
            // de quem opera: é ali que a senha inicial compartilhada morre.
            { path: 'conta', element: <ContaPage /> },
            {
              // As telas da gestão vivem atrás de RotaDeGestao. Ela é a
              // navegação, não a segurança — ver o comentário lá.
              element: <RotaDeGestao />,
              children: [{ path: 'equipe', element: <EquipePage /> }],
            },
          ],
        },
      ],
    },
    { path: '*', element: <Navigate to="/" replace /> },
  ],
  { basename: '/quadro' },
)
