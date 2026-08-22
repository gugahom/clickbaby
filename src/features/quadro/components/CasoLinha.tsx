import { useId, useState } from 'react'
import clsx from 'clsx'
import { Chevron } from '@/components/ui/icones'
import { formatarHora } from '@/lib/formato'
import { corDoCaso } from '../lib/cores-calendar'
import { CLASSE_URGENCIA, estadoSla } from '../lib/sla'
import { useRelogioDeMinuto } from '../lib/useRelogio'
import { ROTULO_ETAPA, type CasoQuadro, type EtapaQuadro } from '../types'
import { CasoDetalhe } from './CasoDetalhe'

interface PropsCasoLinha {
  caso: CasoQuadro
  etapas: EtapaQuadro[]
}

export function CasoLinha({ caso, etapas }: PropsCasoLinha) {
  const [aberto, setAberto] = useState(false)
  const idPainel = useId()
  const idCabecalho = useId()

  // O relógio faz o rótulo do SLA andar sozinho: sem ele, um caso aberto na
  // tela mostraria o prazo congelado no instante em que carregou.
  const agora = useRelogioDeMinuto()
  const sla = estadoSla(caso, agora)
  const cor = corDoCaso(caso.corCalendar)
  const hora = formatarHora(caso.previsaoEm)
  const etapaAtual = etapas.find((e) => e.status === 'em_andamento')
  const concluidas = etapas.filter((e) => e.status === 'concluida').length

  const titulo = caso.bebeNome ? `${caso.maeNome} · ${caso.bebeNome}` : caso.maeNome

  return (
    <div
      className={clsx(
        'border-b border-border last:border-b-0',
        caso.ehRascunho && 'bg-rascunho-fundo/30',
        caso.ehTerminal && 'opacity-60',
      )}
    >
      {/*
        Cabeçalho clicável + painel IRMÃO, não painel dentro do botão. A
        referência da v0 envolvia a linha inteira num <button> e depois
        renderizava outros <button> lá dentro (HTML inválido) — quebraria
        assim que as ações da próxima fatia chegassem.
      */}
      <button
        type="button"
        id={idCabecalho}
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        aria-controls={idPainel}
        className="w-full px-3 py-3 text-left transition-colors hover:bg-muted/40 md:px-4"
      >
        <div className="flex items-stretch gap-3 md:gap-4">
          {/* Barra de cor herdada do Calendar. items-stretch faz ela acompanhar
              a altura da linha sozinha. */}
          <div
            className="w-1 flex-shrink-0 rounded-sm"
            style={{ backgroundColor: cor }}
            aria-hidden="true"
          />

          <div className="min-w-0 flex-1">
            <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between md:gap-4">
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-[15px] font-semibold md:text-base">
                  {hora && (
                    <span className="mr-2 font-mono text-sm text-muted-foreground">
                      {hora}
                    </span>
                  )}
                  {titulo}
                </h3>

                <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  {caso.pacoteNome ? (
                    <span className="font-medium text-foreground">{caso.pacoteNome}</span>
                  ) : (
                    <span className="text-rascunho">sem pacote</span>
                  )}
                  {caso.maternidadeSigla ? (
                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                      {caso.maternidadeSigla}
                    </span>
                  ) : (
                    <span className="text-rascunho">sem maternidade</span>
                  )}
                  {caso.ehRascunho && <BadgeRascunho />}
                  {caso.ehTerminal && (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs uppercase">
                      {caso.statusOperacional}
                    </span>
                  )}
                </div>
              </div>

              {sla.rotulo && (
                <span
                  className={clsx(
                    'hidden flex-shrink-0 text-sm md:inline',
                    CLASSE_URGENCIA[sla.urgencia],
                  )}
                >
                  {sla.rotulo}
                </span>
              )}
            </div>

            {/* Trilha de etapas: inline no desktop, resumida no mobile.
                Rascunho não tem etapas — nada de "0/0". */}
            {etapas.length > 0 && (
              <div className="mt-2">
                <div className="hidden flex-wrap items-center gap-x-1.5 gap-y-1 text-sm md:flex">
                  {etapas.map((etapa, i) => (
                    <span key={etapa.id} className="flex items-center gap-1.5">
                      <span className={classeEtapa(etapa)}>{ROTULO_ETAPA[etapa.tipo]}</span>
                      {i < etapas.length - 1 && (
                        <span className="text-border" aria-hidden="true">
                          ·
                        </span>
                      )}
                    </span>
                  ))}
                </div>

                <div className="flex items-center justify-between text-sm md:hidden">
                  <span className="text-muted-foreground">
                    {etapaAtual ? ROTULO_ETAPA[etapaAtual.tipo] : 'Não iniciado'} ·{' '}
                    {concluidas}/{etapas.length}
                  </span>
                  {sla.rotulo && (
                    <span className={CLASSE_URGENCIA[sla.urgencia]}>{sla.rotulo}</span>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-shrink-0 items-center">
            {/* Chevron aponta para BAIXO quando fechado (abre para baixo) e para
                CIMA quando aberto. A referência tinha isto invertido. */}
            <Chevron
              className={clsx(
                'size-5 text-muted-foreground transition-transform',
                aberto && 'rotate-180',
              )}
            />
          </div>
        </div>
      </button>

      <div id={idPainel} role="region" aria-labelledby={idCabecalho} hidden={!aberto}>
        {aberto && <CasoDetalhe caso={caso} etapas={etapas} sla={sla} />}
      </div>
    </div>
  )
}

function classeEtapa(etapa: EtapaQuadro): string {
  switch (etapa.status) {
    case 'concluida':
      return 'text-concluido font-medium'
    case 'em_andamento':
      return 'text-andamento font-bold'
    case 'dispensada':
      return 'text-muted-foreground line-through'
    default:
      return 'text-muted-foreground'
  }
}

export function BadgeRascunho() {
  return (
    <span className="rounded border border-rascunho-borda bg-rascunho-fundo px-1.5 py-0.5 text-xs font-medium text-rascunho">
      rascunho
    </span>
  )
}
