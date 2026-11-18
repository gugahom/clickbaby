import { useState, type ReactNode } from 'react'
import clsx from 'clsx'
import { Botao } from '@/components/ui/Botao'
import { BotaoCopiar } from '@/components/ui/BotaoCopiar'
import { ModalAmplo } from '@/components/ui/ModalAmplo'
import { IconeConversa } from '@/components/ui/icones'
import { hojeNoFuso } from '@/lib/formato'
import {
  useHistoricoDoLead,
  usePessoasDoComercial,
  type Contato,
  type EventoDoLead,
} from '../api/useLeads'
import {
  ROTULO_CANAL,
  ROTULO_MOTIVO_PERDA,
  ROTULO_ORIGEM,
  ROTULO_RESULTADO,
  dataHoraCurta,
  diaCurto,
  diaDoInstante,
  diasEntre,
  estaAberto,
  linkDoWhatsapp,
  nomeDoLead,
  somarDias,
  telefoneLegivel,
  textoDoPrazo,
  type Lead,
  type MotivoPerda,
} from '../lib/leads'
import {
  DialogoContato,
  DialogoGanho,
  DialogoPassar,
  DialogoPerdido,
  DialogoReabrir,
  DialogoRetorno,
} from './DialogosDoLead'
import { DialogoLead } from './DialogoLead'
import { PilulaPrioridade, PilulaRetorno, PilulaSituacao } from './Pilulas'

type Gesto = 'contato' | 'retorno' | 'passar' | 'perdido' | 'ganho' | 'reabrir' | 'editar'

/**
 * A FICHA DO LEAD — tudo o que a planilha espalhava em colunas ("1º retorno",
 * "2º retorno", "último contato") numa linha do tempo, e os gestos no alto.
 *
 * A ficha guarda só o id e relê o lead da lista a cada render: um contato
 * registrado aqui atualiza a lista e a ficha juntas.
 */
export function FichaDoLead({
  lead,
  aviso,
  onFechar,
}: {
  lead: Lead
  /** Uma frase sobre como se chegou aqui — "este telefone já tinha lead". */
  aviso?: string | null
  onFechar: () => void
}) {
  const hoje = hojeNoFuso()
  const [gesto, setGesto] = useState<Gesto | null>(null)
  const aberto = estaAberto(lead)
  const fechar = () => setGesto(null)

  return (
    <ModalAmplo
      tamanho="ficha"
      titulo="Lead"
      subtitulo={
        <div className="mt-0.5">
          <p className="truncate text-lg font-extrabold tracking-tight">{nomeDoLead(lead)}</p>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <PilulaSituacao lead={lead} />
            {lead.prioridade && aberto && <PilulaPrioridade prioridade={lead.prioridade} />}
            {lead.maternidadeSigla && (
              <span className="rounded-full bg-marca-suave px-2 py-0.5 text-[11px] font-bold text-marca">
                {lead.maternidadeSigla}
              </span>
            )}
            <span>{ROTULO_ORIGEM[lead.origem]}</span>
          </p>
        </div>
      }
      onFechar={onFechar}
    >
      <div className="p-4 md:p-5">
        {aviso && (
          <p role="status" className="mb-4 rounded-md bg-marca-suave px-3 py-2 text-sm font-semibold text-marca">
            {aviso}
          </p>
        )}
        {/* OS GESTOS no alto: o WhatsApp primeiro, porque é o que se faz antes
            de registrar qualquer coisa. */}
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={linkDoWhatsapp(lead.telefone)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-concluido px-5 text-sm font-bold text-white hover:opacity-90"
          >
            <IconeConversa className="size-4" /> Abrir no WhatsApp
          </a>
          {aberto ? (
            <>
              <Botao variante="primario" onClick={() => setGesto('contato')}>
                Registrar contato
              </Botao>
              <Botao onClick={() => setGesto('retorno')}>
                {lead.proximoRetornoEm ? 'Mudar retorno' : 'Agendar retorno'}
              </Botao>
              <Botao onClick={() => setGesto('passar')}>Passar</Botao>
              <Botao onClick={() => setGesto('ganho')}>Fechou</Botao>
              <Botao variante="fantasma" onClick={() => setGesto('perdido')}>
                Perdido
              </Botao>
            </>
          ) : (
            !lead.casoId && <Botao onClick={() => setGesto('reabrir')}>Reabrir</Botao>
          )}
          <Botao variante="fantasma" onClick={() => setGesto('editar')}>
            Editar
          </Botao>
        </div>

        <div className="mt-5 grid gap-6 md:grid-cols-[minmax(0,1fr)_19rem]">
          <div className="min-w-0 space-y-6">
            {aberto && lead.proximoRetornoEm && (
              <Bloco titulo="Próximo passo">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <PilulaRetorno quando={lead.proximoRetornoEm} hoje={hoje} />
                  <span className="text-muted-foreground">
                    {diaDoInstante(lead.proximoRetornoEm) < hoje
                      ? 'O retorno combinado passou — fale com a família e registre.'
                      : 'Falar com a família nesse dia.'}
                  </span>
                </div>
              </Bloco>
            )}

            {!aberto && <Encerramento lead={lead} />}

            <Bloco titulo="Prazo da venda">
              <ReguaDoPrazo lead={lead} hoje={hoje} />
            </Bloco>

            <Bloco titulo="Contatos e histórico">
              <Historico leadId={lead.id} />
            </Bloco>
          </div>

          <aside className="min-w-0 space-y-6">
            <Bloco titulo="Família">
              <dl className="space-y-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Telefone</dt>
                  <dd className="flex items-center gap-1 font-medium tabular-nums">
                    {telefoneLegivel(lead.telefone)}
                    <BotaoCopiar texto={telefoneLegivel(lead.telefone)} />
                  </dd>
                </div>
                <Dado rotulo="Mãe" valor={lead.maeNome} />
                <Dado rotulo="Bebê" valor={lead.bebeNome} />
                <Dado rotulo="DPP" valor={lead.dpp ? diaCurto(lead.dpp) : null} />
                <Dado rotulo="Maternidade" valor={lead.maternidadeNome} />
                <Dado rotulo="New Born" valor={lead.interesseNewBorn ? 'Tem interesse' : null} />
              </dl>
            </Bloco>
            <Bloco titulo="Venda">
              <dl className="space-y-2 text-sm">
                <Dado rotulo="Com quem está" valor={lead.vendedorNome} />
                <Dado
                  rotulo="Origem"
                  valor={`${ROTULO_ORIGEM[lead.origem]}${lead.origemDetalhe ? ` · ${lead.origemDetalhe}` : ''}`}
                />
                <Dado rotulo="Entrou em" valor={dataHoraCurta(lead.criadoEm)} />
                <Dado rotulo="Contatos" valor={String(lead.totalContatos)} />
                {lead.contatosNaRepescagem > 0 && (
                  <Dado rotulo="Na repescagem" valor={String(lead.contatosNaRepescagem)} />
                )}
              </dl>
            </Bloco>
            {lead.observacao && (
              <Bloco titulo="Observação">
                <p className="text-sm whitespace-pre-line">{lead.observacao}</p>
              </Bloco>
            )}
          </aside>
        </div>
      </div>

      {gesto === 'contato' && <DialogoContato lead={lead} onFechar={fechar} />}
      {gesto === 'retorno' && <DialogoRetorno lead={lead} onFechar={fechar} />}
      {gesto === 'passar' && <DialogoPassar lead={lead} onFechar={fechar} />}
      {gesto === 'perdido' && <DialogoPerdido lead={lead} onFechar={fechar} />}
      {gesto === 'ganho' && <DialogoGanho lead={lead} onFechar={fechar} />}
      {gesto === 'reabrir' && <DialogoReabrir lead={lead} onFechar={fechar} />}
      {gesto === 'editar' && <DialogoLead lead={lead} onFechar={fechar} />}
    </ModalAmplo>
  )
}

function Bloco({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="rotulo-sobrescrito mb-2 text-muted-foreground">{titulo}</h3>
      {children}
    </section>
  )
}

/** Uma linha de detalhe. Vazio vira travessão — "não tem", e não "não carregou". */
function Dado({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{rotulo}</dt>
      <dd className="text-right font-medium">{valor ?? '—'}</dd>
    </div>
  )
}

function Encerramento({ lead }: { lead: Lead }) {
  const quando = lead.encerradoEm ? dataHoraCurta(lead.encerradoEm) : null
  return (
    <div
      className={clsx(
        'rounded-painel border px-4 py-3 text-sm',
        lead.situacao === 'ganho' ? 'border-concluido/40 bg-concluido/10' : 'border-border bg-muted',
      )}
    >
      {lead.situacao === 'ganho' ? (
        <p className="font-semibold">Venda fechada{quando ? ` em ${quando}` : ''}.</p>
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

// ---------------------------------------------------------------------------
// A RÉGUA DO PRAZO
// ---------------------------------------------------------------------------

/**
 * ONDE ESTA FAMÍLIA ESTÁ NO TEMPO. A planilha dizia "prioridade: atenção"; a
 * régua mostra POR QUÊ: a entrada do lead, o prazo da venda (DPP − 10), a
 * DPP, e o "hoje" caminhando entre eles. A faixa até o prazo é da venda; a
 * que vai do prazo à DPP é da repescagem.
 */
function ReguaDoPrazo({ lead, hoje }: { lead: Lead; hoje: string }) {
  if (!lead.dpp || !lead.prazoVenda) {
    return (
      <p className="text-sm text-muted-foreground">
        Sem DPP. O prazo da venda é a data provável do parto menos 10 dias — sem ela, o lead fica sem prioridade.
        Pergunte à família e complete em “Editar”.
      </p>
    )
  }

  const entrada = diaDoInstante(lead.criadoEm)
  const inicio = [entrada, hoje, somarDias(lead.prazoVenda, -10)].sort()[0] ?? entrada
  const fim = [lead.dpp, hoje].sort().at(-1) ?? lead.dpp
  const total = Math.max(1, diasEntre(inicio, fim) + 2)
  const pos = (dia: string) => `${((diasEntre(inicio, dia) + 1) / total) * 100}%`
  const larg = (de: string, ate: string) => `${(diasEntre(de, ate) / total) * 100}%`

  const resumo = textoDoPrazo(lead)

  return (
    <div>
      <p className="mb-3 text-sm font-semibold">{resumo ? resumo[0]?.toUpperCase() + resumo.slice(1) : ''}</p>
      <div
        role="img"
        aria-label={`Entrou em ${diaCurto(entrada)}, prazo da venda em ${diaCurto(lead.prazoVenda)}, DPP em ${diaCurto(lead.dpp)}; hoje é ${diaCurto(hoje)}.`}
        className="relative h-14"
      >
        {/* A trilha: venda até o prazo, repescagem até a DPP. */}
        <div className="absolute inset-x-0 top-6 h-2 rounded-full bg-muted" />
        <div
          className="absolute top-6 h-2 rounded-l-full bg-marca/35"
          style={{ left: pos(inicio), width: larg(inicio, lead.prazoVenda) }}
        />
        <div
          className="absolute top-6 h-2 bg-acento/40"
          style={{ left: pos(lead.prazoVenda), width: larg(lead.prazoVenda, lead.dpp) }}
        />
        <Marco dia={lead.prazoVenda} pos={pos(lead.prazoVenda)} rotulo="Prazo" forte />
        <Marco dia={lead.dpp} pos={pos(lead.dpp)} rotulo="DPP" />
        {Math.abs(diasEntre(entrada, lead.prazoVenda)) >= 4 && (
          <Marco dia={entrada} pos={pos(entrada)} rotulo="Entrou" />
        )}
        {/* O HOJE: um alfinete acima da trilha, na cor da prioridade. */}
        <div className="absolute top-0 -translate-x-1/2" style={{ left: pos(hoje) }}>
          <span
            className={clsx(
              'block rounded-full px-1.5 text-[10px] leading-4 font-extrabold text-white',
              lead.prioridade === 'urgente' ? 'bg-atrasado' : lead.prioridade === 'repescagem' ? 'bg-acento-forte' : 'bg-marca',
            )}
          >
            hoje
          </span>
          <span className="mx-auto block h-3.5 w-0.5 bg-foreground/70" />
        </div>
      </div>
      <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-marca/35" /> venda
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-acento/40" /> repescagem
        </span>
      </p>
    </div>
  )
}

function Marco({ dia, pos, rotulo, forte = false }: { dia: string; pos: string; rotulo: string; forte?: boolean }) {
  return (
    <div className="absolute top-5 -translate-x-1/2 text-center" style={{ left: pos }}>
      <span className={clsx('mx-auto block h-4 w-0.5', forte ? 'bg-foreground' : 'bg-foreground/40')} />
      <span className={clsx('block text-[11px] leading-tight whitespace-nowrap', forte ? 'font-bold' : 'text-muted-foreground')}>
        {rotulo} {diaCurto(dia)}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// O HISTÓRICO
// ---------------------------------------------------------------------------

type Payload = Record<string, unknown>

const ROTULO_CAMPO: Record<string, string> = {
  mae_nome: 'mãe',
  bebe_nome: 'bebê',
  telefone: 'telefone',
  dpp: 'DPP',
  maternidade: 'maternidade',
  origem: 'origem',
  origem_detalhe: 'detalhe da origem',
  interesse_new_born: 'New Born',
  observacao: 'observação',
}

interface ItemDoHistorico {
  id: string
  quando: string
  pessoaId: string | null
  titulo: string
  detalhe?: string | null
  repescagem?: boolean
}

function itensDoHistorico(contatos: Contato[], eventos: EventoDoLead[], nome: (id: unknown) => string) {
  const porId = new Map(contatos.map((c) => [c.id, c]))
  const usados = new Set<string>()

  const descreverContato = (c: Contato): ItemDoHistorico => ({
    id: c.id,
    quando: c.ocorridoEm,
    pessoaId: c.pessoaId,
    titulo: `${ROTULO_CANAL[c.canal]} · ${ROTULO_RESULTADO[c.resultado]}`,
    detalhe: c.nota,
    repescagem: c.fase === 'repescagem',
  })

  const itens = eventos.map((e): ItemDoHistorico => {
    const p = (e.payload ?? {}) as Payload
    const base = { id: e.id, quando: e.ocorridoEm, pessoaId: e.pessoaId }
    switch (e.tipo) {
      case 'lead_contato': {
        const c = typeof p.contato_id === 'string' ? porId.get(p.contato_id) : undefined
        if (c) {
          usados.add(c.id)
          return { ...descreverContato(c), id: e.id }
        }
        return { ...base, titulo: 'Registrou um contato' }
      }
      case 'lead_criado':
        return { ...base, titulo: 'Criou o lead' }
      case 'lead_editado': {
        const campos = Array.isArray(p.campos) ? (p.campos as string[]).map((c) => ROTULO_CAMPO[c] ?? c) : []
        return { ...base, titulo: campos.length ? `Editou ${campos.join(', ')}` : 'Editou o lead' }
      }
      case 'lead_retorno_agendado':
        return {
          ...base,
          titulo:
            typeof p.depois === 'string' ? `Marcou o retorno para ${dataHoraCurta(p.depois)}` : 'Tirou o retorno',
        }
      case 'lead_passado':
        return {
          ...base,
          titulo: `Passou o lead de ${nome(p.de)} para ${nome(p.para)}`,
          detalhe: typeof p.motivo === 'string' ? p.motivo : null,
        }
      case 'lead_perdido':
        return {
          ...base,
          titulo: `Marcou perdido${typeof p.motivo === 'string' ? ` — ${ROTULO_MOTIVO_PERDA[p.motivo as MotivoPerda] ?? p.motivo}` : ''}`,
        }
      case 'lead_ganho':
        return { ...base, titulo: 'Fechou a venda' }
      case 'lead_reaberto':
        return { ...base, titulo: 'Reabriu o lead', detalhe: typeof p.motivo === 'string' ? p.motivo : null }
      default:
        return { ...base, titulo: e.tipo }
    }
  })

  // Contato sem evento (o que vier de importação) entra também.
  for (const c of contatos) if (!usados.has(c.id)) itens.push(descreverContato(c))

  return itens.sort((a, b) => b.quando.localeCompare(a.quando))
}

function Historico({ leadId }: { leadId: string }) {
  const { data, isPending, isError } = useHistoricoDoLead(leadId)
  const { data: pessoas = [] } = usePessoasDoComercial()
  const nome = (id: unknown) => pessoas.find((p) => p.id === id)?.nome ?? 'ninguém'

  if (isPending) return <p className="text-sm text-muted-foreground">Carregando…</p>
  if (isError || !data) return <p className="text-sm text-atrasado">Não foi possível carregar o histórico.</p>

  const itens = itensDoHistorico(data.contatos, data.eventos, nome)
  if (itens.length === 0) return <p className="text-sm text-muted-foreground">Nada registrado ainda.</p>

  return (
    <ol className="relative space-y-3 border-l-2 border-border pl-4">
      {itens.map((i) => (
        <li key={i.id} className="relative">
          <span
            className={clsx(
              'absolute top-1.5 -left-[1.4rem] size-2.5 rounded-full ring-2 ring-card',
              i.repescagem ? 'bg-acento-forte' : 'bg-marca',
            )}
          />
          <p className="text-sm font-semibold">
            {i.titulo}
            {i.repescagem && (
              <span className="ml-2 rounded-full bg-acento-suave px-1.5 py-0.5 text-[10px] font-bold text-acento-forte">
                repescagem
              </span>
            )}
          </p>
          {i.detalhe && <p className="mt-0.5 text-sm whitespace-pre-line text-muted-foreground">{i.detalhe}</p>}
          <p className="mt-0.5 text-xs text-muted-foreground">
            {dataHoraCurta(i.quando)}
            {i.pessoaId && ` · ${nome(i.pessoaId)}`}
          </p>
        </li>
      ))}
    </ol>
  )
}
