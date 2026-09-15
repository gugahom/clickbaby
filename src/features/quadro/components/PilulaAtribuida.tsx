import clsx from 'clsx'
import { iniciais } from '@/lib/iniciais'

/**
 * A ETAPA ATRIBUÍDA, EM VERMELHO (15/09/2026, pedido do gestor).
 *
 * Atribuída é trabalho que tem dono e ainda não começou. Na primeira versão do
 * destaque (mesmo dia) ela ganhou o círculo de iniciais na cor da marca, igual
 * à em andamento em azul — e o gestor voltou dizendo que era justamente a
 * atribuída que precisava de MAIS: a fotógrafa precisa bater o olho no Quadro e
 * achar o próprio nome no que está esperando por ela.
 *
 * O VERMELHO MUDOU DE SENTIDO, e isso foi decisão dele, com a troca explicada.
 * Até aqui vermelho era só alarme de tempo (horário chegando, prazo estourado),
 * e o destaque do dia 15 o tinha deixado de fora por isso. Agora vermelho é
 * "precisa de alguém agora" — o que também descreve trabalho parado esperando o
 * play. O que continua separando os dois é a FORMA: o alarme de tempo pinta o
 * cartão inteiro e gira o anel da borda; a atribuída é uma pílula dentro dele.
 *
 * O PULSO para no play: em andamento volta a ser o círculo azul, sem animação,
 * porque aí a pergunta "de quem é" já foi respondida por quem apertou.
 */
export function PilulaAtribuida({
  nome,
  exibido,
  proximo = null,
  aguardando = false,
  larguraMaxima,
}: {
  /** Nome completo: dá as iniciais e o `title`. */
  nome: string
  /** O que se lê — primeiro nome na fita, nome completo na lista do card. */
  exibido: string
  /** Rendição planejada, discreta depois do "›". */
  proximo?: string | null
  /** "aguardando início" por extenso — só onde há espaço, na lista do card. */
  aguardando?: boolean
  larguraMaxima?: string
}) {
  return (
    <span
      title={`${nome} — atribuída, aguardando início`}
      className="pulso-atribuida inline-flex max-w-full min-w-0 items-center gap-1 rounded-full bg-atrasado py-px pr-2 pl-px text-card"
    >
      {/* A letra usa a cor do CARD, como no círculo azul: no tema escuro o
          vermelho é claro, e branco fixo sobre ele não se lê. */}
      <span
        aria-hidden="true"
        className="inline-flex size-[18px] flex-shrink-0 items-center justify-center rounded-full bg-card/25 text-[9px] leading-none font-bold tracking-wide"
      >
        {iniciais(nome)}
      </span>
      <span className={clsx('truncate text-[13px] leading-5 font-extrabold', larguraMaxima)}>
        {exibido}
        {proximo && <span className="font-semibold opacity-80"> › {proximo}</span>}
      </span>
      {aguardando && (
        <span className="flex-shrink-0 text-[11px] font-semibold opacity-90">· aguardando início</span>
      )}
    </span>
  )
}
