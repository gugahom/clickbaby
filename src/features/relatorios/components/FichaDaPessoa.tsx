import { Dropdown } from '@/components/ui/Dropdown'
import type { MetricaDaEquipe, MetricaPorEtapa, MetricaPorPessoa, PadraoDeTempo } from '../api/useMetricas'
import {
  ETAPAS_COM_PRAZO,
  ETAPAS_DE_CAMPO,
  ORDEM_DAS_ETAPAS,
  formatarPercentual,
  primeiroNome,
  rotuloDaEtapa,
} from '../lib/metricas'
import { BarrasHorizontais } from './BarrasHorizontais'
import { BlocoIndicador } from './BlocoIndicador'
import { FaixaDaEquipe } from './FaixaDaEquipe'
import { Medidor } from './Medidor'
import { Cartao } from './PainelDaEquipe'

/**
 * A FICHA DE UMA PESSOA — o mês dela, lido contra a equipe.
 *
 * Quatro perguntas, na ordem em que a gestão as faz:
 *   1. Quanto fez? (os blocos e as barras por tipo)
 *   2. No tempo normal da equipe? (ponto sobre faixa, tipo por tipo)
 *   3. Dá para confiar nesses números? (a qualidade do registro DELA)
 *   4. O que fez que não é etapa? (passagens, material, coordenação, ADM)
 *
 * A TERCEIRA É O QUE SEPARA MÉTRICA DE PALPITE. Uma mediana de edição
 * calculada sobre 3 de 20 edições medidas não diz quanto a pessoa demora; diz
 * que ela quase não abre o relógio. A ficha mostra as duas coisas lado a lado,
 * para ninguém ler a primeira sem a segunda.
 */
export function FichaDaPessoa({
  pessoaId,
  onTrocarPessoa,
  pessoas,
  porEtapa,
  equipe,
  padroes,
}: {
  pessoaId: string | null
  onTrocarPessoa: (pessoaId: string) => void
  pessoas: MetricaPorPessoa[]
  porEtapa: MetricaPorEtapa[]
  equipe: MetricaDaEquipe[]
  padroes: PadraoDeTempo[]
}) {
  // No seletor, quem teve alguma coisa no período vem primeiro; quem está
  // ativo e zerado continua escolhível — "não registrou nada" é informação.
  const comAlgo = (p: MetricaPorPessoa) => porEtapa.some((m) => m.pessoaId === p.pessoaId) || p.diasComTrabalho > 0
  const ordenadas = [...pessoas].sort(
    (a, b) => Number(comAlgo(b)) - Number(comAlgo(a)) || a.nome.localeCompare(b.nome),
  )
  const pessoa = pessoas.find((p) => p.pessoaId === pessoaId) ?? ordenadas[0]

  const seletor = (
    <Dropdown
      buscavel
      alinhamento="direita"
      rotulo="Escolher pessoa"
      selecionado={pessoa?.pessoaId}
      onEscolher={(item) => onTrocarPessoa(item.id)}
      itens={ordenadas.map((p) => ({
        id: p.pessoaId,
        rotulo: comAlgo(p) ? p.nome : `${p.nome} (nada no período)`,
      }))}
    />
  )

  if (!pessoa) {
    return (
      <Cartao titulo="Ficha individual">
        <p className="py-6 text-center text-sm text-muted-foreground">Ninguém para mostrar neste período.</p>
      </Cartao>
    )
  }

  const dela = porEtapa
    .filter((m) => m.pessoaId === pessoa.pessoaId)
    .sort((a, b) => ORDEM_DAS_ETAPAS.indexOf(a.tipo) - ORDEM_DAS_ETAPAS.indexOf(b.tipo))

  const concluidas = dela.reduce((acc, m) => acc + m.concluidas, 0)
  const porOutra = dela.reduce((acc, m) => acc + m.concluidasPorOutra, 0)
  const emParalelo = dela.reduce((acc, m) => acc + m.emParalelo, 0)
  const comPrazo = dela.filter((m) => ETAPAS_COM_PRAZO.has(m.tipo))
  const prazoTotal = comPrazo.reduce((acc, m) => acc + m.comPrazo, 0)
  const prazoOk = comPrazo.reduce((acc, m) => acc + m.noPrazo, 0)
  const edicoes = dela.filter((m) => !ETAPAS_DE_CAMPO.has(m.tipo))
  const edicoesFeitas = edicoes.reduce((acc, m) => acc + m.concluidas, 0)
  const edicoesMedidas = edicoes.reduce((acc, m) => acc + m.medidas, 0)
  const padraoDe = new Map(padroes.map((p) => [p.tipo, p.minutos]))
  const nome = primeiroNome(pessoa.nome)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight text-foreground">{pessoa.nome}</h2>
          {!pessoa.ativo && <p className="text-xs text-muted-foreground">Cadastro desativado</p>}
        </div>
        {seletor}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <BlocoIndicador rotulo="Etapas concluídas" valor={concluidas} />
        <BlocoIndicador rotulo="Dias com trabalho" valor={pessoa.diasComTrabalho} />
        <BlocoIndicador
          rotulo="Fotos e reels no prazo"
          valor={formatarPercentual(prazoOk, prazoTotal)}
          detalhe={prazoTotal === 0 ? 'nenhuma edição com prazo' : `${prazoOk} de ${prazoTotal}`}
        />
        <BlocoIndicador
          rotulo="Voltou para ajuste"
          valor={pessoa.voltouParaAjuste}
          detalhe="casos reabertos e etapas que voltaram"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Cartao titulo="O que fez" subtitulo="Etapas concluídas, por tipo">
          <BarrasHorizontais
            barras={dela.map((m) => ({
              chave: m.tipo,
              rotulo: rotuloDaEtapa(m.tipo),
              valor: m.concluidas,
              detalhe: `${m.medidas} com relógio`,
            }))}
            vazio={`${nome} não concluiu nenhuma etapa neste período.`}
          />
        </Cartao>

        <Cartao titulo="Qualidade do registro" subtitulo="Quanto dos números desta ficha dá para levar a sério">
          <div className="space-y-5">
            <Medidor
              rotulo="Edições com relógio aberto"
              parte={edicoesMedidas}
              todo={edicoesFeitas}
              explicacao="Abaixo de 5 minutos de relógio a edição conta no volume e fica fora do tempo."
            />
            <Medidor
              rotulo="Registrou o próprio trabalho"
              parte={concluidas - porOutra}
              todo={concluidas}
              explicacao="O restante foi concluído por outra conta. O crédito continua sendo desta ficha."
            />
            {emParalelo > 0 && (
              <p className="rounded-xl bg-atencao/12 px-3 py-2 text-xs text-atencao-tinta">
                <strong>{emParalelo}</strong>{' '}
                {emParalelo === 1 ? 'etapa de campo se cruza' : 'etapas de campo se cruzam'} no tempo com
                outra desta mesma ficha, em outro caso. Vale conferir quem estava na sala.
              </p>
            )}
          </div>
        </Cartao>
      </div>

      <Cartao titulo="Tempo, comparado à equipe" subtitulo="Mediana das etapas com relógio aberto, tipo por tipo">
        <FaixaDaEquipe
          nome={nome}
          linhas={dela.map((m) => {
            const e = equipe.find((x) => x.tipo === m.tipo)
            return {
              chave: m.tipo,
              rotulo: rotuloDaEtapa(m.tipo),
              pessoa: m.medianaMin,
              medidas: m.medidas,
              concluidas: m.concluidas,
              equipeMediana: e?.medianaMin ?? null,
              equipeP25: e?.p25Min ?? null,
              equipeP75: e?.p75Min ?? null,
              padrao: padraoDe.get(m.tipo) ?? null,
            }
          })}
        />
      </Cartao>

      <Cartao titulo="Além das etapas" subtitulo="O trabalho que o card anota e que nunca foi etapa">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
          <Numero rotulo="Passou etapa" valor={pessoa.passagensDadas} />
          <Numero rotulo="Recebeu etapa" valor={pessoa.passagensRecebidas} />
          <Numero rotulo="Baixou material" valor={pessoa.materialBaixou} />
          <Numero rotulo="Subiu material" valor={pessoa.materialSubiu} />
          <Numero rotulo="Distribuiu etapas" valor={pessoa.atribuicoesFeitas} />
          <Numero rotulo="Confirmou entregas" valor={pessoa.entregasConfirmadas} />
          <Numero rotulo="Registrou termos" valor={pessoa.termosRegistrados} />
          <Numero rotulo="Avaliações feitas" valor={pessoa.avaliacoesFeitas} />
        </dl>
      </Cartao>
    </div>
  )
}

function Numero({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd className="text-lg font-bold text-foreground">{valor}</dd>
    </div>
  )
}
