import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, m, useReducedMotion } from 'motion/react'
import clsx from 'clsx'
import { Chevron, IconeCheck } from './icones'

/** Quanto o painel pode crescer antes de rolar por dentro. Também é o número
 *  que decide se ele abre para cima. */
const ALTURA_MAXIMA = 256

interface Posicao {
  paraCima: boolean
  topo?: number | undefined
  base?: number | undefined
  esquerda?: number | undefined
  direita?: number | undefined
  largura?: number | undefined
}

export interface ItemDropdown {
  id: string
  rotulo: string
  icone?: ReactNode
  /** Ação sem volta — some do fluxo normal e ganha a cor de alerta. */
  destrutivo?: boolean
  /**
   * A ação existe mas não cabe agora. O item FICA na lista, apagado: sumir
   * faria o menu mudar de tamanho e de ordem a cada estado, e quem procurasse
   * "passar para outra pessoa" concluiria que a função não existe.
   */
  desabilitado?: boolean
  /** Por que não cabe. Vira o `title` — é o que ensina a regra. */
  motivo?: string | undefined
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
  /**
   * O gatilho ocupa a largura toda. Num FORMULÁRIO isto não é enfeite: um
   * seletor mais estreito que os campos de texto acima dele lê como um botão
   * solto no meio do formulário, não como o campo daquela pergunta.
   */
  larguraCheia?: boolean
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
  larguraCheia = false,
  alinhamento = 'esquerda',
  desabilitado = false,
  className,
  id,
}: PropsDropdown) {
  const [aberto, setAberto] = useState(false)
  const [caixaDoPainel, setCaixaDoPainel] = useState<Posicao | null>(null)
  const caixa = useRef<HTMLDivElement>(null)
  const botao = useRef<HTMLButtonElement>(null)
  const gerado = useId()
  const idGatilho = id ?? gerado
  const semMovimento = useReducedMotion()

  const escolhido = selecionado ? itens.find((i) => i.id === selecionado) : undefined

  /*
   * O PAINEL É `fixed`, e essa é a diferença que importa.
   *
   * Como `absolute`, ele era filho do fluxo do diálogo: o <dialog> tem overflow
   * próprio, então um painel que passava do fim dele fazia o MODAL crescer e
   * ganhar barra de rolagem — era preciso rolar o diálogo para achar os itens.
   *
   * `fixed` posiciona pela janela, não pelo ancestral, então o painel sobrepõe
   * em vez de empurrar. E funciona DENTRO do <dialog> justamente porque o
   * diálogo está na top layer: um portal para o <body> ficaria ATRÁS dele.
   *
   * O preço é medir o gatilho à mão e remedir em scroll e resize — `fixed`
   * não acompanha nada sozinho.
   */
  useEffect(() => {
    if (!aberto) return

    function medir() {
      const g = botao.current
      if (!g) return
      const r = g.getBoundingClientRect()
      const abaixo = window.innerHeight - r.bottom
      // Abre para CIMA quando não cabe embaixo e sobra mais espaço em cima.
      // Sem isso, um gatilho no rodapé da tela abriria um painel cortado.
      const paraCima = abaixo < ALTURA_MAXIMA + 16 && r.top > abaixo
      setCaixaDoPainel({
        paraCima,
        topo: paraCima ? undefined : r.bottom + 4,
        base: paraCima ? window.innerHeight - r.top + 4 : undefined,
        esquerda: alinhamento === 'esquerda' ? r.left : undefined,
        direita: alinhamento === 'direita' ? window.innerWidth - r.right : undefined,
        largura: gatilho ? undefined : r.width,
      })
    }

    medir()
    // `true` na captura: o scroll de um contêiner interno (a lista do Quadro)
    // não borbulha até a janela, e sem capturar o painel ficaria para trás.
    window.addEventListener('scroll', medir, true)
    window.addEventListener('resize', medir)

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
      window.removeEventListener('scroll', medir, true)
      window.removeEventListener('resize', medir)
      document.removeEventListener('mousedown', foraDaCaixa)
      document.removeEventListener('keydown', esc, true)
    }
  }, [aberto, alinhamento, gatilho])

  return (
    <div ref={caixa} className={clsx('relative', className)}>
      {gatilho ? (
        <button
          ref={botao}
          type="button"
          id={idGatilho}
          onClick={() => setAberto((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={aberto}
          // O NOME ACESSÍVEL VEM DAQUI, e não de um aria-label no gatilho
          // passado. Nomear por dentro depende do cálculo de nome-por-conteúdo
          // atravessar até o <span>, e some de vez quando o gatilho é só um
          // ícone — que é o caso dos três menus de ícone da tela. Aqui é
          // explícito: quem passa gatilho cuida da aparência, o nome é
          // responsabilidade deste componente.
          aria-label={rotulo}
          disabled={desabilitado}
          // min-h-11 mesmo com gatilho próprio: quem passa um gatilho cuida da
          // aparência, mas o alvo de toque é responsabilidade daqui — o chip de
          // usuário, por exemplo, tem 40px de desenho e ficaria abaixo dos 44
          // da seção 6 sem esta linha.
          className={clsx(
            'flex min-h-11 cursor-pointer items-center disabled:cursor-not-allowed',
            larguraCheia && 'w-full',
          )}
        >
          {gatilho}
        </button>
      ) : (
        <button
          ref={botao}
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
            initial={
              semMovimento
                ? { opacity: 1 }
                : { opacity: 0, y: caixaDoPainel?.paraCima ? 8 : -8, scaleY: 0.96 }
            }
            animate={{ opacity: 1, y: 0, scaleY: 1 }}
            exit={
              semMovimento
                ? { opacity: 0 }
                : { opacity: 0, y: -6, scaleY: 0.96, transition: { duration: 0.12 } }
            }
            transition={
              semMovimento ? { duration: 0 } : { type: 'spring', bounce: 0.15, duration: 0.28 }
            }
            style={{
              position: 'fixed',
              top: caixaDoPainel?.topo,
              bottom: caixaDoPainel?.base,
              left: caixaDoPainel?.esquerda,
              right: caixaDoPainel?.direita,
              width: caixaDoPainel?.largura,
              maxHeight: ALTURA_MAXIMA,
            }}
            className={clsx(
              // z-50: dentro de um <dialog> o painel precisa passar por cima do
              // conteúdo do próprio diálogo, que já tem empilhamento próprio.
              // `text-foreground` EXPLÍCITO, e não por herança.
              //
              // O painel é `position: fixed`, mas continua sendo filho do
              // gatilho no DOM — e o menu da conta vive dentro do cabeçalho da
              // marca, que é `text-white`. O item comum não declarava cor, então
              // herdava branco e sumia sobre o cartão branco. "Sair" aparecia
              // porque é destrutivo e tem cor própria; enquanto o menu teve um
              // item só, e ele era esse, o defeito não existia. Ele nasceu junto
              // com "Editar conta" (02/09/2026).
              'z-50 overflow-y-auto rounded-md border border-border bg-card text-foreground shadow-cartao-alto',
              // A origem acompanha o lado de onde ele nasce, senão um painel
              // que abre para cima parece cair do gatilho.
              caixaDoPainel?.paraCima ? 'origin-bottom' : 'origin-top',
              // Com gatilho próprio a largura é do conteúdo; com o botão
              // padrão ela acompanha o campo, que é o que se espera de um
              // seletor de formulário.
              gatilho && 'min-w-44',
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
                      disabled={item.desabilitado}
                      title={item.motivo}
                      onClick={() => {
                        setAberto(false)
                        onEscolher(item)
                      }}
                      className={clsx(
                        // min-h-11: a linha É o alvo de toque (seção 6).
                        'flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors',
                        item.desabilitado
                          ? 'cursor-not-allowed text-muted-foreground/60'
                          : item.destrutivo
                            ? 'cursor-pointer text-atrasado hover:bg-atrasado/10'
                            : marcado
                              ? 'cursor-pointer bg-marca-suave font-semibold text-marca'
                              : 'cursor-pointer text-foreground hover:bg-muted',
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
