import { Avatar } from '@/components/ui/Avatar'
import { ROTULO_PAPEL } from '@/features/equipe/lib/apresentacao'
import { ROTULO_ESTADO, estaParada, fraseDeAtividade, type EstadoVisivel } from '../lib/estados'
import { BolinhaDeStatus } from './BolinhaDeStatus'

/** Uma linha do painel. O "eu" é a única que difere, e só no rótulo. */
export interface LinhaDePresenca {
  pessoaId: string
  nome: string
  papel: string
  estado: EstadoVisivel
  fotoUrl: string | null
  ultimaAtividade: string | undefined
  /** Quem está logado neste aparelho — vem primeiro e se anuncia. */
  souEu?: boolean
}

/**
 * QUEM ESTÁ NA TELA AGORA, por extenso (17/09/2026, pedido do gestor).
 *
 * A fileira de avatares mostrava QUATRO pessoas e escondia o resto atrás de um
 * "+N" com os nomes num `title` — e cada estado só se lia passando o mouse,
 * um retrato por vez. Para a pergunta que o gestor faz ali ("o que está
 * acontecendo agora") isso obrigava a varrer a fileira com o mouse e guardar
 * de cabeça. Agora a fileira é o GATILHO e esta é a resposta: todo mundo, com
 * estado e frase de atividade lado a lado.
 *
 * O CARTÃO DE HOVER SAIU junto, e não é perda: ele dizia exatamente o que cada
 * linha daqui diz, e manter os dois faria o mesmo retrato responder de dois
 * jeitos — um ao passar o mouse, outro ao clicar.
 *
 * EU APAREÇO, e em primeiro lugar. A pergunta é "quem está aqui", e quem está
 * lendo também está; sem isso a contagem do painel discordaria da sala. A
 * marca "· você" existe para ninguém se procurar na lista.
 *
 * A ORDEM É: eu, depois quem está OCUPADA, depois quem está livre — o inverso
 * seria ordenar por nome, que é a ordem que não responde nada. Dentro de cada
 * grupo, ordem alfabética.
 */
export function PainelDaEquipe({ linhas }: { linhas: LinhaDePresenca[] }) {
  return (
    <div className="max-h-[70vh] overflow-y-auto">
      <ul className="divide-y divide-border">
        {linhas.map((l) => (
          <li key={l.pessoaId} className="flex items-center gap-2.5 px-3 py-2.5">
            <span className="relative flex-shrink-0">
              <Avatar nome={l.nome} fotoUrl={l.fotoUrl} tom="claro" className="size-9" />
              <BolinhaDeStatus
                estado={l.estado}
                // A mesma bolinha VAZADA da fileira: disponível há tempo
                // demais. Cor igual porque ela continua disponível; o que muda
                // é o preenchimento.
                vazada={l.estado === 'disponivel' && estaParada(l.ultimaAtividade)}
                className="absolute right-0 bottom-0 outline-2 outline-card"
              />
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-1.5">
                <span className="truncate text-sm font-semibold">{l.nome}</span>
                {l.souEu && (
                  <span className="flex-shrink-0 text-[11px] font-semibold text-muted-foreground">
                    · você
                  </span>
                )}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {ROTULO_PAPEL[l.papel] ?? l.papel}
              </div>
            </div>

            <div className="flex-shrink-0 text-right">
              <div className="text-xs font-semibold">{ROTULO_ESTADO[l.estado]}</div>
              {/* A frase completa, e não truncada: é ela que o gestor lê para
                  decidir a quem passar a próxima maternidade. */}
              <div className="text-[11px] leading-tight text-muted-foreground">
                {fraseDeAtividade(l.estado, l.ultimaAtividade)}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
