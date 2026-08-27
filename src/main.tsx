import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { LazyMotion } from 'motion/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/lib/queryClient'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { router } from '@/app/router'
import './index.css'

const raiz = document.getElementById('root')
if (!raiz) throw new Error('#root não encontrado')

createRoot(raiz).render(
  <StrictMode>
    {/*
      LazyMotion + `m` no lugar de `motion`: o componente completo do motion
      arrasta o motor de animação inteiro para o bundle inicial. Medido neste
      projeto, era +49.8 KB comprimidos (+29%) só para dar mola aos botões —
      caro para um app que carrega em 5G instável de corredor de maternidade.

      `domAnimation` traz só gestos e saída, que é tudo o que os botões usam,
      e é carregado por import dinâmico — vira um chunk à parte, que chega
      depois da primeira pintura. `strict` faz o build QUEBRAR se alguém
      importar `motion.*` em vez de `m.*` e desfizer isso sem perceber.
    */}
    <LazyMotion features={() => import('@/lib/motion-features').then((m) => m.default)} strict>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </QueryClientProvider>
    </LazyMotion>
  </StrictMode>,
)
