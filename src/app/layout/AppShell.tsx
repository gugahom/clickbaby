import { NavLink, Outlet } from 'react-router'
import clsx from 'clsx'
import { Avatar } from '@/components/ui/Avatar'
import { ehAmbienteLocal } from '@/lib/supabase'
import { useAuth } from '@/features/auth/contexto'

const ROTULO_PAPEL: Record<string, string> = {
  operador: 'Operação',
  comercial: 'Comercial',
  coordenacao: 'Coordenação',
  atendimento: 'Atendimento',
  financeiro: 'Financeiro',
  gestao: 'Gestão',
}

/**
 * Faixa da marca.
 *
 * Era uma tira cinza de 12px com texto pequeno — lida como barra de ferramentas
 * de planilha, não como cabeçalho de produto. Agora é uma faixa índigo cheia:
 * é o único bloco de cor sólida da tela, e é o que ancora tudo abaixo como
 * "aplicativo" em vez de "documento".
 *
 * À direita, a identidade de quem está logado. Num aparelho que troca de mão a
 * cada turno, essa é a pergunta que a pessoa faz antes de tocar em qualquer
 * botão — e o avatar responde antes de qualquer texto ser lido.
 */
export function AppShell() {
  const { pessoa, sair } = useAuth()

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-shrink-0 items-center justify-between gap-3 bg-marca px-3 py-2 text-white md:px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          {/* O ponto rosa é a íris do logo reduzida ao mínimo: identidade sem
              precisar de imagem, e sobrevive a qualquer largura de tela. */}
          <span className="flex items-center gap-1.5 text-sm font-bold tracking-[0.18em] whitespace-nowrap">
            CLICK
            <span className="size-1.5 rounded-full bg-acento" aria-hidden="true" />
            BABY
          </span>
          {/* Ambiente: evita demonstrar contra o remoto por engano. */}
          <span
            className={
              ehAmbienteLocal
                ? 'rounded bg-white/20 px-1.5 py-0.5 font-mono text-[10px] tracking-wide'
                : 'rounded bg-atrasado px-1.5 py-0.5 font-mono text-[10px] tracking-wide'
            }
          >
            {ehAmbienteLocal ? 'LOCAL' : 'REMOTO'}
          </span>
        </div>

        {/* Navegação. Antes não existia: o Quadro era a única tela e chegar na
            fila exigiria digitar a URL. */}
        <nav className="flex flex-1 items-center gap-1" aria-label="Telas">
          <Aba para="/" fim>
            Quadro
          </Aba>
          <Aba para="/fila">Fila de edição</Aba>
        </nav>

        <div className="flex min-w-0 items-center gap-2.5">
          {pessoa && (
            <>
              {/* O nome some no mobile e sobra o avatar, que já carrega as
                  iniciais e o nome completo no title. */}
              <div className="hidden min-w-0 text-right leading-tight sm:block">
                <div className="truncate text-sm font-medium">{pessoa.nome}</div>
                <div className="truncate text-[11px] text-white/70">
                  {ROTULO_PAPEL[pessoa.papelSistema] ?? pessoa.papelSistema}
                </div>
              </div>
              <Avatar nome={pessoa.nome} />
            </>
          )}
          <button
            type="button"
            onClick={() => void sair()}
            className="ml-1 rounded px-2 py-1 text-xs font-medium text-white/80 transition-colors hover:bg-white/15 hover:text-white"
          >
            sair
          </button>
        </div>
      </header>

      <main className="min-h-0 flex-1">
        <Outlet />
      </main>
    </div>
  )
}

// `fim` -> a prop `end` do NavLink. O Quadro agora mora em "/", e sem isso ele
// casaria como ativo em toda rota filha — as duas abas ficariam acesas ao mesmo
// tempo na Fila.
function Aba({
  para,
  fim = false,
  children,
}: {
  para: string
  fim?: boolean
  children: React.ReactNode
}) {
  return (
    <NavLink
      to={para}
      end={fim}
      className={({ isActive }) =>
        clsx(
          'rounded px-2.5 py-1 text-xs font-medium transition-colors',
          isActive ? 'bg-white/20 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white',
        )
      }
    >
      {children}
    </NavLink>
  )
}
