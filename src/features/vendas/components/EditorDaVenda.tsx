import type { KeyboardEvent } from 'react'
import { Botao } from '@/components/ui/Botao'
import { BotaoIcone } from '@/components/ui/BotaoIcone'
import { CampoTexto } from '@/components/ui/CampoTexto'
import { Dropdown } from '@/components/ui/Dropdown'
import { IconeAdicionar, IconeX } from '@/components/ui/icones'
import { formatarMoeda } from '@/lib/formato'
import type { VendaDoCaso } from '../api/useVendaDoCaso'
import {
  ITENS_DE_VENDA,
  PARCELAS,
  ROTULO_ITEM_DE_VENDA,
  alternativaNoCartao,
  editarRascunho,
  linhaDoRascunho,
  linkValido,
  problemaDoRascunho,
  proximoRascunho,
  rascunhoDaTabela,
  rascunhoEfetivo,
  rotuloDaLinha,
  sufixoDoValor,
  type EstadoDaVenda,
  type ItemDeVenda,
  type PrecoDoPacote,
} from '../lib/vendas'

/**
 * O VALOR E O CONTRATO NO FORMULÁRIO DO CALENDÁRIO (14/10/2026, pedido do
 * gestor: "o melhor lugar que eu pensei é aqui direto no meu agendamento (…)
 * quando eu vou fazer um novo caso, ou esses casos que já existem, eu poder
 * entrar e editar e lançar o valor").
 *
 * Nada grava antes do "Salvar" do formulário — o caso pode nem existir ainda.
 * O que já está no banco aparece com um × que marca para apagar; as linhas
 * novas entram pelo "Adicionar", e a que ficou digitada sem o clique entra
 * sozinha no Salvar (ver `mudancaDaVenda`).
 *
 * O PACOTE VEM DA TABELA (27/10/2026, o quadro do gestor): escolhidos pacote e
 * maternidade, a linha mostra "até 6x R$ 265,00 ou R$ 1.490,00 no Pix" em
 * caixas fixas, bem à vista — é o que o vendedor passa para o cliente. EDITAR
 * abre os valores para uma negociação. Sem preço na tabela (BIRTH, NEWBORN,
 * EVENTO, a Rocio) e nas vendas a mais, os valores são digitados.
 */
export function EditorDaVenda({
  inicial,
  carregando,
  estado,
  onMudar,
  tabela,
  entraSozinho,
}: {
  /** O que o banco tem — ausente num caso novo. */
  inicial: VendaDoCaso | undefined
  carregando: boolean
  estado: EstadoDaVenda
  onMudar: (estado: EstadoDaVenda) => void
  /** O preço do pacote, já filtrado por `tabelaAplicavel`. */
  tabela: PrecoDoPacote | null
  /** O pacote da tabela entra no Salvar sem o "+" (ver `mudancaDaVenda`). */
  entraSozinho: boolean
}) {
  const contrato = estado.contrato ?? inicial?.contrato ?? ''
  const existentes = (inicial?.linhas ?? []).filter((l) => !estado.removidas.includes(l.id))
  const total =
    (existentes.reduce((t, l) => t + Math.round(l.valor * 100), 0) +
      estado.novas.reduce((t, l) => t + Math.round(l.valor * 100), 0)) /
    100
  const r = estado.rascunho
  const daTabela = rascunhoDaTabela(r, tabela)
  const efetivo = rascunhoEfetivo(r, tabela)
  const problema = problemaDoRascunho(efetivo)
  const quantas = existentes.length + estado.novas.length

  const mudarRascunho = (parcial: Partial<typeof r>) => onMudar({ ...estado, rascunho: { ...r, ...parcial } })

  function adicionar() {
    if (problema !== null) return
    onMudar({ ...estado, novas: [...estado.novas, linhaDoRascunho(efetivo)], rascunho: proximoRascunho(efetivo) })
  }

  // ENTER ADICIONA, como o "+" (26/10/2026) — e não salva o formulário: o
  // diálogo inteiro é um <form>.
  const enterAdiciona = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    adicionar()
  }

  const botaoAdicionar = (
    <BotaoIcone
      rotulo="Adicionar esta venda"
      tom="acao"
      disabled={problema !== null}
      motivo={problema ? `Falta ${problema}.` : undefined}
      onClick={adicionar}
      className="mb-0.5"
    >
      <IconeAdicionar className="size-5" />
    </BotaoIcone>
  )

  return (
    <section className="space-y-2.5 rounded-xl border border-border px-3 py-2.5" aria-label="Venda do caso">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium">
          Venda{' '}
          <span className="font-normal text-muted-foreground" title="Só atendimento e gestão veem. Não vai para o Google.">
            · interno, não vai para o Google
          </span>
        </span>
        {quantas > 0 && <span className="text-sm font-extrabold tabular-nums">{formatarMoeda(total)}</span>}
      </div>

      {carregando && <p className="text-xs text-muted-foreground">Carregando a venda…</p>}

      {quantas > 0 && (
        <ul className="grid gap-1 sm:grid-cols-2">
          {existentes.map((l) => (
            <Linha
              key={l.id}
              rotulo={rotuloDaLinha(l)}
              valor={l.valor}
              sufixo={sufixoDoValor(l)}
              alternativa={alternativaNoCartao(l)}
              onTirar={() => onMudar({ ...estado, removidas: [...estado.removidas, l.id] })}
            />
          ))}
          {estado.novas.map((l) => (
            <Linha
              key={l.chave}
              rotulo={rotuloDaLinha({ item: l.item, descricao: l.descricao || null })}
              valor={l.valor}
              sufixo={sufixoDoValor({ forma: null, ...l })}
              alternativa={alternativaNoCartao({ forma: null, ...l })}
              nova
              onTirar={() => onMudar({ ...estado, novas: estado.novas.filter((n) => n.chave !== l.chave) })}
            />
          ))}
        </ul>
      )}
      {estado.removidas.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {estado.removidas.length === 1 ? 'Uma venda sai' : `${estado.removidas.length} vendas saem`} ao salvar.
        </p>
      )}

      {/* LANÇAR: o quê, ATÉ quantas vezes de quanto no cartão, OU quanto no Pix —
          o desenho do quadro do gestor. "Outro" pede a descrição, senão vira
          linha que ninguém entende depois. */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-full sm:w-44">
          <span className="text-xs font-medium text-muted-foreground">O quê</span>
          <div className="mt-1">
            <Dropdown
              larguraCheia
              rotulo="O que foi vendido"
              selecionado={r.item}
              onEscolher={(item) => mudarRascunho({ item: item.id as ItemDeVenda })}
              itens={ITENS_DE_VENDA.map((i) => ({ id: i, rotulo: ROTULO_ITEM_DE_VENDA[i] }))}
            />
          </div>
        </div>

        {daTabela ? (
          <>
            <ValorFixo rotulo={`Até ${tabela.parcelas}x`} valor={formatarMoeda(tabela.valorParcela)} />
            <span className="pb-3 text-sm text-muted-foreground">ou</span>
            <ValorFixo rotulo="Pix" valor={formatarMoeda(tabela.valorPix)} />
            <Botao variante="contorno" className="mb-0.5" onClick={() => mudarRascunho(editarRascunho(r, tabela))}>
              Editar
            </Botao>
          </>
        ) : (
          <>
            <div className="w-24">
              <span className="text-xs font-medium text-muted-foreground">Até</span>
              <div className="mt-1">
                <Dropdown
                  larguraCheia
                  rotulo="Parcelas"
                  selecionado={String(r.parcelas)}
                  onEscolher={(item) => mudarRascunho({ parcelas: Number(item.id) })}
                  itens={PARCELAS.map((n) => ({ id: String(n), rotulo: `${n}x` }))}
                />
              </div>
            </div>
            <div className="w-32">
              <CampoTexto
                rotulo="Parcela (R$)"
                valor={r.valorParcela}
                aoMudar={(valorParcela) => mudarRascunho({ valorParcela })}
                inputMode="decimal"
                placeholder="265,00"
                enterKeyHint="done"
                onKeyDown={enterAdiciona}
              />
            </div>
            <span className="pb-3 text-sm text-muted-foreground">ou</span>
            <div className="w-36">
              <CampoTexto
                rotulo="Pix (R$)"
                valor={r.valor}
                aoMudar={(valor) => mudarRascunho({ valor })}
                inputMode="decimal"
                placeholder="1.490,00"
                enterKeyHint="done"
                onKeyDown={enterAdiciona}
              />
            </div>
          </>
        )}
        {botaoAdicionar}
      </div>
      {daTabela && !entraSozinho && (
        <p className="text-xs font-semibold text-atencao-tinta">Valores da tabela. Aperte + para lançar o pacote.</p>
      )}
      {r.item === 'outro' && (
        <CampoTexto
          rotulo="O que foi vendido"
          valor={r.descricao}
          aoMudar={(descricao) => mudarRascunho({ descricao })}
          placeholder="Ex.: ensaio de gestante"
        />
      )}

      <CampoTexto
        rotulo="Link do contrato"
        valor={contrato}
        aoMudar={(v) => onMudar({ ...estado, contrato: v })}
        opcional
        inputMode="url"
        placeholder="https://"
      />
      {contrato.trim() !== '' && !linkValido(contrato) && (
        <p className="text-xs font-semibold text-atrasado">Cole o link do contrato completo, começando com https://.</p>
      )}
      {inicial?.contrato && contrato.trim() === '' && (
        <p className="text-xs font-semibold text-atencao-tinta">Salvar com o campo vazio tira o link do contrato.</p>
      )}
    </section>
  )
}

/** O valor da tabela em destaque, do tamanho de um campo — mas que não se digita. */
function ValorFixo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="min-w-32">
      <span className="text-sm font-medium">{rotulo}</span>
      <div className="mt-1.5 flex min-h-12 items-center rounded-md border border-marca/40 bg-marca-suave px-3 text-lg font-extrabold text-foreground tabular-nums">
        {valor}
      </div>
    </div>
  )
}

function Linha({
  rotulo,
  valor,
  sufixo,
  alternativa,
  nova,
  onTirar,
}: {
  rotulo: string
  valor: number
  /** "no Pix" — ou como a linha de 26/10 foi paga. */
  sufixo: string | null
  /** "ou até 6x de R$ 265,00 no cartão". */
  alternativa: string | null
  nova?: boolean
  onTirar: () => void
}) {
  return (
    // `min-w-0`: item de grade não encolhe abaixo do texto inteiro, e a condição
    // do cartão é comprida — sem isto ela alargava o diálogo no celular.
    <li className="flex min-w-0 items-center gap-2 rounded-lg bg-muted/50 py-1 pr-0.5 pl-2.5 text-sm">
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">
          {rotulo}
          {nova && <span className="ml-1.5 text-xs font-normal text-muted-foreground">nova</span>}
        </span>
        {alternativa && <span className="block text-xs text-muted-foreground">{alternativa}</span>}
      </span>
      <span className="flex-shrink-0 text-right tabular-nums">
        {formatarMoeda(valor)}
        {sufixo && <span className="ml-1 text-xs text-muted-foreground">{sufixo}</span>}
      </span>
      <BotaoIcone rotulo={`Tirar ${rotulo}`} onClick={onTirar}>
        <IconeX className="size-4" />
      </BotaoIcone>
    </li>
  )
}
