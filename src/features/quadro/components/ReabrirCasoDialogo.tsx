import { useState } from 'react'
import clsx from 'clsx'
import { Dialogo } from '@/components/ui/Dialogo'
import type { EtapaTipo } from '../api/useAcoes'
import { ROTULO_ETAPA, type CasoQuadro, type EtapaQuadro } from '../types'

interface PropsReabrirCasoDialogo {
  caso: CasoQuadro
  /** As etapas que o caso já teve — é delas que sai o que se pode refazer. */
  etapas: EtapaQuadro[]
  ocupado: boolean
  erro: string | null
  onCancelar: () => void
  onConfirmar: (motivo: string, etapas: EtapaTipo[]) => void
}

/**
 * Trazer de volta um caso entregue.
 *
 * O CENÁRIO, do gestor: "o cliente pede depois de entregue pra fazer alteração
 * no vídeo, alteração de foto. Só que o atendimento já foi encerrado. Como é
 * que faz nesse caso?" Até aqui não fazia — o trabalho acontecia fora do
 * sistema, que é onde ele deixa de ser medido.
 *
 * DUAS PERGUNTAS, NESTA ORDEM: o que a família pediu, e o que precisa ser
 * refeito. O motivo primeiro porque é ele que responde a segunda: quem lê
 * "quer todas as fotos em preto e branco" já sabe que marcar é a edição de
 * fotos.
 *
 * SÓ AS ETAPAS DE EDIÇÃO aparecem. Um pedido de alteração pós-entrega é sempre
 * sobre o material entregue; nascimento e banho não acontecem de novo, e
 * oferecê-los convidaria a marcar por engano uma etapa que ninguém consegue
 * executar — o caso ficaria aberto para sempre esperando um parto que já foi.
 */
export function ReabrirCasoDialogo({
  caso,
  etapas,
  ocupado,
  erro,
  onCancelar,
  onConfirmar,
}: PropsReabrirCasoDialogo) {
  const [motivo, setMotivo] = useState('')
  const [marcadas, setMarcadas] = useState<EtapaTipo[]>([])

  // O que este caso pode refazer: os tipos de edição que ele de fato tem.
  // Sai das etapas existentes e não de uma lista fixa, então um BASIC não
  // oferece vídeo e um MASTER oferece — sem o código saber o que é um MASTER.
  const disponiveis = [...new Set(etapas.filter((e) => e.trilha === 'edicao').map((e) => e.tipo))]

  const semMotivo = motivo.trim() === ''
  const semEtapa = marcadas.length === 0

  function alternar(tipo: EtapaTipo) {
    setMarcadas((atual) =>
      atual.includes(tipo) ? atual.filter((t) => t !== tipo) : [...atual, tipo],
    )
  }

  const titulo = caso.bebeNome ? `${caso.maeNome} · ${caso.bebeNome}` : caso.maeNome

  return (
    <Dialogo
      titulo={`Reabrir ${titulo}`}
      rotuloConfirmar="Reabrir caso"
      ocupado={ocupado}
      erro={erro}
      confirmarDesabilitado={semMotivo || semEtapa}
      onConfirmar={() => onConfirmar(motivo, marcadas)}
      onCancelar={onCancelar}
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          O caso volta para o Quadro com as etapas marcadas como trabalho novo.
          O que já foi entregue continua registrado — nada é apagado.
        </p>

        <label className="block">
          <span className="text-sm font-medium">O que a família pediu</span>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            placeholder="Quer todas as fotos em preto e branco"
            className="mt-1.5 w-full rounded-md border border-border bg-background/60 px-3 py-2 text-base transition-colors focus:border-marca focus:bg-card"
          />
          <span className="mt-1 block text-xs text-muted-foreground">
            Vira o aviso de cada etapa criada — é o que a editora vai ler.
          </span>
        </label>

        <fieldset>
          <legend className="text-sm font-medium">O que precisa ser refeito</legend>

          {disponiveis.length === 0 ? (
            <p className="mt-1.5 text-sm text-atrasado">
              Este caso não tem etapa de edição registrada, então não há o que
              refazer por aqui.
            </p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-2">
              {disponiveis.map((tipo) => {
                const ativa = marcadas.includes(tipo)
                return (
                  <button
                    key={tipo}
                    type="button"
                    onClick={() => alternar(tipo)}
                    aria-pressed={ativa}
                    /* Chip e não checkbox: alvo de 44px, alcançável com o
                       polegar, e o estado se lê pela cor a um metro de
                       distância. Seção 6 do CLAUDE.md. */
                    className={clsx(
                      'h-11 rounded-full border px-4 text-sm font-medium transition-colors',
                      ativa
                        ? 'border-marca bg-marca text-white'
                        : 'border-border bg-card text-muted-foreground hover:border-marca hover:text-marca',
                    )}
                  >
                    {ROTULO_ETAPA[tipo]}
                  </button>
                )
              })}
            </div>
          )}
        </fieldset>

        {/* O prazo é a consequência menos óbvia da reabertura, e a que mais
            afeta a fila. Dizer aqui evita a descoberta na tela seguinte. */}
        <p className="rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
          O prazo recomeça agora: a revisão vence pelo prazo do pacote contado
          da reabertura, e entra na fila de edição pela urgência dele.
        </p>
      </div>
    </Dialogo>
  )
}
