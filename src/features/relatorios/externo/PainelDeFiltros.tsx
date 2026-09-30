import { useState, type ReactNode } from 'react'
import clsx from 'clsx'
import { Chevron } from '@/components/ui/icones'
import { dataCurta, deslocarMes, periodoDoMes, somarDias } from '../lib/metricas'
import {
  GRUPOS_SIM_NAO,
  OPCOES_FIXAS,
  TITULO_DO_GRUPO,
  type FiltrosDaOperacao,
  type GrupoDeLista,
  type GrupoSimNao,
} from './filtros'
import type { Facetas } from './useOperacao'

/**
 * O PAINEL DE FILTROS, no molde dos classificados (SóCarrão, Webmotors): grupos
 * que abrem e fecham, cada opção com QUANTOS CASOS ela daria ao lado, e as
 * contagens se refazendo a cada marca — é o que deixa misturar filtros sem
 * cair num resultado vazio.
 *
 * QUATRO TIPOS DE CONTROLE, cada um para o tipo de pergunta:
 *   * LISTA de marcar (maternidade, situação…) — somam dentro do grupo;
 *   * SIM / NÃO (passou pela UTI, teve despesa…) — "Todos" é não filtrar;
 *   * FAIXA de mínimo e máximo (horas até o envio, valor de despesa);
 *   * PERÍODO, com atalhos, porque é o filtro que todo mundo mexe primeiro.
 *
 * Opção com ZERO continua na lista, apagada: sumir mudaria a ordem a cada
 * marca, e a pessoa perderia o lugar. A marcada nunca some.
 *
 * TUDO NASCE FECHADO (30/09/2026, pedido do gestor), o período inclusive — que
 * mostra o recorte no próprio título. Só abre sozinho o grupo que já chega com
 * filtro marcado (um link compartilhado), para não esconder o que recorta.
 * A ORDEM também é dele: período, links, termo, situação, prazo, maternidade,
 * pacote, quem fez (com a etapa), equipamento, e o resto.
 */

const VISIVEIS_ANTES_DO_VER_MAIS = 6

export interface OpcaoDoPainel {
  valor: string
  rotulo: string
  contagem: number
}

export function PainelDeFiltros({
  filtros,
  facetas,
  hoje,
  rotuloDe,
  onMudar,
}: {
  filtros: FiltrosDaOperacao
  facetas: Facetas | undefined
  hoje: string
  /** O nome de uma opção, lembrado das contagens (maternidade, pacote, pessoa, etapa). */
  rotuloDe: (grupo: GrupoDeLista, valor: string) => string
  onMudar: (f: FiltrosDaOperacao) => void
}) {
  function opcoesDe(grupo: GrupoDeLista): OpcaoDoPainel[] {
    const contadas = facetas?.get(grupo) ?? []
    const contagem = (valor: string) => contadas.find((c) => c.valor === valor)?.contagem ?? 0
    const fixas = OPCOES_FIXAS[grupo]
    if (fixas) return fixas.map((o) => ({ valor: o.valor, rotulo: o.rotulo, contagem: contagem(o.valor) }))
    // Grupos abertos (maternidade, pacote, pessoa, etapa): as que têm caso, da
    // mais comum para a menos, e as marcadas que zeraram no fim.
    const lista = contadas
      .map((c) => ({ valor: c.valor, rotulo: rotuloDe(grupo, c.valor), contagem: c.contagem }))
      .sort((a, b) => b.contagem - a.contagem || a.rotulo.localeCompare(b.rotulo, 'pt-BR'))
    for (const v of filtros.listas[grupo]) {
      if (!lista.some((o) => o.valor === v)) lista.push({ valor: v, rotulo: rotuloDe(grupo, v), contagem: 0 })
    }
    return lista
  }

  function alternar(grupo: GrupoDeLista, valor: string) {
    const atual = filtros.listas[grupo]
    const nova = atual.includes(valor) ? atual.filter((v) => v !== valor) : [...atual, valor]
    onMudar({ ...filtros, listas: { ...filtros.listas, [grupo]: nova } })
  }

  const lista = (grupo: GrupoDeLista, buscavel = false) => (
    <ListaDoGrupo
      key={grupo}
      titulo={TITULO_DO_GRUPO[grupo]}
      opcoes={opcoesDe(grupo)}
      marcadas={filtros.listas[grupo]}
      onAlternar={(v) => alternar(grupo, v)}
      onLimpar={() => onMudar({ ...filtros, listas: { ...filtros.listas, [grupo]: [] } })}
      buscavel={buscavel}
    />
  )

  return (
    <div className="divide-y divide-border rounded-painel border border-border bg-card">
      <Periodo filtros={filtros} hoje={hoje} onMudar={onMudar} />
      {lista('links')}
      {lista('termos')}
      {lista('situacoes')}
      {lista('prazos')}
      {lista('maternidades', true)}
      {lista('pacotes')}
      {lista('pessoas', true)}
      {lista('etapas')}
      {lista('equipamentos', true)}
      {lista('adicionais')}
      {lista('turnos')}
      {lista('dias_semana')}
      <Secao titulo="Ocorrências" contagem={GRUPOS_SIM_NAO.filter((g) => filtros.simNao[g] !== undefined).length}>
        <div className="space-y-3">
          {GRUPOS_SIM_NAO.map((g) => (
            <SimNao
              key={g}
              grupo={g}
              valor={filtros.simNao[g]}
              contagens={facetas?.get(g) ?? []}
              onMudar={(v) => {
                const simNao = { ...filtros.simNao }
                if (v === undefined) delete simNao[g]
                else simNao[g] = v
                onMudar({ ...filtros, simNao })
              }}
            />
          ))}
        </div>
      </Secao>
      <Secao
        titulo="Faixas"
        contagem={
          (filtros.horas_min !== undefined || filtros.horas_max !== undefined ? 1 : 0) +
          (filtros.despesa_min !== undefined || filtros.despesa_max !== undefined ? 1 : 0)
        }
      >
        <div className="space-y-3">
          <FaixaDeValores
            // A chave refaz os campos quando a faixa muda por fora ("Limpar").
            key={`h-${filtros.horas_min}-${filtros.horas_max}`}
            rotulo="Horas do parto ao envio"
            min={filtros.horas_min}
            max={filtros.horas_max}
            onMudar={(min, max) => onMudar({ ...filtros, horas_min: min, horas_max: max })}
          />
          <FaixaDeValores
            key={`d-${filtros.despesa_min}-${filtros.despesa_max}`}
            rotulo="Despesas do caso (R$)"
            min={filtros.despesa_min}
            max={filtros.despesa_max}
            onMudar={(min, max) => onMudar({ ...filtros, despesa_min: min, despesa_max: max })}
          />
        </div>
      </Secao>
    </div>
  )
}

/** Um grupo que abre e fecha, com o número de marcados no título. */
function Secao({
  titulo,
  contagem = 0,
  resumo,
  onLimpar,
  children,
}: {
  titulo: string
  contagem?: number
  /** Uma linha miúda sob o título, para dizer o que vale sem abrir (o período). */
  resumo?: string | undefined
  onLimpar?: (() => void) | undefined
  children: ReactNode
}) {
  // Grupo com filtro marcado abre sozinho: fechado, esconderia justamente o
  // que está recortando a lista.
  const [aberto, setAberto] = useState(contagem > 0)
  return (
    <section className="px-4 py-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setAberto((a) => !a)}
          aria-expanded={aberto}
          className="flex min-h-9 flex-1 items-center gap-2 text-left text-sm font-bold text-foreground"
        >
          <span className="min-w-0">
            {titulo}
            {resumo && <span className="block text-xs font-medium text-muted-foreground">{resumo}</span>}
          </span>
          {contagem > 0 && (
            <span className="rounded-full bg-marca px-1.5 text-[11px] leading-5 font-bold text-white tabular-nums">
              {contagem}
            </span>
          )}
          <Chevron className={clsx('ml-auto size-4 text-muted-foreground transition-transform', aberto && 'rotate-180')} />
        </button>
        {contagem > 0 && onLimpar && (
          <button type="button" onClick={onLimpar} className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">
            Limpar
          </button>
        )}
      </div>
      {aberto && <div className="pt-2">{children}</div>}
    </section>
  )
}

function ListaDoGrupo({
  titulo,
  opcoes,
  marcadas,
  onAlternar,
  onLimpar,
  buscavel,
}: {
  titulo: string
  opcoes: OpcaoDoPainel[]
  marcadas: string[]
  onAlternar: (valor: string) => void
  onLimpar: () => void
  buscavel: boolean
}) {
  const [todas, setTodas] = useState(false)
  const [busca, setBusca] = useState('')
  const procurado = semAcento(busca.trim())
  const filtradas = procurado ? opcoes.filter((o) => semAcento(o.rotulo).includes(procurado)) : opcoes
  const visiveis = todas || procurado ? filtradas : filtradas.slice(0, VISIVEIS_ANTES_DO_VER_MAIS)
  // A marcada nunca some atrás do "Ver mais".
  const escondidasMarcadas = filtradas.filter((o) => !visiveis.includes(o) && marcadas.includes(o.valor))

  return (
    <Secao titulo={titulo} contagem={marcadas.length} onLimpar={onLimpar}>
      {buscavel && opcoes.length > VISIVEIS_ANTES_DO_VER_MAIS && (
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder={`Buscar ${titulo.toLowerCase()}`}
          className="mb-2 h-9 w-full rounded-full border border-border bg-background px-3 text-sm placeholder:text-muted-foreground"
        />
      )}
      {opcoes.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhuma opção neste recorte.</p>
      ) : (
        <ul className="space-y-0.5">
          {[...visiveis, ...escondidasMarcadas].map((o) => {
            const marcada = marcadas.includes(o.valor)
            return (
              <li key={o.valor}>
                <label
                  className={clsx(
                    'flex min-h-8 cursor-pointer items-center gap-2.5 rounded-lg px-1.5 text-sm hover:bg-muted/60',
                    o.contagem === 0 && !marcada && 'opacity-45',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={marcada}
                    onChange={() => onAlternar(o.valor)}
                    className="size-4 flex-shrink-0 rounded border-border accent-marca"
                  />
                  <span className={clsx('min-w-0 flex-1 truncate', marcada ? 'font-semibold text-foreground' : 'text-foreground/85')}>
                    {o.rotulo}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">{o.contagem.toLocaleString('pt-BR')}</span>
                </label>
              </li>
            )
          })}
        </ul>
      )}
      {!procurado && filtradas.length > VISIVEIS_ANTES_DO_VER_MAIS && (
        <button
          type="button"
          onClick={() => setTodas((t) => !t)}
          className="mt-1 px-1.5 text-xs font-semibold text-marca hover:underline"
        >
          {todas ? 'Ver menos' : `Ver mais (${filtradas.length - VISIVEIS_ANTES_DO_VER_MAIS})`}
        </button>
      )}
    </Secao>
  )
}

/** "Todos / Sim / Não", com a contagem de cada lado. */
function SimNao({
  grupo,
  valor,
  contagens,
  onMudar,
}: {
  grupo: GrupoSimNao
  valor: boolean | undefined
  contagens: { valor: string; contagem: number }[]
  onMudar: (v: boolean | undefined) => void
}) {
  const de = (v: string) => contagens.find((c) => c.valor === v)?.contagem ?? 0
  const opcoes: { id: 'todos' | 'sim' | 'nao'; rotulo: string; v: boolean | undefined }[] = [
    { id: 'todos', rotulo: 'Todos', v: undefined },
    { id: 'sim', rotulo: `Sim · ${de('true')}`, v: true },
    { id: 'nao', rotulo: `Não · ${de('false')}`, v: false },
  ]
  return (
    <div>
      <div className="mb-1 text-xs font-semibold text-muted-foreground">{TITULO_DO_GRUPO[grupo]}</div>
      <div role="group" aria-label={TITULO_DO_GRUPO[grupo]} className="inline-flex rounded-full border border-border bg-background p-0.5">
        {opcoes.map((o) => (
          <button
            key={o.id}
            type="button"
            aria-pressed={valor === o.v}
            onClick={() => onMudar(o.v)}
            className={clsx(
              'inline-flex h-7 items-center rounded-full px-2.5 text-xs whitespace-nowrap tabular-nums transition-colors',
              valor === o.v ? 'bg-marca font-bold text-white' : 'font-medium text-muted-foreground hover:bg-marca-suave hover:text-marca',
            )}
          >
            {o.rotulo}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Mínimo e máximo. Vale ao sair do campo ou no Enter — não a cada tecla. */
function FaixaDeValores({
  rotulo,
  min,
  max,
  onMudar,
}: {
  rotulo: string
  min: number | undefined
  max: number | undefined
  onMudar: (min: number | undefined, max: number | undefined) => void
}) {
  const [textoMin, setTextoMin] = useState(min?.toString() ?? '')
  const [textoMax, setTextoMax] = useState(max?.toString() ?? '')
  const ler = (t: string) => {
    const n = Number(t.replace(',', '.'))
    return t.trim() === '' || !Number.isFinite(n) ? undefined : n
  }
  const aplicar = () => onMudar(ler(textoMin), ler(textoMax))
  const campo = (valor: string, setValor: (v: string) => void, placeholder: string, nome: string) => (
    <input
      type="text"
      inputMode="decimal"
      aria-label={`${rotulo}: ${nome}`}
      value={valor}
      onChange={(e) => setValor(e.target.value)}
      onBlur={aplicar}
      onKeyDown={(e) => e.key === 'Enter' && aplicar()}
      placeholder={placeholder}
      className="h-9 w-full min-w-0 rounded-xl border border-border bg-background px-3 text-sm tabular-nums"
    />
  )
  return (
    <div>
      <div className="mb-1 text-xs font-semibold text-muted-foreground">{rotulo}</div>
      <div className="flex items-center gap-2">
        {campo(textoMin, setTextoMin, 'Mínimo', 'mínimo')}
        <span className="text-xs text-muted-foreground">até</span>
        {campo(textoMax, setTextoMax, 'Máximo', 'máximo')}
      </div>
    </div>
  )
}

/**
 * O PERÍODO, com atalhos — o filtro que todo mundo mexe primeiro. A data é a
 * do ATENDIMENTO (a previsão do caso), a mesma do bloco do dia no Quadro.
 */
function Periodo({
  filtros,
  hoje,
  onMudar,
}: {
  filtros: FiltrosDaOperacao
  hoje: string
  onMudar: (f: FiltrosDaOperacao) => void
}) {
  const mes = hoje.slice(0, 7)
  const atalhos: { rotulo: string; de?: string; ate?: string }[] = [
    { rotulo: 'Este mês', ...intervalo(periodoDoMes(mes)) },
    { rotulo: 'Mês passado', ...intervalo(periodoDoMes(deslocarMes(mes, -1))) },
    { rotulo: 'Últimos 30 dias', de: somarDias(hoje, -29), ate: hoje },
    { rotulo: 'Este ano', de: `${hoje.slice(0, 4)}-01-01`, ate: `${hoje.slice(0, 4)}-12-31` },
    { rotulo: 'Tudo' },
  ]
  // Só UM atalho acende: em 30 de setembro "este mês" e "últimos 30 dias" são o
  // mesmo intervalo, e dois botões acesos parecem dois filtros somados.
  const ativo = atalhos.find((a) => (a.de ?? '') === (filtros.de ?? '') && (a.ate ?? '') === (filtros.ate ?? ''))
  const campoDeData = 'h-10 w-full min-w-0 rounded-xl border border-border bg-background px-3 text-sm tabular-nums'
  const resumo = ativo
    ? ativo.rotulo
    : `${filtros.de ? dataCurta(filtros.de) : '…'} a ${filtros.ate ? dataCurta(filtros.ate) : '…'}`
  return (
    <Secao titulo="Período do atendimento" resumo={resumo}>
      <div className="space-y-2.5">
        <div className="flex flex-wrap gap-1.5">
          {atalhos.map((a) => {
            const aceso = a === ativo
            return (
              <button
                key={a.rotulo}
                type="button"
                aria-pressed={aceso}
                onClick={() => onMudar({ ...filtros, de: a.de, ate: a.ate })}
                className={clsx(
                  'rounded-full border px-2.5 py-1 text-xs transition-colors',
                  aceso
                    ? 'border-marca bg-marca font-bold text-white'
                    : 'border-border font-medium text-muted-foreground hover:border-marca/40 hover:text-marca',
                )}
              >
                {a.rotulo}
              </button>
            )
          })}
        </div>
        {/* Um campo por linha: lado a lado, os dois cortavam o ano ("01/09/202"). */}
        <div className="grid grid-cols-[2.25rem_minmax(0,1fr)] items-center gap-x-2 gap-y-2">
          <label htmlFor="periodo-de" className="text-xs font-semibold text-muted-foreground">
            De
          </label>
          <input
            id="periodo-de"
            type="date"
            value={filtros.de ?? ''}
            onChange={(e) => onMudar({ ...filtros, de: e.target.value || undefined })}
            className={campoDeData}
          />
          <label htmlFor="periodo-ate" className="text-xs font-semibold text-muted-foreground">
            Até
          </label>
          <input
            id="periodo-ate"
            type="date"
            value={filtros.ate ?? ''}
            onChange={(e) => onMudar({ ...filtros, ate: e.target.value || undefined })}
            className={campoDeData}
          />
        </div>
      </div>
    </Secao>
  )
}

const intervalo = (p: { inicio: string; fim: string }) => ({ de: p.inicio, ate: p.fim })

const semAcento = (t: string) =>
  t
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
