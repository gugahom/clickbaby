import { useState } from 'react'
import clsx from 'clsx'
import { rotularDia } from '@/lib/formato'
import { useRegistrarEstacao } from '../api/useAcoes'
import { corDoCaso } from '../lib/cores-calendar'
import { mensagemDeErro } from '../lib/erros'
import { ROTULO_RODADA, type CasoQuadro, type EtapaQuadro, type StatusEtapa } from '../types'
import { IconeMonitor } from '@/components/ui/icones'
import { AcoesDaEtapa } from './AcoesDaEtapa'

interface PropsCartaoDeEdicao {
  caso: CasoQuadro
  hoje: string
  /** Todas as etapas do caso — a precedência depende delas, não só dos reels. */
  etapas: EtapaQuadro[]
  /** As etapas desta seção ainda abertas, já em ordem. */
  daSecao: EtapaQuadro[]
  /**
   * Como nomear cada linha. O reels nomeia pelo BLOCO ("Parto", "B+F") porque
   * tem duas rodadas; o vídeo do MASTER tem uma só, e "Parto" ali seria uma
   * distinção sem contraparte.
   */
  rotularLinha?: (etapa: EtapaQuadro) => string
  onErro: (mensagem: string | null) => void
}

/**
 * O cartão das seções de EDIÇÃO — REELS e MASTER.
 *
 * As duas fazem a mesma pergunta ("que edição há para fazer, e em que PC"),
 * mudando só a etapa que olham e como nomeiam a linha. Duplicar o cartão para
 * trocar um rótulo faria o campo do PC e o grupo de ações existirem em dois
 * lugares que precisariam ser corrigidos juntos.
 *
 * POR QUE NÃO É O CartaoLateral
 * Aquele responde uma pergunta por caso — "quem está neste estado e há quanto
 * tempo". A seção REELS deixou de caber nisso: um caso pode ter DUAS rodadas
 * de reels abertas ao mesmo tempo, cada uma com sua pessoa e seu estado, e o
 * gestor pediu que as duas sejam acionáveis aqui. São duas tarefas num
 * cartão, não um estado.
 *
 * A ESTAÇÃO
 * A coluna `caso_etapas.estacao` existia desde a migration inicial e nunca
 * tinha sido escrita — sobra do módulo de equipamentos. O comentário dela já
 * dizia para que servia: "para a próxima operadora saber onde continuar um
 * trabalho pela metade". É esse o uso: a editora escreve "pc-1" e quem pegar o
 * turno seguinte sabe em qual máquina o arquivo está.
 *
 * Fica por RODADA e não por caso porque é a rodada que está aberta numa
 * máquina — a do parto pode ter sido feita num PC e a do B+F em outro.
 */
export function CartaoDeEdicao({
  caso,
  hoje,
  etapas,
  daSecao,
  // O fallback não deveria disparar: só existem as rodadas 1 e 2. Se um dia
  // existir uma 3, aparecer "Rodada 3" na tela é melhor que uma linha sem
  // nome nenhum — e denuncia o rótulo que ficou faltando.
  rotularLinha = (e) => ROTULO_RODADA[e.rodada] ?? `Rodada ${e.rodada}`,
  onErro,
}: PropsCartaoDeEdicao) {
  const titulo = caso.bebeNome ? `${caso.maeNome} · ${caso.bebeNome}` : caso.maeNome
  const cor = corDoCaso(caso.corCalendar)
  const selo = SELO[estadoDominante(daSecao)]

  return (
    <li
      className={clsx(
        'relative flex items-stretch gap-2.5 rounded-cartao border border-border bg-card px-3 py-3 shadow-cartao transition-shadow hover:shadow-cartao-alto',
        // O anel que corre, e SÓ no parado. É o mesmo recurso do card com hora
        // chegando (ver `.anel-alerta` em index.css) e vale pela mesma razão:
        // um vídeo liberado que ninguém pegou é prazo correndo sem trabalho
        // acontecendo. Se todo cartão da seção girasse, nenhum chamaria.
        selo.anel && 'anel-alerta anel-alerta-vivo',
      )}
      style={selo.anel ? ({ '--cor-alerta': 'var(--atrasado)' } as React.CSSProperties) : undefined}
    >
      <div
        className="w-1 flex-shrink-0 rounded-sm"
        style={{ backgroundColor: cor }}
        aria-hidden="true"
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-sm font-bold tracking-tight">
            {titulo}
          </span>
          {/* O SELO NA LINHA DO NOME, e não por rodada.
          
              Quem varre a seção pergunta "este caso está andando ou parado?",
              e essa é uma pergunta por CASO. Um selo por rodada responderia
              outra coisa — e a rodada já tem os próprios botões logo abaixo,
              que dizem em que estado ela está. */}
          <span
            className={clsx(
              'rotulo-sobrescrito flex-shrink-0 rounded-full px-2 py-1',
              selo.classe,
            )}
          >
            {selo.rotulo}
          </span>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          {caso.maternidadeSigla && <span>{caso.maternidadeSigla}</span>}
          <span>· {caso.dia ? rotularDia(caso.dia, hoje) : 'sem data'}</span>
        </div>

        <ul className="mt-2 space-y-1.5">
          {daSecao.map((etapa) => (
            <LinhaDeRodada
              key={etapa.id}
              etapa={etapa}
              etapas={etapas}
              rotulo={rotularLinha(etapa)}
              onErro={onErro}
            />
          ))}
        </ul>
      </div>
    </li>
  )
}

function LinhaDeRodada({
  etapa,
  etapas,
  rotulo,
  onErro,
}: {
  etapa: EtapaQuadro
  etapas: EtapaQuadro[]
  rotulo: string
  onErro: (mensagem: string | null) => void
}) {
  const responsavel = etapa.responsavelNome?.trim().split(/\s+/)[0] ?? null

  return (
    <li className="flex items-center gap-2 rounded-md bg-muted/60 py-1 pr-1 pl-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
          {/*
            SEMPRE o nome do bloco, mesmo com uma rodada aberta só.
            
            Antes o rótulo caía para "Reels" quando sobrava uma — ou seja,
            concluir o reels do parto REBATIZAVA a linha do B+F, que continuava
            sendo exatamente o mesmo trabalho. O nome de uma tarefa não pode
            mudar porque outra terminou.
            
            E "Reels" nunca acrescentou nada: a seção inteira é de reels.
          */}
          <span className="font-medium">{rotulo}</span>
          {responsavel && (
            <span className="truncate text-xs text-muted-foreground">· {responsavel}</span>
          )}
          {/* A estação passou para a MESMA linha do nome. Ela era um input
              permanente numa linha própria, então todo cartão carregava a
              altura de um campo vazio — e a maioria fica vazia. */}
          <CampoEstacao etapa={etapa} onErro={onErro} />
        </div>
      </div>

      <AcoesDaEtapa etapa={etapa} etapas={etapas} onErro={onErro} />
    </li>
  )
}

/**
 * O ESTADO DO CARTÃO, a partir das rodadas abertas.
 *
 * Um caso pode ter duas rodadas de reels em aberto com estados diferentes. O
 * selo responde por CASO, então precisa de uma regra de precedência — e ela é
 * a mesma que a seção já usa para escolher o que mostrar: trabalho acontecendo
 * vence trabalho parado. Se alguém está editando, o caso está andando, mesmo
 * que a outra rodada espere.
 */
function estadoDominante(etapas: EtapaQuadro[]): StatusEtapa {
  if (etapas.some((e) => e.status === 'em_andamento')) return 'em_andamento'
  if (etapas.some((e) => e.status === 'pausada')) return 'pausada'
  return 'pendente'
}

/**
 * Os selos da seção.
 *
 * PENDENTE EM VERMELHO, e não em cinza. Em qualquer outro lugar da tela
 * pendente é neutro — "ainda não chegou a hora". Aqui não é: um vídeo só
 * entra nesta seção depois de LIBERADO, então pendente aqui significa "o prazo
 * está correndo e ninguém pegou". É a única lista da tela em que esperar já é
 * o problema, e o vermelho diz isso.
 */
const SELO: Record<StatusEtapa, { rotulo: string; classe: string; anel: boolean }> = {
  em_andamento: {
    rotulo: 'Editando',
    classe: 'bg-andamento/12 text-andamento-tinta',
    anel: false,
  },
  pausada: {
    rotulo: 'Pausado',
    classe: 'bg-atencao/12 text-atencao-tinta',
    anel: false,
  },
  pendente: {
    rotulo: 'Pendente',
    classe: 'bg-atrasado/12 text-atrasado',
    anel: true,
  },
  // Os três abaixo não chegam aqui: a seção só lista rodada ABERTA. Existem
  // para o Record ficar total — um `default` esconderia o dia em que a regra
  // de entrada mudar.
  atribuida: { rotulo: 'Pendente', classe: 'bg-atrasado/12 text-atrasado', anel: true },
  concluida: { rotulo: 'Concluído', classe: 'bg-concluido/12 text-concluido-tinta', anel: false },
  dispensada: { rotulo: 'Dispensado', classe: 'bg-muted text-muted-foreground', anel: false },
}

/**
 * O PC, atrás de um ícone.
 *
 * Era um input sempre visível, e a maioria dos cartões o mostrava vazio: uma
 * caixa de texto pedindo para ser preenchida em toda linha da seção, o tempo
 * todo. Agora é um botão de monitor que abre o campo quando alguém quer
 * escrever, e vira uma etiqueta com o valor quando já há um.
 *
 * Salva no BLUR e no Enter, não a cada tecla: "pc-1" são quatro toques, e uma
 * RPC por tecla geraria quatro eventos no histórico para um dado só.
 *
 * O estado local é semeado do servidor e RESSINCRONIZADO quando o valor de lá
 * muda — sem isso, uma edição feita por outra pessoa (o Quadro é ao vivo)
 * ficaria escondida atrás do que está digitado neste aparelho.
 */
function CampoEstacao({
  etapa,
  onErro,
}: {
  etapa: EtapaQuadro
  onErro: (mensagem: string | null) => void
}) {
  const registrar = useRegistrarEstacao()
  const doServidor = etapa.estacao ?? ''
  const [texto, setTexto] = useState(doServidor)
  const [ultimoVisto, setUltimoVisto] = useState(doServidor)
  const [aberto, setAberto] = useState(false)

  // Ressincroniza DURANTE a renderização, não num efeito. É o padrão que o
  // React documenta para estado derivado de prop, e o que a regra
  // react-hooks/set-state-in-effect existe para cobrar: um efeito aqui
  // renderizaria uma vez com o texto velho antes de corrigir.
  if (doServidor !== ultimoVisto) {
    setUltimoVisto(doServidor)
    setTexto(doServidor)
  }

  function salvar() {
    setAberto(false)
    const limpo = texto.trim()
    if (limpo === doServidor) return

    onErro(null)
    registrar.mutateAsync({ casoEtapaId: etapa.id, estacao: limpo }).catch((e) => {
      onErro(mensagemDeErro(e))
      setTexto(doServidor)
    })
  }

  const rotulo = `PC em que a edição está sendo feita${
    etapa.rodada > 1 ? ` (${ROTULO_RODADA[etapa.rodada]})` : ''
  }`

  if (!aberto) {
    return (
      <button
        type="button"
        aria-label={doServidor ? `${rotulo}: ${doServidor}` : `Anotar o ${rotulo}`}
        title={doServidor ? `${rotulo}: ${doServidor}` : `Anotar o ${rotulo}`}
        onClick={() => setAberto(true)}
        className={clsx(
          // O ALVO CRESCE, o desenho não.
          //
          // A pastilha tem 18px de altura, e crescer até os 44px da seção 6
          // dobraria a altura de toda linha da seção — por um botão que a
          // maioria dos cartões nunca usa. O `before` é um retângulo invisível
          // de 44px centrado nela: a mão acerta a área inteira, o olho vê só o
          // ícone. É filho do <button>, então o clique nele é clique no botão.
          'relative inline-flex flex-shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-xs transition-colors',
          "before:absolute before:top-1/2 before:left-1/2 before:size-11 before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']",
          doServidor
            ? 'bg-marca-suave font-semibold text-marca'
            : 'text-muted-foreground/60 hover:bg-muted hover:text-foreground',
        )}
      >
        <IconeMonitor className="size-3.5" />
        {doServidor && <span className="font-mono">{doServidor}</span>}
      </button>
    )
  }

  return (
    <input
      type="text"
      // `autoFocus` e não um foco agendado: o input nasce já pronto para
      // digitar, sem depender de requestAnimationFrame — que o navegador
      // pausa em aba oculta e que faria o foco simplesmente não acontecer.
      // Aqui ele não rouba nada: só existe porque alguém acabou de clicar.
      autoFocus
      value={texto}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={salvar}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          setTexto(doServidor)
          setAberto(false)
        }
      }}
      placeholder="pc-"
      aria-label={rotulo}
      maxLength={20}
      // Estreito de propósito: cabe "pc-1" e não convida a escrever um bilhete.
      // Para isso existe o aviso da etapa.
      className="w-20 flex-shrink-0 rounded-full border border-marca bg-card px-2 py-0.5 font-mono text-xs text-foreground outline-none"
    />
  )
}
