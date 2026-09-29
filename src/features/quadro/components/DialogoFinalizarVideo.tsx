import { useState } from 'react'
import { Dialogo } from '@/components/ui/Dialogo'
import { useEntregaveis, useEnviarVideoNosLinksDoCaso, useEnviarVideoParaEntrega } from '../api/useAcoes'
import { mensagemDeErro } from '../lib/erros'
import { ROTULO_DO_LINK_DO_VIDEO, linksDoCasoParaOVideo } from '../lib/links-do-video'
import type { EtapaQuadro } from '../types'
import { LinkParaCopiar } from './LinkParaCopiar'

/**
 * TERMINAR A EDIÇÃO DO VÍDEO DO MASTER (21/09/2026, pedido do gestor).
 *
 * É a porta de "Pronto para entrega", e a mesma pelos três caminhos: o seletor
 * de fase, o arrastar no quadro por fase e o ✓ do cartão. O vídeo vai para
 * Entregáveis, sinalizado como VÍDEO, esperando a Morgana. Ele NÃO some da
 * seção agora: sai quando ela confirmar a entrega.
 *
 * SE O CASO JÁ TEM LINKS, NÃO PEDE OUTROS (29/09/2026, pedido do gestor:
 * "finalizar o master está pedindo links de novo; se já existirem links ele só
 * deve pedir para adicionar o vídeo a esses links"). O diálogo mostra os links
 * do caso — os do vídeo de uma entrega anterior, ou os das fotos — e pede só a
 * confirmação de que o vídeo foi adicionado a eles. "Usar links novos" continua
 * a um toque, para o vídeo que for para outro lugar. Sem link nenhum no caso,
 * ele pede os dois de sempre: o do vídeo e o WeTransfer do vídeo.
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
  const { data: links } = useEntregaveis(etapa.casoId, true)
  const enviarPar = useEnviarVideoParaEntrega()
  const enviarNosLinks = useEnviarVideoNosLinksDoCaso()
  const [linkVideo, setLinkVideo] = useState('')
  const [linkWetransfer, setLinkWetransfer] = useState('')
  const [usarNovos, setUsarNovos] = useState(false)
  const [adicionei, setAdicionei] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const doCaso = linksDoCasoParaOVideo(links ?? [])
  const buscando = links === undefined
  const nosLinksDoCaso = !usarNovos && doCaso.length > 0
  const ocupado = enviarPar.isPending || enviarNosLinks.isPending

  return (
    <Dialogo
      titulo="Finalizar a edição do vídeo"
      rotuloConfirmar={ocupado ? 'Enviando…' : 'Mandar para Entregáveis'}
      confirmarDesabilitado={
        buscando || (nosLinksDoCaso ? !adicionei : linkVideo.trim() === '' || linkWetransfer.trim() === '')
      }
      ocupado={ocupado}
      erro={erro}
      onCancelar={onFechar}
      onConfirmar={() => {
        setErro(null)
        const envio = nosLinksDoCaso
          ? enviarNosLinks.mutateAsync({ casoEtapaId: etapa.id })
          : enviarPar.mutateAsync({ casoEtapaId: etapa.id, linkVideo, linkWetransfer })
        envio.then(onFechar, (e) => setErro(mensagemDeErro(e)))
      }}
    >
      <p className="text-sm text-muted-foreground">
        {nomeDoCaso}. O vídeo vai para “Pronto para entrega” e aparece em
        Entregáveis para o ADM entregar à família. Ele sai desta seção quando a
        entrega for confirmada.
      </p>

      {buscando ? (
        <p className="text-sm text-muted-foreground">Buscando os links do caso…</p>
      ) : nosLinksDoCaso ? (
        <>
          <div className="space-y-2 rounded-md border border-border bg-muted/40 p-3">
            <p className="text-sm font-semibold">Adicione o vídeo aos links que o caso já tem:</p>
            {doCaso.map((link) => (
              <LinkParaCopiar key={link.id} rotulo={ROTULO_DO_LINK_DO_VIDEO[link.tipo] ?? link.tipo} url={link.url} />
            ))}
          </div>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium">
            <input
              type="checkbox"
              checked={adicionei}
              onChange={(e) => setAdicionei(e.target.checked)}
              className="size-5 flex-shrink-0 rounded border-border accent-marca"
            />
            Adicionei o vídeo a esses links
          </label>
          <button
            type="button"
            onClick={() => setUsarNovos(true)}
            className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            O vídeo foi para outro lugar — usar links novos
          </button>
        </>
      ) : (
        <>
          <CampoDeLink rotulo="Link do vídeo" valor={linkVideo} onMudar={setLinkVideo} foco />
          <CampoDeLink rotulo="WeTransfer do vídeo" valor={linkWetransfer} onMudar={setLinkWetransfer} />
          {doCaso.length > 0 && (
            <button
              type="button"
              onClick={() => setUsarNovos(false)}
              className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              Voltar a usar os links que o caso já tem
            </button>
          )}
        </>
      )}
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
