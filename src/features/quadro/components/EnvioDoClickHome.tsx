import clsx from 'clsx'
import { IconeCheck } from '@/components/ui/icones'
import { useMarcarClickHomeEnviado } from '../api/useAcoes'
import { mensagemDeErro } from '../lib/erros'
import { FASE_CLICK_HOME_ESCOLHA, type EtapaQuadro } from '../types'

/**
 * "ENVIADO À FAMÍLIA" (05/11/2026, pedido do gestor). Na coluna da escolha o
 * card fica parado dias, e a fase sozinha não diz se a galeria já foi mandada ou
 * se ainda falta. O botão separa as duas coisas e apaga o sino de quem faz esse
 * meio de campo; depois dele sobra uma pílula, como o "Enviado ao cliente" do
 * Foto/Livro. O ensaio não muda de coluna: quem o tira dali é a família escolher.
 */
export function EnvioDoClickHome({ etapa, onErro }: { etapa: EtapaQuadro; onErro: (m: string | null) => void }) {
  const marcar = useMarcarClickHomeEnviado()

  if (etapa.faseClickHome !== FASE_CLICK_HOME_ESCOLHA) return null

  if (etapa.clickHomeEnviadoEm) {
    return (
      <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-xs font-bold text-muted-foreground">
        Enviado à família
      </span>
    )
  }

  return (
    <button
      type="button"
      disabled={marcar.isPending}
      onClick={() => {
        onErro(null)
        marcar.mutateAsync({ casoEtapaId: etapa.id }).catch((e: unknown) => onErro(mensagemDeErro(e)))
      }}
      className={clsx(
        'inline-flex min-h-8 items-center gap-1 rounded-full bg-atencao/15 px-2.5 py-1 text-xs font-bold text-atencao-tinta hover:bg-atencao/25',
        marcar.isPending && 'opacity-60',
      )}
    >
      <IconeCheck className="size-3.5" />
      Marcar enviado à família
    </button>
  )
}
