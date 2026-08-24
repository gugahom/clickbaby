import { AcoesDoCaso } from './AcoesDoCaso'
import type { EstadoSla } from '../lib/sla'
import { ROTULO_SITUACAO, type CasoQuadro, type EtapaQuadro } from '../types'

interface PropsCasoDetalhe {
  caso: CasoQuadro
  etapas: EtapaQuadro[]
  sla: EstadoSla
}

/**
 * Painel que expande no lugar: dados do caso -> observações -> etapas.
 *
 * Antes havia duas listas de etapa: "Histórico" (só leitura) e "Ações" (só
 * botões), com os mesmos nomes repetidos. Viraram uma só — o estado de cada
 * etapa e o que dá para fazer com ela moram na mesma linha, em AcoesDoCaso.
 * A duplicação custava metade da altura do card e obrigava a pessoa a casar
 * nome numa lista com nome na outra.
 */
export function CasoDetalhe({ caso, etapas, sla }: PropsCasoDetalhe) {
  return (
    <div className="space-y-4 border-t border-border bg-background px-3 py-4 md:px-4">
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
        <TituloSecao>Etapas</TituloSecao>
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
