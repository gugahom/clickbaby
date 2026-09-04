import { useState } from 'react'
import { Dialogo } from '@/components/ui/Dialogo'
import { CampoTexto } from '@/components/ui/CampoTexto'
import { useEntregaveis, type TipoEntregavel } from '../api/useAcoes'
import type { LinkExigido } from '../lib/links-da-conclusao'
import { ROTULO_ETAPA, type CasoQuadro, type EtapaQuadro } from '../types'

interface PropsConcluirComLinks {
  caso: CasoQuadro
  etapa: EtapaQuadro
  exigidos: LinkExigido[]
  ocupado: boolean
  erro: string | null
  onCancelar: () => void
  onConfirmar: (
    entregaveis: { tipo: TipoEntregavel; url: string }[],
    observacao: string,
  ) => void
}

/**
 * Concluir a etapa de edição PEDINDO o link no mesmo gesto.
 *
 * Regra do gestor em 04/09/2026: o link é pedido na conclusão da edição, e não
 * só no encerramento do caso. O motivo é operacional — quem acabou de editar
 * tem o link na mão; quem encerra o caso dias depois vai atrás dele.
 *
 * ISTO CUSTA TOQUES, e a seção 6 do CLAUDE.md diz que concluir sai em até três.
 * A conta fecha porque a etapa de edição não acontece no corredor: ela é feita
 * sentada, numa estação, com teclado — que é justamente onde colar um link é
 * barato. Nenhuma etapa de CAMPO passa por aqui; o botão delas continua sendo
 * um toque.
 *
 * O CAMPO JÁ VEM PREENCHIDO com o link daquele tipo que o caso já tem, quando
 * tem. A rodada 2 da edição de fotos entrega o mesmo álbum do Google da rodada
 * 1, e obrigar a recolar o mesmo endereço é como se pede para alguém colar
 * qualquer coisa só para destravar a tela. A RPC ignora link idêntico repetido,
 * então reaproveitar não suja a lista da família.
 */
export function DialogoConcluirComLinks({
  caso,
  etapa,
  exigidos,
  ocupado,
  erro,
  onCancelar,
  onConfirmar,
}: PropsConcluirComLinks) {
  const { data: registrados } = useEntregaveis(caso.id, true)
  const [digitados, setDigitados] = useState<Record<string, string>>({})
  const [observacao, setObservacao] = useState('')

  /** O último link daquele tipo que o caso já tem — a sugestão do campo. */
  function sugestao(tipo: TipoEntregavel): string {
    const doTipo = (registrados ?? []).filter((l) => l.tipo === tipo)
    return doTipo.at(-1)?.url ?? ''
  }

  // Derivado, não copiado para o estado num efeito: enquanto ninguém digitou
  // nada naquele campo, ele mostra a sugestão; assim que digita — inclusive
  // apagando tudo —, o que vale é o que a pessoa escreveu.
  function valor(tipo: TipoEntregavel): string {
    return digitados[tipo] ?? sugestao(tipo)
  }

  const completo = exigidos.every((link) => valor(link.tipo).trim() !== '')

  return (
    <Dialogo
      titulo={`Concluir ${ROTULO_ETAPA[etapa.tipo]}`}
      rotuloConfirmar="Concluir etapa"
      confirmarDesabilitado={!completo}
      ocupado={ocupado}
      erro={erro}
      onCancelar={onCancelar}
      onConfirmar={() =>
        onConfirmar(
          exigidos.map((link) => ({ tipo: link.tipo, url: valor(link.tipo).trim() })),
          observacao.trim(),
        )
      }
    >
      <p className="text-sm text-muted-foreground">
        {exigidos.length > 1
          ? 'Os links entram junto com a conclusão — a etapa não fecha sem eles.'
          : 'O link entra junto com a conclusão — a etapa não fecha sem ele.'}
      </p>

      {exigidos.map((link) => (
        <CampoTexto
          key={link.tipo}
          rotulo={link.rotulo}
          valor={valor(link.tipo)}
          aoMudar={(v) => setDigitados((atual) => ({ ...atual, [link.tipo]: v }))}
          type="url"
          inputMode="url"
          placeholder="https://"
          {...(link.dica ? { ajuda: link.dica } : {})}
        />
      ))}

      <label className="block">
        <span className="text-sm font-medium">
          Observação
          <span className="ml-1 text-xs text-muted-foreground">(opcional)</span>
        </span>
        <textarea
          rows={2}
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          placeholder="ex.: mãe pediu fotos com a avó"
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-base"
        />
      </label>
    </Dialogo>
  )
}
