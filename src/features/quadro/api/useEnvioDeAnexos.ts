import { useRef, useState, type ClipboardEvent } from 'react'
import { nomeDoPrintColado, problemaDoArquivo } from '../lib/anexos'
import { mensagemDeErro } from '../lib/erros'
import type { EtapaQuadro } from '../types'
import { useAnexarNosPedidos } from './useAcoes'

/**
 * O ENVIO, separado da lista para quem a mostra decidir de onde vêm os
 * arquivos: o botão e o arrastar ficam na lista; o COLAR (Ctrl+V de um print)
 * fica em quem tem o foco — no diálogo dos pedidos, o texto e a lista juntos.
 *
 * Um arquivo de cada vez, com "2 de 3": o que subiu fica, e o erro diz qual
 * não subiu e por quê. Um lote que falhasse inteiro por causa de um arquivo
 * grande obrigaria a escolher os outros de novo.
 */
export function useEnvioDeAnexos(etapa: EtapaQuadro) {
  const anexar = useAnexarNosPedidos()
  const [progresso, setProgresso] = useState<{ atual: number; total: number } | null>(null)
  const [erros, setErros] = useState<string[]>([])
  // A FILA: o que chega enquanto outro envio corre (um print colado no meio
  // de um arrastar) entra no fim dela, em vez de ser ignorado em silêncio.
  const fila = useRef<File[]>([])
  const contagem = useRef({ feitos: 0, total: 0 })
  const correndo = useRef(false)

  async function enviar(arquivos: File[]) {
    if (arquivos.length === 0) return
    if (!correndo.current) {
      setErros([])
      contagem.current = { feitos: 0, total: 0 }
    }
    const validos = arquivos.filter((a) => {
      const problema = problemaDoArquivo(a)
      if (problema) setErros((atuais) => [...atuais, problema])
      return !problema
    })
    fila.current.push(...validos)
    contagem.current.total += validos.length
    if (correndo.current) return

    correndo.current = true
    for (let arquivo = fila.current.shift(); arquivo; arquivo = fila.current.shift()) {
      contagem.current.feitos += 1
      setProgresso({ atual: contagem.current.feitos, total: contagem.current.total })
      try {
        await anexar.mutateAsync({ casoEtapaId: etapa.id, arquivo })
      } catch (e) {
        const mensagem = mensagemDeErro(e)
        setErros((atuais) => [...atuais, mensagem])
      }
    }
    correndo.current = false
    setProgresso(null)
  }

  function aoColar(e: ClipboardEvent) {
    const arquivos = Array.from(e.clipboardData.files)
    if (arquivos.length === 0) return
    e.preventDefault()
    void enviar(arquivos.map((a) => nomeDoPrintColado(a)))
  }

  return { enviar, aoColar, progresso, erros, limparErros: () => setErros([]) }
}

export type EnvioDeAnexos = ReturnType<typeof useEnvioDeAnexos>
