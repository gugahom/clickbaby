import clsx from 'clsx'
import { useId, useState, type InputHTMLAttributes } from 'react'
import { IconeOlho, IconeOlhoFechado } from './icones'

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
 *
 * CAMPO DE SENHA GANHA O OLHINHO, sem quem chama precisar pedir: se o tipo é
 * `password`, o botão aparece. A alternativa seria uma prop que cada
 * formulário teria de lembrar de ligar — e o formulário que esquecesse seria
 * justamente aquele em que alguém erra a senha e não sabe por quê.
 *
 * Ele importa mais aqui que na média dos sistemas: a senha inicial da equipe
 * tem maiúscula, número e arroba (`@Clickbaby1`), e quem digita é alguém de pé
 * num corredor, com uma mão, num teclado de celular que troca de layout entre
 * as três coisas.
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
  const [revelada, setRevelada] = useState(false)

  const ehSenha = resto.type === 'password'
  // Trocar o `type` é o que revela: `-webkit-text-security` e afins não valem
  // em todo navegador, e um input de texto com máscara própria quebraria o
  // gerenciador de senhas.
  const tipo = ehSenha && revelada ? 'text' : resto.type

  return (
    <label className="block">
      <span className="text-sm font-medium">
        {rotulo}
        {opcional && <span className="ml-1 text-xs text-muted-foreground">(opcional)</span>}
      </span>

      <span className="relative mt-1.5 block">
        <input
          value={valor}
          onChange={(e) => aoMudar(e.target.value)}
          {...(ajuda ? { 'aria-describedby': idAjuda } : {})}
          {...resto}
          type={tipo}
          className={clsx(
            'min-h-12 w-full rounded-md border border-border bg-background/60 px-3 text-base transition-colors',
            'focus:border-marca focus:bg-card',
            // Espaço para o olho não cobrir o fim do que se digita.
            ehSenha && 'pr-12',
          )}
        />

        {ehSenha && (
          <button
            type="button"
            // O <label> em volta faz um clique em qualquer lugar focar o input;
            // sem parar aqui, revelar a senha roubaria o foco de volta e o
            // teclado do celular piscaria a cada toque.
            onClick={(e) => {
              e.preventDefault()
              setRevelada((v) => !v)
            }}
            aria-pressed={revelada}
            aria-label={revelada ? 'Esconder a senha' : 'Mostrar a senha'}
            title={revelada ? 'Esconder a senha' : 'Mostrar a senha'}
            className="absolute inset-y-0 right-0 inline-flex w-12 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground"
          >
            {revelada ? (
              <IconeOlhoFechado className="size-5" />
            ) : (
              <IconeOlho className="size-5" />
            )}
          </button>
        )}
      </span>

      {ajuda && (
        <span id={idAjuda} className="mt-1 block text-xs text-muted-foreground">
          {ajuda}
        </span>
      )}
    </label>
  )
}
