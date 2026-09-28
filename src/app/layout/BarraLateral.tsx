import { NavLink } from 'react-router'
import clsx from 'clsx'
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
 * ELA É SEMPRE ESTREITA, e abre sozinha quando o ponteiro chega ou o foco
 * entra. Houve um botão de "manter aberta" entre as duas primeiras versões, e
 * o gestor o tirou depois de usar: "totalmente inútil". Ele estava certo — com
 * a barra abrindo no caminho do mouse, fixá-la só trocava 3.5rem de largura
 * permanente por nomes que já apareciam quando se precisava deles. Se um dia
 * alguém pedir a barra travada aberta, o caminho é uma preferência de aparelho
 * como o modo TV, e não um botão dentro dela.
 *
 * E ABRE POR CIMA, sem empurrar o conteúdo: a largura reservada é sempre a
 * estreita, e quem cresce é o painel flutuante. Empurrar recalcularia o layout
 * do Quadro inteiro a cada passagem de mouse — com as seções laterais, os
 * blocos por dia e o modo TV reagindo juntos.
 *
 * O ESQUELETO VEIO DO COMPONENTE QUE O GESTOR MANDOU (28/09/2026) — barra com
 * seções rotuladas e itens com ícone —, mas FEITO COM AS PEÇAS DA CASA, como o
 * sino em 18/09. O exemplo trazia cinco pacotes novos (framer-motion,
 * @base-ui/react, tailwind-merge, @tabler/icons-react, clsx) e a seção 12 do
 * CLAUDE.md pede justificativa para cada um: `clsx` já está aqui, o `motion` do
 * projeto é o mesmo framer-motion, os ícones são nossos, e `twMerge` resolve um
 * problema que não temos (ninguém passa `className` de fora para cá). A pílula
 * ativa DESLIZANTE do exemplo (`layoutId`) ficou de fora por um motivo medido:
 * o projeto carrega `domAnimation`, e animação de layout exige trocar para
 * `domMax` — uns 10kB em todo carregamento, no 4G do corredor, por um deslize
 * que ninguém pediu.
 *
 * QUEM A VÊ é quem tem mais de um destino (ver `destinosDe`). Para a fotógrafa
 * dentro do Quadro não existe barra nenhuma: ali não há para onde ir, e a
 * regra da seção 13 vale igual na vertical — espaço permanente para um item só
 * é moldura vazia.
 */
export function BarraLateral({ destinos }: { destinos: Destino[] }) {
  const grupos = agruparDestinos(destinos)
  // Com um grupo só (quem tem apenas o Quadro), o título "Operação" sozinho em
  // cima de um item diz menos que o próprio item.
  const comRotulos = grupos.length > 1

  return (
    // A largura RESERVADA é sempre a estreita — o painel de dentro é que cresce
    // por cima do conteúdo.
    <aside data-slot="barra-lateral" className="relative hidden w-14 flex-shrink-0 md:block">
      <div
        className={clsx(
          'superficie-barra group absolute inset-y-0 left-0 z-20 flex flex-col overflow-hidden border-r border-white/10',
          // `transition-[width]` e não `transition-all`: a barra inteira
          // transicionando faria a cor do item ativo atravessar junto.
          'transition-[width] duration-200 ease-out motion-reduce:transition-none',
          'w-14 hover:w-52 hover:shadow-2xl focus-within:w-52 focus-within:shadow-2xl',
        )}
      >
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
                // Guardar o espaço do rótulo na barra estreita evitava um salto
                // e criava um defeito pior: buracos de 24px entre ícones que,
                // sem texto nenhum, não explicam o que separam. Animada junto, a
                // lista cresce com a barra e não pula — e fechada os ícones
                // ficam numa coluna contínua.
                // O RESPIRO DOS DOIS LADOS DO RÓTULO (28/09/2026, em duas
                // voltas do gestor: "tá muito colado" e, depois, "preciso que a
                // PÍLULA dê uma afastada dos títulos"). O `pb-3` separa o
                // título do item que vem abaixo dele; o que sobra da altura cai
                // acima, pelo `items-end`, e separa o título do grupo anterior.
                //
                // TUDO ISSO MORA NA ALTURA DESTA CAIXA, que é 0 com a barra
                // fechada — e não em margens dos itens. O `pb` também só existe
                // aberto: `height: 0` NÃO engole o padding (o border-box o
                // conta por fora do zero), e cada grupo estufaria a coluna de
                // ícones em 12px sem nada para mostrar. Assim o respiro aparece
                // junto com os nomes, e a coluna de ícones não estufa por causa
                // de um texto que ninguém está vendo.
                <div className="flex h-0 items-end overflow-hidden px-3 pb-0 transition-[height,padding] duration-200 group-focus-within:h-11 group-focus-within:pb-3 group-hover:h-11 group-hover:pb-3 motion-reduce:transition-none">
                  <RotuloQueSome className="rotulo-sobrescrito text-white/45">
                    {ROTULO_DO_GRUPO[grupo]}
                  </RotuloQueSome>
                </div>
              )}

              <div className="flex flex-col gap-0.5">
                {doGrupo.map((destino) => (
                  <ItemDaBarra key={destino.para} destino={destino} />
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
 * parar numa TV. Fechada, a pílula vira um botão arredondado de 40x36 com o
 * ícone dentro, e continua respondendo "você está aqui" sem nenhum texto.
 *
 * 36px DE ALTURA, e não os 44 do primeiro desenho ("as pílulas estão muuuito
 * gordas", 28/09/2026). O piso de 44px da seção 6 é do DEDO no corredor, e
 * esta barra só existe no computador — a mesma distinção que a faixa da
 * navegação já fazia. Com texto de 14px, 44 deixava um vão vazio em cima e
 * embaixo que engordava a pílula sem acrescentar alvo aproveitável.
 */
function ItemDaBarra({ destino }: { destino: Destino }) {
  const { Icone } = destino

  return (
    <NavLink
      to={destino.para}
      end={destino.fim ?? false}
      title={destino.descricao}
      className={({ isActive }) =>
        clsx(
          // px-2.5 com ícone de 20px dá exatamente os 40px da barra fechada: é
          // o que mantém o ícone centrado nos dois estados.
          'flex min-h-9 items-center gap-3 rounded-full px-2.5 transition-colors',
          isActive
            ? 'bg-white text-marca-forte shadow-sm'
            : 'text-white/65 hover:bg-white/10 hover:text-white',
        )
      }
    >
      <Icone className="size-5 flex-shrink-0" />
      <RotuloQueSome className="truncate text-sm font-bold tracking-tight">
        {destino.rotulo}
      </RotuloQueSome>
    </NavLink>
  )
}

/**
 * O texto que existe com a barra fechada e não se vê.
 *
 * NÃO SAI DO DOM (`opacity`, não `display`): ele é o nome acessível do link, e
 * trocá-lo por `aria-label` daria dois lugares para escrever a mesma palavra —
 * o segundo envelhece calado. `group-hover`/`group-focus-within` trazem o texto
 * junto com a largura, sem cada item precisar saber se o mouse está na barra.
 */
function RotuloQueSome({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <span
      className={clsx(
        className,
        'whitespace-nowrap opacity-0 transition-opacity duration-200',
        'group-focus-within:opacity-100 group-hover:opacity-100 motion-reduce:transition-none',
      )}
    >
      {children}
    </span>
  )
}
