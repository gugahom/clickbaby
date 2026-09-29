import { useState } from 'react'
import clsx from 'clsx'
import { useFasesDeCampo, useMetricasPorEtapa, useMetricasPorPessoa, type Periodo } from '../api/useMetricas'
import { ETAPAS_DE_EDICAO, linhasDasPessoas } from '../lib/kpis'
import { INICIO_DAS_METRICAS, dataCurta, rotuloDoMes, somarDias } from '../lib/metricas'
import { Segmentado } from './Segmentado'
import { TabelaDePessoas } from './TabelaDePessoas'

/**
 * A ABA PESSOAS, COM FILTROS (29/09/2026, pedido do gestor: "preciso de alguns
 * filtros nessa parte também, como datas e etc.").
 *
 *   PERÍODO — o mês do topo da tela (o padrão), os últimos 7 dias, hoje, ou
 *   datas escolhidas. "30 dias" saiu (pedido do gestor: redundante com "Mês")
 *   e entrou HOJE no lugar do "24h" que ele sugeriu: o relatório conta por dia
 *   do calendário (as funções recebem datas), e um "24h" que na verdade fosse
 *   "desde a meia-noite" mentiria no nome. É o período de TUDO na aba: tabela, destaques e perfil.
 *   O banco aceita qualquer intervalo e aplica o piso de 01/10/2026 por dentro;
 *   a tela só não oferece data antes dele, nem depois de hoje.
 *
 *   TRABALHO — todos, só quem fez CAMPO, só quem fez EDIÇÃO no período. Não
 *   fere a invariante 3.1: a pergunta é "quem fez edição neste período", lida
 *   das etapas concluídas, e não "quem é editora". A mesma pessoa aparece nos
 *   dois filtros se fez as duas coisas.
 *
 *   BUSCA — pelo nome, sem acento e sem caixa, como as listas de pessoas do
 *   resto do sistema.
 */
type ModoDoPeriodo = 'mes' | '7dias' | 'hoje' | 'datas'
type Trabalho = 'todos' | 'campo' | 'edicao'

const semAcento = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

export function AbaPessoas({ mes, periodoDoMes, hoje }: { mes: string; periodoDoMes: Periodo; hoje: string }) {
  const [modo, setModo] = useState<ModoDoPeriodo>('mes')
  const [de, setDe] = useState(periodoDoMes.inicio)
  const [ate, setAte] = useState(periodoDoMes.fim < hoje ? periodoDoMes.fim : hoje)
  const [trabalho, setTrabalho] = useState<Trabalho>('todos')
  const [busca, setBusca] = useState('')

  // Datas trocadas não viram erro: o intervalo é o que as duas descrevem.
  const [inicioEscolhido, fimEscolhido] = de <= ate ? [de, ate] : [ate, de]
  const periodo: Periodo =
    modo === 'mes'
      ? periodoDoMes
      : modo === '7dias'
        ? { inicio: somarDias(hoje, -6), fim: hoje }
        : modo === 'hoje'
          ? { inicio: hoje, fim: hoje }
          : { inicio: inicioEscolhido, fim: fimEscolhido }
  const rotuloDoPeriodo =
    modo === 'mes'
      ? `em ${rotuloDoMes(mes).toLowerCase()}`
      : modo === '7dias'
        ? 'nos últimos 7 dias'
        : modo === 'hoje'
          ? 'hoje'
          : `de ${dataCurta(periodo.inicio)} a ${dataCurta(periodo.fim)}`

  const porEtapa = useMetricasPorEtapa(periodo)
  const pessoas = useMetricasPorPessoa(periodo)
  const fases = useFasesDeCampo(periodo)
  const consultas = [porEtapa, pessoas, fases]
  const erro = consultas.find((c) => c.error)?.error
  const carregando = consultas.some((c) => c.isPending)
  const atualizando = consultas.some((c) => c.isPlaceholderData)

  const fezCampo = new Set<string>()
  const fezEdicao = new Set<string>()
  for (const m of porEtapa.data ?? []) {
    if (m.concluidas === 0) continue
    if (ETAPAS_DE_EDICAO.includes(m.tipo)) fezEdicao.add(m.pessoaId)
    else fezCampo.add(m.pessoaId)
  }
  const procurado = semAcento(busca.trim())
  const linhas = linhasDasPessoas(porEtapa.data ?? [], pessoas.data ?? []).filter(
    (l) =>
      (trabalho === 'todos' || (trabalho === 'campo' ? fezCampo : fezEdicao).has(l.pessoaId)) &&
      (procurado === '' || semAcento(l.nome).includes(procurado)),
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-painel border border-border bg-card px-3 py-2.5">
        <Segmentado
          rotulo="Período"
          opcoes={[
            { id: 'mes', conteudo: 'Mês' },
            { id: '7dias', conteudo: '7 dias' },
            { id: 'hoje', conteudo: 'Hoje' },
            { id: 'datas', conteudo: 'Datas' },
          ]}
          ativa={modo}
          onTrocar={setModo}
        />
        {modo === 'datas' && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">De</span>
              <CampoData valor={de} onMudar={setDe} minimo={INICIO_DAS_METRICAS} maximo={hoje} />
            </label>
            <label className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">até</span>
              <CampoData valor={ate} onMudar={setAte} minimo={INICIO_DAS_METRICAS} maximo={hoje} />
            </label>
          </div>
        )}
        <span className="hidden h-6 w-px bg-border sm:block" aria-hidden="true" />
        <Segmentado
          rotulo="Tipo de trabalho"
          opcoes={[
            { id: 'todos', conteudo: 'Todos' },
            { id: 'campo', conteudo: 'Campo' },
            { id: 'edicao', conteudo: 'Edição' },
          ]}
          ativa={trabalho}
          onTrocar={setTrabalho}
        />
        <label className="ml-auto flex min-w-0 flex-1 items-center sm:max-w-64">
          <span className="sr-only">Buscar pessoa</span>
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar pessoa"
            className="h-9 w-full rounded-full border border-border bg-background px-4 text-sm placeholder:text-muted-foreground"
          />
        </label>
      </div>

      {erro ? (
        <p className="rounded-painel border border-atrasado/40 bg-card p-4 text-sm text-atrasado">
          Não deu para carregar as pessoas: {erro.message}
        </p>
      ) : carregando ? (
        <p className="py-16 text-center text-sm text-muted-foreground">Carregando…</p>
      ) : (
        <div className={clsx('transition-opacity', atualizando && 'opacity-60')}>
          <TabelaDePessoas
            linhas={linhas}
            pessoas={pessoas.data ?? []}
            porEtapa={porEtapa.data ?? []}
            fases={fases.data ?? []}
            rotuloDoPeriodo={rotuloDoPeriodo}
          />
        </div>
      )}
    </div>
  )
}

function CampoData({
  valor,
  onMudar,
  minimo,
  maximo,
}: {
  valor: string
  onMudar: (valor: string) => void
  minimo: string
  maximo: string
}) {
  return (
    <input
      type="date"
      value={valor}
      min={minimo}
      max={maximo}
      // Campo apagado (o "limpar" do navegador) não vira período vazio.
      onChange={(e) => e.target.value && onMudar(e.target.value)}
      className="h-9 rounded-full border border-border bg-background px-3 text-sm tabular-nums"
    />
  )
}
