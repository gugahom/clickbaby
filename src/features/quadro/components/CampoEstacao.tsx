import { useState } from 'react'
import clsx from 'clsx'
import { IconeMonitor } from '@/components/ui/icones'
import { useRegistrarEstacao } from '../api/useAcoes'
import { mensagemDeErro } from '../lib/erros'
import { rotuloDaRodada, type EtapaQuadro } from '../types'

/** Grafia única da estação. Muda aqui, muda em todo lugar. */
const PREFIXO = 'pc-'

/** Tira o prefixo para o campo mostrar só o número, tolerando o que já está
 *  gravado sem ele (ou com outra caixa) de antes desta regra existir. */
function semPrefixo(valor: string): string {
  return valor.replace(/^\s*pc\s*-?\s*/i, '').trim()
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
export function CampoEstacao({
  etapa,
  onErro,
}: {
  etapa: EtapaQuadro
  onErro: (mensagem: string | null) => void
}) {
  const registrar = useRegistrarEstacao()
  const doServidor = etapa.estacao ?? ''
  // O campo edita SÓ O SUFIXO. "pc-" é prefixo fixo desenhado ao lado do input:
  // a editora digita "1", e o que vai para o banco é "pc-1". Ela escrevia as
  // quatro letras toda vez, e nada impedia "PC1", "pc 1" ou "Pc-1" — três
  // grafias do mesmo PC, que numa busca futura seriam três máquinas.
  const [texto, setTexto] = useState(semPrefixo(doServidor))
  const [ultimoVisto, setUltimoVisto] = useState(doServidor)
  const [aberto, setAberto] = useState(false)

  // Ressincroniza DURANTE a renderização, não num efeito. É o padrão que o
  // React documenta para estado derivado de prop, e o que a regra
  // react-hooks/set-state-in-effect existe para cobrar: um efeito aqui
  // renderizaria uma vez com o texto velho antes de corrigir.
  if (doServidor !== ultimoVisto) {
    setUltimoVisto(doServidor)
    setTexto(semPrefixo(doServidor))
  }

  function salvar() {
    setAberto(false)
    const sufixo = texto.trim()
    // Em branco LIMPA — a RPC trata `''` como "apagar a estação". Sem esta
    // linha, apagar o número gravaria um "pc-" solto.
    const completo = sufixo === '' ? '' : `${PREFIXO}${sufixo}`
    if (completo === doServidor) return

    onErro(null)
    registrar.mutateAsync({ casoEtapaId: etapa.id, estacao: completo }).catch((e) => {
      onErro(mensagemDeErro(e))
      setTexto(semPrefixo(doServidor))
    })
  }

  const rotulo = `PC em que a edição está sendo feita${
    etapa.rodada > 1 ? ` (${rotuloDaRodada(etapa.tipo, etapa.rodada)})` : ''
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
    <span className="inline-flex flex-shrink-0 items-center gap-0.5 rounded-full border border-marca bg-card py-0.5 pr-1.5 pl-2 font-mono text-xs">
      {/* O prefixo é DESENHO, não texto editável: ninguém consegue apagá-lo
          nem escrever outro no lugar. É o que garante uma grafia só. */}
      <span aria-hidden="true" className="text-muted-foreground select-none">
        {PREFIXO}
      </span>
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
            setTexto(semPrefixo(doServidor))
            setAberto(false)
          }
        }}
        placeholder="1"
        aria-label={rotulo}
        // Curto de propósito: aqui vai um número de máquina, não um bilhete.
        // Para bilhete existe o aviso da etapa.
        maxLength={6}
        className="w-8 bg-transparent text-foreground outline-none"
      />
    </span>
  )
}
