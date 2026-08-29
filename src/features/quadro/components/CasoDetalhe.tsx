import { AcoesDoCaso } from './AcoesDoCaso'
import { JanelaDeEntrega } from './JanelaDeEntrega'
import { HistoricoDoCaso } from './HistoricoDoCaso'
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

      {/* Antes das etapas de propósito: a janela responde "quanto tempo eu
          tenho e onde o trabalho caiu dentro dele", que é o enquadramento de
          tudo que vem depois. Depois da lista, ela viraria um resumo do que já
          foi lido. */}
      <JanelaDeEntrega caso={caso} />

      <section>
        <TituloSecao>Etapas</TituloSecao>
        <AcoesDoCaso caso={caso} etapas={etapas} />
      </section>

      {/* Por último de propósito: as etapas respondem "o que fazer agora", que é
          a pergunta de quem abre o card no corredor. O histórico responde "o
          que já aconteceu", que se consulta, não se opera. */}
      <section>
        <TituloSecao>Histórico</TituloSecao>
        <HistoricoDoCaso casoId={caso.id} />
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
      <div className="rotulo-sobrescrito text-muted-foreground">{rotulo}</div>
      {/* NEGRITO no valor.
      
          Rótulo e valor tinham pesos parecidos, e a grade de quatro colunas
          virava oito linhas de texto com a mesma voz. O peso separa o que é
          etiqueta do que é dado — e aqui o dado é o que se procura. */}
      <div className="mt-0.5 text-sm font-bold tracking-tight">{valor}</div>
      {detalhe && <div className="mt-0.5 text-xs text-muted-foreground">{detalhe}</div>}
    </div>
  )
}
