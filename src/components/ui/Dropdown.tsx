import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, m, useReducedMotion } from 'motion/react'
import clsx from 'clsx'
import { Chevron, IconeCheck } from './icones'

export interface ItemDropdown {
  id: string
  rotulo: string
  icone?: ReactNode
  /** Ação sem volta — some do fluxo normal e ganha a cor de alerta. */
  destrutivo?: boolean
}

interface PropsDropdown {
  itens: ItemDropdown[]
  onEscolher: (item: ItemDropdown) => void
  /** O que o gatilho mostra quando nada está escolhido. */
  rotulo: string
  /**
   * Presente = SELETOR: o gatilho mostra o item escolhido e ele ganha um
   * visto. Ausente = MENU de ações, e o gatilho mostra sempre `rotulo`.
   */
  selecionado?: string | undefined
  /** Substitui o botão padrão — usado pelo chip de usuário do cabeçalho. */
  gatilho?: ReactNode
  /** Para o painel não sair da tela quando o gatilho está na borda direita. */
  alinhamento?: 'esquerda' | 'direita'
  desabilitado?: boolean
  className?: string
  /** Vira o `id` do gatilho, para um <label> externo apontar para cá. */
  id?: string
}

/**
 * O dropdown da casa — um só, para escolha e para ação.
 *
 * POR QUE UM SÓ. Havia três `<select>` nativos e nenhum menu; o `<select>` não
 * aceita estilo de item, então os três eram a única coisa da tela fora da
 * linguagem visual do resto — e um menu de ações não podia sequer existir
 * dentro dele. Duas necessidades, um mecanismo: escolher um valor e disparar
 * uma ação são o mesmo gesto de "abrir uma lista e tocar numa linha".
 *
 * O QUE SE PERDE, e é honesto dizer: no celular, `<select>` abre a roda nativa
 * do sistema, que é grande e boa. A troca só se paga porque as linhas aqui têm
 * 44px (seção 6 do CLAUDE.md), o painel rola sozinho quando a lista é longa, e
 * o teclado funciona — sem isso teria sido um retrocesso de usabilidade em
 * troca de estética.
 *
 * FECHA POR FORA, POR ESC E AO ESCOLHER. As três saídas que uma pessoa tenta,
 * nessa ordem. O `mousedown` e não o `click` no clique de fora: com `click`, o
 * toque que fecha o painel também ativaria o que estiver embaixo dele.
 */
export function Dropdown({
  itens,
  onEscolher,
  rotulo,
  selecionado,
  gatilho,
  alinhamento = 'esquerda',
  desabilitado = false,
  className,
  id,
}: PropsDropdown) {
  const [aberto, setAberto] = useState(false)
  const caixa = useRef<HTMLDivElement>(null)
  const gerado = useId()
  const idGatilho = id ?? gerado
  const semMovimento = useReducedMotion()

  const escolhido = selecionado ? itens.find((i) => i.id === selecionado) : undefined

  useEffect(() => {
    if (!aberto) return

    function foraDaCaixa(evento: MouseEvent) {
      if (caixa.current && !caixa.current.contains(evento.target as Node)) {
        setAberto(false)
      }
    }
    function esc(evento: KeyboardEvent) {
      if (evento.key !== 'Escape') return
      // Não deixa borbulhar: dentro de um <dialog>, o Esc fecharia o diálogo
      // inteiro junto, e quem apertou queria fechar só a lista.
      evento.stopPropagation()
      setAberto(false)
    }

    document.addEventListener('mousedown', foraDaCaixa)
    document.addEventListener('keydown', esc, true)
    return () => {
      document.removeEventListener('mousedown', foraDaCaixa)
      document.removeEventListener('keydown', esc, true)
    }
  }, [aberto])

  return (
    <div ref={caixa} className={clsx('relative', className)}>
      {gatilho ? (
        <button
          type="button"
          id={idGatilho}
          onClick={() => setAberto((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={aberto}
          disabled={desabilitado}
          // min-h-11 mesmo com gatilho próprio: quem passa um gatilho cuida da
          // aparência, mas o alvo de toque é responsabilidade daqui — o chip de
          // usuário, por exemplo, tem 40px de desenho e ficaria abaixo dos 44
          // da seção 6 sem esta linha.
          className="flex min-h-11 cursor-pointer items-center disabled:cursor-not-allowed"
        >
          {gatilho}
        </button>
      ) : (
        <button
          type="button"
          id={idGatilho}
          onClick={() => setAberto((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={aberto}
          disabled={desabilitado}
          className={clsx(
            'flex min-h-12 w-full cursor-pointer items-center justify-between gap-2 rounded-md border border-border px-3 text-base transition-colors',
            'focus-visible:border-marca focus-visible:outline-none',
            desabilitado
              ? 'cursor-not-allowed bg-muted/50 text-muted-foreground'
              : 'bg-background/60 hover:bg-card',
          )}
        >
          <span className={clsx('block truncate', !escolhido && 'text-muted-foreground')}>
            {escolhido?.rotulo ?? rotulo}
          </span>
          <m.span
            className="flex-shrink-0 text-muted-foreground"
            animate={{ rotate: aberto ? 180 : 0 }}
            transition={semMovimento ? { duration: 0 } : { duration: 0.2 }}
          >
            <Chevron className="size-4" />
          </m.span>
        </button>
      )}

      <AnimatePresence>
        {aberto && (
          <m.div
            role="menu"
            aria-orientation="vertical"
            aria-labelledby={idGatilho}
            initial={semMovimento ? { opacity: 1 } : { opacity: 0, y: -8, scaleY: 0.96 }}
            animate={{ opacity: 1, y: 0, scaleY: 1 }}
            exit={
              semMovimento
                ? { opacity: 0 }
                : { opacity: 0, y: -6, scaleY: 0.96, transition: { duration: 0.12 } }
            }
            transition={
              semMovimento ? { duration: 0 } : { type: 'spring', bounce: 0.15, duration: 0.28 }
            }
            className={clsx(
              // z-50: dentro de um <dialog> o painel precisa passar por cima do
              // conteúdo do próprio diálogo, que já tem empilhamento próprio.
              'absolute z-50 mt-1 origin-top overflow-hidden rounded-md border border-border bg-card shadow-cartao-alto',
              // Lista longa rola por dentro em vez de empurrar a tela: são ~10
              // pessoas hoje, e a lista de maternidades cresce.
              'max-h-64 overflow-y-auto',
              alinhamento === 'direita' ? 'right-0' : 'left-0',
              // Com gatilho próprio a largura é do conteúdo; com o botão
              // padrão ela acompanha o campo, que é o que se espera de um
              // seletor de formulário.
              gatilho ? 'min-w-44' : 'w-full',
            )}
          >
            <ul className="py-1">
              {itens.map((item) => {
                const marcado = escolhido?.id === item.id
                return (
                  <li key={item.id} role="none">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setAberto(false)
                        onEscolher(item)
                      }}
                      className={clsx(
                        // min-h-11: a linha É o alvo de toque (seção 6).
                        'flex min-h-11 w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm transition-colors',
                        item.destrutivo
                          ? 'text-atrasado hover:bg-atrasado/10'
                          : marcado
                            ? 'bg-marca-suave font-semibold text-marca'
                            : 'hover:bg-muted',
                      )}
                    >
                      {item.icone && <span className="flex-shrink-0">{item.icone}</span>}
                      <span className="truncate">{item.rotulo}</span>
                      {marcado && (
                        <IconeCheck className="ml-auto size-4 flex-shrink-0 text-marca" />
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  )
}
