import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { Botao } from '@/components/ui/Botao'
import { dataPorExtenso, hojeNoFuso } from '@/lib/formato'
import { useQuadro } from './api/useQuadro'
import { useReabrirCaso, useRetornarDaUti, type EtapaTipo } from './api/useAcoes'
import { useRealtimeQuadro } from './api/useRealtimeQuadro'
import { mensagemDeErro } from './lib/erros'
import {
  DIAS_INICIAIS,
  DIAS_POR_PAGINA,
  agruparPorDia,
  blocosAbertos,
  dividirEmDuasColunas,
  mereceDuasColunas,
  semFuturo,
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
import { useTelaLarga } from './lib/useTelaLarga'
import { DiaBloco } from './components/DiaBloco'
import { CasoLinha } from './components/CasoLinha'
import { CartaoLateral } from './components/CartaoLateral'
import { PainelLateral } from './components/PainelLateral'
import { PainelDobravel } from './components/PainelDobravel'
import { RascunhosPainel } from './components/RascunhosPainel'
import { CartaoDeEdicao } from './components/CartaoDeEdicao'
import { FaseDoVideo } from './components/FaseDoVideo'
import { CampoBusca } from './components/CampoBusca'
import { ReabrirCasoDialogo } from './components/ReabrirCasoDialogo'
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
  const telaLarga = useTelaLarga()
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
    //
    // SEM FUTURO (30/08/2026, a pedido do gestor): o Quadro corta em `hoje`.
    // Ver a nota de `semFuturo` em agrupar-por-dia.ts.
    const abertos = semFuturo(blocosAbertos(agruparPorDia(casos)), hoje).map((bloco) => ({
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
      // haveria como saber se sobrou pouco por filtro ou por dia vazio. Corta
      // futuro pelo mesmo motivo que `abertos`: senão a busca vazia diria
      // "88" enquanto a tela mostra só os dias até hoje.
      totalGeral: semFuturo(blocosAbertos(agruparPorDia(todos)), hoje).reduce(
        (soma, b) => soma + b.total,
        0,
      ),
    }
    // `agora` entra nas dependências porque a ordem depende dele: um caso entra
    // na janela de alerta sozinho, com o relógio andando, e precisa subir sem
    // que ninguém recarregue. O relógio bate de minuto em minuto e são ~90
    // casos — reagrupar custa nada. `hoje` entra pelo mesmo motivo que
    // `semFuturo` existe: à meia-noite um dia deixa de ser futuro sozinho.
  }, [data, busca, agora, hoje])

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

  // A decisão de duas colunas junta as duas perguntas: a tela COMPORTA (largura
  // de TV / monitor grande) e o dia PEDE (mais cartão do que cabe numa coluna).
  const emDuasColunas = telaLarga && mereceDuasColunas(mostrados)
  const colunasDeDias = emDuasColunas ? dividirEmDuasColunas(mostrados) : [mostrados]

  /** Posição do bloco na ordem original — as colunas embaralham o índice do
   *  `map`, e `abertoInicialmente` fala da ordem cronológica, não da coluna. */
  const indiceDoBloco = (bloco: (typeof mostrados)[number]) => mostrados.indexOf(bloco)

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
          {/*
            DUAS COLUNAS NA TV, uma no resto (01/09/2026, a pedido do gestor).

            A tela vai ficar ligada numa TV de 70" na sala, e o pedido dele foi
            literal: "o principal é ter todos os cards à vista". Num dia cheio
            — ontem com cinco casos abertos e hoje com oito — a lista de uma
            coluna só passa da altura da tela, e uma tela na parede ninguém
            rola.

            O espaço para isso já existia e estava sendo desperdiçado: o cartão
            usa perto de 40% da largura e o resto é vão. Em duas colunas o
            conteúdo continua do mesmo tamanho e a capacidade vertical dobra.

            VOLTA AO NORMAL SOZINHA quando o movimento cai — ver
            `mereceDuasColunas`. Dois cartões espalhados em duas meias telas
            leem como tela quebrada, não como tela organizada.
          */}
          <div
            className={clsx(
              emDuasColunas &&
                // `items-start`: sem isto as duas colunas esticam até a altura
                // da mais alta, e o vão da mais curta vira uma faixa clicável
                // que não é cartão nenhum.
                'grid grid-cols-2 items-start gap-5',
            )}
          >
            {colunasDeDias.map((coluna, indiceColuna) => (
              <div key={indiceColuna} className="space-y-5">
                {coluna.map((bloco) => (
                  <DiaBloco
                    // A chave carrega o estado de busca de propósito: o
                    // DiaBloco guarda "aberto" em estado próprio, e sem
                    // remontar ele ignoraria a mudança. Um resultado escondido
                    // dentro de um dia fechado é uma busca que respondeu e não
                    // mostrou.
                    key={`${bloco.dia ?? 'sem-data'}-${buscando}`}
                    bloco={bloco}
                    hoje={hoje}
                    etapasPorCaso={etapasPorCaso}
                    // Numa TV ninguém abre nada: tudo que está na tela precisa
                    // já estar aberto. Fora dela, os dois primeiros dias, como
                    // antes.
                    abertoInicialmente={
                      buscando || emDuasColunas || indiceDoBloco(bloco) < 2
                    }
                  />
                ))}
              </div>
            ))}
          </div>

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
      // O vídeo do MASTER não anda por play/pause/concluir: ele percorre as
      // cinco fases do fluxo que a equipe já usa no Trello. Ver FaseDoVideo.
      acoesDaLinha={(etapa) => <FaseDoVideo etapa={etapa} onErro={setErroMaster} />}
      // A linha já diz a fase por extenso; um selo repetindo em outras
      // palavras logo acima seria ruído.
      comSelo={false}
      onErro={setErroMaster}
    />
  ))

  const CRITERIO_REELS =
    'Vídeo liberado para editar, em andamento ou pausado. O caso segue na lista do dia.'
  const CRITERIO_MASTER =
    'Horizontal do MASTER, do backlog ao enviado. Prazo de 10 dias úteis.'
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
      vazio="Nenhum vídeo de MASTER em andamento."
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
          // O botão solto de reabrir saiu daqui e virou item do menu do
          // próprio cartão — ver CasoLinha. Ele pendurava abaixo do cartão,
          // fora da moldura dele, e era a única ação da tela que morava do
          // lado de fora do objeto sobre o qual agia.
          <CasoLinha
            key={caso.id}
            caso={caso}
            etapas={etapasPorCaso.get(caso.id) ?? []}
            onReabrir={(c) => {
              setErroReabrir(null)
              setReabrindo(c)
            }}
          />
        ))}
      </div>
    )

  return (
    <div className="flex h-full flex-col">
      {/* Sem `bg-card`: o chão pastel passa por baixo do cabeçalho da página
          agora, e quem separa é o `backdrop-blur` mais a borda. O branco aqui
          criava uma segunda faixa logo abaixo da faixa da marca, e as duas
          juntas empurravam a lista para o meio da tela. */}
      <header className="sticky top-0 z-10 flex-shrink-0 border-b border-border/70 bg-background/80 px-3 py-4 backdrop-blur-md md:px-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {/* O SOBRESCRITO. A data por extenso saiu do cabeçalho da marca,
                onde é referência curta, e aparece aqui por extenso porque
                acima do título ela é contexto: diz de que dia é este painel
                antes de a pessoa ler qualquer caso. */}
            <p className="rotulo-sobrescrito text-acento">{dataPorExtenso(hoje)}</p>
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
            {/*
              MENOR, E NA FONTE DO RESTO (30/08/2026, a pedido do gestor).

              Era 24px no celular e 36px no desktop, em Syne ExtraBold. Num
              painel operacional o título é a coisa que menos se lê: quem abre
              esta tela já sabe onde está, e o que precisa achar são os CASOS.
              Ele estava comprando três linhas de altura — sobrescrito, título,
              abas — antes do primeiro dado da tela aparecer.

              O tamanho que ele devolve não se perde: vai para o cabeçalho do
              cartão, que é o que se lê cem vezes por turno. É a mesma tinta,
              gasta onde rende.

              Em 375px agora cabe numa linha só, mas `text-balance` fica: se um
              dia a tela ganhar um título mais longo, ele reparte as duas linhas
              de forma pareja em vez de deixar uma palavra órfã.
            */}
            <h1 className="mt-0.5 text-lg font-extrabold tracking-tight text-balance md:text-2xl">
              Painel de atividades
            </h1>
            {/*
              O "x casos em x dias" saiu (28/08/2026, a pedido do gestor). Era
              um número que ninguém usa para decidir nada: quem olha o Quadro
              quer ver os CASOS, e a contagem ocupava a linha logo abaixo do
              título, que é a mais lida da tela.
              
              O aviso de conexão fica — ele não é estatística, é a única coisa
              que diz que a tela pode estar velha. E só aparece quando está
              ruim: um selo verde permanente vira ruído que ninguém lê.
            */}
            {!conectado && !isPending && (
              <p className="mt-0.5">
                <span
                  className="rounded-full bg-atencao/15 px-2 py-0.5 text-[11px] font-medium text-atencao"
                  title="Sem conexão ao vivo. A tela pode não refletir o que outra pessoa acabou de fazer."
                >
                  fora do ao vivo
                </span>
              </p>
            )}
          </div>

          {/* No desktop só resta a escolha entre o Quadro e o arquivo; UTI e
              Reels estão sempre visíveis na coluna direita. */}
          {/* As abas viram um GRUPO com moldura própria: um trilho arredondado
              onde a ativa é uma pílula cheia. Soltas, três pílulas lado a lado
              não diziam que eram alternativas entre si — pareciam três botões
              independentes, e um deles por acaso aceso. */}
          <div
            className="hidden flex-shrink-0 items-center gap-1 rounded-full border border-border bg-card p-1 shadow-cartao lg:flex"
            role="group"
            aria-label="Visão"
          >
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
            <BotaoAba
              ativa={aba === 'concluidos'}
              onClick={() => setAba('concluidos')}
              contagem={concluidos.length}
            >
              Concluídos
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
          {/* O contador vive AQUI agora, e não mais como subtítulo permanente.
              É a diferença entre estatística e resposta: "88 casos em 37 dias"
              ninguém usa para decidir nada; "3 de 88" é o que diz que a busca
              funcionou, e some junto com ela. */}
          <CampoBusca
            valor={busca}
            onMudar={setBusca}
            {...(buscando && !isPending
              ? { resultado: `${totalAbertos} de ${totalGeral}` }
              : {})}
          />
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
                  vazio="Nenhum vídeo de MASTER em andamento."
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
  /*
   * <button> cru e não o Botao: dentro do trilho, a moldura e a sombra do
   * Botao desenhariam uma segunda caixa dentro da caixa. Aqui a pílula ativa
   * é só fundo cheio, e as inativas não têm forma nenhuma até o hover — é o
   * trilho que dá a forma do conjunto.
   */
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativa}
      className={clsx(
        // min-h-11: a seção 6 pede 44px, e trocar o Botao por <button> cru
        // tinha deixado as abas em 36px. O trilho do desktop encolhe junto
        // com o padding dele, então o grupo não engorda por causa disso.
        'inline-flex min-h-11 flex-shrink-0 cursor-pointer items-center gap-2 rounded-full px-4 text-sm transition-colors',
        ativa
          ? 'bg-marca font-bold text-white'
          : 'font-medium text-muted-foreground hover:bg-marca-suave hover:text-marca',
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
                // CHEIO, e não um tint. É o único contador da tela que pede
                // ação — rascunho é cadastro incompleto esperando alguém — e
                // um disco pintado é o que faz o olho voltar para ele.
                ? 'bg-contador text-white'
                : 'bg-muted text-muted-foreground',
          )}
        >
          {contagem}
        </span>
      )}
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
