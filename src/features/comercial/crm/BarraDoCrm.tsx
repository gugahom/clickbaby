import { NavLink, useNavigate } from 'react-router'
import clsx from 'clsx'
import { Avatar } from '@/components/ui/Avatar'
import { Dropdown } from '@/components/ui/Dropdown'
import { Logo } from '@/components/ui/Logo'
import {
  Chevron,
  IconeCaneta,
  IconeExpandir,
  IconeRecolher,
  IconeSair,
  IconeX,
} from '@/components/ui/icones'
import { useAuth } from '@/features/auth/contexto'
import { useTelas } from '@/features/auth/telas'
import { ROTULO_PAPEL } from '@/features/equipe/lib/apresentacao'
import { useUrlDaFoto } from '@/features/perfil/api/useFotoDePerfil'
import { destinosDe, temPaginaPropriaDoComercial } from '@/app/layout/destinos'
import { GRUPOS_DO_CRM, caminhoDaPagina, type PaginaDoCrm } from './navegacao'

/**
 * A BARRA DO CRM (18/11/2026). É a do sistema em espírito — o índigo da marca
 * descendo pela esquerda —, mas com o vocabulário de um CRM: as páginas em
 * grupos, a contagem do que pede gesto ao lado do nome, "em breve" no que
 * ainda não chegou, e a conta embaixo.
 *
 * DUAS FORMAS. No computador ela é um TRILHO que recolhe (15rem ↔ 4.25rem, a
 * escolha fica no aparelho). No celular ela é uma GAVETA que o botão do
 * cabeçalho abre — barra lateral fixa não cabe na largura de um celular.
 *
 * A MARCA É UM ATALHO só para quem tem outras áreas (a gestão): ela abre a
 * lista do resto do sistema. Para quem vende, o CRM é o sistema inteiro
 * (`temPaginaPropriaDoComercial`), e a marca é só a marca.
 */
export function BarraDoCrm({
  modo,
  recolhida,
  onAlternar,
  onFechar,
  contagens,
}: {
  modo: 'trilho' | 'gaveta'
  recolhida: boolean
  onAlternar: () => void
  onFechar: () => void
  /** O número ao lado de cada página, por id. */
  contagens: Record<string, number>
}) {
  const estreita = modo === 'trilho' && recolhida

  return (
    <div className="flex h-full flex-col text-white">
      <Marca estreita={estreita} modo={modo} onFechar={onFechar} />

      <nav
        aria-label="Páginas do CRM"
        className={clsx('min-h-0 flex-1 overflow-y-auto pt-3 pb-4', estreita ? 'px-2.5' : 'px-3')}
      >
        {GRUPOS_DO_CRM.map((grupo, i) => (
          <div key={grupo.rotulo ?? i} className={clsx(i > 0 && 'mt-5')}>
            {grupo.rotulo &&
              (estreita ? (
                <div aria-hidden="true" className="mx-auto mb-2 h-px w-6 bg-white/15" />
              ) : (
                <h2 className="rotulo-sobrescrito mb-1.5 px-2.5 text-white/40">{grupo.rotulo}</h2>
              ))}
            <ul className="flex flex-col gap-0.5">
              {grupo.paginas.map((p) => (
                <li key={p.id}>
                  <ItemDaBarra
                    pagina={p}
                    estreita={estreita}
                    toque={modo === 'gaveta'}
                    contagem={contagens[p.id]}
                    onNavegar={onFechar}
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <Conta estreita={estreita} modo={modo} onAlternar={onAlternar} />
    </div>
  )
}

function ItemDaBarra({
  pagina,
  estreita,
  toque,
  contagem,
  onNavegar,
}: {
  pagina: PaginaDoCrm
  estreita: boolean
  /** Na gaveta do celular o alvo é de dedo: 44px, a regra da seção 6. */
  toque: boolean
  contagem: number | undefined
  onNavegar: () => void
}) {
  const { Icone } = pagina
  const emBreve = Boolean(pagina.emBreve)

  return (
    <NavLink
      to={caminhoDaPagina(pagina)}
      end={pagina.id === ''}
      onClick={onNavegar}
      title={estreita ? `${pagina.rotulo}${emBreve ? ' (em breve)' : ''}` : undefined}
      className={({ isActive }) =>
        clsx(
          'group relative flex items-center gap-2.5 rounded-lg text-sm transition-colors duration-150',
          toque ? 'h-11' : 'h-9',
          'outline-none focus-visible:ring-2 focus-visible:ring-white/60',
          estreita ? 'justify-center' : 'px-2.5',
          isActive
            ? 'bg-white/12 font-semibold text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.08)]'
            : emBreve
              ? 'text-white/50 hover:bg-white/6 hover:text-white/80'
              : 'text-white/75 hover:bg-white/6 hover:text-white',
        )
      }
    >
      {({ isActive }) => (
        <>
          {/* A marca da página aberta: o rosa da marca, encostado na borda. */}
          {isActive && (
            <span
              aria-hidden="true"
              className={clsx(
                'absolute top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-acento',
                estreita ? '-left-2.5' : '-left-3',
              )}
            />
          )}
          <Icone className="size-[18px] flex-shrink-0" />
          {estreita ? (
            <>
              <span className="sr-only">{pagina.rotulo}</span>
              {!emBreve && (contagem ?? 0) > 0 && (
                <span aria-hidden="true" className="absolute top-1.5 right-2 size-1.5 rounded-full bg-acento" />
              )}
            </>
          ) : (
            <>
              <span className="min-w-0 flex-1 truncate">{pagina.rotulo}</span>
              {emBreve ? (
                <span className="flex-shrink-0 rounded-md border border-white/15 px-1 py-px text-[9px] font-semibold tracking-[0.04em] text-white/45 uppercase">
                  Em breve
                </span>
              ) : (
                (contagem ?? 0) > 0 && (
                  <span
                    className={clsx(
                      'min-w-6 rounded-md px-1.5 py-px text-center text-[11px] font-bold tabular-nums',
                      isActive ? 'bg-white/20 text-white' : 'bg-white/10 text-white/75',
                    )}
                  >
                    {contagem}
                  </span>
                )
              )}
            </>
          )}
        </>
      )}
    </NavLink>
  )
}

/**
 * A MARCA no alto. Larga: a logo e o selo CRM. Estreita: um monograma, porque
 * a palavra inteira não cabe em 4rem e cortada vira mancha.
 */
function Marca({ estreita, modo, onFechar }: { estreita: boolean; modo: 'trilho' | 'gaveta'; onFechar: () => void }) {
  const { pessoa } = useAuth()
  const telas = useTelas()
  const navegar = useNavigate()
  const outras = temPaginaPropriaDoComercial(telas, pessoa?.papelSistema)
    ? []
    : destinosDe(telas, pessoa?.papelSistema).filter((d) => d.para !== '/comercial')

  const desenho = (
    <span className={clsx('flex min-w-0 items-center gap-2', estreita && 'justify-center')}>
      {estreita ? (
        <span className="grid size-9 place-items-center rounded-xl bg-white/12 text-sm font-extrabold tracking-tight ring-1 ring-white/15">
          cb
        </span>
      ) : (
        <>
          <Logo variante="clara" className="h-6 max-w-[8.5rem]" />
          <span className="rounded-md bg-acento px-1.5 py-0.5 text-[10px] font-extrabold tracking-[0.12em] text-white">
            CRM
          </span>
        </>
      )}
    </span>
  )

  return (
    <div
      className={clsx(
        'flex h-14 flex-shrink-0 items-center gap-2 border-b border-white/10',
        estreita ? 'justify-center px-2' : 'px-4',
      )}
    >
      {outras.length > 0 ? (
        <Dropdown
          rotulo="Ir para outra área do sistema"
          itens={outras.map((d) => ({ id: d.para, rotulo: d.rotulo }))}
          onEscolher={(item) => void navegar(item.id)}
          gatilho={
            <span className="flex min-w-0 items-center gap-1.5 rounded-lg py-1 pr-1 transition-colors hover:bg-white/8">
              {desenho}
              {!estreita && <Chevron className="size-4 flex-shrink-0 text-white/50" />}
            </span>
          }
        />
      ) : (
        desenho
      )}
      {modo === 'gaveta' && (
        <button
          type="button"
          onClick={onFechar}
          aria-label="Fechar o menu"
          className="ml-auto grid size-11 place-items-center rounded-lg text-white/70 transition-colors outline-none hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/60"
        >
          <IconeX className="size-5" />
        </button>
      )}
    </div>
  )
}

/** Quem está logado, o menu da conta e o botão de recolher. */
function Conta({ estreita, modo, onAlternar }: { estreita: boolean; modo: 'trilho' | 'gaveta'; onAlternar: () => void }) {
  const { pessoa, sair } = useAuth()
  const navegar = useNavigate()
  const { data: foto } = useUrlDaFoto(pessoa?.fotoPath)
  if (!pessoa) return null

  const recolher =
    modo === 'trilho' ? (
      <button
        type="button"
        onClick={onAlternar}
        aria-label={estreita ? 'Abrir a barra lateral' : 'Recolher a barra lateral'}
        aria-expanded={!estreita}
        title={estreita ? 'Abrir a barra' : 'Recolher a barra'}
        className="grid size-9 flex-shrink-0 place-items-center rounded-lg text-white/55 transition-colors outline-none hover:bg-white/8 hover:text-white focus-visible:ring-2 focus-visible:ring-white/60"
      >
        {estreita ? <IconeExpandir className="size-[18px]" /> : <IconeRecolher className="size-[18px]" />}
      </button>
    ) : null

  return (
    <div
      className={clsx(
        'flex flex-shrink-0 gap-1 border-t border-white/10 p-2.5',
        estreita ? 'flex-col items-center' : 'items-center',
      )}
    >
      <Dropdown
        rotulo={`Conta de ${pessoa.nome}`}
        alinhamento="esquerda"
        onEscolher={(item) => {
          if (item.id === 'perfil') void navegar('/perfil')
          if (item.id === 'sair') void sair()
        }}
        itens={[
          { id: 'perfil', rotulo: 'Editar perfil', icone: <IconeCaneta className="size-4" /> },
          { id: 'sair', rotulo: 'Sair da conta', icone: <IconeSair className="size-4" />, destrutivo: true },
        ]}
        className={estreita ? '' : 'min-w-0 flex-1'}
        gatilho={
          <span className="flex min-w-0 items-center gap-2.5 rounded-lg p-1.5 text-left transition-colors hover:bg-white/8">
            <Avatar nome={pessoa.nome} fotoUrl={foto ?? null} />
            {!estreita && (
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate text-[13px] font-semibold">{pessoa.nome}</span>
                <span className="block truncate text-[11px] text-white/55">
                  {ROTULO_PAPEL[pessoa.papelSistema] ?? pessoa.papelSistema}
                </span>
              </span>
            )}
          </span>
        }
      />
      {recolher}
    </div>
  )
}
