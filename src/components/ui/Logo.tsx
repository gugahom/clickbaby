import clsx from 'clsx'

/**
 * A marca, do arquivo original do cliente.
 *
 * É imagem e não SVG desenhado à mão de propósito: o lettering de "Click Baby"
 * é caligrafia customizada, e uma reconstrução minha seria uma imitação —
 * exatamente o tipo de coisa que um dono de marca reconhece e detesta. O PNG é
 * reduzido de 5835px para 1200px (40KB, era 194KB) porque nenhuma tela aqui
 * usa mais que ~400px.
 *
 * O logo é cinza e pastel sobre transparente: só funciona sobre superfície
 * clara. É por isso que o cabeçalho deixou de ser a faixa índigo.
 */
export function Logo({
  className,
  prioridade = false,
  variante = 'cor',
}: {
  className?: string
  prioridade?: boolean
  /**
   * `preta` no cabeçalho do Quadro, `cor` no login.
   *
   * Não é só gosto: o cabeçalho é uma tira estreita sobre branco, com o chão
   * pastel e os cartões logo abaixo. A lente colorida ali disputa atenção com
   * o diafragma de progresso de cada dia, que usa exatamente as mesmas duas
   * cores — duas coisas rosa-e-azul na mesma tela, uma delas informativa e a
   * outra não. Em preto, a marca identifica sem competir. No login não há
   * disputa: é a única coisa na tela, e aí a versão colorida é a certa.
   */
  variante?: 'cor' | 'preta' | 'clara'
}) {
  // `clara` é a PRETA invertida por filtro, e não um arquivo novo.
  //
  // A faixa do cabeçalho voltou a ser escura, e ali a logo cinza sumiria. A
  // saída óbvia seria gerar um PNG branco; `invert(1)` sobre a preta dá
  // exatamente o mesmo resultado, porque a preta já é monocromática sobre
  // transparente — sem asset novo, sem passo de build, sem mais um arquivo
  // para manter em sincronia quando a marca mudar.
  //
  // O que se perde é a lente pastel, mas ela já não estava ali: a variante
  // preta existe justamente para não competir com o diafragma de progresso,
  // que usa as mesmas duas cores.
  const monocromatica = variante === 'preta' || variante === 'clara'
  const arquivo = monocromatica ? 'logo-clickbaby-preta.png' : 'logo-clickbaby.png'
  return (
    <img
      src={`${import.meta.env.BASE_URL}${arquivo}`}
      alt="Estúdio Click Baby"
      width={1200}
      height={monocromatica ? 336 : 310}
      // A do login é a primeira imagem da primeira tela: vale carregar cedo.
      // A do cabeçalho reaparece em toda navegação e sai do cache.
      loading={prioridade ? 'eager' : 'lazy'}
      decoding="async"
      className={clsx('h-auto w-auto object-contain', variante === 'clara' && 'invert', className)}
    />
  )
}
