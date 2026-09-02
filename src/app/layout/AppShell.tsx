import { NavLink, Outlet, useLocation } from 'react-router'
import clsx from 'clsx'
import type { ReactNode } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { Logo } from '@/components/ui/Logo'
import { Dropdown } from '@/components/ui/Dropdown'
import { Chevron, IconeMonitor, IconeSair } from '@/components/ui/icones'
import { ehAmbienteLocal } from '@/lib/supabase'
import { useAuth } from '@/features/auth/contexto'
import { useModoTv } from '@/features/quadro/lib/useModoTv'
import { useTelaLarga } from '@/features/quadro/lib/useTelaLarga'

const ROTULO_PAPEL: Record<string, string> = {
  operador: 'Operação',
  comercial: 'Comercial',
  coordenacao: 'Coordenação',
  atendimento: 'Atendimento',
  financeiro: 'Financeiro',
  gestao: 'Gestão',
}

/**
 * A faixa da marca — quarta versão, e a primeira que ancora a tela.
 *
 * O HISTÓRICO importa para não desfazer o que já foi aprendido. Era uma tira
 * cinza de 12px, lida como barra de planilha. Virou índigo cheia, para a tela
 * parecer aplicativo. Voltou a branca quando o CHÃO virou pastel — e porque a
 * logo é cinza sobre transparente, e sobre índigo sumia.
 *
 * Agora ela é escura de novo, e o problema da logo continua real: a solução é
 * a variante `clara`, que é a preta invertida (ver Logo.tsx). O que mudou para
 * a faixa escura voltar a fazer sentido é que ela deixou de ser um bloco de
 * cor chapada: é um gradiente das duas cores da marca, o azul da íris indo
 * para o rosa, ambos escurecidos. Ela não compete com o chão pastel — ela o
 * fecha por cima, como a moldura de um quadro.
 *
 * A NAVEGAÇÃO só aparece para a GESTÃO, a pedido. As telas administrativas
 * vivem ali, e por ora existe uma só — então a barra nasce com "Painel" e
 * nada mais. Um item único não é moldura vazia aqui: ele existe para que a
 * segunda tela tenha onde chegar, e para a gestão ver de imediato que este
 * lugar é dela. Para quem opera, a barra não existe: nada a escolher.
 */
export function AppShell() {
  const { pessoa, sair } = useAuth()
  const ehGestao = pessoa?.papelSistema === 'gestao'
  const telaLarga = useTelaLarga()
  // O modo TV é do Quadro. Na Equipe o botão continuaria visível e não mudaria
  // nada — um interruptor ligado a nada ensina que ele às vezes não funciona.
  const noQuadro = useLocation().pathname === '/'
  const [modoTv, alternarModoTv] = useModoTv()

  return (
    <div className="flex h-full flex-col">
      <header className="superficie-cabecalho flex-shrink-0 text-white">
        <div className="flex items-center justify-between gap-3 px-3 py-3 md:px-5">
          <div className="flex min-w-0 items-center gap-3">
            {/* `clara` e não `preta`: a mesma silhueta, invertida. */}
            <Logo variante="clara" className="h-7 max-w-[9.5rem] md:h-8 md:max-w-[12rem]" prioridade />

            {/* Ambiente: evita demonstrar contra o remoto por engano. Sobre a
                faixa escura, o LOCAL fica em vidro e o REMOTO em vermelho
                cheio — só o segundo precisa gritar. */}
            <span
              className={clsx(
                'rounded-full px-2 py-0.5 font-mono text-[10px] tracking-wide',
                ehAmbienteLocal
                  ? 'bg-white/15 text-white/80'
                  : 'bg-atrasado text-white',
              )}
            >
              {ehAmbienteLocal ? 'LOCAL' : 'REMOTO'}
            </span>
          </div>

          {/*
            A DATA SAIU e o "sair" foi para dentro.
            
            A data era referência rápida, mas o sobrescrito logo abaixo do
            título já diz "Sábado, 29 de agosto" por extenso — duas datas na
            mesma dobra, uma delas abreviada, e nenhuma das duas ganhava por
            isso.
            
            O "sair" era o único botão permanente do canto, e o único gesto
            realmente perigoso que ficava a um toque de distância num aparelho
            compartilhado. Agora ele vive dentro do menu do usuário, que é onde
            se procura por ele — e onde as próximas ações de conta vão caber
            sem inventar mais um canto.
          */}
          {pessoa && (
            <Dropdown
              alinhamento="direita"
              rotulo={`Conta de ${pessoa.nome}`}
              onEscolher={(item) => {
                if (item.id === 'sair') void sair()
              }}
              itens={[
                { id: 'sair', rotulo: 'Sair da conta', icone: <IconeSair className="size-4" />, destrutivo: true },
              ]}
              gatilho={
                <span className="flex min-w-0 items-center gap-2 rounded-full bg-white/10 py-1 pr-2 pl-1 transition-colors hover:bg-white/20">
                  <Avatar nome={pessoa.nome} />
                  {/* O nome some no mobile e sobra o avatar, que já carrega as
                      iniciais e o nome completo no title. */}
                  <span className="hidden min-w-0 text-left leading-tight sm:block">
                    <span className="block truncate text-sm font-semibold">{pessoa.nome}</span>
                    <span className="block truncate text-[11px] text-white/65">
                      {ROTULO_PAPEL[pessoa.papelSistema] ?? pessoa.papelSistema}
                    </span>
                  </span>
                  <Chevron className="size-4 flex-shrink-0 text-white/60" />
                </span>
              }
            />
          )}
        </div>

        {/*
          A SEGUNDA FAIXA agora tem dois moradores, e por isso passou a existir
          também sem a navegação.

          Ela nasceu só para a gestão, com o item "Painel". O interruptor do
          modo TV veio parar aqui a pedido do gestor, que apontou exatamente
          este vão vazio à direita — e ele está certo: é a única faixa da tela
          que existe para ajustar a TELA, não para mostrar caso nenhum.

          Só que prender o interruptor à navegação da gestão o esconderia de
          todo o resto da equipe, e a TV da sala fica logada no que estiver à
          mão. Então a faixa passa a aparecer quando há QUALQUER COISA nela: a
          navegação, o interruptor, ou os dois. Para quem opera num celular,
          ela continua não existindo.
        */}
        {(ehGestao || (telaLarga && noQuadro)) && (
          <div className="flex items-center gap-1 border-t border-white/10 px-3 pb-2 md:px-5">
            {ehGestao && (
              <nav aria-label="Administração" className="flex gap-1">
                {/*
                  "Painel" deixou de ser um rótulo e virou destino de verdade
                  (02/09/2026). Ele passou semanas como um <span> pintado de
                  aba ativa porque não havia segunda tela para ir — e a dívida
                  #1 do CLAUDE.md descrevia exatamente isso. Com a Equipe, a
                  barra passa a fazer o que aparentava fazer.

                  `end` no Painel: sem isso o "/" casa com toda rota filha e as
                  duas abas acendem juntas em /equipe.
                */}
                <ItemDeNavegacao para="/" fim>
                  Painel
                </ItemDeNavegacao>
                <ItemDeNavegacao para="/equipe">Equipe</ItemDeNavegacao>
              </nav>
            )}

            {/*
              SÓ ONDE O LAYOUT CABE (`telaLarga`, 1536px). Um botão que existe
              e não faz nada é pior que botão nenhum: quem apertasse num
              notebook de 1280px concluiria que a função está quebrada.

              O rótulo diz o destino, não o estado — "Modo TV" é o que acontece
              ao apertar. Se está ligado, dizem o `aria-pressed`, o
              preenchimento, e a tela inteira em duas colunas.
            */}
            {telaLarga && noQuadro && (
              <button
                type="button"
                onClick={alternarModoTv}
                aria-pressed={modoTv}
                className={clsx(
                  'mt-2 ml-auto inline-flex flex-shrink-0 items-center gap-2 rounded-full py-1.5 pr-3 pl-2.5 text-sm font-semibold transition-colors',
                  modoTv
                    ? 'bg-white text-marca-forte hover:bg-white/90'
                    : 'bg-white/10 text-white/80 hover:bg-white/20 hover:text-white',
                )}
              >
                <IconeMonitor className="size-4" />
                Modo TV
                <span
                  className={clsx(
                    'text-[11px] font-medium',
                    modoTv ? 'text-marca-forte/60' : 'text-white/55',
                  )}
                >
                  {modoTv ? 'ligado' : 'desligado'}
                </span>
              </button>
            )}
          </div>
        )}
      </header>

      <main className="min-h-0 flex-1">
        <Outlet />
      </main>
    </div>
  )
}

function ItemDeNavegacao({
  para,
  fim = false,
  children,
}: {
  para: string
  fim?: boolean
  children: ReactNode
}) {
  return (
    <NavLink
      to={para}
      end={fim}
      className={({ isActive }) =>
        clsx(
          'mt-2 rounded-full px-4 py-1.5 text-sm font-bold transition-colors',
          isActive
            ? 'bg-white text-marca-forte'
            : 'text-white/70 hover:bg-white/10 hover:text-white',
        )
      }
    >
      {children}
    </NavLink>
  )
}
