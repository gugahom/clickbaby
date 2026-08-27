import { Outlet } from 'react-router'
import { Avatar } from '@/components/ui/Avatar'
import { Botao } from '@/components/ui/Botao'
import { Logo } from '@/components/ui/Logo'
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
 * Passou por três estados. Era uma tira cinza de 12px, lida como barra de
 * ferramentas de planilha. Virou uma faixa índigo cheia, para ancorar a tela
 * como "aplicativo" em vez de "documento". Agora é branca, com o logo de
 * verdade.
 *
 * A troca só foi possível porque o CHÃO passou a ser pastel (ver a nota em
 * index.css): o trabalho de separar app de documento migrou da faixa para o
 * par chão-tingido + cartão-branco. Sem essa mudança, tirar o índigo teria
 * devolvido a tela ao estado de planilha.
 *
 * E era necessária: o logo é cinza e pastel sobre transparente. Sobre índigo
 * ele ficaria ilegível, e recortá-lo em branco descaracterizaria a marca.
 *
 * Não há mais navegação aqui — o Quadro é a única tela desde que a Fila de
 * edição saiu. Se uma segunda tela voltar, a nav volta com ela; deixar um
 * único item de menu apontando para a página atual seria moldura vazia.
 *
 * À direita, a identidade de quem está logado. Num aparelho que troca de mão
 * a cada turno, essa é a pergunta que a pessoa faz antes de tocar em qualquer
 * botão — e o avatar responde antes de qualquer texto ser lido.
 */
export function AppShell() {
  const { pessoa, sair } = useAuth()

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-3 py-2.5 shadow-cartao md:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <Logo variante="preta" className="h-7 max-w-[9.5rem] md:h-9 md:max-w-[13rem]" prioridade />
          {/* Ambiente: evita demonstrar contra o remoto por engano. Só grita
              quando é o remoto — o local é o estado esperado no dia a dia. */}
          <span
            className={
              ehAmbienteLocal
                ? 'rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] tracking-wide text-muted-foreground'
                : 'rounded bg-atrasado px-1.5 py-0.5 font-mono text-[10px] tracking-wide text-white'
            }
          >
            {ehAmbienteLocal ? 'LOCAL' : 'REMOTO'}
          </span>
        </div>

        <div className="flex min-w-0 items-center gap-2.5">
          {pessoa && (
            <>
              {/* O nome some no mobile e sobra o avatar, que já carrega as
                  iniciais e o nome completo no title. */}
              <div className="hidden min-w-0 text-right leading-tight sm:block">
                <div className="truncate text-sm font-semibold">{pessoa.nome}</div>
                <div className="truncate text-[11px] text-muted-foreground">
                  {ROTULO_PAPEL[pessoa.papelSistema] ?? pessoa.papelSistema}
                </div>
              </div>
              <Avatar nome={pessoa.nome} />
            </>
          )}
          <Botao variante="fantasma" onClick={() => void sair()} className="ml-1 px-4 text-xs">
            sair
          </Botao>
        </div>
      </header>

      <main className="min-h-0 flex-1">
        <Outlet />
      </main>
    </div>
  )
}
