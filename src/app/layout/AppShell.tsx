import { Outlet } from 'react-router'
import clsx from 'clsx'
import { Avatar } from '@/components/ui/Avatar'
import { Logo } from '@/components/ui/Logo'
import { ehAmbienteLocal } from '@/lib/supabase'
import { useAuth } from '@/features/auth/contexto'
import { hojeNoFuso } from '@/lib/formato'

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

          <div className="flex min-w-0 items-center gap-2">
            {/* A data. Some no celular: ali a barra de status do sistema já a
                mostra a dois centímetros daqui. */}
            <span className="hidden rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium tabular-nums text-white/85 lg:inline">
              {rotularCabecalho(hojeNoFuso())}
            </span>

            {pessoa && (
              <div className="flex min-w-0 items-center gap-2 rounded-full bg-white/10 py-1 pr-3 pl-1">
                <Avatar nome={pessoa.nome} />
                {/* O nome some no mobile e sobra o avatar, que já carrega as
                    iniciais e o nome completo no title. */}
                <div className="hidden min-w-0 leading-tight sm:block">
                  <div className="truncate text-sm font-semibold">{pessoa.nome}</div>
                  <div className="truncate text-[11px] text-white/65">
                    {ROTULO_PAPEL[pessoa.papelSistema] ?? pessoa.papelSistema}
                  </div>
                </div>
              </div>
            )}

            {/* <button> cru: sobre a faixa escura, o Botao traria o fundo claro
                dele e viraria um bloco branco no canto. */}
            <button
              type="button"
              onClick={() => void sair()}
              className="inline-flex h-11 items-center rounded-full px-3 text-xs font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            >
              sair
            </button>
          </div>
        </div>

        {ehGestao && (
          <nav
            aria-label="Administração"
            className="flex gap-1 border-t border-white/10 px-3 pb-2 md:px-5"
          >
            <span
              aria-current="page"
              className="mt-2 rounded-full bg-white px-4 py-1.5 text-sm font-bold text-marca-forte"
            >
              Painel
            </span>
          </nav>
        )}
      </header>

      <main className="min-h-0 flex-1">
        <Outlet />
      </main>
    </div>
  )
}

/** "28 ago · sex" — curto o bastante para caber ao lado do resto. */
function rotularCabecalho(dia: string): string {
  const [ano, mes, d] = dia.split('-').map(Number)
  const data = new Date(ano ?? 1970, (mes ?? 1) - 1, d ?? 1)
  const formato = new Intl.DateTimeFormat('pt-BR', {
    day: 'numeric',
    month: 'short',
    weekday: 'short',
  })
  // O Intl devolve "sex., 28 de ago."; aqui a ordem é data primeiro, que é o
  // que se procura, e sem os pontos que o formato longo arrasta.
  const partes = Object.fromEntries(
    formato.formatToParts(data).map((p) => [p.type, p.value.replace('.', '')]),
  )
  return `${partes.day} ${partes.month} · ${partes.weekday}`
}
