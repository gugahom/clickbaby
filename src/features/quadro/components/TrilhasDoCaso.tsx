import clsx from 'clsx'
import { useRelogioDeMinuto } from '../lib/useRelogio'
import {
  ROTULO_ETAPA,
  ROTULO_RODADA,
  type EtapaQuadro,
  type StatusEtapa,
} from '../types'

interface PropsTrilhasDoCaso {
  etapas: EtapaQuadro[]
}

/**
 * Três faixas, não duas.
 *
 * A trilha no banco tem dois valores (acompanhamento e edição), e o REELS sai
 * de dentro da edição. É uma separação de TELA, e é deliberada: o gestor pediu
 * que a edição de reels aconteça na seção própria — a estação de edição é outro
 * lugar físico, com outra pessoa. Misturar reels e fotos na mesma fita
 * escondia isso.
 *
 * O que NÃO se pode perder ao separar: os reels continuam bloqueando o
 * encerramento do caso (migration 20260827181322). Se sumissem do card, quem
 * olhasse o Quadro veria tudo verde, clicaria em confirmar e levaria uma
 * recusa sem explicação na tela. Por isso a faixa REELS existe aqui —
 * mostrando estado, SEM botões. Agir é na seção.
 */
type Faixa = 'acompanhamento' | 'edicao' | 'reels'

const ROTULO_FAIXA: Record<Faixa, string> = {
  acompanhamento: 'Acompanhamento',
  edicao: 'Edição',
  reels: 'Reels',
}

/*
 * AS TRÊS FAIXAS NA MESMA COR.
 *
 * Eram azul, rosa e âmbar, uma para cada. Parecia organizar e não organizava:
 * a cor do rÓTULO não diz nada sobre o estado das etapas ao lado dele, e as
 * três competiam com as cores que SÃO informação — o verde de concluído, o
 * azul de em andamento, o âmbar de pausado. Um rótulo âmbar acima de uma
 * pílula âmbar sugeria uma relação que não existe.
 *
 * Na mesma cor, os rótulos viram calha: leem-se como estrutura, e a cor volta
 * a ser exclusiva do estado. É o que dá a "cara mais limpa".
 */
const COR_FAIXA = 'text-acento'

/**
 * O corpo do card, dividido nas duas trilhas.
 *
 * POR QUE DUAS LINHAS E NÃO UMA
 * Antes era uma fita só: "Entrada · Nascimento · Banho · Fechamento · Vídeo".
 * Funcionava quando havia uma etapa de edição; com três, a fita passa de dez
 * itens e vira parágrafo. Pior: misturava dois lugares físicos diferentes. Uma
 * pessoa olhando a TV da sala de edição precisa achar "o que está sendo
 * editado" sem ler a linha inteira — e essa informação estava no fim de uma
 * sequência que começa na maternidade.
 *
 * A divisão não foi inventada para a tela: é a mesma trilha que decide
 * precedência no banco (coluna gerada, migration 20260827140400). Uma
 * definição, três usos.
 *
 * O NOME DE QUEM ESTÁ NA ETAPA
 * Aparece só onde há trabalho acontecendo — atribuída, em andamento ou
 * pausada. Pôr o nome em toda etapa encheria o card de texto repetido e
 * afogaria justamente o que se quer ver de longe. Concluída não mostra quem
 * fez: isso é histórico, e vive no detalhe.
 *
 * A RENDIÇÃO aparece como "Sarah › Bruna": quem está e quem assume na virada
 * de turno. É o pedido do gestor de "duas pessoas na atribuição", modelado
 * como o que ele descreveu — uma pessoa ativa e a próxima anunciada.
 */
export function TrilhasDoCaso({ etapas }: PropsTrilhasDoCaso) {
  // O relógio das pílulas em andamento. Bate de minuto em minuto — o mesmo
  // hook que faz o rótulo de SLA andar sozinho, sem um segundo temporizador.
  const agora = useRelogioDeMinuto()

  if (etapas.length === 0) return null

  const acompanhamento = etapas.filter((e) => e.trilha === 'acompanhamento')
  const reels = etapas.filter((e) => e.tipo === 'reels')
  const edicao = etapas.filter((e) => e.trilha === 'edicao' && e.tipo !== 'reels')

  /*
   * GRID no desktop, para as três faixas alinharem SOZINHAS.
   *
   * Antes a calha do rótulo era `w-[6.5rem]` — número escolhido no olho, e
   * errado: "ACOMPANHAMENTO" é mais largo que isso e transbordava, encostando
   * na primeira etapa enquanto as outras duas faixas ficavam com folga. As
   * três linhas não batiam.
   *
   * Com `grid-cols-[max-content_1fr]` a coluna mede exatamente o maior rótulo,
   * seja ele qual for. Cada Trilha vira `contents` no desktop, então os dois
   * filhos dela entram direto no grid do pai e alinham por construção — sem
   * medida mágica para alguém precisar refazer quando um rótulo mudar.
   *
   * No celular o grid não vale: ali as faixas empilham, e cada Trilha volta a
   * ser sua própria caixa.
   */
  return (
    <div className="mt-3 space-y-2.5 sm:grid sm:grid-cols-[max-content_1fr] sm:gap-x-4 sm:gap-y-2.5 sm:space-y-0">
      <Trilha faixa="acompanhamento" etapas={acompanhamento} agora={agora} />
      <Trilha faixa="edicao" etapas={edicao} agora={agora} />
      {/* `soMarcador`: a faixa de reels informa, não convida. As duas outras
          nomeiam a etapa porque é ali que se age; aqui a ação está na seção,
          e repetir os nomes gastaria a linha sem oferecer nada. */}
      <Trilha faixa="reels" etapas={reels} soMarcador agora={agora} />
    </div>
  )
}

function Trilha({
  faixa,
  etapas,
  soMarcador = false,
  agora,
}: {
  faixa: Faixa
  etapas: EtapaQuadro[]
  soMarcador?: boolean
  agora: Date
}) {
  if (etapas.length === 0) return null

  const feitas = etapas.filter((e) => e.status === 'concluida').length

  const contador = (
    <span className="flex-shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
      {feitas}/{etapas.length}
    </span>
  )

  /*
   * EMPILHA NO CELULAR, GRID NO DESKTOP.
   *
   * Num aparelho de 375px a calha do rótulo comeria mais de um quarto da
   * largura só para dizer "ACOMPANHAMENTO", e sobraria tão pouco que quatro
   * etapas quebrariam em três linhas — o card ficaria alto e apertado ao mesmo
   * tempo. Empilhado, as etapas usam a largura inteira.
   *
   * Do `sm` para cima, `contents` dissolve esta caixa e joga os dois filhos no
   * grid do pai (ver TrilhasDoCaso), que é o que faz as três faixas alinharem.
   */
  return (
    <div className="flex flex-col gap-1 text-sm sm:contents">
      <div className="flex items-center justify-between gap-2 sm:block sm:pt-0.5">
        <span className={clsx('rotulo-sobrescrito', COR_FAIXA)}>
          {ROTULO_FAIXA[faixa]}
        </span>
        {/* No celular o contador acompanha o rótulo; no desktop vai para o fim
            da fita. Dois nós, um visível por vez — mais simples que mover o
            mesmo elemento entre dois contêineres. */}
        <span className="sm:hidden">{contador}</span>
      </div>

      {/* O ar entre as etapas caiu de 20px para 8px. Ele era generoso porque
          as etapas eram texto solto e precisavam de espaço para o olho saber
          onde uma terminava; agora cada uma tem moldura própria, e o mesmo
          espaço vira buraco no meio da fita. */}
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        {etapas.map((etapa) => (
          <Etapa
            key={etapa.id}
            etapa={etapa}
            soMarcador={soMarcador}
            agora={agora}
            // O sufixo de rodada só aparece quando há MAIS DE UMA rodada
            // daquela etapa no caso. Num BASIC, que nunca terá a segunda,
            // "Fotos Ⅰ Parto" seria uma distinção sem contraparte — ruído que
            // ocupa a linha e não separa nada.
            comRodada={etapas.some(
              (o) => o.tipo === etapa.tipo && o.rodada !== etapa.rodada,
            )}
          />
        ))}

        {/* Na TV é o que responde "quanto falta aqui" sem contar item por item. */}
        <span className="ml-auto hidden sm:block">{contador}</span>
      </div>
    </div>
  )
}

/**
 * A ETAPA COMO PÍLULA.
 *
 * Era um ponto colorido seguido de texto solto. Numa fita de quatro etapas o
 * olho tinha que decidir, sem ajuda nenhuma, onde uma acabava e a outra
 * começava — e o nome de quem estava nela, pendurado ao lado, entrava na mesma
 * corrente de palavras. A pílula resolve isso por construção: uma forma, um
 * assunto.
 *
 * PINTADA QUANDO HÁ ALGUÉM NELA. Pendente é contorno neutro; concluída,
 * em andamento e pausada ganham fundo, borda e texto na cor do estado. A
 * diferença entre "isto ainda não aconteceu" e "isto está acontecendo" passa a
 * ser de MATERIAL, não de tom de cinza — legível na TV da sala de edição, que
 * é a distância que manda aqui.
 *
 * O NOME VEM DENTRO, num chip próprio. Fora, ele era mais uma palavra na fita;
 * dentro, ele pertence visivelmente àquela etapa e a nenhuma outra.
 *
 * O RELÓGIO CORRENDO é a aposta desta versão. Uma etapa em andamento mostra há
 * quanto tempo está aberta, ali na pílula. A empresa inteira quer evidência
 * objetiva de tempo de edição (seção 9 do CLAUDE.md) — e até agora esse número
 * só existia depois, num relatório. Ver o cronômetro correr enquanto o trabalho
 * acontece é a diferença entre medir e acompanhar. É também o único movimento
 * da fita, e ele só existe onde há trabalho em curso.
 */
function Etapa({
  etapa,
  comRodada,
  soMarcador,
  agora,
}: {
  etapa: EtapaQuadro
  comRodada: boolean
  soMarcador: boolean
  agora: Date
}) {
  const pessoas = nomesDaEtapa(etapa)
  const bloco = comRodada || soMarcador ? ROTULO_RODADA[etapa.rodada] : null
  const decorrido = tempoDecorrido(etapa, agora)

  return (
    <span
      className={clsx(
        'inline-flex max-w-full items-center gap-1.5 rounded-full border py-1 pr-2 pl-2.5 text-sm',
        CLASSE_PILULA[etapa.status],
      )}
    >
      <Marcador status={etapa.status} />

      <span className="truncate font-medium">
        {soMarcador ? (
          bloco
        ) : (
          <>
            {ROTULO_ETAPA[etapa.tipo]}
            {bloco && <span className="ml-1.5 font-normal opacity-70">{bloco}</span>}
          </>
        )}
      </span>

      {/* O chip de dentro herda a cor da pílula via `currentColor`, então ele
          acompanha o estado sem uma segunda tabela de cores para manter. */}
      {pessoas && (
        <span className="max-w-[8rem] truncate rounded-full bg-current/12 px-1.5 py-px text-xs font-semibold">
          {pessoas}
        </span>
      )}

      {decorrido && (
        <span className="rounded-full bg-current/12 px-1.5 py-px text-xs font-semibold tabular-nums">
          {decorrido}
        </span>
      )}
    </span>
  )
}

/**
 * Só EM ANDAMENTO mostra o relógio.
 *
 * Pausada não: ali o tempo parou por decisão de alguém, e um número congelado
 * na tela lê como cronômetro quebrado. Concluída também não — o tempo dela é
 * histórico, e vive no detalhe do caso.
 *
 * Desconta a pausa acumulada, pela mesma razão que o tempo de ciclo desconta:
 * o intervalo em que ninguém trabalhou não é tempo de trabalho.
 */
function tempoDecorrido(etapa: EtapaQuadro, agora: Date): string | null {
  if (etapa.status !== 'em_andamento' || !etapa.iniciadoEm) return null

  const ms = agora.getTime() - new Date(etapa.iniciadoEm).getTime()
  const minutos = Math.floor(ms / 60_000)
  if (minutos < 1) return 'agora'
  if (minutos < 60) return `${minutos}min`

  const horas = Math.floor(minutos / 60)
  const resto = minutos % 60
  return resto === 0 ? `${horas}h` : `${horas}h${String(resto).padStart(2, '0')}`
}

/**
 * A cor da pílula É o estado. Uma tabela, não condições espalhadas.
 *
 * `bg-current/…` nos chips internos depende de `text-…` estar aqui: é o que
 * faz o chip do nome acompanhar a cor da pílula sem repetir a tabela.
 */
const CLASSE_PILULA: Record<StatusEtapa, string> = {
  concluida: 'border-concluido/25 bg-concluido/10 text-concluido-tinta',
  em_andamento: 'border-andamento/30 bg-andamento/12 font-semibold text-andamento-tinta',
  pausada: 'border-atencao/30 bg-atencao/12 text-atencao-tinta',
  atribuida: 'border-border bg-card text-foreground',
  // Dispensada é a única cinza COM traço: ela não vai acontecer, e o risco diz
  // isso sem precisar de legenda.
  dispensada: 'border-border bg-muted/60 text-muted-foreground line-through',
  pendente: 'border-border bg-transparent text-muted-foreground',
  // As duas fases do vídeo do MASTER. Aparecem AQUI de verdade — a fita do
  // card mostra todas as etapas do caso, e o vídeo é uma delas mesmo com o
  // fluxo dele morando na seção. Sem estas linhas o vídeo em alteração
  // pareceria pendente na fita, escondendo trabalho em curso.
  em_alteracao: 'border-atencao/30 bg-atencao/15 font-semibold text-atencao-tinta',
  pronto_para_entrega: 'border-pronto-borda bg-pronto-fundo font-semibold text-pronto',
}

/**
 * "Sarah", "Sarah › Bruna", ou nada.
 *
 * Só primeiro nome: na TV, "Sarah Fernandes de Oliveira" empurra a etapa
 * seguinte para fora da linha e o que se ganha é sobrenome que ninguém usa
 * para falar de alguém no corredor.
 *
 * Aparece só onde há trabalho acontecendo — atribuída, em andamento ou
 * pausada. Concluída não mostra quem fez: isso é histórico, e vive no detalhe.
 */
function nomesDaEtapa(etapa: EtapaQuadro): string | null {
  const trabalhando =
    etapa.status === 'atribuida' ||
    etapa.status === 'em_andamento' ||
    etapa.status === 'pausada'

  if (!trabalhando || !etapa.responsavelNome) return null

  const atual = primeiroNome(etapa.responsavelNome)
  return etapa.proximoResponsavelNome
    ? `${atual} › ${primeiroNome(etapa.proximoResponsavelNome)}`
    : atual
}

function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? nome
}

/**
 * O ponto dentro da pílula.
 *
 * Passou a herdar a cor por `currentColor`, em vez de ter a própria tabela: a
 * pílula já carrega o estado na cor do texto, e duas tabelas para a mesma
 * informação divergem na primeira vez que alguém mexer numa só.
 *
 * O que ele ainda faz sozinho é a FORMA: cheio quando há algo acontecendo,
 * vazado quando não. Numa TV a quatro metros o disco cheio contra o vazado se
 * distingue quando a cor já não se distingue.
 */
function Marcador({ status }: { status: StatusEtapa }) {
  const comum = 'size-2 flex-shrink-0 rounded-full'

  if (status === 'em_andamento') {
    // O único anel pulsando da tela é o trabalho em curso — e é o que o olho
    // tem que achar primeiro ao entrar na sala.
    return (
      <span
        className={clsx(comum, 'bg-current ring-2 ring-current/25 motion-safe:animate-pulse')}
        aria-hidden="true"
      />
    )
  }

  if (status === 'pendente') {
    return <span className={clsx(comum, 'border-2 border-current opacity-40')} aria-hidden="true" />
  }

  return <span className={clsx(comum, 'bg-current')} aria-hidden="true" />
}
