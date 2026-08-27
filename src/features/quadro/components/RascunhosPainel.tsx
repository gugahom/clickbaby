import { useState } from 'react'
import { Botao } from '@/components/ui/Botao'
import { IconeCaneta } from '@/components/ui/icones'
import { rotularDia } from '@/lib/formato'
import type { CasoQuadro } from '../types'
import { EditarCasoDialogo } from './EditarCasoDialogo'

interface PropsRascunhosPainel {
  rascunhos: CasoQuadro[]
  hoje: string
}

/**
 * Rascunhos pendentes, em aba própria.
 *
 * ONDE ISTO MORAVA E POR QUE MUDOU
 * Era uma barra amarela sanfonada no topo da lista de dias. Três problemas.
 * Ocupava a faixa mais valiosa da tela — a primeira coisa abaixo do cabeçalho
 * deveria ser o trabalho de hoje, não uma pendência de cadastro. Fechada não
 * dizia nada além de um número; aberta empurrava o dia inteiro para baixo.
 * E, sobretudo, mudou de natureza: com o editor, deixou de ser aviso e virou
 * FILA DE TRABALHO — 47 de 88 casos esperando alguém padronizar.
 *
 * Fila de trabalho é modo, não vizinhança. Alguém entra, resolve dez, sai. Por
 * isso aba, ao lado de Quadro e Concluídos, e não mais uma tira competindo com
 * a lista.
 *
 * O que NÃO mudou: o rascunho continua aparecendo dentro do bloco do dia dele,
 * com selo e o botão "Completar". "Fora do fluxo operacional" quer dizer sem
 * ações de etapa, não invisível — são mais da metade dos casos, e escondê-los
 * do dia esconderia trabalho que vai acontecer.
 *
 * A regra de o que É rascunho não é reimplementada aqui: `ehRascunho`,
 * `faltaPacote` e `faltaMaternidade` vêm derivados da view `quadro_casos`.
 */
export function RascunhosPainel({ rascunhos, hoje }: PropsRascunhosPainel) {
  const [emEdicao, setEmEdicao] = useState<CasoQuadro | null>(null)

  if (rascunhos.length === 0) {
    return (
      <div className="mx-auto max-w-lg p-8 text-center">
        <h2 className="font-semibold">Nenhum rascunho pendente</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Todo caso vindo do Calendar tem pacote e maternidade definidos.
        </p>
      </div>
    )
  }

  return (
    <div className="p-3 md:p-4">
      <p className="mb-3 text-sm text-muted-foreground">
        O sync não conseguiu mapear pacote ou maternidade com certeza e não
        adivinha — pacote errado gera checklist de etapas errado. Complete o
        cadastro e o caso entra no fluxo.
      </p>

      <ul className="space-y-2">
        {rascunhos.map((caso) => {
          const titulo = caso.bebeNome ? `${caso.maeNome} · ${caso.bebeNome}` : caso.maeNome
          return (
            <li
              key={caso.id}
              className="flex items-center gap-3 rounded-cartao border border-rascunho-borda bg-card px-3 py-2.5 shadow-cartao transition-shadow hover:shadow-cartao-alto md:px-4"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{titulo}</div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <span>{caso.dia ? rotularDia(caso.dia, hoje) : 'sem data'}</span>
                  {caso.faltaPacote && <Falta>sem pacote</Falta>}
                  {caso.faltaMaternidade && <Falta>sem maternidade</Falta>}
                  {/* O que JÁ tem também importa: evita reabrir um caso a que
                      só falta um dos dois campos. */}
                  {!caso.faltaPacote && caso.pacoteNome && (
                    <span className="font-medium text-foreground">{caso.pacoteNome}</span>
                  )}
                  {!caso.faltaMaternidade && caso.maternidadeSigla && (
                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono">
                      {caso.maternidadeSigla}
                    </span>
                  )}
                </div>
              </div>

              <Botao
                variante="primario"
                onda
                onClick={() => setEmEdicao(caso)}
                className="flex-shrink-0"
              >
                <IconeCaneta className="size-4" />
                Completar
              </Botao>
            </li>
          )
        })}
      </ul>

      {emEdicao && (
        <EditarCasoDialogo caso={emEdicao} onFechar={() => setEmEdicao(null)} />
      )}
    </div>
  )
}

function Falta({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded border border-rascunho-borda bg-rascunho-fundo px-1.5 py-0.5 font-medium text-rascunho">
      {children}
    </span>
  )
}
