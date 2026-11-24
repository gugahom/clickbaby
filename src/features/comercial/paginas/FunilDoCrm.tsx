import { useMemo, useState, type DragEvent } from 'react'
import clsx from 'clsx'
import { iniciais } from '@/lib/iniciais'
import { DialogoPerdido } from '../components/DialogosDoLead'
import { DialogoFechou } from '../components/DialogoFechou'
import { PilulaPrazo, PilulaRetorno } from '../components/Pilulas'
import { useCrm } from '../crm/contexto'
import {
  ROTULO_ORIGEM,
  diaDoInstante,
  estaAberto,
  haQuantoTempo,
  nomeDoLead,
  porPrazo,
  type Lead,
  type SituacaoLead,
} from '../lib/leads'

/**
 * O FUNIL: os leads por etapa, como o pipeline do Pipedrive. As etapas SÃO as
 * situações do lead — não há uma coluna guardada à parte —, então o quadro e a
 * tabela de Leads nunca discordam.
 *
 * DENTRO DA COLUNA, PELO PRÓXIMO PASSO (a regra do Pipedrive): retorno
 * atrasado em cima, depois os de hoje e os que vêm, e por último quem está sem
 * próximo passo, pelo prazo. Fechou e Perdido mostram só o mês, do mais
 * recente para trás — o funil é do trabalho de agora, o histórico está em Leads.
 *
 * ARRASTAR É ATALHO, e cai nos MESMOS gestos da ficha (como as seções do
 * Quadro): soltar em "Em contato" ou "Negociando" abre o registro de contato
 * (no segundo, já com "mandou proposta"), em "Fechou" pergunta se fechou, em
 * "Perdido" pede o motivo. Nada muda sem o diálogo — um arrasto errado não
 * fecha venda. Só no mouse: o arrastar do HTML não existe no toque, e no
 * celular o caminho é a ficha.
 */
interface Etapa {
  id: SituacaoLead
  rotulo: string
  ponto: string
  doMes?: boolean
}

const ETAPAS: Etapa[] = [
  { id: 'novo', rotulo: 'Novos', ponto: 'bg-muted-foreground/60' },
  { id: 'em_contato', rotulo: 'Em contato', ponto: 'bg-andamento' },
  { id: 'negociando', rotulo: 'Negociando', ponto: 'bg-marca' },
  { id: 'ganho', rotulo: 'Fechou', ponto: 'bg-concluido', doMes: true },
  { id: 'perdido', rotulo: 'Perdido', ponto: 'bg-atrasado', doMes: true },
]

/** Pelo próximo passo: retorno marcado primeiro (o mais cedo em cima), depois sem retorno, pelo prazo. */
function peloProximoPasso(a: Lead, b: Lead): number {
  if (a.proximoRetornoEm && b.proximoRetornoEm) return a.proximoRetornoEm.localeCompare(b.proximoRetornoEm)
  if (a.proximoRetornoEm) return -1
  if (b.proximoRetornoEm) return 1
  return porPrazo(a, b)
}

export function FunilDoCrm() {
  const { visiveis, escopo, hoje, leadAberto, abrirLead, registrarContato } = useCrm()
  const [arrastando, setArrastando] = useState<string | null>(null)
  const [sobre, setSobre] = useState<SituacaoLead | null>(null)
  const [fechar, setFechar] = useState<{ lead: Lead; como: 'ganho' | 'perdido' } | null>(null)
  const mes = hoje.slice(0, 7)

  const colunas = useMemo(
    () =>
      ETAPAS.map((e) => {
        const lista = visiveis.filter(
          (l) =>
            l.situacao === e.id &&
            (!e.doMes || (l.encerradoEm !== null && diaDoInstante(l.encerradoEm).slice(0, 7) === mes)),
        )
        lista.sort(e.doMes ? (a, b) => (b.encerradoEm ?? '').localeCompare(a.encerradoEm ?? '') : peloProximoPasso)
        return { etapa: e, leads: lista }
      }),
    [visiveis, mes],
  )

  const leadArrastado = arrastando ? visiveis.find((l) => l.id === arrastando) : undefined

  /** Para onde este lead pode ir: só para a frente, e nunca de volta a "Novos". */
  function aceita(destino: SituacaoLead): boolean {
    if (!leadArrastado || !estaAberto(leadArrastado)) return false
    if (destino === leadArrastado.situacao || destino === 'novo') return false
    if (destino === 'em_contato') return leadArrastado.situacao === 'novo'
    return true
  }

  function soltar(destino: SituacaoLead) {
    const lead = leadArrastado
    setArrastando(null)
    setSobre(null)
    if (!lead || !aceita(destino)) return
    if (destino === 'em_contato') registrarContato(lead)
    else if (destino === 'negociando') registrarContato(lead, 'mandou_proposta')
    else if (destino === 'ganho' || destino === 'perdido') setFechar({ lead, como: destino })
  }

  return (
    <div className="flex h-full flex-col px-4 py-6 md:px-8 md:py-8">
      <header className="flex-shrink-0">
        <h1 className="text-2xl font-extrabold tracking-tight md:text-[28px]">Funil</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Do primeiro contato ao fechamento.
          <span className="hidden md:inline"> Arraste um lead para a próxima etapa para registrar o que aconteceu.</span>
        </p>
      </header>

      <div className="-mx-4 mt-5 min-h-0 flex-1 overflow-x-auto px-4 pb-2 md:-mx-8 md:px-8">
        <div className="flex h-full min-h-[28rem] gap-3">
          {colunas.map(({ etapa, leads }) => {
            const alvo = arrastando !== null && aceita(etapa.id)
            return (
              <section
                key={etapa.id}
                aria-labelledby={`etapa-${etapa.id}`}
                onDragOver={(e) => {
                  if (!alvo) return
                  e.preventDefault()
                  setSobre(etapa.id)
                }}
                onDragLeave={() => setSobre((s) => (s === etapa.id ? null : s))}
                onDrop={(e) => {
                  e.preventDefault()
                  soltar(etapa.id)
                }}
                className={clsx(
                  'flex min-w-[13.5rem] flex-1 basis-0 flex-col rounded-painel border bg-muted/40 transition-colors',
                  sobre === etapa.id && alvo
                    ? 'border-marca bg-marca-suave/60 ring-2 ring-marca/20'
                    : alvo
                      ? 'border-dashed border-marca/40'
                      : 'border-border',
                )}
              >
                <div className="flex items-center gap-2 px-3.5 pt-3 pb-2">
                  <span aria-hidden="true" className={clsx('size-2 rounded-full', etapa.ponto)} />
                  <h2 id={`etapa-${etapa.id}`} className="text-[13px] font-extrabold">
                    {etapa.rotulo}
                  </h2>
                  <span className="rounded-md bg-card px-1.5 text-[11px] font-bold text-muted-foreground tabular-nums ring-1 ring-border">
                    {leads.length}
                  </span>
                  {etapa.doMes && <span className="ml-auto text-[11px] text-muted-foreground">neste mês</span>}
                </div>

                <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2.5 pb-3">
                  {leads.length === 0 && (
                    <li className="rounded-cartao border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                      {alvo ? 'Solte aqui' : 'Nenhum lead'}
                    </li>
                  )}
                  {leads.map((l) => (
                    <CartaoDoFunil
                      key={l.id}
                      lead={l}
                      hoje={hoje}
                      comVendedor={escopo === 'equipe'}
                      selecionado={leadAberto === l.id}
                      arrastavel={estaAberto(l)}
                      onAbrir={() => abrirLead(l.id)}
                      onArrastar={(e) => {
                        e.dataTransfer.effectAllowed = 'move'
                        e.dataTransfer.setData('text/plain', l.id)
                        setArrastando(l.id)
                      }}
                      onSoltar={() => {
                        setArrastando(null)
                        setSobre(null)
                      }}
                    />
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      </div>

      {fechar?.como === 'ganho' && <DialogoFechou lead={fechar.lead} onFechar={() => setFechar(null)} />}
      {fechar?.como === 'perdido' && <DialogoPerdido lead={fechar.lead} onFechar={() => setFechar(null)} />}
    </div>
  )
}

function CartaoDoFunil({
  lead,
  hoje,
  comVendedor,
  selecionado,
  arrastavel,
  onAbrir,
  onArrastar,
  onSoltar,
}: {
  lead: Lead
  hoje: string
  comVendedor: boolean
  selecionado: boolean
  arrastavel: boolean
  onAbrir: () => void
  onArrastar: (e: DragEvent<HTMLLIElement>) => void
  onSoltar: () => void
}) {
  const aberto = estaAberto(lead)
  return (
    <li
      draggable={arrastavel}
      onDragStart={onArrastar}
      onDragEnd={onSoltar}
      className={clsx(
        'rounded-cartao border bg-card shadow-cartao transition-[border-color,box-shadow]',
        arrastavel && 'cursor-grab active:cursor-grabbing',
        selecionado ? 'border-marca ring-2 ring-marca/20' : 'border-border hover:border-marca/30',
      )}
    >
      <button type="button" onClick={onAbrir} className="block w-full rounded-cartao p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-marca/40">
        <span className="flex items-start gap-2">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px] font-bold">{nomeDoLead(lead)}</span>
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
              {lead.maternidadeSigla && <span className="font-mono font-bold">{lead.maternidadeSigla} · </span>}
              {ROTULO_ORIGEM[lead.origem]}
            </span>
          </span>
          {aberto && <PilulaPrazo lead={lead} />}
        </span>

        {aberto && (
          <span className="mt-2.5 flex items-center gap-2">
            {lead.proximoRetornoEm ? (
              <PilulaRetorno quando={lead.proximoRetornoEm} hoje={hoje} />
            ) : (
              <span className="text-xs font-semibold text-atencao-tinta">Sem próximo passo</span>
            )}
            {lead.fase === 'repescagem' && (
              <span className="rounded-full bg-acento-suave px-2 py-0.5 text-[10px] font-bold text-acento-forte">
                repescagem
              </span>
            )}
          </span>
        )}

        <span className="mt-2.5 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span>
            {lead.ultimoContatoEm ? `último contato ${haQuantoTempo(lead.ultimoContatoEm, hoje)}` : 'nenhum contato'}
          </span>
          {comVendedor && (
            <span
              title={lead.vendedorNome ?? 'Sem vendedor'}
              className="grid size-6 place-items-center rounded-full bg-marca-suave text-[9px] font-extrabold text-marca"
            >
              {lead.vendedorNome ? iniciais(lead.vendedorNome) : '—'}
            </span>
          )}
        </span>
      </button>
    </li>
  )
}
