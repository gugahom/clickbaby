import clsx from 'clsx'
import { Dropdown } from '@/components/ui/Dropdown'
import { IconeBarras, IconeLinha } from '../components/DetalheDoKpi'
import { GraficoDoKpi, type TipoDeGrafico } from '../components/GraficoDoKpi'
import { Segmentado } from '../components/Segmentado'
import type { FiltrosDaOperacao, GrupoDeLista } from './filtros'
import {
  EIXOS,
  GRUPO_DO_EIXO,
  METRICAS,
  graoDoTempo,
  linhasNoTempo,
  ordenarPorDimensao,
  pontosNoTempo,
  rotuloDaLinha,
  type Eixo,
  type LinhaDoGrafico,
  type Metrica,
} from './grafico'
import { useGraficoDaOperacao } from './useOperacao'

/**
 * O RECORTE VIRA GRÁFICO (30/09/2026, pedido do gestor: "todo filtro colocado
 * virar gráfico"). O que se desenha é o número escolhido nos cartões de cima,
 * sobre o recorte que os filtros montaram:
 *
 *   * NO TEMPO — o mesmo gráfico do relatório interno (área ou barras), dia a
 *     dia até dois meses de período, mês a mês acima disso;
 *   * POR DIMENSÃO — barras deitadas, uma por maternidade, pacote, situação…
 *     É o "agrupar por" que ficou pendente na primeira versão.
 *
 * TOCAR NUMA BARRA FILTRA por ela: a dimensão também é um grupo do painel, e o
 * gráfico vira atalho para descer no recorte ("quero ver só a HSC").
 */
export function GraficoDoRecorte({
  filtros,
  eixo,
  metrica,
  forma,
  onTrocarEixo,
  onTrocarForma,
  onFiltrar,
}: {
  filtros: FiltrosDaOperacao
  eixo: Eixo
  metrica: Metrica
  forma: TipoDeGrafico
  onTrocarEixo: (e: Eixo) => void
  onTrocarForma: (f: TipoDeGrafico) => void
  onFiltrar: (grupo: GrupoDeLista, valor: string) => void
}) {
  const grao = graoDoTempo(filtros)
  const consulta = useGraficoDaOperacao(filtros, eixo === 'tempo' ? grao : eixo, true)
  const m = METRICAS[metrica]
  const nomeDoEixo = EIXOS.find((e) => e.id === eixo)?.rotulo ?? ''
  const subtitulo =
    eixo === 'tempo' ? (grao === 'dia' ? 'dia a dia' : 'mês a mês') : nomeDoEixo.replace(/^Por /, 'por ')

  return (
    <section className="rounded-painel border border-border bg-card p-4 md:p-6">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="space-y-1">
          <h2 className="text-lg leading-none font-semibold tracking-tight text-foreground">
            {m.rotulo} <span className="font-normal text-muted-foreground">· {subtitulo}</span>
          </h2>
          <p className="text-sm text-muted-foreground">Toque num dos números acima para trocar o que o gráfico mostra.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Dropdown
            compacto
            alinhamento="direita"
            rotulo="Quebrar o gráfico"
            selecionado={eixo}
            onEscolher={(item) => onTrocarEixo(item.id as Eixo)}
            itens={EIXOS.map((e) => ({ id: e.id, rotulo: e.rotulo }))}
            className="w-56"
          />
          {eixo === 'tempo' && (
            <Segmentado
              rotulo="Forma do gráfico"
              opcoes={[
                { id: 'linha', conteudo: <IconeLinha />, titulo: 'Linha' },
                { id: 'barras', conteudo: <IconeBarras />, titulo: 'Barras' },
              ]}
              ativa={forma}
              onTrocar={onTrocarForma}
            />
          )}
        </div>
      </header>

      {consulta.error ? (
        <p className="py-10 text-center text-sm text-atrasado">Não deu para carregar o gráfico: {consulta.error.message}</p>
      ) : consulta.isPending ? (
        <p className="flex h-72 items-center justify-center text-sm text-muted-foreground">Carregando…</p>
      ) : (
        <div className={clsx('transition-opacity', consulta.isPlaceholderData && 'opacity-60')}>
          {eixo === 'tempo' ? (
            <div className="flex h-72 flex-col xl:h-[26rem]">
              <GraficoDoKpi
                pontos={pontosNoTempo(linhasNoTempo(consulta.data, filtros, grao), grao, metrica)}
                tipo={forma}
                nomeDaSerie={m.rotulo}
                formatar={m.formatar}
                teto={m.teto}
                descricao={`${m.rotulo} do recorte, ${subtitulo}`}
              />
            </div>
          ) : (
            <BarrasPorDimensao
              eixo={eixo}
              metrica={metrica}
              linhas={ordenarPorDimensao(eixo, consulta.data, metrica)}
              onFiltrar={onFiltrar}
              marcadas={GRUPO_DO_EIXO[eixo] ? filtros.listas[GRUPO_DO_EIXO[eixo]] : []}
            />
          )}
        </div>
      )}
    </section>
  )
}

/**
 * Barras deitadas: o rótulo lê-se inteiro (siglas, nomes de pacote e de gente
 * não cabem num eixo de pé), e o valor mora na ponta da barra, em texto — a
 * cor não carrega número nenhum. Cada linha é um botão quando a dimensão é
 * também um filtro.
 */
function BarrasPorDimensao({
  eixo,
  metrica,
  linhas,
  marcadas,
  onFiltrar,
}: {
  eixo: Eixo
  metrica: Metrica
  linhas: LinhaDoGrafico[]
  marcadas: string[]
  onFiltrar: (grupo: GrupoDeLista, valor: string) => void
}) {
  const m = METRICAS[metrica]
  const grupo = GRUPO_DO_EIXO[eixo]
  const valores = linhas.map((l) => m.valor(l))
  const maior = Math.max(m.teto ?? 0, ...valores.map((v) => v ?? 0))
  if (linhas.length === 0) {
    return <p className="py-16 text-center text-sm text-muted-foreground">Nenhum caso neste recorte.</p>
  }
  return (
    <ul className="space-y-1">
      {linhas.map((l, i) => {
        const v = valores[i] ?? null
        const podeFiltrar = grupo !== undefined && l.chave !== 'sem' && !marcadas.includes(l.chave)
        const conteudo = (
          <>
            <span className="w-28 flex-shrink-0 truncate text-left text-sm font-semibold text-foreground sm:w-44">
              {rotuloDaLinha(eixo, l)}
            </span>
            <span className="relative h-6 min-w-0 flex-1 overflow-hidden rounded-md bg-muted/60">
              {v !== null && maior > 0 && (
                <span
                  className="absolute inset-y-0 left-0 rounded-md bg-grafico/85 transition-[width] duration-300"
                  style={{ width: `${Math.max((100 * v) / maior, v > 0 ? 1.5 : 0)}%` }}
                />
              )}
            </span>
            <span className="w-auto min-w-10 flex-shrink-0 text-right text-sm font-bold text-foreground tabular-nums sm:w-28">
              {v === null ? '—' : m.formatar(v)}
            </span>
            <span className="hidden w-36 flex-shrink-0 truncate text-xs text-muted-foreground md:block">
              {m.detalhe(l).join(' · ')}
            </span>
          </>
        )
        return (
          <li key={l.chave}>
            {podeFiltrar ? (
              <button
                type="button"
                onClick={() => onFiltrar(grupo, l.chave)}
                title={`Filtrar por ${rotuloDaLinha(eixo, l)}`}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-marca-suave focus-visible:bg-marca-suave"
              >
                {conteudo}
              </button>
            ) : (
              <div className="flex items-center gap-3 px-2 py-1.5">{conteudo}</div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
