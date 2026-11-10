import { useState } from 'react'
import { Dialogo } from '@/components/ui/Dialogo'
import { formatarDataHora, hojeNoFuso } from '@/lib/formato'
import { useDevolverParaAgenda } from '../api/useAcoes'
import { mensagemDeErro } from '../lib/erros'
import type { CasoQuadro, EtapaQuadro } from '../types'

/** O dia seguinte a 'YYYY-MM-DD', no mesmo formato — o mínimo do campo. */
function diaSeguinte(dia: string): string {
  const [ano, mes, d] = dia.split('-').map(Number)
  return new Date(Date.UTC(ano!, mes! - 1, d! + 1)).toISOString().slice(0, 10)
}

/**
 * VOLTAR PARA A AGENDA (10/11/2026, pedido do gestor). O bebê não nasceu no
 * dia: a mãe foi para casa e volta outro dia. O caso muda de dia e leva tudo
 * junto — ver `devolver_para_a_agenda`. Hora em branco é "hora a definir", como
 * no Calendário.
 */
export function DialogoVoltarParaAgenda({
  caso,
  etapas,
  onFechar,
}: {
  caso: CasoQuadro
  etapas: EtapaQuadro[]
  onFechar: () => void
}) {
  const devolver = useDevolverParaAgenda()
  const [dia, setDia] = useState('')
  const [hora, setHora] = useState('')
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  const entradaFeita = etapas.some((e) => e.tipo === 'entrada' && e.status === 'concluida')
  const rodando = etapas.some((e) => e.status === 'em_andamento')

  return (
    <Dialogo
      titulo="Voltar para a agenda"
      rotuloConfirmar={devolver.isPending ? 'Salvando…' : 'Voltar para a agenda'}
      confirmarDesabilitado={dia === ''}
      ocupado={devolver.isPending}
      erro={erro}
      onCancelar={onFechar}
      onConfirmar={() => {
        setErro(null)
        devolver
          .mutateAsync({
            casoId: caso.id,
            // Com o fuso de Brasília explícito: sem ele, o fuso do aparelho
            // decidiria o dia. Sem hora, o banco guarda a meia-noite do dia.
            previsaoEm: `${dia}T${hora || '00:00'}:00-03:00`,
            semHora: hora === '',
            ...(motivo.trim() ? { motivo: motivo.trim() } : {}),
          })
          .then(onFechar, (e) => setErro(mensagemDeErro(e)))
      }}
    >
      <p className="text-sm text-muted-foreground">
        {caso.maeNome}
        {caso.bebeNome ? ` · ${caso.bebeNome}` : ''}
        {caso.previsaoEm ? `, marcado para ${formatarDataHora(caso.previsaoEm)}` : ''}. O caso sai do Quadro e
        volta na véspera do dia novo, com tudo o que já tem: despesas, links e histórico. O Google acompanha.
      </p>
      {(entradaFeita || rodando) && (
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {entradaFeita && <li>A entrada volta para ser feita de novo no dia novo.</li>}
          {rodando && <li>O que está em andamento pausa: os dias em casa não contam no relógio.</li>}
        </ul>
      )}
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-sm font-medium">Novo dia</span>
          <input
            type="date"
            autoFocus
            value={dia}
            min={diaSeguinte(hojeNoFuso())}
            onChange={(e) => setDia(e.target.value)}
            className="mt-1.5 min-h-12 w-full rounded-md border border-border bg-background px-3 text-base tabular-nums"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">
            Hora <span className="font-normal text-muted-foreground">(ou a definir)</span>
          </span>
          <input
            type="time"
            value={hora}
            onChange={(e) => setHora(e.target.value)}
            className="mt-1.5 min-h-12 w-full rounded-md border border-border bg-background px-3 text-base tabular-nums"
          />
        </label>
      </div>
      <label className="block">
        <span className="text-sm font-medium">
          Motivo <span className="font-normal text-muted-foreground">(opcional)</span>
        </span>
        <input
          type="text"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="ex.: mandada para casa, volta na semana que vem"
          className="mt-1.5 min-h-11 w-full rounded-md border border-border bg-background px-3 text-base"
        />
      </label>
    </Dialogo>
  )
}
