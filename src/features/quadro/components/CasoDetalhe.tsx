import clsx from 'clsx'
import { formatarDataHora } from '@/lib/formato'
import { AcoesDoCaso } from './AcoesDoCaso'
import type { EstadoSla } from '../lib/sla'
import {
  ROTULO_ETAPA,
  ROTULO_SITUACAO,
  ROTULO_STATUS_ETAPA,
  type CasoQuadro,
  type EtapaQuadro,
} from '../types'

interface PropsCasoDetalhe {
  caso: CasoQuadro
  etapas: EtapaQuadro[]
  sla: EstadoSla
}

/**
 * Painel que expande no lugar: observações -> histórico de etapas -> ações,
 * estrutura herdada da referência da v0.
 *
 * O histórico e as ações são listas separadas de propósito. O histórico
 * responde "o que já aconteceu" (inclui etapa concluída, com responsável e
 * horário); as ações respondem "o que dá para fazer agora" e escondem o que já
 * terminou. Juntar as duas faria a linha de uma etapa concluída carregar botões
 * mortos — caro no mobile, onde o espaço é o recurso escasso.
 */
export function CasoDetalhe({ caso, etapas, sla }: PropsCasoDetalhe) {
  return (
    <div className="space-y-4 border-t border-border/60 bg-muted/25 px-3 py-4 md:px-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Campo rotulo="Situação clínica" valor={ROTULO_SITUACAO[caso.situacaoClinica]} />
        <Campo rotulo="Maternidade" valor={caso.maternidadeNome ?? '—'} />
        <Campo rotulo="Pacote" valor={caso.pacoteNome ?? '—'} />
        <Campo
          rotulo="Prazo de entrega"
          valor={sla.rotulo ?? 'Não iniciado'}
          detalhe={sla.detalhe}
        />
      </div>

      {caso.observacao && (
        <section>
          <TituloSecao>Observações</TituloSecao>
          <p className="text-sm whitespace-pre-line">{caso.observacao}</p>
        </section>
      )}

      <section>
        <TituloSecao>Histórico de etapas</TituloSecao>
        {etapas.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {caso.faltaPacote
              ? 'Sem pacote definido — as etapas são geradas quando o pacote for confirmado.'
              : 'Nenhuma etapa gerada.'}
          </p>
        ) : (
          <ul className="space-y-1">
            {etapas.map((etapa) => (
              <li
                key={etapa.id}
                className="flex flex-wrap items-center gap-2 rounded bg-background/60 px-2 py-2 text-sm"
              >
                <span
                  className={clsx('size-2 flex-shrink-0 rounded-full', pontoEtapa(etapa))}
                  aria-hidden="true"
                />
                <span className="flex-1 font-medium">{ROTULO_ETAPA[etapa.tipo]}</span>
                {etapa.responsavelNome && (
                  <span className="text-xs text-muted-foreground">
                    {etapa.responsavelNome}
                  </span>
                )}
                {etapa.estacao && (
                  <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                    {etapa.estacao}
                  </span>
                )}
                {etapa.concluidoEm && (
                  <span className="text-xs text-muted-foreground">
                    {formatarDataHora(etapa.concluidoEm)}
                  </span>
                )}
                <span className="text-xs text-muted-foreground">
                  {ROTULO_STATUS_ETAPA[etapa.status]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <TituloSecao>Ações</TituloSecao>
        <AcoesDoCaso caso={caso} etapas={etapas} />
      </section>

    </div>
  )
}

function TituloSecao({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
      {children}
    </h4>
  )
}

function Campo({
  rotulo,
  valor,
  detalhe,
}: {
  rotulo: string
  valor: string
  detalhe?: string
}) {
  return (
    <div>
      <div className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {rotulo}
      </div>
      <div className="text-sm">{valor}</div>
      {detalhe && <div className="mt-0.5 text-xs text-muted-foreground">{detalhe}</div>}
    </div>
  )
}

function pontoEtapa(etapa: EtapaQuadro): string {
  switch (etapa.status) {
    case 'concluida':
      return 'bg-concluido'
    case 'em_andamento':
      return 'bg-andamento'
    case 'atribuida':
      return 'bg-muted-foreground'
    default:
      return 'bg-muted-foreground/30'
  }
}
