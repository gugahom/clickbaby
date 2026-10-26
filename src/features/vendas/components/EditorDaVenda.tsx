import { BotaoIcone } from '@/components/ui/BotaoIcone'
import { CampoTexto } from '@/components/ui/CampoTexto'
import { Dropdown } from '@/components/ui/Dropdown'
import { IconeAdicionar, IconeX } from '@/components/ui/icones'
import { formatarMoeda } from '@/lib/formato'
import type { VendaDoCaso } from '../api/useVendaDoCaso'
import {
  FORMAS_DE_PAGAMENTO,
  ITENS_DE_VENDA,
  PARCELAS,
  ROTULO_FORMA,
  ROTULO_ITEM_DE_VENDA,
  linhaDoRascunho,
  linkValido,
  problemaDoRascunho,
  rotuloDaLinha,
  rotuloDoPagamento,
  type EstadoDaVenda,
  type FormaDePagamento,
  type ItemDeVenda,
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
 */
export function EditorDaVenda({
  inicial,
  carregando,
  estado,
  onMudar,
}: {
  /** O que o banco tem — ausente num caso novo. */
  inicial: VendaDoCaso | undefined
  carregando: boolean
  estado: EstadoDaVenda
  onMudar: (estado: EstadoDaVenda) => void
}) {
  const contrato = estado.contrato ?? inicial?.contrato ?? ''
  const existentes = (inicial?.linhas ?? []).filter((l) => !estado.removidas.includes(l.id))
  const total =
    (existentes.reduce((t, l) => t + Math.round(l.valor * 100), 0) +
      estado.novas.reduce((t, l) => t + Math.round(l.valor * 100), 0)) /
    100
  const r = estado.rascunho
  const problema = problemaDoRascunho(r)
  const quantas = existentes.length + estado.novas.length

  const mudarRascunho = (parcial: Partial<typeof r>) => onMudar({ ...estado, rascunho: { ...r, ...parcial } })

  // A linha entra e o rascunho volta limpo, guardando a FORMA e as parcelas: a
  // venda a mais de um caso costuma ser paga do mesmo jeito que o pacote.
  function adicionar() {
    if (problema !== null) return
    onMudar({
      ...estado,
      novas: [...estado.novas, linhaDoRascunho(r)],
      rascunho: { ...r, item: r.item === 'pacote' ? 'reels' : r.item, valor: '', descricao: '' },
    })
  }

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
              pagamento={rotuloDoPagamento(l.forma, l.parcelas)}
              valor={l.valor}
              onTirar={() => onMudar({ ...estado, removidas: [...estado.removidas, l.id] })}
            />
          ))}
          {estado.novas.map((l) => (
            <Linha
              key={l.chave}
              rotulo={rotuloDaLinha({ item: l.item, descricao: l.descricao || null })}
              pagamento={rotuloDoPagamento(l.forma, l.parcelas)}
              valor={l.valor}
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

      {/* LANÇAR: o que foi vendido, quanto e COMO FOI PAGO (26/10/2026). O
          pacote é o primeiro, e "Outro" pede a descrição — senão vira linha que
          ninguém entende depois. ENTER NO VALOR ADICIONA, como o "+" (pedido do
          gestor), e não salva o formulário: o diálogo inteiro é um <form>. */}
      <div className="grid grid-cols-2 items-end gap-2 md:grid-cols-[minmax(0,11rem)_minmax(0,9rem)_minmax(0,8rem)_minmax(0,7rem)_auto]">
        <div>
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
        <CampoTexto
          rotulo="Valor (R$)"
          valor={r.valor}
          aoMudar={(valor) => mudarRascunho({ valor })}
          inputMode="decimal"
          placeholder="4.500,00"
          enterKeyHint="done"
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            e.preventDefault()
            adicionar()
          }}
        />
        <div>
          <span className="text-xs font-medium text-muted-foreground">Pagamento</span>
          <div className="mt-1">
            <Dropdown
              larguraCheia
              rotulo="Escolha"
              selecionado={r.forma ?? ''}
              onEscolher={(item) => mudarRascunho({ forma: item.id as FormaDePagamento })}
              itens={FORMAS_DE_PAGAMENTO.map((f) => ({ id: f, rotulo: ROTULO_FORMA[f] }))}
            />
          </div>
        </div>
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <span className="text-xs font-medium text-muted-foreground">Parcelas</span>
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
          {/* O "+" mora com as parcelas no celular, para não ficar sozinho numa linha. */}
          <BotaoIcone
            rotulo="Adicionar esta venda"
            tom="acao"
            disabled={problema !== null}
            motivo={problema ? `Falta ${problema}.` : undefined}
            onClick={adicionar}
            className="mb-0.5 md:hidden"
          >
            <IconeAdicionar className="size-5" />
          </BotaoIcone>
        </div>
        <BotaoIcone
          rotulo="Adicionar esta venda"
          tom="acao"
          disabled={problema !== null}
          motivo={problema ? `Falta ${problema}.` : undefined}
          onClick={adicionar}
          className="mb-0.5 hidden md:inline-flex"
        >
          <IconeAdicionar className="size-5" />
        </BotaoIcone>
      </div>
      <CampoTexto
        rotulo="Link do contrato"
        valor={contrato}
        aoMudar={(v) => onMudar({ ...estado, contrato: v })}
        opcional
        inputMode="url"
        placeholder="https://"
      />
      {r.item === 'outro' && (
        <CampoTexto
          rotulo="O que foi vendido"
          valor={r.descricao}
          aoMudar={(descricao) => mudarRascunho({ descricao })}
          placeholder="Ex.: ensaio de gestante"
        />
      )}

      {contrato.trim() !== '' && !linkValido(contrato) && (
        <p className="text-xs font-semibold text-atrasado">Cole o link do contrato completo, começando com https://.</p>
      )}
      {inicial?.contrato && contrato.trim() === '' && (
        <p className="text-xs font-semibold text-atencao-tinta">Salvar com o campo vazio tira o link do contrato.</p>
      )}
    </section>
  )
}

function Linha({
  rotulo,
  pagamento,
  valor,
  nova,
  onTirar,
}: {
  rotulo: string
  /** "Cartão 10x"; nulo nas linhas de antes da forma. */
  pagamento: string | null
  valor: number
  nova?: boolean
  onTirar: () => void
}) {
  return (
    <li className="flex items-center gap-2 rounded-lg bg-muted/50 py-0.5 pr-0.5 pl-2.5 text-sm">
      <span className="min-w-0 flex-1 truncate">
        {rotulo}
        {pagamento && <span className="ml-1.5 text-xs text-muted-foreground">· {pagamento}</span>}
        {nova && <span className="ml-1.5 text-xs text-muted-foreground">nova</span>}
      </span>
      <span className="flex-shrink-0 tabular-nums">{formatarMoeda(valor)}</span>
      <BotaoIcone rotulo={`Tirar ${rotulo}`} onClick={onTirar}>
        <IconeX className="size-4" />
      </BotaoIcone>
    </li>
  )
}
