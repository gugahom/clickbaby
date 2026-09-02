import clsx from 'clsx'
import { Avatar } from '@/components/ui/Avatar'
import { useRelogioDeMinuto } from '@/lib/useRelogio'
import { DIAS_DE_JANELA, type EtapaEmMaos, type PessoaDaEquipe } from '../api/useEquipe'
import { DivisaoDeLugar, Numero } from './Metricas'
import {
  COR_LUGAR,
  ROTULO_LUGAR,
  ROTULO_PAPEL,
  formatarDuracao,
  relativo,
} from '../lib/apresentacao'

/**
 * A ficha de uma pessoa: quem ela é, onde está agora e o que os carimbos dizem
 * sobre o trabalho dela.
 *
 * A ORDEM DAS TRÊS PERGUNTAS é a ordem em que a coordenação pensa. Primeiro
 * "ela está livre?", que é a decisão de agora — quem distribui a fila precisa
 * disso antes de qualquer histórico. Depois o volume dos trinta dias. Por
 * último onde ela trabalha, que é a pergunta de escala, não de plantão.
 *
 * O TEMPO DE CICLO vem acompanhado do TAMANHO DA AMOSTRA, e isso não é
 * rodapé. A seção 9 do CLAUDE.md existe porque o cliente quer evidência
 * objetiva para cobrar tempo de edição; uma média de duas etapas apresentada
 * com a mesma cara de uma média de quarenta transformaria evidência em
 * impressão. O número de amostras é o que separa as duas.
 */
export function FichaDaPessoa({ pessoa }: { pessoa: PessoaDaEquipe }) {
  const apelido = pessoa.apelidos[0]

  return (
    <div className="space-y-3">
      <section className="overflow-hidden rounded-cartao border border-border bg-card shadow-cartao">
        {/* A faixa da marca no topo da ficha: ela amarra a pessoa ao produto e
            dá âncora visual à coluna, que sem isso seria mais um cartão branco
            ao lado de uma lista de cartões brancos. */}
        <div className="superficie-cabecalho px-4 pt-4 pb-5 text-white">
          <div className="flex items-center gap-3">
            <Avatar nome={pessoa.nome} className="size-12 text-sm" />
            <div className="min-w-0">
              <h2 className="truncate text-xl font-extrabold tracking-tight">
                {pessoa.nome}
              </h2>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-white/70">
                <span>{ROTULO_PAPEL[pessoa.papelSistema] ?? pessoa.papelSistema}</span>
                {apelido && <span>· “{apelido}”</span>}
              </p>
            </div>
          </div>
        </div>

        <div className="-mt-3 rounded-t-cartao bg-card px-4 pt-4 pb-4">
          <EstadoAgora pessoa={pessoa} />
        </div>
      </section>

      {pessoa.emMaos.length > 0 && <EmMaos etapas={pessoa.emMaos} />}

      <NumerosDaJanela pessoa={pessoa} />

      {/* O que a ficha AINDA não responde. Dito aqui porque a pergunta natural
          de quem chega nesta coluna é "e o cumprimento de prazo?" — e o
          silêncio leria como "essa pessoa não estourou nenhum". */}
      {/* Uma linha, não um parágrafo. Ela existe para desfazer UMA leitura
          errada — "o ciclo dela é baixo porque ela é rápida" — e some do olho
          depois da primeira vez. Cumprimento de SLA fica de fora por enquanto
          e dizer isso aqui seria trocar um mal-entendido por uma lista de
          ausências. */}
      <p className="px-1 text-xs text-muted-foreground">
        O ciclo desconta pausas e ignora etapa concluída sem ter sido iniciada —
        o registro retroativo de campo não vira “zero”.
      </p>
    </div>
  )
}

/**
 * Os números dos últimos trinta dias — os mesmos para a gestão olhar alguém e
 * para a pessoa olhar a si mesma.
 *
 * Um componente só, e não dois parecidos: a seção 9 do CLAUDE.md é explícita
 * de que a fila é visível para toda a equipe, não só para a gestão, porque a
 * produtividade subiu com a presença dos sócios e visibilidade compartilhada
 * reproduz isso sem clima de fiscalização. Duas versões do mesmo número, uma
 * "de gestão" e outra "de operação", desmentiriam essa escolha na primeira vez
 * que divergissem.
 */
export function NumerosDaJanela({
  pessoa,
  titulo = `Últimos ${DIAS_DE_JANELA} dias`,
  // A tela de Conta fala com a própria pessoa. Trocar "ela" por "você" é a
  // diferença entre um relatório sobre alguém e a resposta a uma pergunta que
  // ela fez sobre si — e é a única coisa que muda entre os dois usos.
  rotuloDivisao = 'Onde ela trabalha',
}: {
  pessoa: PessoaDaEquipe
  titulo?: string
  rotuloDivisao?: string
}) {
  return (
      <section className="rounded-cartao border border-border bg-card p-4 shadow-cartao">
        <h3 className="rotulo-sobrescrito text-acento">{titulo}</h3>

        <div className="mt-3 grid grid-cols-2 gap-4">
          <Numero
            valor={pessoa.concluidasNaJanela}
            rotulo="etapas concluídas"
            tom={pessoa.concluidasNaJanela === 0 ? 'apagado' : 'neutro'}
          />
          <Numero
            valor={
              pessoa.cicloMedioMin === null ? '—' : formatarDuracao(pessoa.cicloMedioMin)
            }
            rotulo="ciclo médio"
            nota={
              pessoa.cicloMedioMin === null
                ? 'sem etapa cronometrada'
                : `média de ${pessoa.amostraDoCiclo} ${
                    pessoa.amostraDoCiclo === 1 ? 'etapa' : 'etapas'
                  }`
            }
            tom={pessoa.cicloMedioMin === null ? 'apagado' : 'neutro'}
          />
        </div>

        <div className="mt-4 border-t border-border/70 pt-4">
          <h4 className="rotulo-sobrescrito mb-2 text-[10px] text-muted-foreground">
            {rotuloDivisao}
          </h4>
          <DivisaoDeLugar
            porLugar={pessoa.concluidasPorLugar}
            total={pessoa.concluidasNaJanela}
          />
        </div>
      </section>
  )
}

function EstadoAgora({ pessoa }: { pessoa: PessoaDaEquipe }) {
  if (!pessoa.temAcesso) {
    return (
      <Estado
        tom="rascunho"
        titulo="Sem acesso"
        detalhe="Existe no cadastro, mas nenhuma conta aponta para ela — não consegue entrar."
      />
    )
  }

  if (!pessoa.ativo) {
    return (
      <Estado
        tom="apagado"
        titulo="Inativa"
        detalhe="Fora da operação. O histórico dela continua nos casos em que trabalhou."
      />
    )
  }

  if (pessoa.emAndamento === 0) {
    return (
      <Estado
        tom="livre"
        titulo="Livre"
        detalhe={
          pessoa.ultimaAtividade
            ? `Nada em mãos. Última atividade ${relativo(pessoa.ultimaAtividade)}.`
            : 'Nada em mãos, e nenhuma etapa registrada ainda.'
        }
      />
    )
  }

  // TUDO PAUSADO NÃO É TRABALHANDO. O ponto pulsando e a cor do lugar dizem
  // "está acontecendo agora"; com a etapa parada isso é uma afirmação falsa, e
  // é justamente a pessoa que alguém precisa procurar.
  if (pessoa.tudoPausado) {
    return (
      <div className="flex items-start gap-3">
        <span
          className="mt-1.5 size-2.5 flex-shrink-0 rounded-full bg-atencao"
          aria-hidden="true"
        />
        <div className="min-w-0">
          <p className="font-extrabold tracking-tight">
            Parada
            <span className="ml-2 rounded-full bg-atencao/15 px-2 py-0.5 text-[11px] font-bold text-atencao-tinta">
              {pessoa.emAndamento === 1 ? '1 pausada' : `${pessoa.emAndamento} pausadas`}
            </span>
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            O trabalho parou e ninguém retomou
            {pessoa.ultimaAtividade && ` · mexeu ${relativo(pessoa.ultimaAtividade)}`}
          </p>
        </div>
      </div>
    )
  }

  const lugar = pessoa.lugarAgora

  return (
    <div className="flex items-start gap-3">
      <span
        className={clsx(
          'mt-1.5 size-2.5 flex-shrink-0 rounded-full ring-2',
          lugar ? COR_LUGAR[lugar].barra : 'bg-andamento',
          'ring-current/20 motion-safe:animate-pulse',
        )}
        aria-hidden="true"
      />
      <div className="min-w-0">
        <p className="font-extrabold tracking-tight">
          {pessoa.fazendoAgora}
          {lugar && (
            <span
              className={clsx(
                'ml-2 rounded-full px-2 py-0.5 text-[11px] font-bold',
                COR_LUGAR[lugar].fundo,
                COR_LUGAR[lugar].texto,
              )}
            >
              {ROTULO_LUGAR[lugar]}
            </span>
          )}
        </p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {pessoa.emAndamento === 1
            ? '1 etapa em mãos agora'
            : `${pessoa.emAndamento} etapas em mãos agora`}
          {pessoa.ultimaAtividade && ` · mexeu ${relativo(pessoa.ultimaAtividade)}`}
        </p>
      </div>
    </div>
  )
}

function Estado({
  tom,
  titulo,
  detalhe,
}: {
  tom: 'livre' | 'apagado' | 'rascunho'
  titulo: string
  detalhe: string
}) {
  return (
    <div className="flex items-start gap-3">
      <span
        className={clsx(
          'mt-1.5 size-2.5 flex-shrink-0 rounded-full',
          tom === 'livre' && 'border-2 border-concluido',
          tom === 'apagado' && 'bg-muted-foreground/40',
          tom === 'rascunho' && 'bg-rascunho',
        )}
        aria-hidden="true"
      />
      <div className="min-w-0">
        <p className="font-extrabold tracking-tight">{titulo}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{detalhe}</p>
      </div>
    </div>
  )
}

/**
 * O que ela está segurando agora, caso a caso.
 *
 * É a única parte da ficha que não é estatística, e a mais usada: quem
 * distribui a fila não pergunta "quantas ela tem", pergunta "o que ela tem" —
 * e a resposta precisa do nome da família, não do número. "Ingrid está no
 * Nascimento da Thayane há 3h" é uma frase sobre a qual se decide alguma
 * coisa; "Ingrid: 2" não é.
 *
 * A PAUSADA é marcada. Uma etapa parada há seis horas conta igual a uma
 * correndo há dez minutos na contagem de carga, e não é a mesma coisa para
 * quem vai redistribuir.
 */
function EmMaos({ etapas }: { etapas: EtapaEmMaos[] }) {
  // O mesmo relógio do Quadro: sem ele, "há 3h" fica congelado no instante em
  // que a ficha abriu, e numa tela que a coordenação deixa aberta o turno
  // inteiro isso é a diferença entre relógio e fotografia.
  const agora = useRelogioDeMinuto().getTime()

  return (
    <section className="rounded-cartao border border-border bg-card p-4 shadow-cartao">
      <h3 className="rotulo-sobrescrito text-acento">Em mãos agora</h3>

      <ul className="mt-3 space-y-2">
        {etapas.map((e) => {
          const cor = e.lugar ? COR_LUGAR[e.lugar] : COR_LUGAR.campo
          const ha =
            e.desde === null ? null : formatarDuracao((agora - new Date(e.desde).getTime()) / 60_000)

          return (
            <li key={e.id} className="flex items-baseline gap-2.5">
              <span
                className={clsx(
                  'mt-1 size-2 flex-shrink-0 rounded-full',
                  e.pausada ? 'bg-atencao' : cor.barra,
                )}
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">
                  <span className="font-bold">{e.etapa}</span>
                  <span className="text-muted-foreground"> · {e.caso}</span>
                </p>
              </div>
              <span className="flex-shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
                {e.pausada ? 'pausada' : ha ? `há ${ha}` : 'não iniciada'}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
