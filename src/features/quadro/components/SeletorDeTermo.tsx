import clsx from 'clsx'
import { CLASSE_TERMO, EXPLICACAO_TERMO, OPCOES_TERMO, ROTULO_TERMO } from '../lib/termo'
import type { TermoStatus } from '../types'

/**
 * AS QUATRO RESPOSTAS DO TERMO, em chips (22/09/2026; a quarta em 28/09).
 *
 * Chips e não lista: a seção 6 manda usar botão sempre que der, e esta é a
 * última pergunta antes de um gesto que encerra o caso. As quatro aparecem de
 * uma vez porque a pessoa está LENDO o contrato — esconder duas atrás de um
 * seletor transformaria uma leitura em dois toques.
 *
 * EM GRADE DE DOIS, e não numa fileira que quebra sozinha. Com três elas cabiam
 * lado a lado; com quatro, um `flex-wrap` deixaria três numa linha e uma órfã na
 * outra, e o arranjo mudaria de forma conforme a largura. Duas por duas é o
 * mesmo desenho no celular e no PC, e cada chip fica largo o bastante para o
 * dedo — os 44px da seção 6 continuam garantidos pela altura.
 *
 * A EXPLICAÇÃO DA ESCOLHIDA aparece embaixo, e só dela: a mídia da empresa vai
 * filtrar por este campo depois, e "ass pendente" sem legenda é a diferença
 * entre "não assinou" e "ainda não chegou".
 */
export function SeletorDeTermo({
  valor,
  sugerido,
  onEscolher,
}: {
  valor: TermoStatus | null
  /** Explica por que uma resposta já veio marcada — hoje, o BIRTH sem contrato. */
  sugerido?: string | undefined
  onEscolher: (termo: TermoStatus) => void
}) {
  return (
    <div>
      <span className="text-sm font-medium">Termo de uso de imagem</span>
      <p className="mt-0.5 text-xs text-muted-foreground">
        É o que diz se a mídia da empresa pode usar as fotos deste parto.
      </p>

      <div className="mt-1.5 grid grid-cols-2 gap-2">
        {OPCOES_TERMO.map((opcao) => (
          <button
            key={opcao}
            type="button"
            aria-pressed={valor === opcao}
            onClick={() => onEscolher(opcao)}
            className={clsx(
              'inline-flex min-h-11 w-full items-center justify-center rounded-full px-3 text-center text-sm font-bold transition-colors',
              valor === opcao
                ? CLASSE_TERMO[opcao]
                : 'border border-border text-muted-foreground hover:bg-muted',
            )}
          >
            {ROTULO_TERMO[opcao]}
          </button>
        ))}
      </div>

      <p className="mt-1 text-xs text-muted-foreground">
        {valor ? EXPLICACAO_TERMO[valor] : 'Escolha uma das quatro para continuar.'}
        {valor && sugerido ? ` ${sugerido}` : ''}
      </p>
    </div>
  )
}
