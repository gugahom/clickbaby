import clsx from 'clsx'
import { IconeCalendario } from '@/components/ui/icones'
import {
  DESCRICAO_PRIORIDADE,
  ROTULO_PRIORIDADE,
  ROTULO_SITUACAO,
  dataHoraCurta,
  diaDoInstante,
  type Lead,
  type Prioridade,
} from '../lib/leads'

/**
 * A COR DE CADA PRIORIDADE é a legenda da planilha do comercial, traduzida
 * para os tons da casa. Só o URGENTE é sólido — é o "precisa de alguém agora"
 * do sistema inteiro (a pílula da atribuída, o aviso do card); o resto é
 * tingido. A repescagem leva o rosa da marca: não é mais urgente que o
 * urgente, é OUTRA conversa, com outra pessoa.
 */
const COR_PRIORIDADE: Record<Prioridade, string> = {
  urgente: 'bg-atrasado text-white',
  atencao: 'bg-atencao/15 text-atencao-tinta ring-1 ring-atencao/40',
  acompanhar: 'bg-andamento/12 text-andamento-tinta ring-1 ring-andamento/30',
  normal: 'bg-muted text-foreground ring-1 ring-border',
  repescagem: 'bg-acento-suave text-acento-forte ring-1 ring-acento/40',
}

/**
 * A CONTAGEM DO PRAZO, o número que o vendedor procura primeiro: quantos dias
 * faltam para a DPP − 10. É a assinatura da tela — a planilha pintava a
 * linha inteira pela prioridade; aqui a cor fica num quadrado só, com o
 * número dentro, e o resto da linha fica legível.
 */
export function ContagemDoPrazo({ lead, className }: { lead: Lead; className?: string }) {
  const d = lead.diasParaPrazo
  const encerrado = lead.situacao === 'ganho' || lead.situacao === 'perdido'

  if (d === null || lead.prioridade === null) {
    return (
      <div
        className={clsx(
          'flex size-13 flex-shrink-0 flex-col items-center justify-center rounded-xl border border-dashed border-border text-muted-foreground',
          className,
        )}
        title={encerrado ? ROTULO_SITUACAO[lead.situacao] : 'Sem DPP — o prazo da venda sai dela'}
      >
        <span className="text-[11px] leading-tight font-bold">{encerrado ? ROTULO_SITUACAO[lead.situacao] : 'sem'}</span>
        {!encerrado && <span className="text-[11px] leading-tight font-bold">DPP</span>}
      </div>
    )
  }

  const numero = d < 0 ? -d : d
  const legenda = d === 0 ? 'hoje' : d < 0 ? (numero === 1 ? 'dia atrás' : 'dias atrás') : numero === 1 ? 'dia' : 'dias'

  return (
    <div
      className={clsx(
        'flex size-13 flex-shrink-0 flex-col items-center justify-center rounded-xl tabular-nums',
        COR_PRIORIDADE[lead.prioridade],
        className,
      )}
      title={`${ROTULO_PRIORIDADE[lead.prioridade]} — ${DESCRICAO_PRIORIDADE[lead.prioridade]}`}
    >
      <span className="text-xl leading-none font-extrabold tracking-tight">{d === 0 ? '0' : numero}</span>
      <span className="mt-0.5 text-[10px] leading-none font-bold">{legenda}</span>
    </div>
  )
}

export function PilulaPrioridade({ prioridade }: { prioridade: Prioridade }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold whitespace-nowrap',
        COR_PRIORIDADE[prioridade],
      )}
      title={DESCRICAO_PRIORIDADE[prioridade]}
    >
      {ROTULO_PRIORIDADE[prioridade]}
    </span>
  )
}

/**
 * O RETORNO COMBINADO. Vermelho quando passou do dia, âmbar no dia, neutro
 * depois — a mesma régua do retorno do relatório externo.
 */
export function PilulaRetorno({ quando, hoje }: { quando: string; hoje: string }) {
  const dia = diaDoInstante(quando)
  const atrasado = dia < hoje
  const ehHoje = dia === hoje
  const hora = dataHoraCurta(quando).split(' ')[1] ?? ''

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap tabular-nums',
        atrasado
          ? 'bg-atrasado text-white'
          : ehHoje
            ? 'bg-atencao/15 text-atencao-tinta ring-1 ring-atencao/40'
            : 'bg-muted text-foreground ring-1 ring-border',
      )}
      title={atrasado ? 'Retorno atrasado' : ehHoje ? 'Retorno para hoje' : 'Retorno agendado'}
    >
      <IconeCalendario className="size-3.5" />
      {ehHoje ? `Hoje ${hora}` : dataHoraCurta(quando).replace(',', '')}
    </span>
  )
}

export function PilulaSituacao({ lead }: { lead: Lead }) {
  const cor =
    lead.situacao === 'ganho'
      ? 'bg-concluido text-white'
      : lead.situacao === 'perdido'
        ? 'bg-muted text-muted-foreground ring-1 ring-border'
        : lead.situacao === 'negociando'
          ? 'bg-marca-suave text-marca'
          : 'bg-muted text-foreground'
  return (
    <span className={clsx('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold whitespace-nowrap', cor)}>
      {ROTULO_SITUACAO[lead.situacao]}
    </span>
  )
}
