import { useState } from 'react'
import { BotaoCopiar } from '@/components/ui/BotaoCopiar'

/**
 * Um link com rótulo e botão de copiar — o que se manda para a família. Mora
 * aqui (e não dentro de EntregasPainel) desde 29/09/2026, quando o diálogo de
 * finalizar o vídeo do MASTER passou a mostrar os links do caso também.
 */
export function LinkParaCopiar({ rotulo, url }: { rotulo: string; url: string }) {
  const [falhou, setFalhou] = useState(false)
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold">{rotulo}</p>
      <div className="flex items-center gap-1">
        {/* rel="noreferrer": o link é credencial de acesso da família. */}
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="min-w-0 flex-1 truncate text-sm text-marca underline underline-offset-2"
        >
          {url}
        </a>
        <BotaoCopiar texto={url} onFalha={() => setFalhou(true)} />
      </div>
      {falhou && (
        <p className="text-xs text-muted-foreground">
          Não deu para copiar. Selecione o link e copie à mão.
        </p>
      )}
    </div>
  )
}
