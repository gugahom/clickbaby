import { useState } from 'react'
import { CampoTexto } from '@/components/ui/CampoTexto'
import { Dialogo } from '@/components/ui/Dialogo'
import { Dropdown } from '@/components/ui/Dropdown'
import { hojeNoFuso } from '@/lib/formato'
import { useCadastros } from '@/features/quadro/api/useCadastros'
import {
  useCriarLead,
  useEditarLead,
  usePessoasDoComercial,
  useVendedoresDasMaternidades,
  type DadosDoLead,
} from '../api/useLeads'
import { ROTULO_ORIGEM, diaCurto, diasEntre, somarDias, type Lead, type OrigemLead } from '../lib/leads'
import { CampoNota, Escolhas } from './Escolhas'

/**
 * NOVO LEAD E EDITAR LEAD — o mesmo formulário.
 *
 * O VENDEDOR NÃO SE ESCOLHE NA MÃO por padrão: ele vem da maternidade (o
 * cadastro "quem atende cada maternidade"). Quem precisa de outro escolhe; e
 * na edição o vendedor nem aparece — trocar de mão é "Passar", que deixa
 * registro.
 *
 * "Monte seu pacote" fica fora da lista: é a origem da página pública da fase
 * G, que nenhuma pessoa digita.
 */
const ORIGENS_DIGITAVEIS: OrigemLead[] = ['cupom', 'vendedor', 'anuncio', 'instagram', 'indicacao', 'outro']

const AUTOMATICO = 'automatico'

export function DialogoLead({
  lead,
  onFechar,
  onCriado,
}: {
  /** Presente = editar. */
  lead?: Lead
  onFechar: () => void
  onCriado?: (id: string, jaExistia: boolean) => void
}) {
  const hoje = hojeNoFuso()
  const editando = lead !== undefined
  const { data: cadastros } = useCadastros(true)
  const { data: pessoas = [] } = usePessoasDoComercial()
  const { data: vendedores = [] } = useVendedoresDasMaternidades()
  const criar = useCriarLead()
  const editar = useEditarLead()

  const [d, setD] = useState<DadosDoLead>({
    maeNome: lead?.maeNome ?? '',
    bebeNome: lead?.bebeNome ?? '',
    telefone: lead?.telefone ?? '',
    dpp: lead?.dpp ?? '',
    maternidadeId: lead?.maternidadeId ?? '',
    origem: lead?.origem ?? 'cupom',
    origemDetalhe: lead?.origemDetalhe ?? '',
    interesseNewBorn: lead?.interesseNewBorn ?? false,
    observacao: lead?.observacao ?? '',
  })
  const [vendedor, setVendedor] = useState<string>(AUTOMATICO)
  const [erro, setErro] = useState<string | null>(null)
  const mudar = (parcial: Partial<DadosDoLead>) => setD((antes) => ({ ...antes, ...parcial }))

  const maternidades = cadastros?.maternidades ?? []
  const daMaternidade = vendedores.find((v) => v.maternidadeId === d.maternidadeId)?.pessoaId ?? null
  const nomeDe = (id: string | null) => pessoas.find((p) => p.id === id)?.nome ?? null

  const prazo = d.dpp ? somarDias(d.dpp, -10) : null
  const diasAtePrazo = prazo ? diasEntre(hoje, prazo) : null

  const ocupado = criar.isPending || editar.isPending
  const podeSalvar = d.maeNome.trim() !== '' && d.telefone.replace(/\D/g, '').length >= 10

  function salvar() {
    setErro(null)
    if (lead) {
      editar.mutate(
        { ...d, leadId: lead.id },
        { onSuccess: onFechar, onError: (e) => setErro(e instanceof Error ? e.message : String(e)) },
      )
      return
    }
    criar.mutate(
      { ...d, vendedorId: vendedor === AUTOMATICO ? '' : vendedor },
      {
        onSuccess: (r) => onCriado?.(r.id, r.jaExistia),
        onError: (e) => setErro(e instanceof Error ? e.message : String(e)),
      },
    )
  }

  return (
    <Dialogo
      titulo={editando ? 'Editar lead' : 'Novo lead'}
      rotuloConfirmar={ocupado ? 'Salvando…' : editando ? 'Salvar' : 'Criar lead'}
      confirmarDesabilitado={!podeSalvar}
      ocupado={ocupado}
      erro={erro}
      largo
      onCancelar={onFechar}
      onConfirmar={salvar}
    >
      <div className="grid gap-x-6 gap-y-4 md:grid-cols-2">
        <div className="space-y-4">
          <CampoTexto rotulo="Mãe" valor={d.maeNome} aoMudar={(v) => mudar({ maeNome: v })} autoComplete="off" />
          <CampoTexto
            rotulo="Bebê"
            opcional
            valor={d.bebeNome}
            aoMudar={(v) => mudar({ bebeNome: v })}
            autoComplete="off"
          />
          <CampoTexto
            rotulo="Telefone (WhatsApp)"
            valor={d.telefone}
            aoMudar={(v) => mudar({ telefone: v })}
            inputMode="tel"
            autoComplete="off"
            ajuda="Com DDD. Um telefone com lead aberto não vira outro lead — abre o que já existe."
          />
          <label className="block">
            <span className="text-sm font-medium">
              DPP<span className="ml-1 text-xs text-muted-foreground">(data provável do parto)</span>
            </span>
            <input
              type="date"
              value={d.dpp}
              onChange={(e) => mudar({ dpp: e.target.value })}
              className="mt-1.5 h-12 w-full rounded-xl border border-border bg-background px-3 text-base tabular-nums"
            />
            <span className="mt-1 block text-xs text-muted-foreground">
              {prazo
                ? `Prazo da venda: ${diaCurto(prazo)} (DPP − 10)${
                    diasAtePrazo !== null && diasAtePrazo < 0 ? ' — já passou, o lead nasce na repescagem' : ''
                  }`
                : 'Sem DPP o lead não tem prazo nem prioridade.'}
            </span>
          </label>
          <div>
            <span className="text-sm font-medium">Maternidade</span>
            <div className="mt-1.5">
              <Dropdown
                rotulo="Ainda não sabe"
                itens={[
                  { id: '', rotulo: 'Ainda não sabe' },
                  ...maternidades.map((m) => ({ id: m.id, rotulo: `${m.sigla} — ${m.nome}` })),
                ]}
                selecionado={d.maternidadeId}
                onEscolher={(i) => mudar({ maternidadeId: i.id })}
                buscavel
                larguraCheia
                variante="campo"
              />
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <Escolhas
            rotulo="De onde veio"
            opcoes={(lead?.origem === 'monte_seu_pacote'
              ? [...ORIGENS_DIGITAVEIS, 'monte_seu_pacote' as const]
              : ORIGENS_DIGITAVEIS
            ).map((id) => ({ id, rotulo: ROTULO_ORIGEM[id] }))}
            escolhida={d.origem}
            onEscolher={(origem) => mudar({ origem })}
          />
          <CampoTexto
            rotulo="Detalhe da origem"
            opcional
            valor={d.origemDetalhe}
            aoMudar={(v) => mudar({ origemDetalhe: v })}
            placeholder="CUPOM-GNDI, CELL GUI, nome de quem indicou…"
            autoComplete="off"
          />
          {!editando && (
            <div>
              <span className="text-sm font-medium">Com quem fica</span>
              <div className="mt-1.5">
                <Dropdown
                  rotulo="Da maternidade"
                  itens={[
                    {
                      id: AUTOMATICO,
                      rotulo: `Quem atende a maternidade${
                        d.maternidadeId ? ` — ${nomeDe(daMaternidade) ?? 'ninguém definido'}` : ''
                      }`,
                    },
                    ...pessoas.filter((p) => p.podeReceber).map((p) => ({ id: p.id, rotulo: p.nome })),
                  ]}
                  selecionado={vendedor}
                  onEscolher={(i) => setVendedor(i.id)}
                  buscavel
                  larguraCheia
                  variante="campo"
                />
              </div>
            </div>
          )}
          <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-border px-3">
            <input
              type="checkbox"
              checked={d.interesseNewBorn}
              onChange={(e) => mudar({ interesseNewBorn: e.target.checked })}
              className="size-5 accent-marca"
            />
            <span className="text-sm font-medium">Tem interesse no New Born</span>
          </label>
          <CampoNota rotulo="Observação" valor={d.observacao} aoMudar={(v) => mudar({ observacao: v })} />
        </div>
      </div>
    </Dialogo>
  )
}
