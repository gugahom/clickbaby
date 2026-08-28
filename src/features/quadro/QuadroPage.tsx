import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { Botao } from '@/components/ui/Botao'
import { hojeNoFuso } from '@/lib/formato'
import { useQuadro } from './api/useQuadro'
import { useReabrirCaso, useRetornarDaUti, type EtapaTipo } from './api/useAcoes'
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
  casosComVideoMasterAberto,
  reelsAbertosDaSecao,
  videosMasterAbertos,
  casosConcluidos,
  casosNaUti,
} from './lib/secoes'
import { ordenarPorUrgencia } from './lib/alerta-horario'
import { filtrarCasos } from './lib/busca'
import { useRelogioDeMinuto } from './lib/useRelogio'
import { DiaBloco } from './components/DiaBloco'
import { CasoLinha } from './components/CasoLinha'
import { CartaoLateral } from './components/CartaoLateral'
import { PainelLateral } from './components/PainelLateral'
import { PainelDobravel } from './components/PainelDobravel'
import { RascunhosPainel } from './components/RascunhosPainel'
import { CartaoDeEdicao } from './components/CartaoDeEdicao'
import { CampoBusca } from './components/CampoBusca'
import { ReabrirCasoDialogo } from './components/ReabrirCasoDialogo'
import { IconeReabrir } from '@/components/ui/icones'
import type { CasoQuadro } from './types'
import type { EtapaQuadro } from './types'

/**
 * Aba só existe no mobile. No desktop as duas colunas convivem, porque a
 * pergunta "o que temos hoje" e a pergunta "quem está na UTI" são olhadas ao
 * mesmo tempo — inclusive na TV da sala de edição.
 */
type Aba = 'lista' | 'uti' | 'reels' | 'master' | 'concluidos' | 'rascunhos'

/** Mapa vazio estável: `new Map()` inline nasce sem tipo e vira `any` nos usos. */
const SEM_ETAPAS: Map<string, EtapaQuadro[]> = new Map()

export function QuadroPage() {
  const [aba, setAba] = useState<Aba>('lista')
  const [diasVisiveis, setDiasVisiveis] = useState(DIAS_INICIAIS)
  const { data, isPending, error } = useQuadro()
  const retornarDaUti = useRetornarDaUti()
  const [erroUti, setErroUti] = useState<string | null>(null)
  const [erroReels, setErroReels] = useState<string | null>(null)
  const [erroMaster, setErroMaster] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [reabrindo, setReabrindo] = useState<CasoQuadro | null>(null)
  const [erroReabrir, setErroReabrir] = useState<string | null>(null)
  const reabrirCaso = useReabrirCaso()

  const hoje = hojeNoFuso()
  const agora = useRelogioDeMinuto()
  // Mantém o Quadro igual em todos os aparelhos — ver useRealtimeQuadro.
  const { conectado } = useRealtimeQuadro()

  const buscando = busca.trim() !== ''

  const {
    blocos,
    rascunhos,
    naUti,
    emReels,
    emMaster,
    concluidos,
    totalAbertos,
    totalGeral,
  } = useMemo(() => {
    const todos = data?.casos ?? []
    const etapas = data?.etapasPorCaso ?? SEM_ETAPAS

    // A busca filtra ANTES do agrupamento, e por isso vale para tudo de uma
    // vez: dias, rascunhos, concluídos e as três seções. Filtrar depois
    // exigiria repetir a regra em cada lista, e elas divergiriam na primeira
    // vez que alguem mexesse em uma só.
    const casos = filtrarCasos(todos, busca)

    // A urgência entra POR CIMA da ordem por hora, não no lugar dela: quem não
    // está em alerta mantém a posição cronológica. Ver ordenarPorUrgencia.
    const abertos = blocosAbertos(agruparPorDia(casos)).map((bloco) => ({
      ...bloco,
      casos: ordenarPorUrgencia(bloco.casos, etapas, agora),
    }))

    return {
      blocos: abertos,
      rascunhos: casos.filter((c) => c.ehRascunho && !c.ehTerminal && !c.naUti),
      naUti: casosNaUti(casos),
      emReels: casosComVideoAberto(casos, etapas),
      emMaster: casosComVideoMasterAberto(casos, etapas),
      concluidos: casosConcluidos(casos),
      totalAbertos: abertos.reduce((soma, b) => soma + b.total, 0),
      // O denominador do "3 de 88". Sem ele a busca diria "3 casos" e não
      // haveria como saber se sobrou pouco por filtro ou por dia vazio.
      totalGeral: blocosAbertos(agruparPorDia(todos)).reduce((soma, b) => soma + b.total, 0),
    }
    // `agora` entra nas dependências porque a ordem depende dele: um caso entra
    // na janela de alerta sozinho, com o relógio andando, e precisa subir sem
    // que ninguém recarregue. O relógio bate de minuto em minuto e são ~90
    // casos — reagrupar custa nada.
  }, [data, busca, agora])

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
        buscando ? (
          <Aviso titulo={`Nada encontrado para “${busca.trim()}”`}>
            A busca olha nome da mãe, do bebê, pacote e maternidade. O caso pode
            estar em Rascunhos ou Concluídos — as abas filtram pelo mesmo termo.
          </Aviso>
        ) : (
          <Aviso titulo="Nenhum dia aberto">
            Todo caso previsto já foi resolvido ou está na UTI. Um dia só sai do
            Quadro quando não sobra trabalho nele — nunca por passagem de data.
          </Aviso>
        )
      ) : (
        <div className="space-y-5">
          {mostrados.map((bloco, i) => (
            <DiaBloco
              // A chave carrega o estado de busca de propósito: o DiaBloco
              // guarda "aberto" em estado próprio, e sem remontar ele ignoraria
              // a mudança. Um resultado escondido dentro de um dia fechado é
              // uma busca que respondeu e não mostrou.
              key={`${bloco.dia ?? 'sem-data'}-${buscando}`}
              bloco={bloco}
              hoje={hoje}
              etapasPorCaso={etapasPorCaso}
              abertoInicialmente={buscando || i < 2}
            />
          ))}

          {/* Ida e volta. Sem o "exibir menos", carregar mais era um caminho
              de mão única: quem abrisse 30 dias para procurar um caso ficava
              com os 30 rolando embaixo pelo resto do turno, e a única saída
              era recarregar a página — que também perde o que estiver aberto. */}
          {(restantes > 0 || diasVisiveis > DIAS_INICIAIS) && (
            <div className="flex flex-col gap-2 pt-1 pb-2 sm:flex-row sm:justify-center">
              {restantes > 0 && (
                <Botao
                  onClick={() => setDiasVisiveis((n) => n + DIAS_POR_PAGINA)}
                  className="w-full sm:w-auto"
                >
                  Carregar mais dias ({restantes} restantes)
                </Botao>
              )}
              {diasVisiveis > DIAS_INICIAIS && (
                // Contorno, não primário: desfazer não disputa atenção com
                // avançar.
                <Botao
                  variante="contorno"
                  onClick={() => setDiasVisiveis(DIAS_INICIAIS)}
                  className="w-full sm:w-auto"
                >
                  Exibir menos
                </Botao>
              )}
            </div>
          )}
        </div>
      )}
    </>
  )

  const conteudoUti = (
    <>
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
    </>
  )

  const conteudoReels = emReels.map((caso) => (
    <CartaoDeEdicao
      key={caso.id}
      caso={caso}
      hoje={hoje}
      etapas={etapasPorCaso.get(caso.id) ?? []}
      daSecao={reelsAbertosDaSecao(etapasPorCaso.get(caso.id) ?? [])}
      onErro={setErroReels}
    />
  ))

  const conteudoMaster = emMaster.map((caso) => (
    <CartaoDeEdicao
      key={caso.id}
      caso={caso}
      hoje={hoje}
      etapas={etapasPorCaso.get(caso.id) ?? []}
      daSecao={videosMasterAbertos(etapasPorCaso.get(caso.id) ?? [])}
      // Uma rodada só: o rótulo de bloco do reels ("Parto") não se aplica.
      rotularLinha={() => 'Vídeo'}
      onErro={setErroMaster}
    />
  ))

  const CRITERIO_REELS =
    'Vídeo liberado para editar, em andamento ou pausado. O caso segue na lista do dia.'
  const CRITERIO_MASTER =
    'Horizontal do MASTER, liberado ou em andamento. Prazo de 10 dias úteis.'
  const CRITERIO_UTI = 'Fora do dia e com o prazo de entrega congelado.'

  const painelReels = (
    <PainelLateral
      titulo="Reels"
      quantidade={emReels.length}
      criterio={CRITERIO_REELS}
      vazio="Nenhum vídeo aberto."
      erro={erroReels}
    >
      {conteudoReels}
    </PainelLateral>
  )

  const painelUti = (
    <PainelLateral
      titulo="UTI"
      quantidade={naUti.length}
      criterio={CRITERIO_UTI}
      vazio="Nenhum bebê na UTI."
      erro={erroUti}
    >
      {conteudoUti}
    </PainelLateral>
  )

  const painelMaster = (
    <PainelLateral
      titulo="Master"
      quantidade={emMaster.length}
      criterio={CRITERIO_MASTER}
      vazio="Nenhum vídeo de MASTER aberto."
      erro={erroMaster}
    >
      {conteudoMaster}
    </PainelLateral>
  )

  const listaConcluidos =
    concluidos.length === 0 ? (
      <Aviso
        titulo={
          buscando
            ? `Nada concluído para “${busca.trim()}”`
            : 'Nenhum caso concluído ainda'
        }
      >
        Casos encerrados e cancelados aparecem aqui.
      </Aviso>
    ) : (
      <div className="space-y-2 p-3 md:p-4">
        {concluidos.map((caso) => (
          <div key={caso.id}>
            <CasoLinha caso={caso} etapas={etapasPorCaso.get(caso.id) ?? []} />

            {/*
              REABRIR, e só no ENCERRADO.
              
              O gestor: "aqui no quadro de concluído eu não achei nenhuma opção
              pra reativar o cliente e colocar a edição". Não havia mesmo — o
              caso saia do Quadro e não voltava, e o retrabalho acontecia fora
              do sistema, que é onde ele deixa de ser medido.
              
              Cancelado não ganha o botão: desfazer um cancelamento é vender de
              novo, não editar de novo. A RPC também recusa — isto aqui é só
              para não oferecer o que vai ser negado.
            */}
            {caso.statusOperacional === 'encerrado' && (
              <div className="mt-1 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setErroReabrir(null)
                    setReabrindo(caso)
                  }}
                  className="inline-flex h-11 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-marca-suave hover:text-marca"
                >
                  <IconeReabrir className="size-4" />
                  Reabrir para alteração
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    )

  return (
    <div className="flex h-full flex-col">
      <header className="sticky top-0 z-10 flex-shrink-0 border-b border-border bg-card/85 px-3 py-3 backdrop-blur md:px-5">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            {/*
              "Painel de atividades" no título, "Quadro" na aba.
              
              Não é inconsistência: são duas coisas. O título nomeia a TELA
              inteira, que hoje tem quatro visões; a aba nomeia UMA delas, e
              trocar o rótulo dela para "Painel de atividades" a colocaria em
              pé de igualdade com Rascunhos e Concluídos — que são recortes
              dela, não irmãs.
              
              `truncate` porque em 375px o título novo é quase o dobro do
              antigo e disputaria a linha com os botões de aba.
            */}
            <h1 className="truncate text-lg font-bold tracking-tight md:text-2xl">
              Painel de atividades
            </h1>
            <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground md:text-sm">
              {isPending
                ? 'Carregando…'
                : buscando
                  ? `${totalAbertos} de ${totalGeral} ${totalGeral === 1 ? 'caso' : 'casos'}`
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

        {/*
          A BUSCA É UMA SÓ, e serve a aba que estiver aberta.
          
          Uma por aba seria mais arrumado e pior de usar: quem procura a
          Jéssica não sabe se ela está no Quadro, nos Rascunhos ou nos
          Concluídos — é por não saber que está procurando. Com um campo só, o
          termo continua valendo ao trocar de aba, e a resposta é achar em vez
          de digitar de novo.
          
          Linha própria, e não ao lado do título: num aparelho de 375px ela
          espremeria o título e os botões de aba num beco.
        */}
        <div className="mt-3 flex">
          <CampoBusca valor={busca} onMudar={setBusca} />
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
          {/* Mesma hierarquia do desktop: Reels primeiro, depois Master e
              UTI. No mobile não dá para uma seção ser "maior", então quem
              carrega a ordem é a posição — e a tira rola para a direita. */}
          <BotaoAba ativa={aba === 'reels'} onClick={() => setAba('reels')}>
            Reels ({emReels.length})
          </BotaoAba>
          <BotaoAba ativa={aba === 'master'} onClick={() => setAba('master')}>
            Master ({emMaster.length})
          </BotaoAba>
          <BotaoAba ativa={aba === 'uti'} onClick={() => setAba('uti')}>
            UTI ({naUti.length})
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
              {/*
                REELS EM CIMA E COM A SOBRA; MASTER e UTI dobráveis embaixo.
                
                Era `grid-rows-2` com UTI e Reels em metades iguais — e a UTI,
                quase sempre vazia, guardava meia coluna para dizer "nenhum
                bebê na UTI" enquanto a lista de reels, que é o trabalho do
                turno, rolava dentro da outra metade.
                
                `min-h-0` no contêiner e no REELS é o que faz a divisão
                funcionar: sem ele, um filho flex se recusa a encolher abaixo
                do próprio conteúdo e a coluna transborda a tela — que é
                exatamente o "scroll pra achar" que não se quer.
              */}
              <div className="flex min-h-0 flex-col gap-3">
                <div className="min-h-0 flex-1">{painelReels}</div>
                <PainelDobravel
                  titulo="Master"
                  quantidade={emMaster.length}
                  criterio={CRITERIO_MASTER}
                  vazio="Nenhum vídeo de MASTER aberto."
                  erro={erroMaster}
                >
                  {conteudoMaster}
                </PainelDobravel>
                <PainelDobravel
                  titulo="UTI"
                  quantidade={naUti.length}
                  criterio={CRITERIO_UTI}
                  vazio="Nenhum bebê na UTI."
                  erro={erroUti}
                >
                  {conteudoUti}
                </PainelDobravel>
              </div>
            </div>

            {/* Mobile: uma seção por vez, e aí o scroll é da página mesmo. */}
            <div className="min-h-0 flex-1 overflow-y-auto p-3 lg:hidden">
              {aba === 'lista' && listaPorDia}
              {aba === 'uti' && painelUti}
              {aba === 'reels' && painelReels}
              {aba === 'master' && painelMaster}
            </div>
          </>
        )}
      </div>

      {reabrindo && (
        <ReabrirCasoDialogo
          caso={reabrindo}
          etapas={etapasPorCaso.get(reabrindo.id) ?? []}
          ocupado={reabrirCaso.isPending}
          erro={erroReabrir}
          onCancelar={() => setReabrindo(null)}
          onConfirmar={(motivo, etapas) => {
            setErroReabrir(null)
            reabrirCaso
              .mutateAsync({ casoId: reabrindo.id, motivo, etapas: etapas as EtapaTipo[] })
              .then(() => setReabrindo(null))
              .catch((e) => setErroReabrir(mensagemDeErro(e)))
          }}
        />
      )}
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
