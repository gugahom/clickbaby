import { useEffect, useLayoutEffect, useRef, useState, type ComponentType } from 'react'
import clsx from 'clsx'
import {
  IconeItalico,
  IconeListaComMarcadores,
  IconeListaNumerada,
  IconeNegrito,
  IconeSublinhado,
  IconeTachado,
  IconeTirarFormatacao,
} from '@/components/ui/icones'
import { CLASSES_DO_TEXTO_FORMATADO, paraHtml, sanitizarHtml, textoDoHtml } from '@/lib/textoFormatado'

type Formato = 'bold' | 'italic' | 'underline' | 'strikeThrough' | 'insertUnorderedList' | 'insertOrderedList'
type Comando = Formato | 'removeFormat'

const BOTOES: { comando: Comando; rotulo: string; Icone: ComponentType<{ className?: string }> }[] = [
  { comando: 'bold', rotulo: 'Negrito (Ctrl+B)', Icone: IconeNegrito },
  { comando: 'italic', rotulo: 'Itálico (Ctrl+I)', Icone: IconeItalico },
  { comando: 'underline', rotulo: 'Sublinhado (Ctrl+U)', Icone: IconeSublinhado },
  { comando: 'strikeThrough', rotulo: 'Tachado', Icone: IconeTachado },
  { comando: 'insertUnorderedList', rotulo: 'Lista com marcadores', Icone: IconeListaComMarcadores },
  { comando: 'insertOrderedList', rotulo: 'Lista numerada', Icone: IconeListaNumerada },
  { comando: 'removeFormat', rotulo: 'Tirar a formatação', Icone: IconeTirarFormatacao },
]

const FORMATOS: Formato[] = ['bold', 'italic', 'underline', 'strikeThrough', 'insertUnorderedList', 'insertOrderedList']

/**
 * `execCommand` é a API que os navegadores mantêm para editar texto rico, e é
 * o que todo editor leve usa por baixo — marcada como obsoleta há anos e sem
 * substituta. A alternativa era uma biblioteca de editor, que a seção 12 do
 * CLAUDE.md pede para justificar, por sete botões.
 */
function executar(comando: string, valor?: string) {
  document.execCommand(comando, false, valor)
}

/** Os formatos ligados onde está o cursor — o botão aceso, como no Google. */
function formatosAtivos(editor: HTMLElement | null): Set<Formato> {
  const selecao = document.getSelection()
  if (!editor || !selecao?.anchorNode || !editor.contains(selecao.anchorNode)) return new Set()
  return new Set(FORMATOS.filter((f) => document.queryCommandState(f)))
}

/**
 * CAIXA DE TEXTO COM FORMATAÇÃO (06/10/2026, pedido do gestor), com a barra de
 * botões EMBAIXO da caixa — "sem tirar muito espaço, se possível deixe abaixo"
 * —, no arranjo da descrição de evento do próprio Google Calendar.
 *
 * `valor` é HTML (ou o texto puro de antes do editor, que entra convertido), e
 * `onMudar` devolve HTML LIMPO (`sanitizarHtml`) — ou vazio, quando não sobra
 * texto, para "campo em branco" continuar significando "sem observação".
 *
 * O conteúdo entra UMA vez, na montagem: reescrever o HTML a cada tecla jogaria
 * o cursor para o começo. Quem quiser trocar o texto de fora troca a `key`.
 */
export function EditorDeTexto({
  valor,
  onMudar,
  rotulo,
  linhas = 4,
  dica,
}: {
  valor: string
  onMudar: (html: string) => void
  /** Nome acessível da caixa (o título que aparece acima dela). */
  rotulo: string
  /** Altura mínima, em linhas — o `rows` da textarea que ela substitui. */
  linhas?: number
  /** Texto cinza dentro da caixa vazia. */
  dica?: string
}) {
  const editor = useRef<HTMLDivElement>(null)
  const [inicial] = useState(() => paraHtml(valor))
  const [vazio, setVazio] = useState(() => textoDoHtml(inicial) === '')
  const [ativos, setAtivos] = useState<Set<Formato>>(() => new Set())

  useLayoutEffect(() => {
    if (editor.current) editor.current.innerHTML = inicial
  }, [inicial])

  useEffect(() => {
    const ler = () => setAtivos(formatosAtivos(editor.current))
    document.addEventListener('selectionchange', ler)
    return () => document.removeEventListener('selectionchange', ler)
  }, [])

  function emitir() {
    const el = editor.current
    if (!el) return
    const limpo = sanitizarHtml(el.innerHTML)
    const semTexto = textoDoHtml(limpo) === ''
    setVazio(semTexto)
    onMudar(semTexto ? '' : limpo)
    setAtivos(formatosAtivos(el))
  }

  function aplicar(comando: Comando) {
    const el = editor.current
    if (!el) return
    if (!el.contains(document.getSelection()?.anchorNode ?? null)) el.focus()
    executar(comando)
    // "Tirar a formatação" não desfaz lista: ela é estrutura, não estilo.
    // Quem a tira de verdade é o próprio botão da lista, que alterna.
    emitir()
  }

  return (
    <div className="mt-1.5 overflow-hidden rounded-xl border border-border bg-background focus-within:border-marca/60">
      <div className="relative">
        {vazio && dica && (
          <span aria-hidden="true" className="pointer-events-none absolute top-2 left-3 text-base text-muted-foreground">
            {dica}
          </span>
        )}
        <div
          ref={editor}
          role="textbox"
          aria-multiline="true"
          aria-label={rotulo}
          contentEditable
          suppressContentEditableWarning
          onInput={emitir}
          onPaste={(e) => {
            // Colar passa pela MESMA limpeza: um texto copiado de um site
            // traria script, estilo e link junto.
            e.preventDefault()
            const html = e.clipboardData.getData('text/html')
            if (html) executar('insertHTML', sanitizarHtml(html))
            else executar('insertText', e.clipboardData.getData('text/plain'))
            emitir()
          }}
          onDrop={(e) => {
            // Arrastar para dentro também traria HTML de fora: entra como texto.
            e.preventDefault()
            executar('insertText', e.dataTransfer.getData('text/plain'))
            emitir()
          }}
          style={{ minHeight: `calc(${linhas} * 1.5rem + 1rem)` }}
          className={clsx(
            'max-h-72 overflow-y-auto px-3 py-2 text-base leading-6 outline-none',
            CLASSES_DO_TEXTO_FORMATADO,
          )}
        />
      </div>
      {/* No toque, os sete botões dividem a largura numa fileira só, com a
          altura de 44px (seção 6): com 44 de largura também, o último caía
          sozinho numa segunda linha a 375px. Sem vão entre eles, todo toque
          na barra acerta algum botão. */}
      <div
        role="toolbar"
        aria-label="Formatação"
        className="flex flex-wrap items-center gap-0.5 border-t border-border bg-muted/40 px-1.5 py-1 pointer-coarse:flex-nowrap pointer-coarse:gap-0 pointer-coarse:px-0.5"
      >
        {BOTOES.map(({ comando, rotulo: nome, Icone }) => {
          const ligado = comando !== 'removeFormat' && ativos.has(comando)
          return (
            <button
              key={comando}
              type="button"
              title={nome}
              aria-label={nome}
              {...(comando !== 'removeFormat' ? { 'aria-pressed': ligado } : {})}
              // O mousedown tiraria a seleção da caixa antes do clique: sem
              // isto, o negrito iria para lugar nenhum.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => aplicar(comando)}
              className={clsx(
                'grid size-8 place-items-center rounded-lg transition-colors pointer-coarse:h-11 pointer-coarse:w-auto pointer-coarse:flex-1',
                ligado ? 'bg-marca/15 text-marca' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                comando === 'removeFormat' && 'ml-auto pointer-coarse:ml-0',
              )}
            >
              <Icone className="size-4" />
            </button>
          )
        })}
      </div>
    </div>
  )
}
