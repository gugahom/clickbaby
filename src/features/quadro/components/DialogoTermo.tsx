import { useState } from 'react'
import { Dialogo } from '@/components/ui/Dialogo'
import { useRegistrarTermo } from '../api/useAcoes'
import { mensagemDeErro } from '../lib/erros'
import { termoSugerido } from '../lib/termo'
import type { CasoQuadro, TermoStatus } from '../types'
import { SeletorDeTermo } from './SeletorDeTermo'

/**
 * RESPONDER O TERMO FORA DA ENTREGA (22/09/2026, pedido do gestor).
 *
 * A pergunta nasce no diálogo de confirmar a entrega, que é onde a Morgana
 * está com o contrato em mãos. Este aqui é a outra porta, pelo menu do cartão,
 * e serve a duas coisas que a primeira não alcança: os casos que encerraram
 * ANTES desta pergunta existir, e a correção de um engano — o caso já está
 * encerrado quando a resposta é dada, e sem esta porta um erro ficaria trancado
 * para sempre (`registrar_termo` aceita caso em qualquer estado, justamente por
 * isso).
 */
export function DialogoTermo({
  caso,
  onFechar,
}: {
  caso: CasoQuadro
  onFechar: () => void
}) {
  const registrar = useRegistrarTermo()
  const [termo, setTermo] = useState<TermoStatus | null>(
    caso.termoStatus ?? termoSugerido(caso.pacoteSlug),
  )
  const [erro, setErro] = useState<string | null>(null)

  return (
    <Dialogo
      titulo="Termo de uso de imagem"
      rotuloConfirmar="Salvar"
      confirmarDesabilitado={termo === null || termo === caso.termoStatus}
      ocupado={registrar.isPending}
      erro={erro}
      onCancelar={onFechar}
      onConfirmar={() => {
        if (termo === null) return
        setErro(null)
        registrar
          .mutateAsync({ casoId: caso.id, termo })
          .then(onFechar)
          .catch((e) => setErro(mensagemDeErro(e)))
      }}
    >
      <p className="text-sm text-muted-foreground">
        {caso.maeNome}
        {caso.bebeNome ? ` · ${caso.bebeNome}` : ''}. A resposta fica no caso e
        no histórico — trocar depois não apaga a de hoje.
      </p>

      <SeletorDeTermo valor={termo} onEscolher={setTermo} />
    </Dialogo>
  )
}
