import clsx from 'clsx'
import { COR_ANEL_ESTADO, COR_ESTADO, type EstadoVisivel } from '../lib/estados'

/**
 * A bolinha de estado.
 *
 * SEM ANEL PRÓPRIO, e isso é decisão e não esquecimento: ela pousa em dois
 * fundos muito diferentes — a faixa da marca, que é um GRADIENTE (não há token
 * de cor única que case com ele), e o menu branco. Um anel fixo aqui ficaria
 * certo num lugar e errado no outro. Quem chama sabe onde está e passa o anel
 * pelo `className`.
 */
export function BolinhaDeStatus({
  estado,
  vazada = false,
  className,
}: {
  estado: EstadoVisivel
  /**
   * Disponível, mas sem pegar trabalho há um tempo.
   *
   * VAZADA e não de outra cor: ela continua disponível — a cor está certa e
   * mudá-la diria outro estado. O que muda é o preenchimento, que é a diferença
   * entre "de mãos livres" e "de mãos livres há tempo demais". Um quarto tom no
   * cabeçalho seria mais uma cor para decorar; um círculo cheio e um vazio se
   * leem sem legenda.
   */
  vazada?: boolean
  className?: string
}) {
  return (
    <span
      className={clsx(
        'block size-2.5 flex-shrink-0 rounded-full',
        vazada
          ? // `inset` para o anel crescer para DENTRO: para fora ele brigaria
            // com o anel escuro que separa a bolinha do retrato.
            clsx('bg-transparent ring-2 ring-inset', COR_ANEL_ESTADO[estado])
          : COR_ESTADO[estado],
        className,
      )}
      aria-hidden="true"
    />
  )
}
