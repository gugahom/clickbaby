import { useState } from 'react'
import { BotaoIcone } from './BotaoIcone'
import { IconeCopiar } from './icones'

interface PropsBotaoCopiar {
  /** O que vai para a área de transferência. */
  texto: string
  /**
   * Chamado quando o navegador NEGA a área de transferência (http sem TLS,
   * permissão recusada, contexto sem foco). Quem chama decide onde a frase
   * aparece — dentro de um diálogo ela precisa ficar no diálogo, porque o
   * `<dialog>` modal inertiza o resto da página e um alerta atrás do backdrop
   * é invisível.
   */
  onFalha?: () => void
}

/**
 * COPIAR UM LINK, em qualquer lugar que mostre um.
 *
 * Existe porque o link de entrega é para ser MANDADO — vai por WhatsApp para a
 * família —, e selecionar com o dedo uma url truncada que é clicável abre a
 * galeria sem querer em vez de copiar.
 *
 * Virou componente quando a terceira cópia da mesma função `copiar` ia nascer
 * (11/09/2026): a lista de entregáveis do card, o bloco de link já criado da
 * conclusão e agora o checklist de entrega. As três tinham o mesmo `try/catch`,
 * o mesmo "copiado!" temporário e o mesmo timeout de 1,8s — três cópias que
 * divergem na primeira vez que alguém mexer numa só.
 *
 * O "copiado!" VOLTA SOZINHO: um estado permanente vira parte do desenho e
 * deixa de dizer que ACABOU de acontecer.
 */
export function BotaoCopiar({ texto, onFalha }: PropsBotaoCopiar) {
  const [copiado, setCopiado] = useState(false)

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(true)
      window.setTimeout(() => setCopiado(false), 1800)
    } catch {
      // Não é beco: o link continua clicável e selecionável à mão.
      onFalha?.()
    }
  }

  return (
    <BotaoIcone
      rotulo={copiado ? 'Link copiado' : 'Copiar link'}
      tom={copiado ? 'positivo' : 'neutro'}
      onClick={() => void copiar()}
    >
      <IconeCopiar className="size-4" />
    </BotaoIcone>
  )
}
