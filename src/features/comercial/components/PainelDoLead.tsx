import { useEffect, useRef, useState, type ReactNode } from 'react'
import clsx from 'clsx'
import { BotaoCopiar } from '@/components/ui/BotaoCopiar'
import { Dropdown } from '@/components/ui/Dropdown'
import { Chevron, IconeConversa, IconeX } from '@/components/ui/icones'
import { hojeNoFuso } from '@/lib/formato'
import {
  ROTULO_MOTIVO_PERDA,
  ROTULO_ORIGEM,
  dataHoraCurta,
  diaCurto,
  diaDoInstante,
  estaAberto,
  linkDoWhatsapp,
  nomeDoLead,
  telefoneLegivel,
  type Lead,
} from '../lib/leads'
import { AtividadeDoLead } from './AtividadeDoLead'
import { DialogoPassar, DialogoPerdido, DialogoReabrir, DialogoRetorno } from './DialogosDoLead'
import { DialogoFechou } from './DialogoFechou'
import { Link } from 'react-router'
import { useCasoEditavel } from '@/features/calendario/api/useCalendario'
import { emBrasilia } from '@/features/calendario/lib/datas'
import { DialogoLead } from './DialogoLead'
import { ContagemDoPrazo, PilulaPrioridade, PilulaRetorno, PilulaSituacao } from './Pilulas'
import { ReguaDoPrazo } from './ReguaDoPrazo'

type Gesto = 'retorno' | 'passar' | 'perdido' | 'ganho' | 'reabrir' | 'editar'

/**
 * A FICHA DO LEAD, numa gaveta à direita (18/11/2026, o CRM premium). É o
 * "preview" do HubSpot e o painel lateral do Twenty: a lista continua viva
 * atrás, e tocar em outro lead TROCA a ficha em vez de fechar e abrir. Por
 * isso não é um diálogo modal — quem pede foco são só os gestos.
 *
 * O ALTO DIZ QUEM É E O QUE FAZER: a contagem do prazo no lugar do retrato (é
 * o dado que define esta família para a venda), o nome, e dois gestos à vista
 * — abrir a conversa e registrar o contato, que é o ciclo do vendedor. O resto
 * (retorno, passar, fechou, perdido, editar) fica em "Mais", para a ficha não
 * virar uma fileira de botões.
 *
 * A ficha guarda só o id e relê o lead da lista a cada render: um contato
 * registrado aqui atualiza a lista e a ficha juntas.
 */
export function PainelDoLead({
  lead,
  aviso,
  onFechar,
  onRegistrarContato,
}: {
  lead: Lead
  /** Uma frase sobre como se chegou aqui — "este telefone já tinha lead". */
  aviso?: string | null
  onFechar: () => void
  onRegistrarContato: () => void
}) {
  const hoje = hojeNoFuso()
  const [gesto, setGesto] = useState<Gesto | null>(null)
  const titulo = useRef<HTMLHeadingElement>(null)
  const aberto = estaAberto(lead)
  const fechar = () => setGesto(null)

  // O FOCO VEM PARA A FICHA quando ela abre ou troca de lead, para o teclado
  // e o leitor de tela começarem por ela.
  useEffect(() => {
    titulo.current?.focus()
  }, [lead.id])

  // Esc fecha a ficha — menos quando há um diálogo aberto por cima: ali o Esc
  // é dele, e fechar as duas coisas de uma vez seria perder o que se digitou.
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key !== 'Escape' || document.querySelector('dialog[open]')) return
      onFechar()
    }
    document.addEventListener('keydown', aoTeclar)
    return () => document.removeEventListener('keydown', aoTeclar)
  }, [onFechar])

  const mais = aberto
    ? [
        { id: 'retorno', rotulo: lead.proximoRetornoEm ? 'Mudar o retorno' : 'Agendar retorno' },
        { id: 'passar', rotulo: 'Passar para outra pessoa' },
        { id: 'ganho', rotulo: 'Fechou a venda' },
        { id: 'perdido', rotulo: 'Marcar como perdido', destrutivo: true },
        { id: 'editar', rotulo: 'Editar os dados' },
      ]
    : [
        ...(lead.casoId ? [] : [{ id: 'reabrir', rotulo: 'Reabrir o lead' }]),
        { id: 'editar', rotulo: 'Editar os dados' },
      ]

  return (
    <aside
      aria-label={`Ficha de ${nomeDoLead(lead)}`}
      className="entra-direita fixed inset-y-0 right-0 z-30 flex w-full flex-col border-l border-border bg-card shadow-cartao-alto md:w-[min(42rem,calc(100vw-5rem))]"
    >
      {/* ------------------------------------------------ o alto */}
      <div className="flex-shrink-0 border-b border-border px-4 pt-3 pb-4 md:px-6">
        <div className="flex items-center justify-between">
          <p className="rotulo-sobrescrito text-muted-foreground">Lead</p>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar a ficha"
            title="Fechar (Esc)"
            className="-mr-2 grid size-11 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <IconeX className="size-5" />
          </button>
        </div>

        <div className="mt-1 flex items-start gap-3.5">
          <ContagemDoPrazo lead={lead} />
          <div className="min-w-0 flex-1">
            <h2
              ref={titulo}
              tabIndex={-1}
              className="text-xl leading-tight font-extrabold tracking-tight outline-none"
            >
              {lead.maeNome}
              {lead.bebeNome && <span className="font-semibold text-muted-foreground"> / {lead.bebeNome}</span>}
            </h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
              <PilulaSituacao lead={lead} />
              {lead.prioridade && aberto && <PilulaPrioridade prioridade={lead.prioridade} />}
              {lead.maternidadeSigla && (
                <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] font-bold">
                  {lead.maternidadeSigla}
                </span>
              )}
              <span className="text-muted-foreground">{ROTULO_ORIGEM[lead.origem]}</span>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <a
            href={linkDoWhatsapp(lead.telefone)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-concluido px-4 text-sm font-bold text-white hover:opacity-90 md:min-h-10"
          >
            <IconeConversa className="size-4" /> WhatsApp
          </a>
          {aberto && (
            <button
              type="button"
              onClick={onRegistrarContato}
              className="inline-flex min-h-11 items-center rounded-full bg-marca px-4 text-sm font-bold text-white hover:bg-marca-forte md:min-h-10"
            >
              Registrar contato
            </button>
          )}
          <Dropdown
            rotulo="Mais ações"
            itens={mais}
            onEscolher={(item) => setGesto(item.id as Gesto)}
            gatilho={
              <span className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border bg-card px-4 text-sm font-semibold hover:bg-muted md:min-h-10">
                Mais <Chevron className="size-4 text-muted-foreground" />
              </span>
            }
          />
        </div>
      </div>

      {/* ------------------------------------------------ o corpo */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-6">
        {aviso && (
          <p role="status" className="mb-5 rounded-lg bg-marca-suave px-3 py-2 text-sm font-semibold text-marca">
            {aviso}
          </p>
        )}

        <div className="space-y-7">
          {aberto ? (
            <ProximoPasso lead={lead} hoje={hoje} onAgendar={() => setGesto('retorno')} />
          ) : (
            <Encerramento lead={lead} />
          )}

          <Secao titulo="Prazo da venda">
            <ReguaDoPrazo lead={lead} hoje={hoje} />
          </Secao>

          <Secao titulo="Detalhes">
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2.5 text-sm sm:grid-cols-2">
              <Campo rotulo="Telefone">
                <span className="flex items-center gap-0.5 tabular-nums">
                  {telefoneLegivel(lead.telefone)}
                  <BotaoCopiar texto={telefoneLegivel(lead.telefone)} />
                </span>
              </Campo>
              <Campo rotulo="DPP">{lead.dpp ? diaCurto(lead.dpp) : null}</Campo>
              <Campo rotulo="Maternidade">{lead.maternidadeNome}</Campo>
              <Campo rotulo="Com quem está">{lead.vendedorNome}</Campo>
              <Campo rotulo="Origem">
                {ROTULO_ORIGEM[lead.origem]}
                {lead.origemDetalhe ? ` · ${lead.origemDetalhe}` : ''}
              </Campo>
              <Campo rotulo="Entrou em">{dataHoraCurta(lead.criadoEm)}</Campo>
              <Campo rotulo="Contatos">
                {lead.totalContatos}
                {lead.contatosNaRepescagem > 0 ? ` · ${lead.contatosNaRepescagem} na repescagem` : ''}
              </Campo>
              <Campo rotulo="New Born">{lead.interesseNewBorn ? 'Tem interesse' : null}</Campo>
            </dl>
            {lead.observacao && (
              <p className="mt-4 rounded-lg bg-muted px-3 py-2 text-sm whitespace-pre-line">{lead.observacao}</p>
            )}
          </Secao>

          <Secao titulo="Atividade">
            <AtividadeDoLead leadId={lead.id} />
          </Secao>
        </div>
      </div>

      {gesto === 'retorno' && <DialogoRetorno lead={lead} onFechar={fechar} />}
      {gesto === 'passar' && <DialogoPassar lead={lead} onFechar={fechar} />}
      {gesto === 'perdido' && <DialogoPerdido lead={lead} onFechar={fechar} />}
      {gesto === 'ganho' && <DialogoFechou lead={lead} onFechar={fechar} />}
      {gesto === 'reabrir' && <DialogoReabrir lead={lead} onFechar={fechar} />}
      {gesto === 'editar' && <DialogoLead lead={lead} onFechar={fechar} />}
    </aside>
  )
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="rotulo-sobrescrito mb-3 text-muted-foreground">{titulo}</h3>
      {children}
    </section>
  )
}

/** Um campo da ficha. Vazio vira travessão — "não tem", e não "não carregou". */
function Campo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  const vazio = children === null || children === undefined || children === ''
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-3 border-b border-border/60 pb-2">
      <dt className="flex-shrink-0 text-muted-foreground">{rotulo}</dt>
      <dd className="min-w-0 truncate text-right font-medium">{vazio ? '—' : children}</dd>
    </div>
  )
}

/**
 * O PRÓXIMO PASSO, no topo do corpo: todo lead aberto tem que ter um. Sem
 * retorno marcado, a ficha diz isso em âmbar e oferece marcar — é o lead que
 * a planilha deixava sumir.
 */
function ProximoPasso({ lead, hoje, onAgendar }: { lead: Lead; hoje: string; onAgendar: () => void }) {
  if (!lead.proximoRetornoEm) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-cartao border border-atencao/40 bg-atencao/10 px-4 py-3">
        <p className="min-w-0 flex-1 text-sm">
          <span className="font-bold text-atencao-tinta">Sem próximo passo.</span>{' '}
          {lead.totalContatos === 0 ? 'Ninguém falou com a família ainda.' : 'Nenhum retorno está marcado.'}
        </p>
        <button
          type="button"
          onClick={onAgendar}
          className="min-h-10 rounded-full border border-atencao/50 bg-card px-3.5 text-sm font-semibold hover:bg-atencao/10"
        >
          Agendar retorno
        </button>
      </div>
    )
  }

  const atrasado = diaDoInstante(lead.proximoRetornoEm) < hoje
  return (
    <div
      className={clsx(
        'flex flex-wrap items-center gap-3 rounded-cartao border px-4 py-3',
        atrasado ? 'border-atrasado/40 bg-atrasado/8' : 'border-border bg-muted/60',
      )}
    >
      <PilulaRetorno quando={lead.proximoRetornoEm} hoje={hoje} />
      <p className="min-w-0 flex-1 text-sm">
        {atrasado ? 'O retorno combinado passou — fale com a família e registre.' : 'Retorno combinado com a família.'}
      </p>
    </div>
  )
}

function Encerramento({ lead }: { lead: Lead }) {
  const quando = lead.encerradoEm ? dataHoraCurta(lead.encerradoEm) : null
  return (
    <div
      className={clsx(
        'rounded-cartao border px-4 py-3 text-sm',
        lead.situacao === 'ganho' ? 'border-concluido/40 bg-concluido/10' : 'border-border bg-muted',
      )}
    >
      {lead.situacao === 'ganho' ? (
        <>
          <p className="font-semibold">Venda fechada{quando ? ` em ${quando}` : ''}.</p>
          {lead.casoId && <CasoDoLead casoId={lead.casoId} />}
        </>
      ) : (
        <>
          <p className="font-semibold">
            Perdido{lead.motivoPerda ? ` — ${ROTULO_MOTIVO_PERDA[lead.motivoPerda]}` : ''}
            {quando ? `, em ${quando}` : ''}.
          </p>
          {lead.motivoPerdaTexto && <p className="mt-1 text-muted-foreground">{lead.motivoPerdaTexto}</p>}
        </>
      )}
    </div>
  )
}

/**
 * O CASO QUE NASCEU DO LEAD (fase B): quem é, o dia e o caminho para a agenda.
 * O dia leva à visão do DIA no Calendário, onde o caso está com tudo o que tem.
 */
function CasoDoLead({ casoId }: { casoId: string }) {
  const caso = useCasoEditavel(casoId)
  if (!caso.data) return null
  const c = caso.data
  const dia = c.previsaoEm ? emBrasilia(c.previsaoEm).dia : null
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="min-w-0 text-muted-foreground">
        Caso <span className="font-semibold text-foreground">{c.maeNome}</span>
        {dia ? ` · ${dia.split('-').reverse().slice(0, 2).join('/')}` : ''}
      </span>
      {dia && (
        <Link to={`/calendario?ver=dia&dia=${dia}`} className="font-semibold text-marca underline underline-offset-2">
          Ver na agenda
        </Link>
      )}
    </div>
  )
}
