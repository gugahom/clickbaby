import { createBrowserRouter, Navigate } from 'react-router'
import { AppShell } from './layout/AppShell'
import { RotaProtegida } from './guards/RotaProtegida'
import { RotaDaTela } from './guards/RotaDaTela'
import { Inicio } from './guards/Inicio'
import { CalendarioPage } from '@/features/calendario/CalendarioPage'
import { DespesasPage } from '@/features/despesas/DespesasPage'
import { LoginPage } from '@/features/auth/LoginPage'
import { EquipePage } from '@/features/equipe/EquipePage'
import { RelatoriosPage } from '@/features/relatorios/RelatoriosPage'
import { RelatorioExternoPage } from '@/features/relatorios/externo/RelatorioExternoPage'
import { PerfilPage } from '@/features/perfil/PerfilPage'
import { CrmLayout } from '@/features/comercial/crm/CrmLayout'
import { InicioDoCrm } from '@/features/comercial/paginas/InicioDoCrm'
import { LeadsDoCrm } from '@/features/comercial/paginas/LeadsDoCrm'
import { FunilDoCrm } from '@/features/comercial/paginas/FunilDoCrm'
import { AgendaDoCrm } from '@/features/comercial/paginas/AgendaDoCrm'
import { ConfiguracoesDoCrm } from '@/features/comercial/paginas/ConfiguracoesDoCrm'
import { EmBreveDoCrm } from '@/features/comercial/paginas/EmBreveDoCrm'

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
// ROTA NOVA DE PRIMEIRO NÍVEL entra também em `ROTAS_DO_APP`, no vite.config.ts:
// sem isso, abrir o endereço direto (link colado, F5) dá 404 no Cloudflare.
export const router = createBrowserRouter(
  [
    { path: '/login', element: <LoginPage /> },
    {
      element: <RotaProtegida />,
      children: [
        {
          element: <AppShell />,
          children: [
            // CADA TELA ATRÁS DA PRÓPRIA PORTA (30/09/2026): quem vê o quê é a
            // lista de telas da pessoa, que a gestão concede na Equipe — ver
            // `RotaDaTela` e a migration 20260930232424.
            {
              element: <RotaDaTela tela="quadro" />,
              // Quem vende entra direto no Comercial — a página dele.
              children: [{ index: true, element: <Inicio /> }],
            },
            // O perfil é de qualquer pessoa logada — inclusive, e sobretudo,
            // de quem opera: é ali que a senha inicial compartilhada morre.
            { path: 'perfil', element: <PerfilPage /> },
            {
              element: <RotaDaTela tela="equipe" />,
              children: [{ path: 'equipe', element: <EquipePage /> }],
            },
            {
              element: <RotaDaTela tela="relatorios" />,
              children: [{ path: 'relatorios', element: <RelatoriosPage /> }],
            },
            {
              // O externo também é da tela Comercial, que o abre só no modo
              // comercial (01/10/2026).
              element: <RotaDaTela tela={['relatorios', 'comercial']} />,
              children: [{ path: 'relatorios/externo', element: <RelatorioExternoPage /> }],
            },
            {
              element: <RotaDaTela tela="despesas" />,
              children: [{ path: 'despesas', element: <DespesasPage /> }],
            },
            {
              element: <RotaDaTela tela="calendario" />,
              children: [{ path: 'calendario', element: <CalendarioPage /> }],
            },
          ],
        },
        {
          // O CRM DO COMERCIAL (18/11/2026) é uma página PRÓPRIA, fora da
          // moldura do Quadro: tem a barra, o cabeçalho e a busca dele — ver
          // `CrmLayout`. Aqui a tela é também a segurança: a RLS dos leads
          // confere `tem_tela('comercial')`.
          element: <RotaDaTela tela="comercial" />,
          children: [
            {
              path: 'comercial',
              element: <CrmLayout />,
              children: [
                { index: true, element: <InicioDoCrm /> },
                { path: 'leads', element: <LeadsDoCrm /> },
                { path: 'funil', element: <FunilDoCrm /> },
                { path: 'agenda', element: <AgendaDoCrm /> },
                { path: 'configuracoes', element: <ConfiguracoesDoCrm /> },
                // As páginas que ainda não chegaram — ver `navegacao.ts`.
                { path: ':pagina', element: <EmBreveDoCrm /> },
              ],
            },
          ],
        },
      ],
    },
    { path: '*', element: <Navigate to="/" replace /> },
  ],
  { basename: '/quadro' },
)
