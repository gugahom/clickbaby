import { IconeRelatorio } from '@/components/ui/icones'

/**
 * RELATÓRIOS — a tela existe, os números ainda não (28/09/2026, pedido do
 * gestor: "já pode criar a aba de relatório MAS SEM NADA NELA POR ENQUANTO").
 *
 * Ela nasce vazia DE PROPÓSITO, e a página diz isso em voz alta em vez de
 * fingir que está carregando. O que ainda não existe é o acordo sobre o que se
 * mede: as métricas da ficha da Equipe foram REMOVIDAS em 03/09/2026 por essa
 * mesma razão (seção 13), e recolocá-las aqui por conta própria seria refazer
 * a decisão que o gestor tomou.
 *
 * O DADO JÁ ESTÁ GUARDADO, e é isso que esta tela vai ler quando tiver
 * pergunta: `eventos` é append-only desde o primeiro dia (invariante 3.3), o
 * que permite calcular uma definição nova sobre o histórico inteiro — inclusive
 * o tempo em cada fase do trabalho de campo, que passou a ser gravado hoje.
 */
export function RelatoriosPage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-3 md:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-extrabold tracking-tight">Relatórios</h1>
        <p className="text-sm text-muted-foreground">
          O lugar dos números da operação.
        </p>
      </header>

      <div className="flex flex-col items-center gap-3 rounded-painel border border-dashed border-border bg-card/50 px-4 py-12 text-center">
        <IconeRelatorio className="size-8 text-muted-foreground/60" />
        <p className="max-w-sm text-sm text-muted-foreground">
          Ainda não há nada aqui. O sistema guarda o histórico desde o primeiro
          dia — falta combinar o que vale a pena medir.
        </p>
      </div>
    </div>
  )
}
