import { useState } from 'react'
import { Dialogo } from '@/components/ui/Dialogo'
import { useAnotarEtapa } from '../api/useAcoes'
import { mensagemDeErro } from '../lib/erros'
import type { EtapaQuadro } from '../types'

/**
 * EXCLUIR O AVISO (21/09/2026, pedido do gestor).
 *
 * O banco sempre soube apagar — `anotar_etapa` com texto em branco limpa a
 * observação e grava `observacao_removida`, com o texto antigo no evento. A
 * única porta na tela era "Editar aviso" e apagar o texto à mão, e ninguém
 * adivinha isso: aviso cumprido ficava pulsando no card.
 *
 * Pergunta antes, porque o texto some da tela; o que ele dizia continua no
 * histórico do caso.
 */
export function DialogoExcluirAviso({
  etapa,
  nomeDaEtapa,
  onFechar,
}: {
  etapa: EtapaQuadro
  nomeDaEtapa: string
  onFechar: () => void
}) {
  const anotar = useAnotarEtapa()
  const [erro, setErro] = useState<string | null>(null)

  return (
    <Dialogo
      titulo="Excluir este aviso?"
      rotuloConfirmar="Excluir aviso"
      confirmarDestrutivo
      ocupado={anotar.isPending}
      erro={erro}
      onCancelar={onFechar}
      onConfirmar={() => {
        setErro(null)
        anotar
          .mutateAsync({ casoEtapaId: etapa.id, observacao: '' })
          .then(onFechar)
          .catch((e) => setErro(mensagemDeErro(e)))
      }}
    >
      <p className="rotulo-sobrescrito text-muted-foreground">{nomeDaEtapa}</p>
      <p className="text-sm whitespace-pre-line">{etapa.observacao}</p>
      <p className="text-sm text-muted-foreground">
        O aviso sai do card. O que ele dizia fica no histórico do caso.
      </p>
    </Dialogo>
  )
}
