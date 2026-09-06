import clsx from 'clsx'
import { COR_ESTADO, type EstadoVisivel } from '../lib/estados'

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
  className,
}: {
  estado: EstadoVisivel
  className?: string
}) {
  return (
    <span
      className={clsx('block size-2.5 flex-shrink-0 rounded-full', COR_ESTADO[estado], className)}
      aria-hidden="true"
    />
  )
}
