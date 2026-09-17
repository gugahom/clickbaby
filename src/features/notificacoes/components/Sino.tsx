import { useEffect, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import clsx from 'clsx'
import { IconeSino } from '@/components/ui/icones'
import { useAuth } from '@/features/auth/contexto'
import { useQuadro } from '@/features/quadro/api/useQuadro'
import { useRelogioDeMinuto } from '@/lib/useRelogio'
import { useMarcarVistas, useVistoEm } from '../api/useNotificacoesVistas'
import {
  derivarNotificacoes,
  temNovidade,
  type Notificacao,
  type TipoNotificacao,
} from '../lib/derivar'

/**
 * Quantas notificações a lista mostra antes de dizer "e mais N".
 *
 * Trinta não é um teto de desempenho — é de leitura. Uma lista que rola sem
 * fim responde "quanto está pegando fogo", que é uma pergunta de painel, não
 * de sino. O que passa disso o Quadro mostra melhor.
 */
const TETO = 30

/**
 * A COR DE CADA TIPO, reusando os tokens que já significam essas coisas na
 * tela. Vermelho é "precisa de alguém agora" (a decisão de 15/09 sobre o que o
 * vermelho quer dizer neste sistema), âmbar é espera, neutro é informação.
 */
const COR: Record<TipoNotificacao, string> = {
  atribuida: 'bg-atrasado',
  horario: 'bg-atrasado',
  alteracao_minha: 'bg-atrasado',
  prazo: 'bg-atrasado',
  aviso: 'bg-atencao',
  alteracao: 'bg-atencao',
  rendicao: 'bg-logo-azul',
  parada: 'bg-atencao',
  entrega: 'bg-pronto',
  rascunho: 'bg-rascunho-cheio',
}

/**
 * O SINO DO CABEÇALHO (17/09/2026, pedido do gestor).
 *
 * "Ao lado das funcionárias quero um ícone de sino que funcione como
 * notificador (…) é colocado uma bolinha no momento que o usuário precisa dar
 * atenção para algo (…) quero a bolinha junto e talvez um pulse."
 *
 * A LISTA É DERIVADA e não mora em tabela nenhuma — ver `lib/derivar.ts`, que
 * é onde a decisão está escrita. Aqui ficam só as três regras de tela:
 *
 *   1. A BOLINHA PULSA SÓ PELAS MINHAS. Atribuição, rendição e alteração em
 *      trabalho meu acendem o vermelho com a onda; o resto entra no contador
 *      sem gritar. Um sino que pulsa por qualquer urgência da operação inteira
 *      pulsa o dia todo, e alerta que toca sempre é alerta que ninguém olha.
 *   2. ABRIR APAGA O PULSO, NÃO A LISTA. O item continua ali até o trabalho
 *      ser resolvido — foi a escolha do gestor, e é o que separa "já vi" de
 *      "já fiz".
 *   3. CLICAR LEVA AO CASO. Sem isso o sino informa e não resolve: quem lê
 *      "atribuída a você" teria que ir procurar o card no Quadro.
 *
 * ELE EXISTE NO MOBILE, ao contrário da fileira de presença. A razão é a
 * mesma que tira a presença de lá: quem está no corredor com uma mão no
 * aparelho não escolhe a quem passar trabalho — mas é justamente ela que
 * precisa saber que uma etapa foi atribuída ao seu nome.
 *
 * DE ONDE VÊM OS DADOS: `useQuadro`, a MESMA consulta do Quadro. No Quadro ela
 * já está em cache, então o sino não custa requisição nenhuma; nas outras
 * telas ele carrega o Quadro uma vez e reaproveita o mesmo realtime e o mesmo
 * refetch de dois minutos.
 */
export function Sino() {
  const { pessoa } = useAuth()
  const { data } = useQuadro()
  const { data: vistoEm } = useVistoEm()
  const marcar = useMarcarVistas()
  const navegar = useNavigate()
  const agora = useRelogioDeMinuto()

  const [aberto, setAberto] = useState(false)
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
    papel: pessoa?.papelSistema ?? 'operador',
    agora,
  })

  const novidade = temNovidade(lista, vistoEm ?? null)
  const minhas = lista.filter((n) => n.familia === 'minha').length

  function alternar() {
    const indo = !aberto
    setAberto(indo)
    // Marca ao ABRIR, e só quando há o que marcar: uma RPC por clique num sino
    // vazio seria escrita à toa a cada curiosidade.
    if (indo && novidade) marcar.mutate()
  }

  function irAoCaso(n: Notificacao) {
    setAberto(false)
    // O Quadro lê `?caso=` e abre o card, seja em que aba ele estiver — ver
    // QuadroPage. Query e não rota própria: o caso não tem tela, ele tem um
    // lugar DENTRO do Quadro.
    void navegar(`/?caso=${n.casoId}`)
  }

  return (
    <div ref={caixa} className="relative flex-shrink-0">
      <button
        type="button"
        onClick={alternar}
        aria-expanded={aberto}
        aria-controls={idPainel}
        aria-haspopup="dialog"
        aria-label={
          lista.length === 0
            ? 'Notificações: nada pedindo atenção'
            : `Notificações: ${lista.length}${minhas > 0 ? `, ${minhas} para você` : ''}`
        }
        className="relative inline-flex size-11 cursor-pointer items-center justify-center rounded-full text-white transition-colors hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none"
      >
        <IconeSino className="size-5" />

        {lista.length > 0 && (
          <span
            className={clsx(
              'absolute top-1 right-1 inline-flex min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold tabular-nums',
              // O PULSO É DO CHAMADO, e a classe é a mesma da pílula de quem
              // foi atribuída e do aviso do card (`.pulso-chamado`, index.css):
              // as três dizem "precisa de alguém agora" e não podem ter três
              // linguagens diferentes.
              novidade
                ? 'pulso-chamado bg-atrasado text-white'
                : 'bg-white/25 text-white',
            )}
          >
            {lista.length}
          </span>
        )}
      </button>

      {aberto && (
        <div
          id={idPainel}
          role="dialog"
          aria-label="Notificações"
          className="absolute top-full right-0 z-40 mt-2 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-cartao border border-border bg-card text-foreground shadow-cartao-alto"
        >
          <div className="flex items-center justify-between gap-2 border-b border-border bg-acento-suave px-3 py-2">
            <span className="rotulo-sobrescrito text-acento-forte">Notificações</span>
            {minhas > 0 && (
              <span className="rounded-full bg-atrasado px-2 py-0.5 text-[11px] font-bold text-white">
                {minhas} para você
              </span>
            )}
          </div>

          {lista.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              Nada pedindo atenção agora.
            </p>
          ) : (
            <ul className="max-h-[70vh] divide-y divide-border overflow-y-auto">
              {lista.slice(0, TETO).map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => irAoCaso(n)}
                    className="flex w-full cursor-pointer items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-muted/60"
                  >
                    {/* A cor é a única coisa que distingue os tipos de longe.
                        Um ícone por tipo seria dez desenhos para uma lista que
                        se lê em dois segundos. */}
                    <span
                      className={clsx('mt-1.5 size-2 flex-shrink-0 rounded-full', COR[n.tipo])}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{n.titulo}</span>
                      <span className="block truncate text-xs font-medium text-foreground/80">
                        {n.casoNome}
                      </span>
                      {/* O detalhe TRUNCA: o aviso pode ser um parágrafo, e
                          quem quer o texto inteiro abre o card — que é para
                          onde o clique leva. */}
                      <span className="block truncate text-xs text-muted-foreground">
                        {n.detalhe}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {lista.length > TETO && (
            <p className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
              E mais {lista.length - TETO} no Quadro.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
