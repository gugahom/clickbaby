import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { AnimatePresence, m, useReducedMotion } from 'motion/react'
import clsx from 'clsx'
import {
  IconeAtribuir,
  IconeAviso,
  IconeCalendario,
  IconeReabrir,
  IconeRelogio,
  IconeRendicao,
  IconeSino,
  IconeX,
} from '@/components/ui/icones'
import { useAuth } from '@/features/auth/contexto'
import { useQuadro } from '@/features/quadro/api/useQuadro'
import { formatarDuracao } from '@/lib/formato'
import { useRelogioDeMinuto } from '@/lib/useRelogio'
import { useMarcarVistas, useMarcasDoSino } from '../api/useNotificacoesVistas'
import { derivarNotificacoes, type Notificacao, type TipoNotificacao } from '../lib/derivar'

/**
 * Quantas notificações a lista mostra antes de dizer "e mais N".
 *
 * Trinta não é um teto de desempenho — é de leitura. Uma lista que rola sem
 * fim responde "quanto está pegando fogo", que é uma pergunta de painel, não
 * de sino. O que passa disso o Quadro mostra melhor.
 */
const TETO = 30

/**
 * UM ÍCONE POR TIPO — o que a caixa de entrada de referência faz com um ícone
 * por ação. Os desenhos são os do próprio projeto (`icones.tsx`), e não uma
 * biblioteca de ícones nova: todos estes já significam a mesma coisa em outro
 * lugar da tela (o de atribuir é o do menu de atribuir, o de reabrir é o do
 * "Pedir alteração"), e a mesma ação com dois desenhos obriga a reaprender.
 */
const ICONE: Record<TipoNotificacao, (props: { className: string }) => ReactNode> = {
  atribuida: IconeAtribuir,
  horario: IconeRelogio,
  prazo: IconeCalendario,
  alteracao_minha: IconeReabrir,
  rendicao: IconeRendicao,
  aviso: IconeAviso,
}

/** "há 25min", "em 40min" — ou nada, quando o carimbo não existe. */
function quandoRelativo(em: string, agora: Date): string | null {
  if (!em) return null
  const ms = new Date(em).getTime() - agora.getTime()
  if (Number.isNaN(ms)) return null
  const horas = Math.abs(ms) / 3_600_000
  return ms > 0 ? `em ${formatarDuracao(horas)}` : `há ${formatarDuracao(horas)}`
}

/**
 * O SINO DO CABEÇALHO (17/09/2026, pedido do gestor; visual trocado em 18/09).
 *
 * A LISTA É DERIVADA e não mora em tabela nenhuma — ver `lib/derivar.ts`, que
 * é onde a decisão está escrita. O que vive aqui é a caixa de entrada.
 *
 * O VISUAL É O DA CAIXA DE ENTRADA QUE O GESTOR MANDOU (18/09/2026): botão com
 * borda e contador no canto, painel com abas no topo, um ícone por linha,
 * negrito e bolinha no que é novo, e um rodapé fechando o cartão. Foi refeito
 * com as peças da casa, e não com o shadcn que vinha junto do exemplo — ver o
 * comentário no fim deste arquivo.
 *
 * TRÊS REGRAS DE COMPORTAMENTO, e elas não mudaram com o visual:
 *
 *   1. O CONTADOR CONTA NOVIDADES. Ele some quando não há nada novo — é a
 *      "bolinha no momento que o usuário precisa dar atenção", nas palavras
 *      do pedido.
 *
 *      E O SINO CHAMA ENQUANTO HOUVER ALGO PARA VOCÊ (18/09/2026, pedido do
 *      gestor: "deve chamar mais a atenção"). O botão fica vermelho, solta a
 *      onda do chamado — maior que a da pílula — e balança de tempos em
 *      tempos. Isso vale enquanto EXISTIR notificação "para você", e não só
 *      enquanto ela for nova: é a mesma regra da pílula de quem foi
 *      atribuída no card, que pulsa até o play. Abrir o sino não o cala; o
 *      trabalho andar, sim. Com o painel aberto ele para — a pessoa já está
 *      olhando, e uma onda atrás da lista que ela lê só atrapalha.
 *   2. ABRIR MARCA COMO VISTO, e o item continua listado até o trabalho ser
 *      resolvido (decisão do gestor, 17/09). É por isso que o exemplo tinha
 *      "Marcar todas como lidas" e aqui não tem: abrir já faz isso.
 *
 *      SÓ "PARA VOCÊ" DESDE 30/09/2026 (pedido do gestor). Até ali havia duas
 *      abas — "Todas" e "Para você" — e um "Limpar gerais" para o que era do
 *      trabalho dos outros. As gerais saíram (ver `lib/derivar.ts`), e com
 *      elas as abas e o botão: sobrou uma lista só, toda ela esperando por
 *      quem abre. A coluna `gerais_limpas_em` e a RPC de limpar ficaram no
 *      banco, sem uso.
 *   3. CLICAR LEVA AO CASO (`/?caso=`), que o Quadro abre e destaca.
 *
 */
export function Sino() {
  const { pessoa } = useAuth()
  const { data } = useQuadro()
  const { data: marcas } = useMarcasDoSino()
  const vistoEm = marcas?.vistoEm ?? null
  const marcar = useMarcarVistas()
  const navegar = useNavigate()
  const agora = useRelogioDeMinuto()
  const semMovimento = useReducedMotion()

  const [aberto, setAberto] = useState(false)
  /*
   * O "JÁ VI" DE ANTES DE ABRIR. Abrir marca tudo como visto no banco — e sem
   * esta cópia, o negrito e a bolinha das novidades sumiriam no mesmo quadro em
   * que o painel aparece, que é justamente quando a pessoa precisa deles.
   */
  const [vistoAntes, setVistoAntes] = useState<string | null>(null)
  const caixa = useRef<HTMLDivElement>(null)
  const idPainel = useId()

  useEffect(() => {
    if (!aberto) return

    function foraDaqui(e: MouseEvent) {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false)
    }
    function noEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setAberto(false)
    }

    document.addEventListener('mousedown', foraDaqui)
    document.addEventListener('keydown', noEsc)
    return () => {
      document.removeEventListener('mousedown', foraDaqui)
      document.removeEventListener('keydown', noEsc)
    }
  }, [aberto])

  const lista = derivarNotificacoes({
    casos: data?.casos ?? [],
    etapasPorCaso: data?.etapasPorCaso ?? new Map(),
    pessoaId: pessoa?.id ?? null,
    agora,
  })

  const ehNova = (n: Notificacao, marca: string | null) => marca === null || n.em > marca
  const novas = lista.filter((n) => ehNova(n, vistoEm))

  /*
   * O AVISO DE "CHEGOU AGORA" (01/10/2026, pedido do gestor: "dar uma sensação
   * de urgência maior, porque hoje não está passando"). Com a lista enxuta —
   * só o que tem o nome da pessoa —, cada item novo merece aparecer sozinho:
   * um cartão embaixo do sino, por alguns segundos, com o caso a um toque.
   *
   * Só para o que NASCE com a tela aberta: o que já existia ao entrar fica no
   * sino, que já está vermelho e balançando por ele — uma rajada de cartões no
   * login seria o oposto de urgência. E a hora chegando conta como nova no
   * minuto em que entra na janela vermelha, que é quando ela precisa aparecer.
   *
   * Estado derivado de render anterior, e não efeito: guardar a lista de ids da
   * última vez e comparar é o padrão do React para "isto mudou desde a última
   * renderização".
   */
  const idsAgora = lista.map((n) => n.id).join('|')
  const [idsAntes, setIdsAntes] = useState<string | null>(null)
  const [chegou, setChegou] = useState<Notificacao | null>(null)
  if (data && idsAgora !== idsAntes) {
    if (idsAntes !== null) {
      const conhecidos = new Set(idsAntes.split('|'))
      const nova = lista.find((n) => !conhecidos.has(n.id) && ehNova(n, vistoEm))
      if (nova) setChegou(nova)
    }
    setIdsAntes(idsAgora)
  }
  useEffect(() => {
    if (!chegou) return
    const t = window.setTimeout(() => setChegou(null), 9000)
    return () => window.clearTimeout(t)
  }, [chegou])
  // O sino CHAMA enquanto houver algo para mim — e não enquanto eu estiver com
  // a lista aberta na frente, que é quando a onda só atrapalharia a leitura.
  const chamando = lista.length > 0 && !aberto

  function alternar() {
    const indo = !aberto
    setAberto(indo)
    setChegou(null)
    if (!indo) return
    setVistoAntes(vistoEm)
    // Só escreve quando há o que marcar: uma RPC por clique num sino sem
    // novidade seria escrita à toa a cada curiosidade.
    if (novas.length > 0) marcar.mutate()
  }

  function irAoCaso(n: Notificacao) {
    setAberto(false)
    setChegou(null)
    // O Quadro lê `?caso=` e abre o card, seja em que aba ele estiver — ver
    // QuadroPage. Query e não rota própria: o caso não tem tela, ele tem um
    // lugar DENTRO do Quadro.
    void navegar(`/?caso=${n.casoId}`)
  }

  return (
    /*
     * `sm:relative`, e não `relative` sempre (24/09/2026, o painel aparecia
     * CORTADO no celular).
     *
     * O painel abre com `right-0` — alinhado à direita de quem o posiciona — e
     * tem a largura da tela menos as margens. Ancorado NO BOTÃO, a borda direita
     * dele caía onde o sino termina, ~60px antes da borda da tela, e a esquerda
     * saía para fora: as primeiras letras de cada linha ficavam cortadas ("o/Livro
     * voltou para alteração").
     *
     * Sem `relative` aqui, quem posiciona passa a ser o CABEÇALHO (a linha que
     * tem `relative` no AppShell): `right-0` vira a margem direita da tela e
     * `top-full` vira a base do cabeçalho — o painel encosta nas duas margens,
     * que é o que a largura já pressupunha. No desktop nada muda: a partir de
     * `sm` o botão volta a ser a âncora.
     */
    <div ref={caixa} className="flex-shrink-0 sm:relative">
      <button
        type="button"
        onClick={alternar}
        aria-expanded={aberto}
        aria-controls={idPainel}
        aria-haspopup="dialog"
        aria-label={`Notificações: ${
          lista.length === 0
            ? 'nada pedindo atenção'
            : [
                `${lista.length} para você`,
                novas.length > 0 ? `${novas.length} ${novas.length === 1 ? 'nova' : 'novas'}` : null,
              ]
                .filter(Boolean)
                .join(', ')
        }`}
        className={clsx(
          // O BOTÃO COM BORDA do exemplo, com 44px e não 40: o piso de toque
          // da seção 6 vale no cabeçalho também — é o sino que a pessoa aperta
          // de pé, no corredor.
          'relative inline-flex size-11 cursor-pointer items-center justify-center rounded-md border text-white transition-colors focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none',
          lista.length > 0
            ? // VERMELHO SÓLIDO quando há trabalho meu: é a cor do chamado no
              // card (a pílula da atribuída, o aviso), e a única coisa sólida
              // na faixa escura — o olho vai nela primeiro.
              'border-atrasado bg-atrasado hover:bg-atrasado/90'
            : 'border-white/25 bg-white/10 hover:bg-white/20',
          chamando && 'pulso-sino',
        )}
      >
        <IconeSino className={clsx('size-[18px]', chamando && 'balanco-sino')} />

        {novas.length > 0 && (
          <span
            className={clsx(
              // BRANCO SEMPRE: o botão já é o vermelho quando há algo para
              // você, e um contador vermelho em cima dele sumiria.
              'absolute -top-2 left-full inline-flex min-w-5 -translate-x-1/2 items-center justify-center rounded-full bg-white px-1 text-[11px] leading-5 font-bold tabular-nums text-atrasado ring-2 ring-black/30',
            )}
          >
            {novas.length > 99 ? '99+' : novas.length}
          </span>
        )}
      </button>

      <AnimatePresence>
        {chegou && !aberto && (
          <m.div
            key={chegou.id}
            role="status"
            aria-live="polite"
            initial={semMovimento ? { opacity: 1 } : { opacity: 0, y: -10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={semMovimento ? { opacity: 0 } : { opacity: 0, y: -6, transition: { duration: 0.15 } }}
            transition={semMovimento ? { duration: 0 } : { type: 'spring', bounce: 0.25, duration: 0.35 }}
            style={{ transformOrigin: 'top right' }}
            className="absolute top-full right-3 z-50 mt-2 w-[min(340px,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-atrasado/40 bg-card text-foreground shadow-cartao-alto sm:right-0"
          >
            <div className="flex items-start gap-3 border-l-4 border-atrasado p-3">
              <button
                type="button"
                onClick={() => irAoCaso(chegou)}
                className="flex min-w-0 flex-1 cursor-pointer items-start gap-3 text-left"
              >
                <span className="mt-0.5 grid size-8 flex-shrink-0 place-items-center rounded-full bg-atrasado text-white">
                  {(() => {
                    const Icone = ICONE[chegou.tipo]
                    return <Icone className="size-4" />
                  })()}
                </span>
                <span className="min-w-0">
                  <span className="block text-[11px] font-bold tracking-wide text-atrasado uppercase">Para você · agora</span>
                  <span className="block text-sm font-bold">{chegou.titulo}</span>
                  <span className="block truncate text-xs text-muted-foreground">{chegou.casoNome}</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => setChegou(null)}
                aria-label="Dispensar o aviso"
                className="-mt-1 -mr-1 grid size-8 flex-shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <IconeX className="size-4" />
              </button>
            </div>
          </m.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {aberto && (
          <m.div
            id={idPainel}
            role="dialog"
            aria-label="Notificações"
            // A entrada do exemplo — aparece, cresce de 95% e desce um pouco —
            // feita com o `motion` que o projeto já usa no Dropdown, em vez do
            // plugin de animação do Tailwind que o exemplo pressupunha.
            initial={semMovimento ? { opacity: 1 } : { opacity: 0, scale: 0.95, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={
              semMovimento
                ? { opacity: 0 }
                : { opacity: 0, scale: 0.95, y: -4, transition: { duration: 0.12 } }
            }
            transition={
              semMovimento ? { duration: 0 } : { type: 'spring', bounce: 0.15, duration: 0.28 }
            }
            style={{ transformOrigin: 'top right' }}
            // `right-3` no celular: ali quem posiciona é o cabeçalho inteiro, e
            // o zero cravaria o painel na borda da tela enquanto a largura já
            // desconta as duas margens. A partir de `sm` a âncora volta a ser o
            // botão, e o zero é o alinhamento certo.
            className="absolute top-full right-3 z-50 mt-2 w-[min(380px,calc(100vw-1.5rem))] overflow-hidden rounded-md border border-border bg-card text-foreground shadow-cartao-alto sm:right-0"
          >
            <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
              <h2 className="text-sm font-bold text-foreground">Para você</h2>
              {lista.length > 0 && (
                <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-atrasado px-1.5 text-[11px] leading-5 font-bold tabular-nums text-white">
                  {lista.length}
                </span>
              )}
            </div>

            <div className="max-h-80 overflow-y-auto">
              {lista.length === 0 ? (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                  Nada esperando por você.
                </div>
              ) : (
                lista.slice(0, TETO).map((n) => {
                  const Icone = ICONE[n.tipo]
                  const nova = ehNova(n, vistoAntes)
                  const quando = quandoRelativo(n.em, agora)
                  return (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => irAoCaso(n)}
                      className={clsx(
                        'flex w-full cursor-pointer items-start gap-3 border-b border-border px-3 py-3 text-left transition-colors last:border-b-0',
                        // PASSOU DA HORA OU DO PRAZO: a linha inteira tinge, e o
                        // título fica vermelho — é o que não pode esperar a lista.
                        n.urgente ? 'bg-atrasado/8 hover:bg-atrasado/12' : 'hover:bg-muted/60',
                      )}
                    >
                      <div className="mt-0.5 text-atrasado">
                        <Icone className="size-[18px]" />
                      </div>

                      <div className="min-w-0 flex-1 space-y-0.5">
                        <p
                          className={clsx(
                            'text-sm',
                            n.urgente
                              ? 'font-bold text-atrasado'
                              : nova
                                ? 'font-semibold text-foreground'
                                : 'text-foreground/80',
                          )}
                        >
                          {n.titulo}{' '}
                          <span className="font-medium">· {n.casoNome}</span>
                        </p>
                        {/* O detalhe TRUNCA: o aviso pode ser um parágrafo, e
                            quem quer o texto inteiro abre o card — que é para
                            onde o clique leva. */}
                        <p className="truncate text-xs text-muted-foreground">
                          {n.detalhe}
                          {quando && ` · ${quando}`}
                        </p>
                      </div>

                      {nova && (
                        <span
                          className="mt-1.5 inline-block size-2 flex-shrink-0 rounded-full bg-marca"
                          aria-label="nova"
                        />
                      )}
                    </button>
                  )
                })
              )}
            </div>

            {/* O RODAPÉ fecha o cartão, como no exemplo. Lá ele levava a "ver
                todas"; aqui não existe outra tela de notificações — a lista
                inteira é esta —, então ele diz a regra que a pessoa mais
                precisa saber sobre esta caixa: ninguém limpa nada à mão. */}
            <div className="border-t border-border px-3 py-2 text-center text-xs text-muted-foreground">
              {lista.length > TETO
                ? `E mais ${lista.length - TETO} — veja no Quadro.`
                : 'Cada item some sozinho quando o trabalho é feito.'}
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/*
 * POR QUE NÃO O SHADCN QUE VEIO COM O EXEMPLO (18/09/2026).
 *
 * O componente de referência chegava com seis pacotes (Radix Popover, Tabs,
 * Slot e Label, class-variance-authority, lucide-react) e sete arquivos de UI.
 * O visual foi reproduzido; as dependências não, por quatro motivos:
 *
 *   1. O projeto decidiu não usar shadcn (ver `Dialogo`: o `<dialog>` nativo
 *      já dá foco preso e Esc), e a seção 12 do CLAUDE.md pede justificativa
 *      para toda biblioteca nova. Seis pacotes para um painel que já existia
 *      não passam nessa régua.
 *   2. O `Button` do shadcn seria um SEGUNDO sistema de botões ao lado do
 *      `Botao` — e o tamanho de ícone dele tem 40px, abaixo do piso de 44 da
 *      seção 6.
 *   3. As classes de animação do exemplo (`animate-in`, `zoom-in-95`) exigem
 *      um plugin do Tailwind que não está instalado: elas não dariam erro,
 *      só não fariam nada. A animação aqui é do `motion`, que já está no
 *      projeto.
 *   4. Os tokens do exemplo (`bg-popover`, `bg-primary`, `bg-accent`) não são
 *      os da casa, e no tema escuro sairiam das cores que o resto da tela usa.
 *
 * Os dados de demonstração do exemplo também ficaram de fora: a lista é a
 * derivada de verdade (`lib/derivar.ts`).
 */
