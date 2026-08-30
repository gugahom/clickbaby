import { Outlet } from 'react-router'
import clsx from 'clsx'
import { Avatar } from '@/components/ui/Avatar'
import { Logo } from '@/components/ui/Logo'
import { Dropdown } from '@/components/ui/Dropdown'
import { Chevron, IconeSair } from '@/components/ui/icones'
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
