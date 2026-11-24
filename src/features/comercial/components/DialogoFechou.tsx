import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { Dialogo } from '@/components/ui/Dialogo'
import { FecharVendaDialogo } from '@/features/calendario/components/FormularioDoCaso'
import { useCasoEditavel } from '@/features/calendario/api/useCalendario'
import { useCadastros } from '@/features/quadro/api/useCadastros'
import { invalidarVendas, salvarVendaDoCaso, usePrecoDoPacote, useVendaDoCaso } from '@/features/vendas/api/useVendaDoCaso'
import { EditorDaVenda } from '@/features/vendas/components/EditorDaVenda'
import { VENDA_INTOCADA, mudancaDaVenda, tabelaAplicavel, type EstadoDaVenda } from '@/features/vendas/lib/vendas'
import { useCasosParecidos, useMarcarGanho, type CasoParecido } from '../api/useLeads'
import { diaCurto, nomeDoLead, type Lead } from '../lib/leads'

/**
 * "FECHOU" (24/11/2026, fase B). Antes de criar o caso, a agenda: enquanto o
 * Google e o CRM convivem, a mesma família pode já estar lá — o vendedor marcou
 * antes, ou o parto virou BIRTH. Sem caso parecido, o formulário abre direto;
 * com, quem fecha escolhe LIGAR a um deles ou criar o caso novo. O sistema não
 * liga sozinho por nome parecido (seção 7 do CLAUDE.md).
 *
 * Criar é `fechar_lead`, pelo formulário do Calendário (`FecharVendaDialogo`):
 * caso, venda, contrato e lead numa transação. Ligar é `marcar_lead_ganho` —
 * e, como no fechamento, cobra a venda do pacote e o contrato quando o caso
 * ainda não os tem, menos no BIRTH, que é feito sem contrato.
 */
export function DialogoFechou({ lead, onFechar }: { lead: Lead; onFechar: () => void }) {
  const parecidos = useCasosParecidos(lead.id)
  const [passo, setPasso] = useState<'escolher' | 'novo' | CasoParecido>('escolher')

  const novo = (
    <FecharVendaDialogo
      lead={{
        id: lead.id,
        maeNome: lead.maeNome,
        bebeNome: lead.bebeNome,
        maternidadeId: lead.maternidadeId,
        dpp: lead.dpp,
        interesseNewBorn: lead.interesseNewBorn,
      }}
      onFechado={onFechar}
      onFechar={onFechar}
    />
  )

  if (parecidos.isPending) {
    return (
      <Dialogo titulo="Fechar a venda" rotuloConfirmar="Fechar" soFechar onConfirmar={onFechar} onCancelar={onFechar}>
        <p className="text-sm text-muted-foreground">Procurando a família na agenda…</p>
      </Dialogo>
    )
  }

  // Sem parecido — ou sem conseguir procurar —, o caminho é o caso novo: a
  // busca é ajuda, não porta.
  if (passo === 'novo' || parecidos.isError || parecidos.data.length === 0) return novo
  if (passo !== 'escolher') return <DialogoLigar lead={lead} caso={passo} onLigado={onFechar} onVoltar={() => setPasso('escolher')} />

  return (
    <Dialogo
      titulo="Esta família já está na agenda?"
      rotuloConfirmar="Não é nenhum — criar o caso"
      onConfirmar={() => setPasso('novo')}
      onCancelar={onFechar}
    >
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {parecidos.data.length === 1 ? 'Achamos um caso' : `Achamos ${parecidos.data.length} casos`} com o mesmo nome
          de mãe perto da DPP de <span className="font-semibold text-foreground">{nomeDoLead(lead)}</span>. Se for ele,
          ligue o lead ao caso em vez de criar outro.
        </p>
        <ul className="space-y-2">
          {parecidos.data.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setPasso(c)}
                className="flex min-h-11 w-full items-center gap-3 rounded-xl border border-border px-3 py-2 text-left hover:bg-muted focus-visible:outline-2 focus-visible:outline-marca"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">
                    {c.maeNome}
                    {c.bebeNome && c.bebeNome !== 'BEBÊ' ? ` / ${c.bebeNome}` : ''}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {[diaCurto(c.dia), c.pacote ?? 'sem pacote', c.maternidade].filter(Boolean).join(' · ')}
                    {c.situacao === 'encerrado' ? ' · entregue' : ''}
                  </span>
                </span>
                <span className="text-sm font-semibold text-marca">Ligar</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Dialogo>
  )
}

function DialogoLigar({
  lead,
  caso,
  onLigado,
  onVoltar,
}: {
  lead: Lead
  caso: CasoParecido
  onLigado: () => void
  onVoltar: () => void
}) {
  const queryClient = useQueryClient()
  const ligar = useMarcarGanho()
  const editavel = useCasoEditavel(caso.id)
  const cadastros = useCadastros(true)
  const atual = useVendaDoCaso(caso.id, true)
  const preco = usePrecoDoPacote(editavel.data?.pacoteId ?? null, editavel.data?.maternidadeId ?? null, true)
  const [estado, setEstado] = useState<EstadoDaVenda>(VENDA_INTOCADA)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const slug = cadastros.data?.pacotes.find((p) => p.id === editavel.data?.pacoteId)?.slug ?? ''
  // O BIRTH é feito sem contrato, para tentar a venda depois: ligar a ele não
  // cobra nada (é o "virou BIRTH" da planilha).
  const ehBirth = slug.startsWith('birth')
  const tabela = atual.data ? tabelaAplicavel(preco.preco, atual.data.linhas, estado) : null
  const venda = mudancaDaVenda(estado, atual.data?.contrato ?? null, { tabela, entraSozinho: true })
  const m = venda.mudanca
  const temPacote =
    (atual.data?.linhas.some((l) => l.item === 'pacote' && !(m?.removidas ?? []).includes(l.id)) ?? false) ||
    (m?.novas.some((n) => n.item === 'pacote') ?? false)
  const contrato = m?.contrato !== undefined ? m.contrato : (atual.data?.contrato ?? '')
  const carregando = atual.isPending || editavel.isPending || cadastros.isPending
  const falta = [
    venda.falta,
    !ehBirth && !temPacote && 'o valor do pacote na venda',
    !ehBirth && !contrato && 'o link do contrato',
  ].filter(Boolean) as string[]
  const mudouVenda = m !== null && (m.novas.length > 0 || m.removidas.length > 0 || m.contrato !== undefined)

  async function confirmar() {
    if (m === null) return
    setErro(null)
    setSalvando(true)
    try {
      // Primeiro a venda (se mudou), depois o lead: se a ligação falhar, a venda
      // já está no caso e tentar de novo não a lança em dobro.
      if (mudouVenda) await salvarVendaDoCaso(caso.id, m, 'so_venda')
      await ligar.mutateAsync({ leadId: lead.id, casoId: caso.id })
      onLigado()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não deu para ligar o lead ao caso.')
    } finally {
      void invalidarVendas(queryClient)
      setSalvando(false)
    }
  }

  return (
    <Dialogo
      titulo="Ligar ao caso da agenda"
      rotuloConfirmar={salvando ? 'Ligando…' : 'Fechar com este caso'}
      confirmarDesabilitado={carregando || falta.length > 0}
      ocupado={salvando}
      erro={erro}
      largo
      onConfirmar={() => void confirmar()}
      onCancelar={onVoltar}
    >
      <div className="space-y-3">
        <div className="rounded-xl bg-muted/50 px-3 py-2.5 text-sm">
          <p className="font-semibold">
            {caso.maeNome}
            {caso.bebeNome && caso.bebeNome !== 'BEBÊ' ? ` / ${caso.bebeNome}` : ''}
          </p>
          <p className="text-xs text-muted-foreground">
            {[diaCurto(caso.dia), caso.pacote ?? 'sem pacote', caso.maternidade].filter(Boolean).join(' · ')}
          </p>
        </div>
        <p className="text-sm text-muted-foreground">
          O lead de <span className="font-semibold text-foreground">{nomeDoLead(lead)}</span> fecha ligado a este caso.
          {ehBirth
            ? ' Como é um BIRTH, a venda e o contrato podem ficar para depois.'
            : ' A venda do pacote e o contrato precisam estar no caso.'}
        </p>
        <EditorDaVenda
          inicial={atual.data}
          carregando={atual.isPending}
          estado={estado}
          onMudar={setEstado}
          tabela={tabela}
          entraSozinho
          contratoObrigatorio={!ehBirth}
        />
        {falta.length > 0 && !carregando && (
          <p className={clsx('text-sm font-semibold', venda.falta ? 'text-atrasado' : 'text-muted-foreground')}>
            Falta {falta.join(', ')}.
          </p>
        )}
      </div>
    </Dialogo>
  )
}
