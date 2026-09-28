import { NavLink } from 'react-router'
import clsx from 'clsx'
import { IconeExpandirBarra, IconeRecolherBarra } from '@/components/ui/icones'
import { useBarraFixa } from './useBarraFixa'
import { agruparDestinos, ROTULO_DO_GRUPO, type Destino } from './destinos'

/**
 * A NAVEGAÇÃO DO COMPUTADOR (28/09/2026, pedido do gestor: "uma sidebar que
 * pode ficar escondida com ícones e os nomes das telas").
 *
 * POR QUE SAIU DA FAIXA HORIZONTAL. Ela funcionava com três itens e para de
 * funcionar com seis: a área comercial e o calendário próprio estão na fila —
 * Relatórios já entrou —, e uma fileira de seis palavras no alto compete com o
 * cabeçalho, que já tem marca, presença, sino e conta. A barra cresce para
 * baixo, que é a direção em que sobra espaço.
 *
 * RECOLHIDA POR PADRÃO, e é isto que torna a troca barata: o Quadro é a tela
 * mais apertada do sistema, e aberta a barra custaria 13rem da largura que a
 * coluna lateral e o modo TV já disputaram uma vez. Recolhida ela custa 3.5rem
 * — menos do que a faixa horizontal custava em altura — e ABRE SOZINHA quando
 * o ponteiro chega ou o foco entra.
 *
 * E ABRE POR CIMA, sem empurrar o conteúdo: a largura reservada é sempre a da
 * barra recolhida, e quem cresce é o painel flutuante. Empurrar recalcularia o
 * layout do Quadro inteiro a cada passagem de mouse — com as seções laterais,
 * os blocos por dia e o modo TV reagindo juntos.
 *
 * O ESQUELETO VEIO DO COMPONENTE QUE O GESTOR MANDOU (28/09/2026) — barra com
 * cabeçalho, seções rotuladas, itens com ícone, interruptor de recolher —, mas
 * FEITO COM AS PEÇAS DA CASA, como o sino em 18/09. O exemplo trazia cinco
 * pacotes novos (framer-motion, @base-ui/react, tailwind-merge,
 * @tabler/icons-react, clsx) e a seção 12 do CLAUDE.md pede justificativa para
 * cada um: `clsx` já está aqui, o `motion` do projeto é o mesmo framer-motion,
 * os ícones são nossos, e `twMerge` resolve um problema que não temos (ninguém
 * passa `className` de fora para cá). A pílula ativa DESLIZANTE do exemplo
 * (`layoutId`) ficou de fora por um motivo medido: o projeto carrega
 * `domAnimation`, e animação de layout exige trocar para `domMax` — uns 10kB
 * em todo carregamento, no 4G do corredor, por um deslize que ninguém pediu.
 *
 * QUEM A VÊ é quem tem mais de um destino (ver `destinosDe`). Para a fotógrafa
 * dentro do Quadro não existe barra nenhuma: ali não há para onde ir, e a
 * regra da seção 13 vale igual na vertical — espaço permanente para um item só
 * é moldura vazia.
 */
export function BarraLateral({ destinos }: { destinos: Destino[] }) {
  const [fixa, alternar] = useBarraFixa()
  const grupos = agruparDestinos(destinos)
  // Com um grupo só (quem tem apenas o Quadro), o título "Operação" sozinho em
  // cima de um item diz menos que o próprio item.
  const comRotulos = grupos.length > 1

  return (
    // A largura RESERVADA. Fixa, ela é a da barra; recolhida, é sempre a
    // estreita — o painel de dentro é que cresce por cima do conteúdo.
    <aside
      data-slot="barra-lateral"
      className={clsx('relative hidden flex-shrink-0 md:block', fixa ? 'w-52' : 'w-14')}
    >
      <div
        data-recolhida={fixa ? 'false' : 'true'}
        className={clsx(
          'superficie-barra group absolute inset-y-0 left-0 z-20 flex flex-col overflow-hidden border-r border-white/10',
          // `transition-[width]` e não `transition-all`: a barra inteira
          // transicionando faria a cor do item ativo atravessar junto.
          'transition-[width] duration-200 ease-out motion-reduce:transition-none',
          fixa
            ? 'w-52'
            : 'w-14 hover:w-52 hover:shadow-2xl focus-within:w-52 focus-within:shadow-2xl',
        )}
      >
        {/*
          O INTERRUPTOR FICA NO TOPO, como no componente que o gestor mandou, e
          fica VISÍVEL SEMPRE — inclusive recolhido, onde vira o ícone de
          abrir. Ele é a única porta para fixar a barra; escondê-lo até o mouse
          passar tornaria a função invisível para quem não descobre por acaso.
        */}
        <div className="border-b border-white/10 p-2">
          <button
            type="button"
            onClick={alternar}
            aria-pressed={fixa}
            aria-label={fixa ? 'Recolher a barra' : 'Manter a barra aberta'}
            className="flex min-h-10 w-full items-center gap-3 rounded-full px-2.5 text-left text-white/55 transition-colors hover:bg-white/10 hover:text-white"
          >
            {fixa ? (
              <IconeRecolherBarra className="size-5 flex-shrink-0" />
            ) : (
              <IconeExpandirBarra className="size-5 flex-shrink-0" />
            )}
            <RotuloQueSome aberta={fixa} className="truncate text-sm font-semibold">
              {fixa ? 'Recolher' : 'Manter aberta'}
            </RotuloQueSome>
          </button>
        </div>

        {/* `overflow-y-auto`: hoje são quatro itens e cabem, mas a área
            comercial e o calendário estão na fila, e uma barra que corta o
            último destino numa tela baixa é pior que uma que rola. */}
        <nav
          aria-label="Navegação"
          className="flex min-h-0 flex-1 flex-col gap-1 overflow-x-hidden overflow-y-auto p-2"
        >
          {grupos.map(({ grupo, destinos: doGrupo }, indice) => (
            <div key={grupo} className={clsx(indice > 0 && 'mt-1 border-t border-white/10 pt-1')}>
              {comRotulos && (
                // A ALTURA ABRE JUNTO COM A LARGURA, em vez de ficar reservada.
                // Guardar o espaço do rótulo na barra recolhida evitava um
                // salto e criava um defeito pior: buracos de 24px entre ícones
                // que, sem texto nenhum, não explicam o que separam. Animada
                // junto, a lista cresce com a barra e não pula — e recolhida os
                // ícones ficam numa coluna contínua.
                <div
                  className={clsx(
                    'flex items-end overflow-hidden px-3 transition-[height] duration-200 motion-reduce:transition-none',
                    fixa ? 'h-6 pb-1' : 'h-0 group-focus-within:h-6 group-hover:h-6',
                  )}
                >
                  <RotuloQueSome
                    aberta={fixa}
                    className="rotulo-sobrescrito text-white/45"
                  >
                    {ROTULO_DO_GRUPO[grupo]}
                  </RotuloQueSome>
                </div>
              )}

              <div className="flex flex-col gap-1">
                {doGrupo.map((destino) => (
                  <ItemDaBarra key={destino.para} destino={destino} aberta={fixa} />
                ))}
              </div>
            </div>
          ))}
        </nav>
      </div>
    </aside>
  )
}

/**
 * ATIVA É PÍLULA BRANCA CHEIA, como era na faixa — o contraste entre a atual e
 * as outras precisa ser de MATERIAL e não de tom, porque esta barra também vai
 * parar numa TV. Recolhida, a pílula vira um quadrado arredondado de 40px com
 * o ícone dentro, e continua respondendo "você está aqui" sem nenhum texto.
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
      <RotuloQueSome aberta={aberta} className="truncate text-sm font-bold tracking-tight">
        {destino.rotulo}
      </RotuloQueSome>
    </NavLink>
  )
}

/**
 * O texto que existe recolhido e não se vê.
 *
 * NÃO SAI DO DOM (`opacity`, não `display`): ele é o nome acessível do link, e
 * trocá-lo por `aria-label` daria dois lugares para escrever a mesma palavra —
 * o segundo envelhece calado. `group-hover`/`group-focus-within` trazem o
 * texto junto com a largura, sem cada item precisar saber se o mouse está na
 * barra.
 */
function RotuloQueSome({
  aberta,
  className,
  children,
}: {
  aberta: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <span
      className={clsx(
        className,
        'whitespace-nowrap transition-opacity duration-200 motion-reduce:transition-none',
        aberta
          ? 'opacity-100'
          : 'opacity-0 group-focus-within:opacity-100 group-hover:opacity-100',
      )}
    >
      {children}
    </span>
  )
}
