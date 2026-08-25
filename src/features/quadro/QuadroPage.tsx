import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { Botao } from '@/components/ui/Botao'
import { hojeNoFuso } from '@/lib/formato'
import { useQuadro } from './api/useQuadro'
import { useRetornarDaUti } from './api/useAcoes'
import { useRealtimeQuadro } from './api/useRealtimeQuadro'
import { mensagemDeErro } from './lib/erros'
import {
  DIAS_INICIAIS,
  DIAS_POR_PAGINA,
  agruparPorDia,
  blocosAbertos,
} from './lib/agrupar-por-dia'
import { casosConcluidos, casosEmEdicaoDeVideo, casosNaUti } from './lib/secoes'
import { useRelogioDeMinuto } from './lib/useRelogio'
import { DiaBloco } from './components/DiaBloco'
import { CasoLinha } from './components/CasoLinha'
import { CartaoLateral } from './components/CartaoLateral'
import { PainelLateral } from './components/PainelLateral'
import { RascunhosBarra } from './components/RascunhosBarra'
import type { EtapaQuadro } from './types'

/**
 * Aba só existe no mobile. No desktop as duas colunas convivem, porque a
 * pergunta "o que temos hoje" e a pergunta "quem está na UTI" são olhadas ao
 * mesmo tempo — inclusive na TV da sala de edição.
 */
type Aba = 'lista' | 'uti' | 'reels' | 'concluidos'

/** Mapa vazio estável: `new Map()` inline nasce sem tipo e vira `any` nos usos. */
const SEM_ETAPAS: Map<string, EtapaQuadro[]> = new Map()

export function QuadroPage() {
  const [aba, setAba] = useState<Aba>('lista')
  const [diasVisiveis, setDiasVisiveis] = useState(DIAS_INICIAIS)
  const { data, isPending, error } = useQuadro()
  const retornarDaUti = useRetornarDaUti()
  const [erroUti, setErroUti] = useState<string | null>(null)

  const hoje = hojeNoFuso()
  const agora = useRelogioDeMinuto()
  // Mantém o Quadro igual em todos os aparelhos — ver useRealtimeQuadro.
  const { conectado } = useRealtimeQuadro()

  const { blocos, rascunhos, naUti, emReels, concluidos, totalAbertos } = useMemo(() => {
    const casos = data?.casos ?? []
    const etapas = data?.etapasPorCaso ?? SEM_ETAPAS
    const abertos = blocosAbertos(agruparPorDia(casos))
    return {
      blocos: abertos,
      rascunhos: casos.filter((c) => c.ehRascunho && !c.ehTerminal && !c.naUti),
      naUti: casosNaUti(casos),
      emReels: casosEmEdicaoDeVideo(casos, etapas),
      concluidos: casosConcluidos(casos),
      totalAbertos: abertos.reduce((soma, b) => soma + b.total, 0),
    }
  }, [data])

  if (error) {
    return (
      <Aviso titulo="Não foi possível carregar o Quadro">
        {error instanceof Error ? error.message : 'Erro desconhecido.'}
      </Aviso>
    )
  }

  const etapasPorCaso = data?.etapasPorCaso ?? SEM_ETAPAS
  const mostrados = blocos.slice(0, diasVisiveis)
  const restantes = blocos.length - mostrados.length

  const listaPorDia = (
    <>
      <RascunhosBarra rascunhos={rascunhos} hoje={hoje} />

      {blocos.length === 0 ? (
        <Aviso titulo="Nenhum dia aberto">
          Todo caso previsto já foi resolvido ou está na UTI. Um dia só sai do Quadro
          quando não sobra trabalho nele — nunca por passagem de data.
        </Aviso>
      ) : (
        <>
          {mostrados.map((bloco, i) => (
            <DiaBloco
              key={bloco.dia ?? 'sem-data'}
              bloco={bloco}
              hoje={hoje}
              etapasPorCaso={etapasPorCaso}
              abertoInicialmente={i < 2}
            />
          ))}

          {restantes > 0 && (
            <div className="p-4 text-center">
              <Botao
                onClick={() => setDiasVisiveis((n) => n + DIAS_POR_PAGINA)}
                className="w-full sm:w-auto"
              >
                Carregar mais dias ({restantes} restantes)
              </Botao>
            </div>
          )}
        </>
      )}
    </>
  )

  const painelUti = (
    <PainelLateral
      titulo="UTI"
      quantidade={naUti.length}
      criterio="Fora do dia e com o prazo de entrega congelado."
      vazio="Nenhum bebê na UTI."
      erro={erroUti}
    >
      {naUti.map((caso) => (
        <CartaoLateral
          key={caso.id}
          caso={caso}
          hoje={hoje}
          destaque="uti"
          detalhe={`Na UTI há ${duracaoDesde(caso.utiDesde, agora)}`}
          acao={
            <button
              type="button"
              disabled={retornarDaUti.isPending}
              onClick={() => {
                setErroUti(null)
                retornarDaUti
                  .mutateAsync({ casoId: caso.id })
                  .catch((e) => setErroUti(mensagemDeErro(e)))
              }}
              className="min-h-9 rounded-md border border-border px-2 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50"
            >
              Voltar da UTI
            </button>
          }
        />
      ))}
    </PainelLateral>
  )

  const painelReels = (
    <PainelLateral
      titulo="Reels"
      quantidade={emReels.length}
      criterio="Edição de vídeo em andamento. O caso segue na lista do dia."
      vazio="Nenhuma edição de vídeo em andamento."
    >
      {emReels.map((caso) => {
        const video = etapasPorCaso.get(caso.id)?.find((e) => e.tipo === 'edicao_video')
        return (
          <CartaoLateral
            key={caso.id}
            caso={caso}
            hoje={hoje}
            destaque="reels"
            detalhe={
              video?.responsavelNome
                ? `Editando: ${video.responsavelNome}`
                : 'Edição em andamento'
            }
          />
        )
      })}
    </PainelLateral>
  )

  const listaConcluidos =
    concluidos.length === 0 ? (
      <Aviso titulo="Nenhum caso concluído ainda">
        Casos encerrados e cancelados aparecem aqui.
      </Aviso>
    ) : (
      <div>
        {concluidos.map((caso) => (
          <CasoLinha
            key={caso.id}
            caso={caso}
            etapas={etapasPorCaso.get(caso.id) ?? []}
          />
        ))}
      </div>
    )

  return (
    <div className="flex h-full flex-col">
      <header className="sticky top-0 z-10 flex-shrink-0 border-b border-border bg-card px-3 py-3 shadow-cartao md:px-4">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-lg font-bold tracking-tight md:text-2xl">Quadro</h1>
            <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground md:text-sm">
              {isPending
                ? 'Carregando…'
                : `${totalAbertos} ${totalAbertos === 1 ? 'caso' : 'casos'} em ${blocos.length} ${blocos.length === 1 ? 'dia' : 'dias'}`}
              {/* Só aparece quando NÃO está conectado. Um selo verde permanente
                  vira ruído que ninguém lê; o que a pessoa precisa saber é o
                  contrário — que a tela pode estar velha. */}
              {!conectado && !isPending && (
                <span
                  className="rounded-full bg-atencao/15 px-2 py-0.5 text-[11px] font-medium text-atencao"
                  title="Sem conexão ao vivo. A tela pode não refletir o que outra pessoa acabou de fazer."
                >
                  fora do ao vivo
                </span>
              )}
            </p>
          </div>

          {/* No desktop só resta a escolha entre o Quadro e o arquivo; UTI e
              Reels estão sempre visíveis na coluna direita. */}
          <div className="hidden flex-shrink-0 gap-1 lg:flex" role="group" aria-label="Visão">
            <BotaoAba ativa={aba !== 'concluidos'} onClick={() => setAba('lista')}>
              Quadro
            </BotaoAba>
            <BotaoAba ativa={aba === 'concluidos'} onClick={() => setAba('concluidos')}>
              Concluídos ({concluidos.length})
            </BotaoAba>
          </div>
        </div>

        {/* Mobile: as duas colunas não cabem lado a lado, então viram abas. */}
        <div
          className="mt-3 flex gap-1 overflow-x-auto lg:hidden"
          role="group"
          aria-label="Seções"
        >
          <BotaoAba ativa={aba === 'lista'} onClick={() => setAba('lista')}>
            Lista
          </BotaoAba>
          <BotaoAba ativa={aba === 'uti'} onClick={() => setAba('uti')}>
            UTI ({naUti.length})
          </BotaoAba>
          <BotaoAba ativa={aba === 'reels'} onClick={() => setAba('reels')}>
            Reels ({emReels.length})
          </BotaoAba>
          <BotaoAba ativa={aba === 'concluidos'} onClick={() => setAba('concluidos')}>
            Concluídos ({concluidos.length})
          </BotaoAba>
        </div>
      </header>

      {/* overflow-hidden, não auto: no desktop quem rola são as três caixas
          (lista, UTI, Reels), cada uma por dentro. Um scroll de página aqui
          faria as seções crescerem e se empurrarem de novo. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {isPending ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            Carregando casos…
          </p>
        ) : aba === 'concluidos' ? (
          <div className="min-h-0 flex-1 overflow-y-auto">{listaConcluidos}</div>
        ) : (
          <>
            {/* Desktop: lista larga à esquerda; à direita, UTI e Reels dividem
                a altura em duas linhas IGUAIS (grid-rows-2). Cada uma rola por
                dentro, então nenhuma empurra a outra por mais casos que tenha. */}
            <div className="hidden min-h-0 flex-1 lg:grid lg:grid-cols-[minmax(0,1fr)_30rem] lg:gap-4 lg:p-4">
              <div className="min-h-0 overflow-y-auto rounded-md border border-border bg-card shadow-painel">
                {listaPorDia}
              </div>
              <div className="grid min-h-0 grid-rows-2 gap-4">
                {painelUti}
                {painelReels}
              </div>
            </div>

            {/* Mobile: uma seção por vez, e aí o scroll é da página mesmo. */}
            <div className="min-h-0 flex-1 overflow-y-auto lg:hidden">
              {aba === 'lista' && listaPorDia}
              {aba === 'uti' && <div className="p-3">{painelUti}</div>}
              {aba === 'reels' && <div className="p-3">{painelReels}</div>}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function BotaoAba({
  ativa,
  onClick,
  children,
}: {
  ativa: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativa}
      className={clsx(
        'min-h-11 flex-shrink-0 rounded-md px-3.5 text-sm font-semibold transition-colors',
        ativa
          ? 'bg-marca text-white shadow-cartao'
          : 'border border-border text-muted-foreground hover:bg-marca-suave hover:text-marca',
      )}
    >
      {children}
    </button>
  )
}

/** "4h", "2d" — quanto tempo desde um instante. */
function duracaoDesde(iso: string | null, agora: Date): string {
  if (!iso) return '—'
  const horas = (agora.getTime() - new Date(iso).getTime()) / 3_600_000
  if (horas < 1) return `${Math.max(1, Math.round(horas * 60))}min`
  if (horas < 48) return `${Math.round(horas)}h`
  return `${Math.round(horas / 24)}d`
}

function Aviso({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-lg p-8 text-center">
      <h2 className="font-semibold">{titulo}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{children}</p>
    </div>
  )
}
