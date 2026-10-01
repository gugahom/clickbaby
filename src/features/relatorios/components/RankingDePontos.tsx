import { useState } from 'react'
import clsx from 'clsx'
import { Avatar } from '@/components/ui/Avatar'
import { IconeCoroa } from '@/components/ui/icones'
import type { LinhaDaPessoa } from '../lib/kpis'
import { formatarPontos } from '../lib/pontos'
import { Cartao } from './PainelDaEquipe'

/**
 * O RANKING POR PONTOS, COM COROAS (30/09/2026, pedido do gestor: a empresa quer
 * começar a trabalhar com gamificação). O visual veio de um exemplo de
 * leaderboard que ele mandou — posição, coroa nos três primeiros, retrato,
 * nome, pontos e quanto cada um subiu ou desceu —, feito com as peças da casa:
 * o exemplo trazia `lucide-react` e o `Button` do shadcn, e aqui os ícones são
 * nossos e o botão é a linha inteira.
 *
 * O QUE SAIU DO EXEMPLO: o "nível" e a liga (Diamante, Platina…) debaixo do
 * nome — pedido dele: "só o nome mesmo". E a paginação: a equipe cabe numa
 * tela.
 *
 * O QUE ENTROU: a BARRA debaixo do nome, que mede os pontos contra os do
 * primeiro lugar. É a pergunta de quem olha um ranking — "quanto falta para
 * alcançar" —, e ela não se lê comparando números de cabeça.
 *
 * A POSIÇÃO É A MESMA DA TABELA: empate divide o lugar (1, 2, 2, 4) e quem não
 * fez ponto não tem lugar. Por isso a coroa vai por POSIÇÃO — dois empatados
 * em primeiro ganham, os dois, a de ouro.
 *
 * A VARIAÇÃO compara com o período de MESMO TAMANHO logo antes (o mês
 * anterior, os 7 dias anteriores, ontem). Ela só aparece quando o período
 * anterior tem ponto de alguém: em outubro de 2026 ele é setembro, antes do
 * piso das métricas, e "▲ 5" contra um ranking vazio seria mentira. Com seta e
 * sinal, nunca só cor — a mesma regra dos cartões de KPI.
 *
 * A BUSCA POR NOME NÃO MEXE AQUI: procurar alguém na tabela não pode fazer
 * essa pessoa virar "1º lugar". O filtro de TRABALHO mexe — um ranking só de
 * quem fez edição é uma liga de verdade —, e nele a variação some, porque o
 * período anterior não foi recortado do mesmo jeito.
 *
 * Mostra os CINCO primeiros e, se quem está olhando ficou de fora, a própria
 * linha depois de um "…". O resto abre num toque.
 */

const VISIVEIS = 5

const MEDALHA = {
  1: { coroa: 'fill-ouro stroke-ouro-traco', anel: 'ring-ouro', nome: 'Ouro' },
  2: { coroa: 'fill-prata stroke-prata-traco', anel: 'ring-prata', nome: 'Prata' },
  3: { coroa: 'fill-bronze stroke-bronze-traco', anel: 'ring-bronze', nome: 'Bronze' },
} as const

interface Colocacao {
  linha: LinhaDaPessoa
  posicao: number
  /** Lugares ganhos desde o período anterior; 'novo' = não pontuou nele. */
  mudanca: number | 'novo' | null
}

/** Posição de cada um por pontos, com empate dividindo o lugar. Zero não tem lugar. */
function posicoes(pontos: { pessoaId: string; pontos: number }[]): Map<string, number> {
  const ordenados = pontos.filter((p) => p.pontos > 0).sort((a, b) => b.pontos - a.pontos)
  const mapa = new Map<string, number>()
  ordenados.forEach((p, i) => {
    const anterior = ordenados[i - 1]
    mapa.set(p.pessoaId, anterior && anterior.pontos === p.pontos ? (mapa.get(anterior.pessoaId) ?? i + 1) : i + 1)
  })
  return mapa
}

export function RankingDePontos({
  linhas,
  anteriores,
  rotuloDaComparacao,
  fotos,
  euId,
  selecionadaId,
  onEscolher,
}: {
  linhas: LinhaDaPessoa[]
  /** Os pontos de cada pessoa no período anterior; sem ele, sem variação. */
  anteriores: { pessoaId: string; pontos: number }[] | undefined
  /** "vs mês anterior". */
  rotuloDaComparacao: string
  /** pessoaId -> URL assinada do retrato. */
  fotos: Map<string, string>
  euId: string | undefined
  selecionadaId: string | undefined
  onEscolher: (pessoaId: string) => void
}) {
  const [inteiro, setInteiro] = useState(false)

  const agora = posicoes(linhas)
  const antes = anteriores && anteriores.some((p) => p.pontos > 0) ? posicoes(anteriores) : null
  const colocacoes: Colocacao[] = linhas
    .filter((l) => agora.has(l.pessoaId))
    .map((l) => {
      const posicao = agora.get(l.pessoaId) ?? 0
      const antiga = antes?.get(l.pessoaId)
      return { linha: l, posicao, mudanca: antes ? (antiga === undefined ? ('novo' as const) : antiga - posicao) : null }
    })
    .sort((a, b) => a.posicao - b.posicao || a.linha.nome.localeCompare(b.linha.nome))

  if (colocacoes.length === 0) {
    return (
      <Cartao titulo="Ranking por pontos" className="h-full">
        <p className="py-8 text-center text-sm text-muted-foreground">Ninguém pontuou neste período.</p>
      </Cartao>
    )
  }

  const lider = colocacoes[0]?.linha.pontos ?? 1
  // Duas a mais que o corte mostram tudo: um "…" que esconde uma linha só
  // ocupa o lugar dela.
  const cabeTudo = inteiro || colocacoes.length <= VISIVEIS + 2
  const topo = cabeTudo ? colocacoes : colocacoes.slice(0, VISIVEIS)
  const eu = cabeTudo ? undefined : colocacoes.slice(VISIVEIS).find((c) => c.linha.pessoaId === euId)

  const linha = (c: Colocacao) => (
    <LinhaDoRanking
      key={c.linha.pessoaId}
      colocacao={c}
      lider={lider}
      fotoUrl={fotos.get(c.linha.pessoaId) ?? null}
      souEu={c.linha.pessoaId === euId}
      escolhida={c.linha.pessoaId === selecionadaId}
      rotuloDaComparacao={rotuloDaComparacao}
      onEscolher={() => onEscolher(c.linha.pessoaId)}
    />
  )

  return (
    <Cartao
      titulo="Ranking por pontos"
      className="h-full"
      acao={antes && <span className="text-xs text-muted-foreground">{rotuloDaComparacao}</span>}
    >
      <ol className="-mx-2 space-y-0.5">
        {topo.map(linha)}
        {eu && (
          <>
            <li aria-hidden="true" className="py-0.5 text-center text-sm leading-none tracking-[0.3em] text-muted-foreground">
              ···
            </li>
            {linha(eu)}
          </>
        )}
      </ol>

      {colocacoes.length > VISIVEIS + 2 && (
        <button
          type="button"
          onClick={() => setInteiro((v) => !v)}
          className="mt-2 w-full rounded-full py-2 text-sm font-semibold text-marca hover:bg-marca-suave"
        >
          {inteiro ? 'Ver só os primeiros' : `Ver o ranking inteiro (${colocacoes.length})`}
        </button>
      )}
    </Cartao>
  )
}

function LinhaDoRanking({
  colocacao: { linha, posicao, mudanca },
  lider,
  fotoUrl,
  souEu,
  escolhida,
  rotuloDaComparacao,
  onEscolher,
}: {
  colocacao: Colocacao
  lider: number
  fotoUrl: string | null
  souEu: boolean
  escolhida: boolean
  rotuloDaComparacao: string
  onEscolher: () => void
}) {
  const medalha = posicao <= 3 ? MEDALHA[posicao as 1 | 2 | 3] : undefined

  return (
    <li>
      <button
        type="button"
        onClick={onEscolher}
        aria-pressed={escolhida}
        className={clsx(
          'flex w-full items-center gap-3 rounded-cartao px-2 pt-3 pb-2 text-left transition-colors',
          'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-marca',
          escolhida ? 'bg-marca-suave' : 'hover:bg-muted/60',
        )}
      >
        <span className="w-6 flex-shrink-0 text-right text-sm font-bold tabular-nums text-foreground">
          {posicao}
          {medalha && <span className="sr-only">, {medalha.nome}</span>}
        </span>

        {/* A coroa POUSA no retrato, inclinada — é o gesto de quem ganhou, e
            não um ícone a mais na fileira. */}
        <span className="relative ml-1 flex-shrink-0">
          <span className={clsx('block rounded-full', medalha && clsx('ring-2 ring-offset-2 ring-offset-card', medalha.anel))}>
            <Avatar nome={linha.nome} fotoUrl={fotoUrl} tom="claro" className="size-10 text-sm" />
          </span>
          {medalha && (
            <IconeCoroa
              className={clsx('absolute -top-3.5 -left-2.5 size-6 -rotate-[24deg] drop-shadow-sm', medalha.coroa)}
            />
          )}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate font-semibold text-foreground">{linha.nome}</span>
            {souEu && (
              <span className="flex-shrink-0 rounded-full bg-marca-suave px-1.5 py-0.5 text-[10px] font-bold text-marca">
                você
              </span>
            )}
          </span>
          <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <span
              className={clsx('block h-full rounded-full', posicao === 1 ? 'bg-marca' : 'bg-grafico/70')}
              style={{ width: `${Math.max(4, (linha.pontos / lider) * 100)}%` }}
            />
          </span>
        </span>

        <span className="flex flex-shrink-0 items-center gap-3">
          <Mudanca mudanca={mudanca} rotuloDaComparacao={rotuloDaComparacao} />
          <span className="min-w-14 text-right">
            <span className="text-lg font-extrabold tabular-nums leading-none text-foreground">
              {formatarPontos(linha.pontos)}
            </span>
            <span className="ml-1 text-xs text-muted-foreground">{linha.pontos > 1 ? 'pts' : 'pt'}</span>
          </span>
        </span>
      </button>
    </li>
  )
}

function Mudanca({ mudanca, rotuloDaComparacao }: { mudanca: number | 'novo' | null; rotuloDaComparacao: string }) {
  if (mudanca === null || mudanca === 0) return null
  if (mudanca === 'novo') {
    return (
      <span
        title={`Não tinha pontuado no período anterior (${rotuloDaComparacao})`}
        className="rounded-full bg-acento-suave px-1.5 py-0.5 text-[10px] font-bold text-acento-forte"
      >
        novo
      </span>
    )
  }
  const subiu = mudanca > 0
  const lugares = Math.abs(mudanca)
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-0.5 text-xs font-bold tabular-nums',
        subiu ? 'text-concluido-tinta' : 'text-atrasado',
      )}
    >
      <span aria-hidden="true">{subiu ? '▲' : '▼'}</span>
      {lugares}
      <span className="sr-only">
        {subiu ? 'subiu' : 'desceu'} {lugares} {lugares === 1 ? 'posição' : 'posições'} {rotuloDaComparacao}
      </span>
    </span>
  )
}
