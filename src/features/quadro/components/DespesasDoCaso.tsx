import { useState } from 'react'
import clsx from 'clsx'
import { Dialogo } from '@/components/ui/Dialogo'
import { Dropdown } from '@/components/ui/Dropdown'
import { BotaoIcone } from '@/components/ui/BotaoIcone'
import { Alerta } from '@/components/ui/Alerta'
import { IconeAdicionar, IconeLixeira } from '@/components/ui/icones'
import { formatarMoeda } from '@/lib/formato'
import { useAuth } from '@/features/auth/contexto'
import {
  useDespesas,
  usePessoasAtivas,
  useRegistrarDespesa,
  useRemoverDespesa,
  type DespesaResumo,
  type MomentoDespesa,
  type TipoDespesa,
} from '../api/useAcoes'
import { mensagemDeErro } from '../lib/erros'
import type { CasoQuadro } from '../types'

/**
 * O VOCABULÁRIO É O DA PLANILHA (seção 2: a tela fala a língua da operação).
 *
 * "Uber ida" e "Uber volta" são as colunas IDA e VOLTA; "Refeição" é a
 * "REFEIÇÃO EXTRA". Nada de "transporte" ou "alimentação", que seriam nomes
 * mais gerais e nenhum deles é o que a equipe diz.
 */
const ROTULO_TIPO: Record<TipoDespesa, string> = {
  uber_ida: 'Uber ida',
  uber_volta: 'Uber volta',
  refeicao: 'Refeição',
  outro: 'Outro',
}

const ROTULO_MOMENTO: Record<MomentoDespesa, string> = {
  parto: 'Parto',
  substituicao: 'Substituição',
  fechamento: 'Fechamento',
}

const TIPOS: TipoDespesa[] = ['uber_ida', 'uber_volta', 'refeicao', 'outro']
const MOMENTOS: MomentoDespesa[] = ['parto', 'substituicao', 'fechamento']

/**
 * "24,90" -> 24.9.
 *
 * QUEM DIGITA USA VÍRGULA. Um `type="number"` resolveria o parse e traria dois
 * problemas piores: no Android ele aceita vírgula e devolve string vazia no
 * `value`, e no desktop a roda do mouse muda o valor sem ninguém pedir — num
 * campo de dinheiro isso é troco perdido em silêncio.
 *
 * O ponto vira separador de MILHAR quando há vírgula ("1.234,56"), e separador
 * decimal quando não há ("24.90") — que é como as duas grafias chegam de gente
 * diferente digitando o mesmo valor.
 */
function paraNumero(texto: string): number | null {
  const bruto = texto.trim().replace(/\s|R\$/g, '')
  if (bruto === '') return null

  const normalizado = bruto.includes(',')
    ? bruto.replace(/\./g, '').replace(',', '.')
    : bruto

  const n = Number(normalizado)
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * A LISTA DE GASTOS DO CASO, com o total embaixo.
 *
 * O total é a razão de isto existir: o gestor soma a faixa DESPESAS da planilha
 * por caso no fim do mês, e aqui a soma já está pronta e sempre atualizada.
 *
 * Ele é calculado no cliente, e isso é seguro porque a lista inteira está aqui —
 * são poucas linhas por caso e não há paginação para truncar a soma. No dia em
 * que existir um relatório de mês inteiro, a conta é do BANCO, não desta função:
 * somar no cliente o que o servidor pagina é como se perde dinheiro sem erro
 * nenhum na tela (ver a nota sobre `db-max-rows` na seção 5 do CLAUDE.md).
 */
export function DespesasDoCaso({ caso, aberto }: { caso: CasoQuadro; aberto: boolean }) {
  const { data: despesas, isPending } = useDespesas(caso.id, aberto)
  const [erro, setErro] = useState<string | null>(null)

  const lista = despesas ?? []
  const total = lista.reduce((soma, d) => soma + d.valor, 0)

  if (isPending) {
    return <p className="text-xs text-muted-foreground">Carregando despesas…</p>
  }

  return (
    <div className="space-y-2">
      {erro && <Alerta onFechar={() => setErro(null)}>{erro}</Alerta>}

      {lista.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Nenhuma despesa lançada neste caso.
        </p>
      ) : (
        <>
          <ul className="space-y-1">
            {lista.map((despesa) => (
              <LinhaDeDespesa key={despesa.id} despesa={despesa} onErro={setErro} />
            ))}
          </ul>

          {/* O TOTAL SÓ APARECE COM MAIS DE UMA LINHA. Com uma, ele repetiria o
              número logo acima e viraria enfeite — e um rótulo "Total" em cima
              de uma soma de uma parcela ensina a não olhar para ele. */}
          {lista.length > 1 && (
            <div className="flex items-center justify-between border-t border-border pt-2 text-sm">
              <span className="font-semibold">Total do caso</span>
              <span className="font-bold tabular-nums">{formatarMoeda(total)}</span>
            </div>
          )}
        </>
      )}
    </div>
  )
}

/**
 * Uma linha: o que foi, de quem, quanto — e o apagar.
 *
 * NÃO EXISTE EDITAR, aqui nem no banco. Valor errado se corrige apagando e
 * lançando de novo, e os dois eventos ficam em `eventos` contando o que
 * aconteceu. Um UPDATE silencioso deixaria a soma do mês mudar sem nada que
 * explique a diferença.
 */
function LinhaDeDespesa({
  despesa,
  onErro,
}: {
  despesa: DespesaResumo
  onErro: (mensagem: string | null) => void
}) {
  const remover = useRemoverDespesa()
  const [confirmando, setConfirmando] = useState(false)

  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded bg-background/60 px-2 py-2 text-sm">
      <span className="font-medium">{ROTULO_TIPO[despesa.tipo]}</span>

      {despesa.momento && (
        <span className="rounded bg-marca-suave px-1.5 py-0.5 text-xs font-medium">
          {ROTULO_MOMENTO[despesa.momento]}
        </span>
      )}

      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
        {despesa.pessoaNome ?? 'sem responsável'}
        {despesa.descricao ? ` · ${despesa.descricao}` : ''}
      </span>

      {/* tabular-nums: numa lista de valores, os centavos alinhados são o que
          deixa a conferência ser leitura em vez de contagem. */}
      <span className="font-semibold tabular-nums">{formatarMoeda(despesa.valor)}</span>

      <BotaoIcone
        rotulo="Apagar despesa"
        tom="pendencia"
        disabled={remover.isPending}
        onClick={() => setConfirmando(true)}
      >
        <IconeLixeira className="size-4" />
      </BotaoIcone>

      {confirmando && (
        <Dialogo
          titulo="Apagar esta despesa?"
          rotuloConfirmar="Apagar"
          confirmarDestrutivo
          ocupado={remover.isPending}
          erro={null}
          onCancelar={() => setConfirmando(false)}
          onConfirmar={() => {
            onErro(null)
            remover
              .mutateAsync({ despesaId: despesa.id })
              .then(() => setConfirmando(false))
              .catch((e) => {
                setConfirmando(false)
                onErro(mensagemDeErro(e))
              })
          }}
        >
          <p className="text-sm text-muted-foreground">
            {ROTULO_TIPO[despesa.tipo]} de {formatarMoeda(despesa.valor)}
            {despesa.pessoaNome ? ` — ${despesa.pessoaNome}` : ''}. O lançamento sai
            da soma do caso; o registro de que ele existiu fica no histórico.
          </p>
        </Dialogo>
      )}
    </li>
  )
}

/**
 * O botão que lança a despesa, ao lado de "Acrescentar etapa" — foi onde o
 * gestor pediu, e faz sentido: as duas são coisas que aconteceram no
 * atendimento e que o pacote não previa.
 *
 * ELE NÃO SOME NUNCA, ao contrário do vizinho: "Acrescentar etapa" desaparece
 * quando não há etapa a acrescentar, e despesa sempre pode haver — inclusive
 * num caso cancelado, que é justamente quando o Uber já foi pago e o parto não
 * aconteceu.
 */
export function BotaoNovaDespesa({ caso }: { caso: CasoQuadro }) {
  const [aberto, setAberto] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-dashed border-border px-3 text-sm font-semibold text-muted-foreground transition-colors hover:border-marca hover:text-marca"
      >
        <IconeAdicionar className="size-4" />
        Despesa
      </button>

      {aberto && <DialogoDespesa caso={caso} onFechar={() => setAberto(false)} />}
    </>
  )
}

/**
 * O LANÇAMENTO.
 *
 * Tipo e momento são CHIPS, não campos de texto: a seção 6 manda usar botão
 * sempre que puder, e quem lança está com uma mão no celular. O valor é o único
 * lugar em que digitar é inevitável.
 *
 * A PESSOA JÁ VEM PREENCHIDA com quem está lançando, que é o caso comum — a
 * fotógrafa registra a própria corrida. Trocar é um toque, e serve para o ADM
 * lançando pela equipe.
 */
function DialogoDespesa({ caso, onFechar }: { caso: CasoQuadro; onFechar: () => void }) {
  const { pessoa } = useAuth()
  const { data: pessoas } = usePessoasAtivas()
  const registrar = useRegistrarDespesa()

  const [tipo, setTipo] = useState<TipoDespesa>('uber_ida')
  const [valorTexto, setValorTexto] = useState('')
  const [momento, setMomento] = useState<MomentoDespesa | null>(null)
  const [pessoaId, setPessoaId] = useState<string>(pessoa?.id ?? '')
  const [descricao, setDescricao] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  const valor = paraNumero(valorTexto)
  const precisaDescricao = tipo === 'outro' && descricao.trim() === ''
  const nomeEscolhido =
    (pessoas ?? []).find((p) => p.id === pessoaId)?.nome ?? 'Escolher pessoa'

  function salvar() {
    if (valor === null) return
    setErro(null)
    registrar
      .mutateAsync({
        casoId: caso.id,
        tipo,
        valor,
        ...(pessoaId === '' ? {} : { pessoaId }),
        ...(momento === null ? {} : { momento }),
        ...(descricao.trim() === '' ? {} : { descricao: descricao.trim() }),
      })
      .then(onFechar)
      .catch((e) => setErro(mensagemDeErro(e)))
  }

  return (
    <Dialogo
      titulo="Lançar despesa"
      rotuloConfirmar="Lançar"
      confirmarDesabilitado={valor === null || precisaDescricao}
      ocupado={registrar.isPending}
      erro={erro}
      onCancelar={onFechar}
      onConfirmar={salvar}
    >
      <p className="text-sm text-muted-foreground">
        {caso.maeNome}
        {caso.bebeNome ? ` · ${caso.bebeNome}` : ''}. O gasto entra na soma deste
        caso.
      </p>

      <div>
        <span className="text-sm font-medium">O que foi</span>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {TIPOS.map((t) => (
            <Chip key={t} ativo={tipo === t} onClick={() => setTipo(t)}>
              {ROTULO_TIPO[t]}
            </Chip>
          ))}
        </div>
      </div>

      <label className="block">
        <span className="text-sm font-medium">Valor</span>
        <input
          type="text"
          inputMode="decimal"
          autoFocus
          value={valorTexto}
          onChange={(e) => setValorTexto(e.target.value)}
          placeholder="24,90"
          className="mt-1.5 min-h-12 w-full rounded-md border border-border bg-background px-3 text-base tabular-nums"
        />
        {/* A confirmação do que o sistema ENTENDEU do que foi digitado. Vírgula
            e ponto chegam misturados, e ver "R$ 24,90" antes de salvar é o que
            pega o zero a mais na hora, não no fim do mês. */}
        <span className="mt-1 block text-xs text-muted-foreground">
          {valor === null
            ? 'Só números. Vírgula para os centavos.'
            : `Vai entrar como ${formatarMoeda(valor)}.`}
        </span>
      </label>

      <div>
        <span className="text-sm font-medium">De quem foi</span>
        <div className="mt-1.5">
          <Dropdown
            rotulo="Escolher pessoa"
            selecionado={pessoaId}
            onEscolher={(item) => setPessoaId(item.id)}
            itens={(pessoas ?? []).map((p) => ({ id: p.id, rotulo: p.nome }))}
            gatilho={
              <span className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium">
                {nomeEscolhido}
              </span>
            }
          />
        </div>
      </div>

      <div>
        <span className="text-sm font-medium">
          Momento
          <span className="ml-1 text-xs text-muted-foreground">(opcional)</span>
        </span>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {MOMENTOS.map((m) => (
            <Chip
              key={m}
              ativo={momento === m}
              // Clicar de novo desmarca: sem isso, escolher por engano viraria
              // um rótulo errado que não tem como tirar sem fechar o diálogo.
              onClick={() => setMomento((atual) => (atual === m ? null : m))}
            >
              {ROTULO_MOMENTO[m]}
            </Chip>
          ))}
        </div>
      </div>

      <label className="block">
        <span className="text-sm font-medium">
          Descrição
          <span className="ml-1 text-xs text-muted-foreground">
            {tipo === 'outro' ? '(obrigatória)' : '(opcional)'}
          </span>
        </span>
        <input
          type="text"
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder={tipo === 'outro' ? 'ex.: estacionamento do hospital' : ''}
          className="mt-1.5 min-h-12 w-full rounded-md border border-border bg-background px-3 text-base"
        />
      </label>
    </Dialogo>
  )
}

/** Botão de seleção única, com alvo de 44px (seção 6 do CLAUDE.md). */
function Chip({
  ativo,
  onClick,
  children,
}: {
  ativo: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={ativo}
      onClick={onClick}
      className={clsx(
        'inline-flex min-h-11 items-center rounded-full border px-3 text-sm font-semibold transition-colors',
        ativo
          ? 'border-marca bg-marca text-white'
          : 'border-border text-muted-foreground hover:border-marca hover:text-marca',
      )}
    >
      {children}
    </button>
  )
}
