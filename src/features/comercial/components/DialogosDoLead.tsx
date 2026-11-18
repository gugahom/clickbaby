import { useState } from 'react'
import { Dialogo } from '@/components/ui/Dialogo'
import { Dropdown } from '@/components/ui/Dropdown'
import { hojeNoFuso } from '@/lib/formato'
import {
  useAgendarRetorno,
  useMarcarGanho,
  useMarcarPerdido,
  usePassarLead,
  usePessoasDoComercial,
  useReabrirLead,
  useRegistrarContato,
} from '../api/useLeads'
import {
  ROTULO_CANAL,
  ROTULO_MOTIVO_PERDA,
  ROTULO_RESULTADO,
  diaDoInstante,
  nomeDoLead,
  retornoNoDia,
  somarDias,
  type CanalContato,
  type Lead,
  type MotivoPerda,
  type ResultadoContato,
} from '../lib/leads'
import { CampoNota, Escolhas } from './Escolhas'

const mensagem = (e: unknown) => (e instanceof Error ? e.message : String(e))

function Quem({ lead }: { lead: Lead }) {
  return (
    <p className="text-sm text-muted-foreground">
      <span className="font-semibold text-foreground">{nomeDoLead(lead)}</span>
      {lead.maternidadeSigla && ` · ${lead.maternidadeSigla}`}
    </p>
  )
}

// ---------------------------------------------------------------------------
// O RETORNO — compartilhado pelo registro de contato e pelo "reagendar"
// ---------------------------------------------------------------------------

type AtalhoRetorno = 'sem' | 'd1' | 'd2' | 'd3' | 'd7' | 'outro'

const ATALHOS_RETORNO: { id: AtalhoRetorno; rotulo: string; dias?: number }[] = [
  { id: 'sem', rotulo: 'Sem retorno' },
  { id: 'd1', rotulo: 'Amanhã', dias: 1 },
  { id: 'd2', rotulo: 'Em 2 dias', dias: 2 },
  { id: 'd3', rotulo: 'Em 3 dias', dias: 3 },
  { id: 'd7', rotulo: 'Em 1 semana', dias: 7 },
  { id: 'outro', rotulo: 'Outro dia' },
]

interface EstadoRetorno {
  atalho: AtalhoRetorno
  dia: string
  hora: string
}

function retornoDoEstado(e: EstadoRetorno, hoje: string): string | null {
  if (e.atalho === 'sem') return null
  if (e.atalho === 'outro') return e.dia ? retornoNoDia(e.dia, e.hora || '09:00') : null
  const dias = ATALHOS_RETORNO.find((a) => a.id === e.atalho)?.dias ?? 1
  return retornoNoDia(somarDias(hoje, dias))
}

/**
 * QUANDO VOLTAR. Os atalhos marcam o dia às 9h — é a hora em que o vendedor
 * abre a fila. "Outro dia" abre data e hora, para o "me liga às 18h" da mãe.
 */
function EscolhaDeRetorno({
  estado,
  onMudar,
  hoje,
  rotulo,
}: {
  estado: EstadoRetorno
  onMudar: (e: EstadoRetorno) => void
  hoje: string
  rotulo: string
}) {
  return (
    <div className="space-y-3">
      <Escolhas
        rotulo={rotulo}
        opcoes={ATALHOS_RETORNO}
        escolhida={estado.atalho}
        onEscolher={(atalho) =>
          onMudar({ ...estado, atalho, dia: atalho === 'outro' && !estado.dia ? somarDias(hoje, 1) : estado.dia })
        }
      />
      {estado.atalho === 'outro' && (
        <div className="grid grid-cols-[1fr_8rem] gap-2">
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Dia</span>
            <input
              type="date"
              value={estado.dia}
              min={hoje}
              onChange={(e) => onMudar({ ...estado, dia: e.target.value })}
              className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-base tabular-nums"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Hora</span>
            <input
              type="time"
              value={estado.hora}
              onChange={(e) => onMudar({ ...estado, hora: e.target.value })}
              className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-base tabular-nums"
            />
          </label>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// REGISTRAR CONTATO — o gesto mais repetido da tela
// ---------------------------------------------------------------------------

/**
 * O RETORNO SUGERIDO pelo resultado, enquanto a pessoa não escolheu outro:
 * quem não respondeu se procura amanhã; proposta enviada pede resposta em
 * dois dias; "pediu retorno" quase sempre vem com dia — três é o chute.
 * "Respondeu" não sugere nada: a conversa está andando.
 */
const RETORNO_SUGERIDO: Partial<Record<ResultadoContato, AtalhoRetorno>> = {
  sem_resposta: 'd1',
  mandou_proposta: 'd2',
  pediu_retorno: 'd3',
}

export function DialogoContato({
  lead,
  onFechar,
  resultadoInicial,
}: {
  lead: Lead
  onFechar: () => void
  /** O resultado já escolhido — o Funil, quando o lead é solto em "Negociando". */
  resultadoInicial?: ResultadoContato | undefined
}) {
  const hoje = hojeNoFuso()
  const registrar = useRegistrarContato()
  const [canal, setCanal] = useState<CanalContato>('whatsapp')
  const [resultado, setResultado] = useState<ResultadoContato | null>(resultadoInicial ?? null)
  const [nota, setNota] = useState('')
  const [retorno, setRetorno] = useState<EstadoRetorno>({
    atalho: (resultadoInicial && RETORNO_SUGERIDO[resultadoInicial]) ?? 'sem',
    dia: '',
    hora: '09:00',
  })
  const [retornoTocado, setRetornoTocado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const naRepescagem = lead.fase === 'repescagem'

  return (
    <Dialogo
      titulo="Registrar contato"
      rotuloConfirmar={registrar.isPending ? 'Registrando…' : 'Registrar'}
      confirmarDesabilitado={resultado === null || (retorno.atalho === 'outro' && !retorno.dia)}
      ocupado={registrar.isPending}
      erro={erro}
      onCancelar={onFechar}
      onConfirmar={() => {
        if (!resultado) return
        setErro(null)
        registrar.mutate(
          { leadId: lead.id, canal, resultado, nota, retorno: retornoDoEstado(retorno, hoje) },
          { onSuccess: onFechar, onError: (e) => setErro(mensagem(e)) },
        )
      }}
    >
      <div className="space-y-5">
        <Quem lead={lead} />
        {naRepescagem && (
          <p className="rounded-md bg-acento-suave px-3 py-2 text-xs font-semibold text-acento-forte">
            O prazo da venda já passou — este contato conta como repescagem.
          </p>
        )}
        <Escolhas
          rotulo="Por onde"
          opcoes={(Object.keys(ROTULO_CANAL) as CanalContato[]).map((id) => ({ id, rotulo: ROTULO_CANAL[id] }))}
          escolhida={canal}
          onEscolher={setCanal}
        />
        <Escolhas
          rotulo="Como foi"
          opcoes={(Object.keys(ROTULO_RESULTADO) as ResultadoContato[]).map((id) => ({
            id,
            rotulo: ROTULO_RESULTADO[id],
          }))}
          escolhida={resultado}
          onEscolher={(r) => {
            setResultado(r)
            if (!retornoTocado) setRetorno((e) => ({ ...e, atalho: RETORNO_SUGERIDO[r] ?? 'sem' }))
          }}
        />
        <EscolhaDeRetorno
          rotulo="Quando falar de novo"
          estado={retorno}
          hoje={hoje}
          onMudar={(e) => {
            setRetornoTocado(true)
            setRetorno(e)
          }}
        />
        <CampoNota rotulo="Nota" valor={nota} aoMudar={setNota} placeholder="O que a família disse" />
      </div>
    </Dialogo>
  )
}

// ---------------------------------------------------------------------------
// REAGENDAR — mudar o retorno sem ter falado com a família
// ---------------------------------------------------------------------------

export function DialogoRetorno({ lead, onFechar }: { lead: Lead; onFechar: () => void }) {
  const hoje = hojeNoFuso()
  const agendar = useAgendarRetorno()
  const atual = lead.proximoRetornoEm
  const [estado, setEstado] = useState<EstadoRetorno>(() =>
    atual
      ? {
          atalho: 'outro',
          dia: diaDoInstante(atual),
          hora: new Intl.DateTimeFormat('pt-BR', {
            timeZone: 'America/Sao_Paulo',
            hour: '2-digit',
            minute: '2-digit',
          }).format(new Date(atual)),
        }
      : { atalho: 'd1', dia: '', hora: '09:00' },
  )
  const [erro, setErro] = useState<string | null>(null)

  return (
    <Dialogo
      titulo={atual ? 'Mudar o retorno' : 'Agendar retorno'}
      rotuloConfirmar={agendar.isPending ? 'Salvando…' : estado.atalho === 'sem' ? 'Tirar o retorno' : 'Agendar'}
      confirmarDesabilitado={(estado.atalho === 'sem' && !atual) || (estado.atalho === 'outro' && !estado.dia)}
      ocupado={agendar.isPending}
      erro={erro}
      onCancelar={onFechar}
      onConfirmar={() => {
        setErro(null)
        agendar.mutate(
          { leadId: lead.id, quando: retornoDoEstado(estado, hoje) },
          { onSuccess: onFechar, onError: (e) => setErro(mensagem(e)) },
        )
      }}
    >
      <div className="space-y-4">
        <Quem lead={lead} />
        <EscolhaDeRetorno rotulo="Quando falar com a família" estado={estado} onMudar={setEstado} hoje={hoje} />
      </div>
    </Dialogo>
  )
}

// ---------------------------------------------------------------------------
// PASSAR — o lead muda de vendedor
// ---------------------------------------------------------------------------

export function DialogoPassar({ lead, onFechar }: { lead: Lead; onFechar: () => void }) {
  const passar = usePassarLead()
  const { data: pessoas = [] } = usePessoasDoComercial()
  const [para, setPara] = useState<string | null>(null)
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  const candidatas = pessoas.filter((p) => p.podeReceber && p.id !== lead.vendedorId)

  return (
    <Dialogo
      titulo="Passar o lead"
      rotuloConfirmar={passar.isPending ? 'Passando…' : 'Passar'}
      confirmarDesabilitado={para === null}
      ocupado={passar.isPending}
      erro={erro}
      onCancelar={onFechar}
      onConfirmar={() => {
        if (!para) return
        setErro(null)
        passar.mutate(
          { leadId: lead.id, paraPessoaId: para, motivo },
          { onSuccess: onFechar, onError: (e) => setErro(mensagem(e)) },
        )
      }}
    >
      <div className="space-y-4">
        <Quem lead={lead} />
        <p className="text-sm">
          Hoje com <span className="font-semibold">{lead.vendedorNome ?? 'ninguém'}</span>.
        </p>
        <div>
          <span className="text-sm font-medium">Para quem</span>
          <div className="mt-1.5">
            <Dropdown
              rotulo="Escolher a pessoa"
              itens={candidatas.map((p) => ({ id: p.id, rotulo: p.nome }))}
              selecionado={para ?? undefined}
              onEscolher={(i) => setPara(i.id)}
              buscavel
              larguraCheia
              variante="campo"
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Só aparece quem tem a tela Comercial.</p>
        </div>
        <CampoNota rotulo="Por quê" valor={motivo} aoMudar={setMotivo} placeholder="Férias, maternidade nova…" />
      </div>
    </Dialogo>
  )
}

// ---------------------------------------------------------------------------
// PERDIDO — com motivo, para o relatório saber por que se perde
// ---------------------------------------------------------------------------

export function DialogoPerdido({ lead, onFechar }: { lead: Lead; onFechar: () => void }) {
  const perder = useMarcarPerdido()
  const [motivo, setMotivo] = useState<MotivoPerda | null>(null)
  const [texto, setTexto] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  return (
    <Dialogo
      titulo="Marcar como perdido"
      rotuloConfirmar={perder.isPending ? 'Salvando…' : 'Marcar perdido'}
      confirmarDestrutivo
      confirmarDesabilitado={motivo === null || (motivo === 'outro' && texto.trim() === '')}
      ocupado={perder.isPending}
      erro={erro}
      onCancelar={onFechar}
      onConfirmar={() => {
        if (!motivo) return
        setErro(null)
        perder.mutate(
          { leadId: lead.id, motivo, texto },
          { onSuccess: onFechar, onError: (e) => setErro(mensagem(e)) },
        )
      }}
    >
      <div className="space-y-4">
        <Quem lead={lead} />
        <Escolhas
          rotulo="Por quê"
          opcoes={(Object.keys(ROTULO_MOTIVO_PERDA) as MotivoPerda[]).map((id) => ({
            id,
            rotulo: ROTULO_MOTIVO_PERDA[id],
          }))}
          escolhida={motivo}
          onEscolher={setMotivo}
        />
        <CampoNota
          rotulo={motivo === 'outro' ? 'Qual o motivo' : 'Detalhe'}
          opcional={motivo !== 'outro'}
          valor={texto}
          aoMudar={setTexto}
        />
        <p className="text-xs text-muted-foreground">
          O lead sai da fila. Se a família voltar a chamar, ele se reabre pela ficha.
        </p>
      </div>
    </Dialogo>
  )
}

// ---------------------------------------------------------------------------
// FECHOU — nesta fase, o caso continua nascendo no Calendário
// ---------------------------------------------------------------------------

export function DialogoGanho({ lead, onFechar }: { lead: Lead; onFechar: () => void }) {
  const ganhar = useMarcarGanho()
  const [erro, setErro] = useState<string | null>(null)

  return (
    <Dialogo
      titulo="Fechou a venda?"
      rotuloConfirmar={ganhar.isPending ? 'Salvando…' : 'Fechou'}
      ocupado={ganhar.isPending}
      erro={erro}
      onCancelar={onFechar}
      onConfirmar={() => {
        setErro(null)
        ganhar.mutate({ leadId: lead.id }, { onSuccess: onFechar, onError: (e) => setErro(mensagem(e)) })
      }}
    >
      <div className="space-y-3">
        <Quem lead={lead} />
        <p className="text-sm">
          O lead sai da fila e conta como venda fechada. Crie o caso no Calendário, como sempre — ligar o lead ao
          caso, e criar o caso daqui, entra na próxima etapa da tela.
        </p>
      </div>
    </Dialogo>
  )
}

// ---------------------------------------------------------------------------
// REABRIR — a família voltou a chamar
// ---------------------------------------------------------------------------

export function DialogoReabrir({ lead, onFechar }: { lead: Lead; onFechar: () => void }) {
  const reabrir = useReabrirLead()
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  return (
    <Dialogo
      titulo="Reabrir o lead"
      rotuloConfirmar={reabrir.isPending ? 'Reabrindo…' : 'Reabrir'}
      confirmarDesabilitado={motivo.trim() === ''}
      ocupado={reabrir.isPending}
      erro={erro}
      onCancelar={onFechar}
      onConfirmar={() => {
        setErro(null)
        reabrir.mutate({ leadId: lead.id, motivo }, { onSuccess: onFechar, onError: (e) => setErro(mensagem(e)) })
      }}
    >
      <div className="space-y-4">
        <Quem lead={lead} />
        <CampoNota
          rotulo="Por que reabrir"
          opcional={false}
          valor={motivo}
          aoMudar={setMotivo}
          placeholder="A família voltou a chamar"
        />
      </div>
    </Dialogo>
  )
}
