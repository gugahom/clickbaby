import { useState } from 'react'
import { rotularDia } from '@/lib/formato'
import { useRegistrarEstacao } from '../api/useAcoes'
import { corDoCaso } from '../lib/cores-calendar'
import { mensagemDeErro } from '../lib/erros'
import { ROTULO_RODADA, type CasoQuadro, type EtapaQuadro } from '../types'
import { AcoesDaEtapa } from './AcoesDaEtapa'

interface PropsCartaoReels {
  caso: CasoQuadro
  hoje: string
  /** Todas as etapas do caso — a precedência depende delas, não só dos reels. */
  etapas: EtapaQuadro[]
  /** As rodadas de reels ainda abertas, já em ordem. */
  reels: EtapaQuadro[]
  onErro: (mensagem: string | null) => void
}

/**
 * O cartão da seção REELS.
 *
 * POR QUE NÃO É MAIS O CartaoLateral
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
export function CartaoReels({ caso, hoje, etapas, reels, onErro }: PropsCartaoReels) {
  const titulo = caso.bebeNome ? `${caso.maeNome} · ${caso.bebeNome}` : caso.maeNome
  const cor = corDoCaso(caso.corCalendar)

  return (
    <li className="flex items-stretch gap-2.5 rounded-md border border-border bg-card px-3 py-2.5 shadow-cartao">
      <div
        className="w-1 flex-shrink-0 rounded-sm"
        style={{ backgroundColor: cor }}
        aria-hidden="true"
      />

      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{titulo}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          {caso.maternidadeSigla && <span>{caso.maternidadeSigla}</span>}
          <span>· {caso.dia ? rotularDia(caso.dia, hoje) : 'sem data'}</span>
        </div>

        <ul className="mt-2 space-y-1.5">
          {reels.map((etapa) => (
            <LinhaDeRodada key={etapa.id} etapa={etapa} etapas={etapas} onErro={onErro} />
          ))}
        </ul>
      </div>
    </li>
  )
}

function LinhaDeRodada({
  etapa,
  etapas,
  onErro,
}: {
  etapa: EtapaQuadro
  etapas: EtapaQuadro[]
  onErro: (mensagem: string | null) => void
}) {
  const responsavel = etapa.responsavelNome?.trim().split(/\s+/)[0] ?? null

  return (
    <li className="flex items-center gap-2 rounded-md bg-muted/50 py-1 pr-1 pl-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-sm">
          {/*
            SEMPRE o nome do bloco, mesmo com uma rodada aberta só.
            
            Antes o rótulo caía para "Reels" quando sobrava uma — ou seja,
            concluir o reels do parto REBATIZAVA a linha do B+F, que continuava
            sendo exatamente o mesmo trabalho. O nome de uma tarefa não pode
            mudar porque outra terminou.
            
            E "Reels" nunca acrescentou nada: a seção inteira é de reels.
          */}
          <span className="font-medium">{ROTULO_RODADA[etapa.rodada]}</span>
          {responsavel && (
            <span className="truncate text-xs text-muted-foreground">· {responsavel}</span>
          )}
        </div>
        <CampoEstacao etapa={etapa} onErro={onErro} />
      </div>

      <AcoesDaEtapa etapa={etapa} etapas={etapas} onErro={onErro} />
    </li>
  )
}

/**
 * O campo do PC.
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

  // Ressincroniza DURANTE a renderização, não num efeito. É o padrão que o
  // React documenta para estado derivado de prop, e o que a regra
  // react-hooks/set-state-in-effect existe para cobrar: um efeito aqui
  // renderizaria uma vez com o texto velho antes de corrigir.
  if (doServidor !== ultimoVisto) {
    setUltimoVisto(doServidor)
    setTexto(doServidor)
  }

  function salvar() {
    const limpo = texto.trim()
    if (limpo === doServidor) return

    onErro(null)
    registrar
      .mutateAsync({ casoEtapaId: etapa.id, estacao: limpo })
      .catch((e) => {
        onErro(mensagemDeErro(e))
        setTexto(doServidor)
      })
  }

  return (
    <input
      type="text"
      value={texto}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={salvar}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') setTexto(doServidor)
      }}
      placeholder="pc-"
      aria-label={`PC em que a edição está sendo feita${
        etapa.rodada > 1 ? ` (${ROTULO_RODADA[etapa.rodada]})` : ''
      }`}
      maxLength={20}
      // Estreito de propósito: cabe "pc-1" e não convida a escrever um bilhete.
      // Para isso existe o aviso da etapa.
      className="mt-0.5 w-20 rounded border border-transparent bg-transparent px-1 py-0.5 font-mono text-xs text-muted-foreground transition-colors hover:border-border focus:border-marca focus:bg-card focus:text-foreground"
    />
  )
}
