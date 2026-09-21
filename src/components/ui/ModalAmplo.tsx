import { useEffect, useRef, type ReactNode } from 'react'
import clsx from 'clsx'
import { BotaoIcone } from './BotaoIcone'
import { IconeX } from './icones'

interface PropsModalAmplo {
  titulo: string
  /** O que mora ao lado do título: contador, critério. */
  subtitulo?: ReactNode
  /** Controles do cabeçalho, antes do fechar — a chave de visão, por exemplo. */
  acoes?: ReactNode
  onFechar: () => void
  children: ReactNode
  /**
   * `tela` (o padrão) é a seção inteira, quase a janela toda. `ficha` é UM
   * cartão aberto — a ficha do MASTER e do FOTO/LIVRO (21/09/2026) —, mais
   * estreita e da altura do conteúdo: uma ficha esticada até o fim da tela seria
   * um vão branco embaixo de quatro blocos.
   */
  tamanho?: 'tela' | 'ficha'
}

/**
 * O modal de TRABALHO — quase a tela inteira, para operar e não para confirmar.
 *
 * O `Dialogo` da casa é de confirmação: 30rem, um texto e dois botões. Este é
 * o outro caso, que nasceu com as seções MASTER e FOTO/LIVRO (15/09/2026): uma
 * lista inteira de cartões com seletor e play/pause, que na coluna da direita
 * não tinha espaço para ser mexida. Esticar o `Dialogo` por uma prop misturaria
 * os dois contratos — um tem "Confirmar" e "Cancelar", o outro só fecha.
 *
 * MESMO MECANISMO do `Dialogo`: `<dialog>` nativo com `showModal()`, que dá foco
 * preso, Esc e inertização do resto da página sem biblioteca. O `Dropdown` já
 * sabe abrir por cima dele (painel `fixed` na top layer), e um `Dialogo` de
 * confirmação aberto de dentro — dispensar o vídeo — entra acima dele na pilha.
 *
 * `open:flex` E NÃO `flex`. A folha do navegador esconde o `<dialog>` fechado
 * com `display: none`, e um `flex` do Tailwind ganharia dela: por um quadro,
 * antes do `showModal()`, o modal apareceria solto no meio da página.
 */
export function ModalAmplo({
  titulo,
  subtitulo,
  acoes,
  onFechar,
  children,
  tamanho = 'tela',
}: PropsModalAmplo) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialogo = ref.current
    if (!dialogo?.open) dialogo?.showModal()
  }, [])

  return (
    <dialog
      ref={ref}
      aria-label={titulo}
      onCancel={(e) => {
        e.preventDefault()
        onFechar()
      }}
      className={clsx(
        'm-auto overflow-hidden rounded-painel border border-border bg-card p-0 text-foreground shadow-cartao-alto backdrop:bg-marca-forte/45 backdrop:backdrop-blur-sm open:flex open:flex-col',
        tamanho === 'tela'
          ? 'h-[calc(100dvh-2rem)] w-[min(90rem,calc(100vw-2rem))]'
          : 'max-h-[calc(100dvh-2rem)] w-[min(64rem,calc(100vw-2rem))]',
      )}
    >
      <header className="flex flex-shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-acento-suave px-4 py-3 md:px-5">
        <div className="min-w-0 flex-1">
          <h2 className="rotulo-sobrescrito text-acento-forte">{titulo}</h2>
          {subtitulo}
        </div>
        {acoes}
        <BotaoIcone rotulo={`Fechar ${titulo}`} onClick={onFechar}>
          <IconeX className="size-5" />
        </BotaoIcone>
      </header>

      <div className="min-h-0 flex-1">{children}</div>
    </dialog>
  )
}
