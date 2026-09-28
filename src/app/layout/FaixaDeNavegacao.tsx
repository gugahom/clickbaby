import { NavLink } from 'react-router'
import clsx from 'clsx'
import type { Destino } from './destinos'

/**
 * A NAVEGAÇÃO DO CELULAR — a faixa que existia para todo mundo até 28/09/2026,
 * agora só abaixo de `md`.
 *
 * No computador ela deu lugar à barra lateral (ver `BarraLateral`), que cresce
 * para baixo em vez de para o lado. No celular a barra lateral não serve: uma
 * coluna fixa custaria largura onde ela é o recurso escasso, e abrir no hover
 * não existe no toque.
 *
 * ELA PRECISA CONTINUAR EXISTINDO, e não é detalhe: quem opera no celular só a
 * vê fora do Quadro — e é ela o caminho de volta da tela de Perfil. Prender
 * quem opera numa tela sem saída foi exatamente o defeito corrigido em
 * 03/09/2026; esconder a navegação do celular o recriaria.
 *
 * `bg-black/25` escurece o gradiente da marca em vez de pintar por cima: a
 * faixa continua sendo as cores da marca, rebaixadas, e é esse degrau de
 * luminosidade que faz a pílula branca da aba ativa saltar.
 */
export function FaixaDeNavegacao({ destinos }: { destinos: Destino[] }) {
  return (
    <nav
      aria-label="Navegação"
      className="flex gap-1 border-t border-white/10 bg-black/25 px-3 py-2 md:hidden"
    >
      {destinos.map((destino) => (
        <NavLink
          key={destino.para}
          to={destino.para}
          end={destino.fim ?? false}
          className={({ isActive }) =>
            clsx(
              // 40px de alvo dentro de uma faixa que soma 44 com o respiro
              // dela — a régua da seção 6 aplicada onde ela vale, que é o dedo
              // no corredor.
              'inline-flex min-h-10 items-center rounded-full px-4 text-[0.9375rem] font-bold tracking-tight transition-colors',
              isActive
                ? 'bg-white text-marca-forte shadow-sm'
                : 'text-white/65 hover:bg-white/10 hover:text-white',
            )
          }
        >
          {destino.rotulo}
        </NavLink>
      ))}
    </nav>
  )
}
