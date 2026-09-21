import { useState } from 'react'
import { Dialogo } from '@/components/ui/Dialogo'
import { useEnviarVideoParaEntrega } from '../api/useAcoes'
import { mensagemDeErro } from '../lib/erros'
import type { EtapaQuadro } from '../types'

/**
 * TERMINAR A EDIÇÃO DO VÍDEO DO MASTER (21/09/2026, pedido do gestor).
 *
 * É a porta de "Pronto para entrega", e a mesma pelos três caminhos: o seletor
 * de fase, o arrastar no quadro por fase e o ✓ do cartão. Pede os DOIS links
 * que o gestor exige — o do vídeo e o WeTransfer —, e o vídeo vai para
 * Entregáveis, sinalizado como VÍDEO, esperando a Morgana. Ele NÃO some da seção
 * agora: sai quando ela confirmar a entrega.
 *
 * Até 21/09 este diálogo pedia um link só e concluía o vídeo na hora — e o ✓ do
 * cartão nem passava por ele.
 */
export function DialogoFinalizarVideo({
  etapa,
  nomeDoCaso,
  onFechar,
}: {
  etapa: EtapaQuadro
  nomeDoCaso: string
  onFechar: () => void
}) {
  const enviar = useEnviarVideoParaEntrega()
  const [linkVideo, setLinkVideo] = useState('')
  const [linkWetransfer, setLinkWetransfer] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  return (
    <Dialogo
      titulo="Finalizar a edição do vídeo"
      rotuloConfirmar={enviar.isPending ? 'Enviando…' : 'Mandar para Entregáveis'}
      confirmarDesabilitado={linkVideo.trim() === '' || linkWetransfer.trim() === ''}
      ocupado={enviar.isPending}
      erro={erro}
      onCancelar={onFechar}
      onConfirmar={() => {
        setErro(null)
        enviar
          .mutateAsync({ casoEtapaId: etapa.id, linkVideo, linkWetransfer })
          .then(onFechar, (e) => setErro(mensagemDeErro(e)))
      }}
    >
      <p className="text-sm text-muted-foreground">
        {nomeDoCaso}. O vídeo vai para “Pronto para entrega” e aparece em
        Entregáveis para o ADM entregar à família. Ele sai desta seção quando a
        entrega for confirmada.
      </p>

      <CampoDeLink rotulo="Link do vídeo" valor={linkVideo} onMudar={setLinkVideo} foco />
      <CampoDeLink rotulo="WeTransfer do vídeo" valor={linkWetransfer} onMudar={setLinkWetransfer} />
    </Dialogo>
  )
}

function CampoDeLink({
  rotulo,
  valor,
  onMudar,
  foco = false,
}: {
  rotulo: string
  valor: string
  onMudar: (valor: string) => void
  foco?: boolean
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{rotulo}</span>
      <input
        type="url"
        inputMode="url"
        autoFocus={foco}
        value={valor}
        onChange={(e) => onMudar(e.target.value)}
        placeholder="https://"
        className="mt-1.5 min-h-12 w-full rounded-md border border-border bg-background px-3 text-base"
      />
    </label>
  )
}
