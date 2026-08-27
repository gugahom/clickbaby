import clsx from 'clsx'
import {
  NUMERAL_RODADA,
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

const COR_FAIXA: Record<Faixa, string> = {
  acompanhamento: 'text-marca',
  edicao: 'text-acento',
  reels: 'text-rascunho',
}

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
  if (etapas.length === 0) return null

  const acompanhamento = etapas.filter((e) => e.trilha === 'acompanhamento')
  const reels = etapas.filter((e) => e.tipo === 'reels')
  const edicao = etapas.filter((e) => e.trilha === 'edicao' && e.tipo !== 'reels')

  return (
    <div className="mt-3 space-y-2.5">
      <Trilha faixa="acompanhamento" etapas={acompanhamento} />
      <Trilha faixa="edicao" etapas={edicao} />
      {/* `soMarcador`: a faixa de reels informa, não convida. As duas outras
          nomeiam a etapa porque é ali que se age; aqui a ação está na seção,
          e repetir os nomes gastaria a linha sem oferecer nada. */}
      <Trilha faixa="reels" etapas={reels} soMarcador />
    </div>
  )
}

function Trilha({
  faixa,
  etapas,
  soMarcador = false,
}: {
  faixa: Faixa
  etapas: EtapaQuadro[]
  soMarcador?: boolean
}) {
  if (etapas.length === 0) return null

  const feitas = etapas.filter((e) => e.status === 'concluida').length

  const contador = (
    <span className="flex-shrink-0 text-xs tabular-nums text-muted-foreground">
      {feitas}/{etapas.length}
    </span>
  )

  /*
   * EMPILHA NO CELULAR, LADO A LADO NO DESKTOP.
   *
   * A calha do rótulo tem 6.5rem. Num aparelho de 375px isso é mais de um
   * quarto da largura só para dizer "ACOMPANHAMENTO", e sobrava tão pouco que
   * quatro etapas quebravam em três linhas — o card ficava alto e apertado ao
   * mesmo tempo, que foi a queixa.
   *
   * Empilhado, as etapas usam a largura inteira e cabem em menos linhas. A
   * altura total sai igual ou menor, e o respiro aparece. Do `sm` para cima a
   * calha volta, porque aí ela paga: as duas trilhas alinham na vertical e a
   * vista acha a certa sem ler.
   */
  return (
    <div className="flex flex-col gap-1 text-sm sm:flex-row sm:items-start sm:gap-3">
      <div className="flex items-center justify-between gap-2 sm:block sm:w-[6.5rem] sm:flex-shrink-0 sm:pt-0.5">
        <span
          className={clsx(
            'text-[10px] font-bold tracking-[0.08em] uppercase',
            COR_FAIXA[faixa],
          )}
        >
          {ROTULO_FAIXA[faixa]}
        </span>
        {/* No celular o contador acompanha o rótulo; no desktop vai para o fim
            da fita. Dois nós, um visível por vez — mais simples que mover o
            mesmo elemento entre dois contêineres. */}
        <span className="sm:hidden">{contador}</span>
      </div>

      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1.5">
        {etapas.map((etapa) => (
          <Etapa
            key={etapa.id}
            etapa={etapa}
            soMarcador={soMarcador}
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

function Etapa({
  etapa,
  comRodada,
  soMarcador,
}: {
  etapa: EtapaQuadro
  comRodada: boolean
  soMarcador: boolean
}) {
  const pessoas = nomesDaEtapa(etapa)
  const numeral = comRodada ? NUMERAL_RODADA[etapa.rodada] : null
  const bloco = comRodada ? ROTULO_RODADA[etapa.rodada] : null

  return (
    <span className="inline-flex items-center gap-1">
      <Marcador status={etapa.status} />
      <span className={CLASSE_STATUS[etapa.status]}>
        {/* O numeral vem PRIMEIRO, e sozinho já ordena as rodadas de longe.
            O nome do bloco vem depois, para quem chega perto e precisa saber
            de que material se trata. */}
        {numeral && <span className="mr-1 font-bold tabular-nums">{numeral}</span>}
        {!soMarcador && ROTULO_ETAPA[etapa.tipo]}
        {bloco && (
          <span
            className={clsx(
              'text-xs font-normal text-muted-foreground',
              !soMarcador && 'ml-1',
            )}
          >
            {bloco}
          </span>
        )}
      </span>
      {pessoas && (
        <span className="text-xs font-medium text-muted-foreground">· {pessoas}</span>
      )}
    </span>
  )
}

/**
 * "Sarah", "Sarah › Bruna", ou nada.
 *
 * Só primeiro nome: na TV, "Sarah Fernandes de Oliveira" empurra a etapa
 * seguinte para fora da linha e o que se ganha é sobrenome que ninguém usa
 * para falar de alguém no corredor.
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

const CLASSE_STATUS: Record<StatusEtapa, string> = {
  concluida: 'text-concluido',
  em_andamento: 'font-semibold text-andamento',
  pausada: 'font-medium text-atencao',
  atribuida: 'text-foreground',
  dispensada: 'text-muted-foreground line-through',
  pendente: 'text-muted-foreground',
}

/**
 * O ponto antes do nome da etapa. É o que carrega o estado à distância: numa
 * TV a 4 metros a cor do texto de 13px já não se distingue, mas um disco cheio
 * contra um vazado, sim.
 */
function Marcador({ status }: { status: StatusEtapa }) {
  const comum = 'size-2 flex-shrink-0 rounded-full'

  switch (status) {
    case 'concluida':
      return <span className={clsx(comum, 'bg-concluido')} aria-hidden="true" />
    case 'em_andamento':
      // Anel pulsando: a única etapa da tela que muda sozinha é a que está
      // acontecendo agora, e é a que o olho tem que achar primeiro.
      return (
        <span
          className={clsx(
            comum,
            'bg-andamento ring-2 ring-andamento/30 motion-safe:animate-pulse',
          )}
          aria-hidden="true"
        />
      )
    case 'pausada':
      return <span className={clsx(comum, 'bg-atencao')} aria-hidden="true" />
    case 'dispensada':
      return <span className={clsx(comum, 'bg-border')} aria-hidden="true" />
    default:
      return (
        <span
          className={clsx(comum, 'border-2 border-border bg-transparent')}
          aria-hidden="true"
        />
      )
  }
}
