import { useState } from 'react'
import { Dialogo } from '@/components/ui/Dialogo'
import { useEntregaveis, useEnviarClickHomeParaEntrega } from '../api/useAcoes'
import { mensagemDeErro } from '../lib/erros'
import type { EtapaQuadro } from '../types'

/**
 * OS LINKS DE ENTREGA DO NEW BORN (11/11/2026, pedido do gestor: "depois de
 * editar a seleção tem um espaço para a gente colocar o link do New Born, do
 * Google Fotos, e o do WeTransfer").
 *
 * É a porta do "Pronto para entrega", e a mesma pelos três caminhos — o seletor
 * de fase, o arrastar e o ✓ "Seleção editada". Não fecha sem os dois links
 * (decisão do gestor), e grava os dois e a fase na mesma transação
 * (`enviar_click_home_para_entrega`).
 *
 * Quem volta do pronto para a seleção e manda de novo encontra o par que já
 * estava aqui, ainda não conferido: trocar é editar, não colar tudo outra vez.
 */
export function DialogoLinksDoNewBorn({
  etapa,
  nomeDoCaso,
  onFechar,
}: {
  etapa: EtapaQuadro
  nomeDoCaso: string
  onFechar: () => void
}) {
  const { data: links } = useEntregaveis(etapa.casoId, true)
  if (links === undefined) return null

  const pendente = (tipo: string) =>
    links.find((l) => l.tipo === tipo && l.confirmado_em === null)?.url ?? ''

  return (
    <Formulario
      etapa={etapa}
      nomeDoCaso={nomeDoCaso}
      googleInicial={pendente('click_home_google')}
      wetransferInicial={pendente('click_home_wetransfer')}
      onFechar={onFechar}
    />
  )
}

function Formulario({
  etapa,
  nomeDoCaso,
  googleInicial,
  wetransferInicial,
  onFechar,
}: {
  etapa: EtapaQuadro
  nomeDoCaso: string
  googleInicial: string
  wetransferInicial: string
  onFechar: () => void
}) {
  const enviar = useEnviarClickHomeParaEntrega()
  const [google, setGoogle] = useState(googleInicial)
  const [wetransfer, setWetransfer] = useState(wetransferInicial)
  const [erro, setErro] = useState<string | null>(null)

  return (
    <Dialogo
      titulo="Links de entrega do New Born"
      rotuloConfirmar={enviar.isPending ? 'Enviando…' : 'Pronto para entrega'}
      confirmarDesabilitado={google.trim() === '' || wetransfer.trim() === ''}
      ocupado={enviar.isPending}
      erro={erro}
      onCancelar={onFechar}
      onConfirmar={() => {
        setErro(null)
        enviar
          .mutateAsync({ casoEtapaId: etapa.id, linkGoogle: google, linkWetransfer: wetransfer })
          .then(onFechar, (e) => setErro(mensagemDeErro(e)))
      }}
    >
      <p className="text-sm text-muted-foreground">
        {nomeDoCaso}. Com a seleção editada, cole os dois links que a família vai
        receber. O ensaio vai para “Pronto para entrega” e aparece em Entregáveis
        para o ADM confirmar.
      </p>

      <CampoDeLink rotulo="Google Fotos do New Born" valor={google} onMudar={setGoogle} foco />
      <CampoDeLink rotulo="WeTransfer do New Born" valor={wetransfer} onMudar={setWetransfer} />
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
  onMudar: (v: string) => void
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
