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
import {
  casosComVideoAberto,
  reelsAbertosDaSecao,
  casosConcluidos,
  casosNaUti,
} from './lib/secoes'
import { useRelogioDeMinuto } from './lib/useRelogio'
import { DiaBloco } from './components/DiaBloco'
import { CasoLinha } from './components/CasoLinha'
import { CartaoLateral } from './components/CartaoLateral'
import { PainelLateral } from './components/PainelLateral'
import { RascunhosPainel } from './components/RascunhosPainel'
import { CartaoReels } from './components/CartaoReels'
import type { EtapaQuadro } from './types'

/**
 * Aba só existe no mobile. No desktop as duas colunas convivem, porque a
 * pergunta "o que temos hoje" e a pergunta "quem está na UTI" são olhadas ao
 * mesmo tempo — inclusive na TV da sala de edição.
 */
type Aba = 'lista' | 'uti' | 'reels' | 'concluidos' | 'rascunhos'

/** Mapa vazio estável: `new Map()` inline nasce sem tipo e vira `any` nos usos. */
const SEM_ETAPAS: Map<string, EtapaQuadro[]> = new Map()

export function QuadroPage() {
  const [aba, setAba] = useState<Aba>('lista')
  const [diasVisiveis, setDiasVisiveis] = useState(DIAS_INICIAIS)
  const { data, isPending, error } = useQuadro()
  const retornarDaUti = useRetornarDaUti()
  const [erroUti, setErroUti] = useState<string | null>(null)
  const [erroReels, setErroReels] = useState<string | null>(null)

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
      emReels: casosComVideoAberto(casos, etapas),
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
      {blocos.length === 0 ? (
        <Aviso titulo="Nenhum dia aberto">
          Todo caso previsto já foi resolvido ou está na UTI. Um dia só sai do Quadro
          quando não sobra trabalho nele — nunca por passagem de data.
        </Aviso>
      ) : (
        <div className="space-y-5">
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
            <div className="pt-1 pb-2 text-center">
              <Botao
                onClick={() => setDiasVisiveis((n) => n + DIAS_POR_PAGINA)}
                className="w-full sm:w-auto"
              >
                Carregar mais dias ({restantes} restantes)
              </Botao>
            </div>
          )}
        </div>
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
            <Botao
              variante="contorno"
              onda
              disabled={retornarDaUti.isPending}
              onClick={() => {
                setErroUti(null)
                retornarDaUti
                  .mutateAsync({ casoId: caso.id })
                  .catch((e) => setErroUti(mensagemDeErro(e)))
              }}
              className="px-3 text-xs"
            >
              Voltar da UTI
            </Botao>
          }
        />
      ))}
    </PainelLateral>
  )

  const painelReels = (
    <PainelLateral
      titulo="Reels"
      quantidade={emReels.length}
      criterio="Vídeo liberado para editar, em andamento ou pausado. O caso segue na lista do dia."
      vazio="Nenhum vídeo aberto."
      erro={erroReels}
    >
      {emReels.map((caso) => (
        <CartaoReels
          key={caso.id}
          caso={caso}
          hoje={hoje}
          etapas={etapasPorCaso.get(caso.id) ?? []}
          reels={reelsAbertosDaSecao(etapasPorCaso.get(caso.id) ?? [])}
          onErro={setErroReels}
        />
      ))}
    </PainelLateral>
  )

  const listaConcluidos =
    concluidos.length === 0 ? (
      <Aviso titulo="Nenhum caso concluído ainda">
        Casos encerrados e cancelados aparecem aqui.
      </Aviso>
    ) : (
      <div className="space-y-2 p-3 md:p-4">
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
      <header className="sticky top-0 z-10 flex-shrink-0 border-b border-border bg-card/85 px-3 py-3 backdrop-blur md:px-5">
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
            <BotaoAba ativa={aba === 'lista'} onClick={() => setAba('lista')}>
              Quadro
            </BotaoAba>
            {/* Rascunhos é MODO de trabalho, não vizinhança: alguém entra,
                padroniza dez cadastros e sai. Por isso aba, e não mais a tira
                amarela que ocupava o topo da lista do dia. O contador em
                âmbar é o que puxa para cá. */}
            <BotaoAba
              ativa={aba === 'rascunhos'}
              onClick={() => setAba('rascunhos')}
              contagem={rascunhos.length}
              tom="rascunho"
            >
              Rascunhos
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
          <BotaoAba
            ativa={aba === 'rascunhos'}
            onClick={() => setAba('rascunhos')}
            contagem={rascunhos.length}
            tom="rascunho"
          >
            Rascunhos
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
        ) : aba === 'rascunhos' ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <RascunhosPainel rascunhos={rascunhos} hoje={hoje} />
          </div>
        ) : (
          <>
            {/* Desktop: lista larga à esquerda; à direita, UTI e Reels dividem
                a altura em duas linhas IGUAIS (grid-rows-2). Cada uma rola por
                dentro, então nenhuma empurra a outra por mais casos que tenha. */}
            <div className="hidden min-h-0 flex-1 lg:grid lg:grid-cols-[minmax(0,1fr)_30rem] lg:gap-4 lg:p-4">
              {/* Sem painel branco em volta: o chão pastel precisa aparecer
                  ENTRE os cartões, senão eles voltam a ser linhas de uma
                  grade e a separação do item 5 não existe. */}
              <div className="min-h-0 overflow-y-auto pr-1">{listaPorDia}</div>
              <div className="grid min-h-0 grid-rows-2 gap-4">
                {painelUti}
                {painelReels}
              </div>
            </div>

            {/* Mobile: uma seção por vez, e aí o scroll é da página mesmo. */}
            <div className="min-h-0 flex-1 overflow-y-auto p-3 lg:hidden">
              {aba === 'lista' && listaPorDia}
              {aba === 'uti' && painelUti}
              {aba === 'reels' && painelReels}
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
  contagem,
  tom = 'marca',
  children,
}: {
  ativa: boolean
  onClick: () => void
  /** Quando presente, vira selo em vez de "(n)" no meio do texto. */
  contagem?: number
  tom?: 'marca' | 'rascunho'
  children: React.ReactNode
}) {
  return (
    <Botao
      variante={ativa ? 'primario' : 'contorno'}
      onClick={onClick}
      aria-pressed={ativa}
      className={clsx(
        'flex-shrink-0 px-4',
        ativa
          ? 'shadow-cartao'
          : 'bg-card/60 text-muted-foreground hover:bg-marca-suave hover:text-marca',
      )}
    >
      {children}
      {contagem !== undefined && contagem > 0 && (
        <span
          className={clsx(
            'rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums',
            ativa
              ? 'bg-white/25 text-white'
              : tom === 'rascunho'
                ? 'bg-rascunho text-white'
                : 'bg-muted text-muted-foreground',
          )}
        >
          {contagem}
        </span>
      )}
    </Botao>
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
