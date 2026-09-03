import clsx from 'clsx'
import { useId, type InputHTMLAttributes } from 'react'

interface PropsCampoTexto
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'className'> {
  rotulo: string
  valor: string
  aoMudar: (valor: string) => void
  opcional?: boolean
  /** Linha miúda abaixo do campo: formato esperado, o que vai acontecer, etc. */
  ajuda?: string
}

/**
 * O campo de texto da aplicação.
 *
 * `min-h-12` (48px) e `text-base` não são gosto: a seção 6 do CLAUDE.md exige
 * alvo de 44px, e em iOS um input com fonte menor que 16px faz a página dar
 * zoom sozinha ao receber foco — num corredor de maternidade, com uma mão, o
 * zoom involuntário é o que faz a pessoa perder o lugar na tela.
 *
 * Vivia dentro de EditarCasoDialogo. Saiu de lá quando o segundo formulário
 * apareceu (cadastro de pessoa, 02/09/2026): duas cópias do mesmo campo
 * divergem na primeira vez que alguém mexer numa só.
 */
export function CampoTexto({
  rotulo,
  valor,
  aoMudar,
  opcional = false,
  ajuda,
  ...resto
}: PropsCampoTexto) {
  const idAjuda = useId()

  return (
    <label className="block">
      <span className="text-sm font-medium">
        {rotulo}
        {opcional && <span className="ml-1 text-xs text-muted-foreground">(opcional)</span>}
      </span>
      <input
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        {...(ajuda ? { 'aria-describedby': idAjuda } : {})}
        {...resto}
        className={clsx(
          'mt-1.5 min-h-12 w-full rounded-md border border-border bg-background/60 px-3 text-base transition-colors',
          'focus:border-marca focus:bg-card',
        )}
      />
      {ajuda && (
        <span id={idAjuda} className="mt-1 block text-xs text-muted-foreground">
          {ajuda}
        </span>
      )}
    </label>
  )
}
