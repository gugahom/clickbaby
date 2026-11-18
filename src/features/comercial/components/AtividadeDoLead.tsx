import clsx from 'clsx'
import {
  useHistoricoDoLead,
  usePessoasDoComercial,
  type Contato,
  type EventoDoLead,
} from '../api/useLeads'
import {
  ROTULO_CANAL,
  ROTULO_MOTIVO_PERDA,
  ROTULO_RESULTADO,
  dataHoraCurta,
  type MotivoPerda,
} from '../lib/leads'

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

export function AtividadeDoLead({ leadId }: { leadId: string }) {
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
