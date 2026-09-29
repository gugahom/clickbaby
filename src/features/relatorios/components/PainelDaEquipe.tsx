import type { ReactNode } from 'react'
import type {
  MetricaDaEquipe,
  MetricaPorEtapa,
  PrazoDaSemana,
  PrazoDoPeriodo,
} from '../api/useMetricas'
import {
  ETAPAS_DE_CAMPO,
  ORDEM_DAS_ETAPAS,
  formatarHoras,
  formatarPercentual,
  rotuloDaEtapa,
} from '../lib/metricas'
import { BarrasHorizontais } from './BarrasHorizontais'
import { BlocoIndicador } from './BlocoIndicador'
import { GraficoDePrazo } from './GraficoDePrazo'
import { Medidor } from './Medidor'

/**
 * O PAINEL DA EQUIPE — o mês inteiro, sem nome de ninguém.
 *
 * ABRE PELO PRAZO porque é o número mais confiável do banco e o que a empresa
 * vende: "entregou dentro do prazo?" (o plano, seção 6, já o chamava de
 * indicador central). Ele é o número-herói, o único da tela.
 *
 * A QUALIDADE DO REGISTRO ESTÁ AQUI, e não escondida nas fichas: é ela que diz
 * quanto dos outros números vale. Se metade das edições não teve relógio, a
 * mediana de tempo é a mediana da metade que teve — e a gestão precisa ver isso
 * antes de ler o tempo de alguém.
 */
export function PainelDaEquipe({
  prazo,
  semanas,
  equipe,
  porEtapa,
  inicioDoPeriodo,
}: {
  prazo: PrazoDoPeriodo
  semanas: PrazoDaSemana[]
  equipe: MetricaDaEquipe[]
  porEtapa: MetricaPorEtapa[]
  inicioDoPeriodo: string
}) {
  const totalConcluidas = equipe.reduce((acc, e) => acc + e.concluidas, 0)
  const pessoasNoPeriodo = new Set(porEtapa.map((m) => m.pessoaId)).size

  const porTipo = [...equipe].sort(
    (a, b) => ORDEM_DAS_ETAPAS.indexOf(a.tipo) - ORDEM_DAS_ETAPAS.indexOf(b.tipo),
  )

  // CONTAGENS SE SOMAM; medianas, não. Aqui só se soma contagem que o banco já
  // devolveu inteira — e a lista é por pessoa e tipo, nunca paginada.
  const edicao = porEtapa.filter((m) => !ETAPAS_DE_CAMPO.has(m.tipo))
  const edicoesConcluidas = edicao.reduce((acc, m) => acc + m.concluidas, 0)
  const edicoesMedidas = edicao.reduce((acc, m) => acc + m.medidas, 0)
  const porOutra = porEtapa.reduce((acc, m) => acc + m.concluidasPorOutra, 0)
  const emParalelo = porEtapa.reduce((acc, m) => acc + m.emParalelo, 0)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="col-span-2 lg:col-span-1">
          <BlocoIndicador
            destaque
            rotulo="Prazo cumprido"
            valor={formatarPercentual(prazo.noPrazo, prazo.enviados)}
            detalhe={
              prazo.enviados === 0
                ? 'Nenhum caso enviado neste período'
                : `${prazo.noPrazo} de ${prazo.enviados} casos enviados antes de vencer`
            }
            alerta={prazo.enviados > 0 && prazo.noPrazo / prazo.enviados < 0.8}
          />
        </div>
        <BlocoIndicador
          rotulo="Do parto ao envio"
          valor={formatarHoras(prazo.medianaHorasAteEnvio)}
          detalhe="mediana, até o envio para Entregáveis"
        />
        <BlocoIndicador
          rotulo="Esperando o ADM"
          valor={formatarHoras(prazo.medianaHorasAteConfirmacao)}
          detalhe="mediana, do envio à confirmação"
        />
        <BlocoIndicador
          rotulo="Etapas concluídas"
          valor={totalConcluidas.toLocaleString('pt-BR')}
          detalhe={`por ${pessoasNoPeriodo} ${pessoasNoPeriodo === 1 ? 'pessoa' : 'pessoas'}`}
        />
      </div>

      <Cartao titulo="Prazo por semana" subtitulo="Casos enviados para Entregáveis, pela semana do envio">
        <GraficoDePrazo semanas={semanas} inicioDoPeriodo={inicioDoPeriodo} />
      </Cartao>

      <div className="grid gap-4 lg:grid-cols-2">
        <Cartao titulo="O que a equipe fez" subtitulo="Etapas concluídas no período, por tipo">
          <BarrasHorizontais
            barras={porTipo.map((e) => ({
              chave: e.tipo,
              rotulo: rotuloDaEtapa(e.tipo),
              valor: e.concluidas,
              detalhe: `${e.medidas} com relógio · ${e.pessoas} ${e.pessoas === 1 ? 'pessoa' : 'pessoas'}`,
            }))}
            vazio="Nenhuma etapa concluída neste período."
          />
        </Cartao>

        <Cartao
          titulo="Qualidade do registro"
          subtitulo="Quanto dos outros números dá para levar a sério"
        >
          <div className="space-y-5">
            <Medidor
              rotulo="Edições com relógio aberto"
              parte={edicoesMedidas}
              todo={edicoesConcluidas}
              explicacao="Edição concluída com menos de 5 minutos de relógio é contada, mas fica fora do tempo: play e concluir juntos não medem trabalho."
            />
            <Medidor
              rotulo="Etapas registradas pela própria pessoa"
              parte={totalConcluidas - porOutra}
              todo={totalConcluidas}
              explicacao="O resto foi concluído por outra conta, no lugar de quem fez. O crédito continua de quem fez — isto mostra só o hábito."
            />
            {emParalelo > 0 && (
              <p className="rounded-xl bg-atencao/12 px-3 py-2 text-xs text-atencao-tinta">
                <strong>{emParalelo}</strong> {emParalelo === 1 ? 'etapa de campo aparece' : 'etapas de campo aparecem'}{' '}
                em paralelo com outra da mesma pessoa, em outro caso. Duas mães na mesma maternidade
                explicam algumas; muitas na mesma conta costumam ser registro feito em nome de quem não
                estava na sala.
              </p>
            )}
          </div>
        </Cartao>
      </div>
    </div>
  )
}

export function Cartao({
  titulo,
  subtitulo,
  acao,
  children,
}: {
  titulo: string
  subtitulo?: string | undefined
  acao?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="rounded-painel border border-border bg-card p-4">
      <header className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold tracking-tight text-foreground">{titulo}</h2>
          {subtitulo && <p className="text-xs text-muted-foreground">{subtitulo}</p>}
        </div>
        {acao}
      </header>
      {children}
    </section>
  )
}
