import { useState } from 'react'
import { Dialogo } from '@/components/ui/Dialogo'
import { useEnviarClickHomeParaEscolha } from '../api/useAcoes'
import { mensagemDeErro } from '../lib/erros'
import type { EtapaQuadro } from '../types'

/**
 * MANDAR O NEW BORN PARA A ESCOLHA DA FAMÍLIA (22/09/2026, pedido do gestor).
 *
 * É a porta da fase "Enviar para escolha", e a mesma pelos três caminhos: o
 * seletor de fase, o arrastar no quadro por fase e o ✓ do cartão. Pede o LINK
 * da galeria — é o endereço que a família abre para escolher as fotos do
 * ensaio —, e o ensaio vai para Entregáveis, sinalizado como NEW BORN.
 *
 * Ele NÃO sai da seção agora: sai quando a Morgana confirmar. Mesmo arranjo do
 * vídeo e do fotolivro, e pelo mesmo motivo — o link que ninguém registra é o
 * link que some.
 */
export function DialogoGaleriaDoClickHome({
  etapa,
  nomeDoCaso,
  onFechar,
}: {
  etapa: EtapaQuadro
  nomeDoCaso: string
  onFechar: () => void
}) {
  const enviar = useEnviarClickHomeParaEscolha()
  const [link, setLink] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  return (
    <Dialogo
      titulo="Mandar o New Born para escolha"
      rotuloConfirmar={enviar.isPending ? 'Enviando…' : 'Mandar para Entregáveis'}
      confirmarDesabilitado={link.trim() === ''}
      ocupado={enviar.isPending}
      erro={erro}
      onCancelar={onFechar}
      onConfirmar={() => {
        setErro(null)
        enviar
          .mutateAsync({ casoEtapaId: etapa.id, link })
          .then(onFechar, (e) => setErro(mensagemDeErro(e)))
      }}
    >
      <p className="text-sm text-muted-foreground">
        {nomeDoCaso}. O ensaio vai para “Enviar para escolha” e aparece em
        Entregáveis, para o ADM mandar a galeria à família. Ele sai desta seção
        quando a entrega for confirmada.
      </p>

      <label className="block">
        <span className="text-sm font-medium">Link da galeria de escolha</span>
        <input
          type="url"
          inputMode="url"
          autoFocus
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="https://"
          className="mt-1.5 min-h-12 w-full rounded-md border border-border bg-background px-3 text-base"
        />
      </label>
    </Dialogo>
  )
}
