import { NavLink } from 'react-router'
import clsx from 'clsx'
import { Chevron } from '@/components/ui/icones'
import { useBarraFixa } from './useBarraFixa'
import type { Destino } from './destinos'

/**
 * A NAVEGAÇÃO DO COMPUTADOR (28/09/2026, pedido do gestor: "uma sidebar que
 * pode ficar escondida com ícones e os nomes das telas").
 *
 * POR QUE SAIU DA FAIXA HORIZONTAL. Ela funcionava com três itens e para de
 * funcionar com seis: a área comercial, os relatórios e o calendário próprio
 * estão na fila, e uma fileira de seis palavras no alto compete com o
 * cabeçalho, que já tem marca, presença, sino e conta. A barra cresce para
 * baixo, que é a direção em que sobra espaço.
 *
 * RECOLHIDA POR PADRÃO, e isto é o que torna a troca barata: o Quadro é a tela
 * mais apertada do sistema, e aberta a barra custaria 13rem da largura que a
 * coluna lateral e o modo TV já disputaram uma vez. Recolhida ela custa 3.5rem
 * — menos que a faixa horizontal custava em altura — e ABRE SOZINHA quando o
 * ponteiro chega ou o foco entra.
 *
 * E ABRE POR CIMA, sem empurrar o conteúdo: a largura reservada é sempre a da
 * barra recolhida, e quem cresce é o painel flutuante. Empurrar recalcularia o
 * layout do Quadro inteiro a cada passagem de mouse — com as seções laterais,
 * os blocos por dia e o modo TV reagindo juntos.
 *
 * QUEM A VÊ é quem tem mais de um destino (ver `destinosDe`). Para a fotógrafa
 * dentro do Quadro não existe barra nenhuma: ali não há para onde ir, e a
 * regra da seção 13 vale igual na vertical — espaço permanente para um item só
 * é moldura vazia.
 */
export function BarraLateral({ destinos }: { destinos: Destino[] }) {
  const [fixa, alternar] = useBarraFixa()

  return (
    // A largura RESERVADA. Fixa, ela é a da barra; recolhida, é sempre a
    // estreita — o painel de dentro é que cresce por cima do conteúdo.
    <aside className={clsx('relative hidden flex-shrink-0 md:block', fixa ? 'w-52' : 'w-14')}>
      <div
        className={clsx(
          'superficie-barra group absolute inset-y-0 left-0 z-20 flex flex-col overflow-hidden border-r border-white/10 p-2',
          // `transition-[width]` e não `transition-all`: a barra inteira
          // transicionando faria a cor do item ativo atravessar junto.
          'transition-[width] duration-200 ease-out motion-reduce:transition-none',
          fixa
            ? 'w-52'
            : 'w-14 hover:w-52 hover:shadow-2xl focus-within:w-52 focus-within:shadow-2xl',
        )}
      >
        <nav aria-label="Navegação" className="flex flex-col gap-1">
          {destinos.map((destino) => (
            <ItemDaBarra key={destino.para} destino={destino} aberta={fixa} />
          ))}
        </nav>

        {/*
          O CONTROLE DA PRÓPRIA BARRA fica embaixo, separado por uma linha: ele
          não é destino, e no meio dos outros seria lido como mais uma tela.

          Ele aparece só quando a barra está aberta — fixa, ou aberta pelo
          ponteiro. Recolhida, um quarto ícone no rodapé pediria para ser
          decifrado antes de qualquer destino, e é o único que não leva a lugar
          nenhum.
        */}
        <div className="mt-auto border-t border-white/10 pt-2">
          <button
            type="button"
            onClick={alternar}
            aria-pressed={fixa}
            className={clsx(
              'flex min-h-10 w-full items-center gap-3 rounded-full px-2.5 text-left text-white/55',
              'transition-opacity duration-200 hover:bg-white/10 hover:text-white motion-reduce:transition-none',
              fixa ? 'opacity-100' : 'opacity-0 group-focus-within:opacity-100 group-hover:opacity-100',
            )}
          >
            <Chevron
              className={clsx(
                'size-5 flex-shrink-0 transition-transform duration-200 motion-reduce:transition-none',
                fixa ? 'rotate-90' : '-rotate-90',
              )}
            />
            <span className="truncate text-sm font-semibold whitespace-nowrap">
              {fixa ? 'Recolher' : 'Manter aberta'}
            </span>
          </button>
        </div>
      </div>
    </aside>
  )
}

/**
 * ATIVA É PÍLULA BRANCA CHEIA, como era na faixa — o contraste entre a atual e
 * as outras precisa ser de MATERIAL e não de tom, porque esta barra também vai
 * parar numa TV. Recolhida, a pílula vira um quadrado arredondado de 40px com
 * o ícone dentro, e continua respondendo "você está aqui" sem nenhum texto.
 *
 * O RÓTULO NÃO SE APAGA DO DOM, só da vista (`opacity`): ele é o nome
 * acessível do link, e trocá-lo por `aria-label` daria dois lugares para
 * escrever a mesma palavra.
 */
function ItemDaBarra({ destino, aberta }: { destino: Destino; aberta: boolean }) {
  const { Icone } = destino

  return (
    <NavLink
      to={destino.para}
      end={destino.fim ?? false}
      title={destino.descricao}
      className={({ isActive }) =>
        clsx(
          // px-2.5 com ícone de 20px dá exatamente os 40px da barra recolhida:
          // é o que mantém o ícone centrado nos dois estados.
          'flex min-h-11 items-center gap-3 rounded-full px-2.5 transition-colors',
          isActive
            ? 'bg-white text-marca-forte shadow-sm'
            : 'text-white/65 hover:bg-white/10 hover:text-white',
        )
      }
    >
      <Icone className="size-5 flex-shrink-0" />
      <span
        className={clsx(
          'truncate text-sm font-bold tracking-tight whitespace-nowrap',
          'transition-opacity duration-200 motion-reduce:transition-none',
          aberta ? 'opacity-100' : 'opacity-0 group-focus-within:opacity-100 group-hover:opacity-100',
        )}
      >
        {destino.rotulo}
      </span>
    </NavLink>
  )
}
