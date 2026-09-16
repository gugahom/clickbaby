import { useState, type ReactNode } from 'react'
import clsx from 'clsx'
import { Alerta } from '@/components/ui/Alerta'
import { Chevron } from '@/components/ui/icones'
import { ModalAmplo } from '@/components/ui/ModalAmplo'

/** Um caso da seção, com a fase em que está e o cartão pronto para desenhar. */
export interface ItemDaSecao {
  id: string
  /** `null` = ainda sem fase declarada. */
  fase: string | null
  cartao: ReactNode
}

export interface ColunaDaSecao {
  id: string
  rotulo: string
}

type Modo = 'lista' | 'fase'

interface PropsSecaoEmModal {
  titulo: string
  quantidade: number
  criterio: string
  vazio: string
  erro: string | null
  onLimparErro: () => void
  itens: ItemDaSecao[]
  /** As fases, na ordem da esteira — viram as colunas da visão POR FASE. */
  colunas: ColunaDaSecao[]
  /** Separa a preferência de visão de uma seção da outra, no aparelho. */
  chaveModo: string
}

/**
 * SEÇÃO QUE ABRE EM MODAL — MASTER e FOTO/LIVRO (15/09/2026, pedido do gestor).
 *
 * Na coluna da direita elas eram `PainelDobravel`: abriam como sanfona, com teto
 * de 192px — teto pedido pelo próprio gestor, para nenhuma seção roubar altura
 * do REELS. O preço apareceu no uso: um cartão de vídeo ou de fotolivro tem
 * nome, pacote, seletor de fase e play/pause, e em 192px cabia um e meio. Ele
 * achou pequeno para mexer, e com razão.
 *
 * A saída mantém as DUAS regras: a seção continua no mesmo lugar da coluna, do
 * mesmo tamanho fechada (título e contador), e o REELS não perde nada — o que
 * muda é que o clique abre um modal largo em vez de uma sanfona apertada. Os
 * CARTÕES SÃO OS MESMOS, com as mesmas ações e o mesmo realtime: o modal só
 * desenha o que o Quadro já tem.
 *
 * DUAS VISÕES, COM CHAVE, EM TESTE. LISTA é a grade de cartões maiores, na
 * ordem de sempre. POR FASE é o quadro de colunas, uma por fase, que o gestor
 * quis ver antes de decidir — e que REABRE uma decisão escrita: quando estas
 * seções nasceram, o quadro de colunas foi descartado (ver `FaseDoVideo`),
 * porque a pergunta aqui é sobre UM caso, não sobre carga por coluna. A visão
 * que perder sai; a chave não é para ficar.
 *
 * Nas duas, a fase muda pelo seletor do cartão. Sem arrastar: é o gesto mais
 * difícil de acertar com uma mão, e o que um quadro de colunas costuma exigir.
 */
export function SecaoEmModal({
  titulo,
  quantidade,
  criterio,
  vazio,
  erro,
  onLimparErro,
  itens,
  colunas,
  chaveModo,
}: PropsSecaoEmModal) {
  const [aberto, setAberto] = useState(false)
  const [modo, setModo] = useState<Modo>(() => lerModo(chaveModo))

  function trocarModo(novo: Modo) {
    setModo(novo)
    gravarModo(chaveModo, novo)
  }

  return (
    <>
      {/* FECHADA, IGUAL À SANFONA: mesmo desenho, mesmo contador. Quem já sabia
          onde olhar continua achando no mesmo lugar — o que muda é o que o
          clique faz, e o chevron virado para o lado diz que ele leva a outro
          lugar em vez de abrir aqui. */}
      <section className="flex flex-shrink-0 flex-col overflow-hidden rounded-painel border border-border bg-card shadow-painel">
        <button
          type="button"
          onClick={() => setAberto(true)}
          aria-haspopup="dialog"
          className="flex w-full cursor-pointer items-center gap-3 bg-acento-suave px-3.5 py-3 text-left transition-colors hover:bg-acento-suave/70"
        >
          <span className="min-w-0 flex-1">
            <span className="flex items-center justify-between gap-2">
              <span className="rotulo-sobrescrito text-acento-forte">{titulo}</span>
              <span className="inline-flex min-w-7 items-center justify-center rounded-full bg-contador px-2 py-0.5 text-sm font-bold tabular-nums text-white">
                {quantidade}
              </span>
            </span>
          </span>
          <Chevron className="size-5 flex-shrink-0 -rotate-90 text-acento-forte" />
        </button>
      </section>

      {aberto && (
        <ModalAmplo
          titulo={titulo}
          onFechar={() => setAberto(false)}
          subtitulo={
            <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
              <span className="font-bold text-foreground tabular-nums">{quantidade}</span>
              {quantidade === 1 ? ' caso' : ' casos'} · {criterio}
            </p>
          }
          acoes={<ChaveDeModo modo={modo} onTrocar={trocarModo} />}
        >
          <div className="flex h-full min-h-0 flex-col">
            {/* O erro mora DENTRO do modal: o <dialog> inertiza a coluna de
                trás, e um alerta lá ficaria invisível atrás do fundo. */}
            {erro && (
              <div className="flex-shrink-0 px-4 pt-3 md:px-5">
                <Alerta onFechar={onLimparErro}>{erro}</Alerta>
              </div>
            )}

            {quantidade === 0 ? (
              <p className="px-4 py-12 text-center text-sm text-muted-foreground">{vazio}</p>
            ) : modo === 'lista' ? (
              <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-5">
                {/* `items-start`: sem ele um cartão curto estica até a altura do
                    vizinho mais alto da mesma linha, e o espaço vazio embaixo
                    parece área clicável. */}
                <ul className="grid items-start gap-3 md:grid-cols-2 2xl:grid-cols-3">
                  {itens.map((item) => item.cartao)}
                </ul>
              </div>
            ) : (
              <QuadroPorFase itens={itens} colunas={colunas} />
            )}
          </div>
        </ModalAmplo>
      )}
    </>
  )
}

function ChaveDeModo({ modo, onTrocar }: { modo: Modo; onTrocar: (m: Modo) => void }) {
  return (
    <div
      role="group"
      aria-label="Como mostrar a seção"
      className="inline-flex flex-shrink-0 rounded-full border border-border bg-card p-0.5"
    >
      {(
        [
          ['lista', 'Lista'],
          ['fase', 'Por fase'],
        ] as const
      ).map(([id, rotulo]) => (
        <button
          key={id}
          type="button"
          aria-pressed={modo === id}
          onClick={() => onTrocar(id)}
          className={clsx(
            'min-h-10 rounded-full px-4 text-sm font-semibold transition-colors',
            modo === id ? 'bg-marca text-white' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {rotulo}
        </button>
      ))}
    </div>
  )
}

/**
 * Uma coluna por fase, na ordem da esteira, rolando na horizontal.
 *
 * "SEM FASE" VEM PRIMEIRO, e só quando existe. É o caso que ninguém declarou
 * ainda — no fotolivro é justamente o que a ordenação da lista já põe no topo,
 * por ser o único que corre risco de ser esquecido.
 *
 * FASE DESCONHECIDA CAI EM "SEM FASE", e não some. Se um dia o banco ganhar uma
 * fase que esta tela ainda não conhece, o cartão aparece no lugar errado — mas
 * aparece. Sumir com ele esconderia trabalho, que é o pior erro desta tela.
 *
 * COLUNA VAZIA FICA: o quadro inteiro é o que dá a leitura de "onde está a
 * carga", que é a única razão de ter colunas.
 */
function QuadroPorFase({ itens, colunas }: { itens: ItemDaSecao[]; colunas: ColunaDaSecao[] }) {
  const conhecidas = new Set(colunas.map((c) => c.id))
  const semFase = itens.filter((i) => i.fase === null || !conhecidas.has(i.fase))

  const grupos = [
    ...(semFase.length > 0 ? [{ id: '__sem_fase', rotulo: 'Sem fase', itens: semFase }] : []),
    ...colunas.map((c) => ({ ...c, itens: itens.filter((i) => i.fase === c.id) })),
  ]

  return (
    <div className="flex h-full min-h-0 items-start gap-3 overflow-x-auto p-4 md:p-5">
      {grupos.map((grupo) => (
        <section
          key={grupo.id}
          /*
           * A COLUNA SE AJUSTA AO CONTEÚDO, com piso e teto.
           *
           * Com largura fixa (22rem, a primeira tentativa), o cartão do
           * fotolivro não cabia: a pílula "Aguardando pagamento e fotos" mais o
           * play e o concluir passam de 22rem, e a coluna ganhava uma barra de
           * rolagem HORIZONTAL por dentro — o pior dos dois mundos, porque o
           * que ficava escondido era justamente o botão.
           *
           * `w-max` mede pelo conteúdo. O PISO mantém as colunas vazias com
           * corpo de coluna, e o TETO impede que um nome de mãe comprido estique
           * uma coluna até o dobro das outras (o nome trunca, como no cartão da
           * seção).
           */
          className="flex max-h-full w-max min-w-[20rem] max-w-[26rem] flex-shrink-0 flex-col rounded-painel border border-border bg-background/70"
        >
          <header className="flex flex-shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2.5">
            <h3 className="text-sm font-bold tracking-tight">{grupo.rotulo}</h3>
            <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-muted px-1.5 text-xs font-bold tabular-nums text-muted-foreground">
              {grupo.itens.length}
            </span>
          </header>
          {grupo.itens.length === 0 ? (
            <p className="px-3 py-4 text-xs text-muted-foreground">Nenhum caso nesta fase.</p>
          ) : (
            <ul className="min-h-0 space-y-2 overflow-y-auto p-2">
              {grupo.itens.map((item) => item.cartao)}
            </ul>
          )}
        </section>
      ))}
    </div>
  )
}

/*
 * A visão escolhida fica NO APARELHO — é preferência de tela, não dado de
 * domínio (seção 12 do CLAUDE.md), e a TV da sala pode querer uma enquanto o
 * PC da edição quer outra. Começa em POR FASE porque é a visão que o gestor
 * pediu para ver antes de decidir.
 *
 * Tudo em try/catch: `localStorage` pode não existir (aba privada, armazenamento
 * bloqueado), e a tela precisa funcionar do mesmo jeito sem lembrar de nada.
 */
function lerModo(chave: string): Modo {
  try {
    const salvo = window.localStorage.getItem(`clickbaby:secao-modo:${chave}`)
    return salvo === 'lista' ? 'lista' : 'fase'
  } catch {
    return 'fase'
  }
}

function gravarModo(chave: string, modo: Modo) {
  try {
    window.localStorage.setItem(`clickbaby:secao-modo:${chave}`, modo)
  } catch {
    // Sem armazenamento a escolha só não é lembrada.
  }
}
