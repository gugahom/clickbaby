import { useEffect, useRef, type ReactNode } from 'react'
import clsx from 'clsx'

/**
 * A GAVETA: um painel que entra pela borda da tela, por cima de tudo (18/11/2026,
 * o menu do CRM no celular). É um `<dialog>` modal, como o `Dialogo` e o
 * `ModalAmplo`: o foco fica preso dentro dela e o Esc fecha, de graça.
 *
 * Tocar FORA fecha também — o fundo escurecido é o "clique fora" que todo
 * celular ensina. Por isso o conteúdo ocupa a gaveta inteira: um clique dentro
 * nunca cai no próprio `<dialog>`.
 */
export function Gaveta({
  rotulo,
  lado = 'esquerda',
  className,
  onFechar,
  children,
}: {
  rotulo: string
  lado?: 'esquerda' | 'direita'
  className?: string
  onFechar: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const d = ref.current
    if (!d?.open) d?.showModal()
  }, [])

  return (
    <dialog
      ref={ref}
      aria-label={rotulo}
      onCancel={(e) => {
        e.preventDefault()
        onFechar()
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onFechar()
      }}
      className={clsx(
        'm-0 h-full max-h-none w-[min(18rem,85vw)] max-w-none border-0 p-0 shadow-cartao-alto backdrop:bg-marca-forte/40 backdrop:backdrop-blur-[2px]',
        lado === 'esquerda' ? 'entra-esquerda mr-auto' : 'entra-direita ml-auto',
        className,
      )}
    >
      <div className="h-full">{children}</div>
    </dialog>
  )
}
