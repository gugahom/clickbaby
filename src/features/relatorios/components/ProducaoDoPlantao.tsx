import { useState } from 'react'
import clsx from 'clsx'
import { Dialogo } from '@/components/ui/Dialogo'
import { ROTULO_ETAPA, rotuloDaRodada } from '@/features/quadro/types'
import type { Plantao } from '@/features/equipe/api/useEscala'
import { diaCurto, horaEmBrasilia } from '@/features/equipe/lib/apresentacao'
import { useProducaoDoPlantao, type EtapaDoPlantao } from '../api/useProducaoDoPlantao'

/** "Reels · B+F" da segunda rodada em diante, como no Quadro. */
function nomeDaEtapa(e: EtapaDoPlantao): string {
  const base = ROTULO_ETAPA[e.tipo]
  return e.rodada > 1 ? `${base} · ${rotuloDaRodada(e.tipo, e.rodada)}` : base
}

/** A cor da trilha: as duas cores de gráfico da casa, validadas para daltonismo. */
const COR_DA_TRILHA = {
  acompanhamento: 'bg-grafico',
  edicao: 'bg-grafico-comparacao',
} as const

const BORDA_DA_TRILHA = {
  acompanhamento: 'border-grafico',
  edicao: 'border-grafico-comparacao',
} as const

const ROTULO_STATUS: Record<string, string> = {
  em_andamento: 'em andamento',
  pausada: 'pausada',
  pendente: 'pendente',
}

const HORA = 3_600_000

interface Ponto {
  etapa: EtapaDoPlantao
  /** 0 a 100, a posição dentro do plantão. */
  x: number
  /** A fileira: pontos muito próximos sobem um degrau em vez de se cobrir. */
  fileira: number
  aberta: boolean
}

/** Pontos a menos de 3% um do outro não cabem na mesma fileira. */
function empilhar(itens: { etapa: EtapaDoPlantao; x: number; aberta: boolean }[]): Ponto[] {
  const ultimos: number[] = []
  return [...itens]
    .sort((a, b) => a.x - b.x)
    .map((p) => {
      let fileira = ultimos.findIndex((u) => p.x - u >= 3)
      if (fileira === -1) fileira = ultimos.length < 4 ? ultimos.length : ultimos.length - 1
      ultimos[fileira] = p.x
      return { ...p, fileira }
    })
}

/** As concluídas agrupadas por caso, na ordem da primeira conclusão. */
function porCaso(etapas: EtapaDoPlantao[]): { casoId: string; nome: string; etapas: EtapaDoPlantao[] }[] {
  const mapa = new Map<string, { casoId: string; nome: string; etapas: EtapaDoPlantao[] }>()
  for (const e of etapas) {
    const g = mapa.get(e.casoId) ?? { casoId: e.casoId, nome: e.casoNome, etapas: [] }
    g.etapas.push(e)
    mapa.set(e.casoId, g)
  }
  return [...mapa.values()]
}

/**
 * O RESUMO DO PLANTÃO (11/11/2026, pedido do gestor): "eu clico no plantão e me
 * mostra um resumo — fotografou 2 nascimentos, editou 2 reels, editou um
 * master". Ver `useProducaoDoPlantao`.
 *
 * MORA NO RELATÓRIO INTERNO (mesmo dia, segunda volta: "juntar tudo num lugar
 * só quando diz respeito a trabalho realizado"), no perfil da pessoa, ao lado
 * das horas de plantão. A primeira versão abria pela escala da Equipe.
 *
 * O DESENHO (terceira volta: "uma lista solta não ficou legal"): três números
 * no alto, a LINHA DO TEMPO do plantão com um ponto por etapa — campo em azul,
 * edição em rosa, a aberta vazada — e as etapas agrupadas POR CASO, que é como
 * a operação pensa o trabalho. Tocar num ponto acende a linha dele no caso.
 */
export function ProducaoDoPlantao({
  pessoaId,
  nome,
  plantao,
  onFechar,
}: {
  pessoaId: string
  nome: string
  plantao: Plantao
  onFechar: () => void
}) {
  const { data, isPending, error } = useProducaoDoPlantao(pessoaId, plantao.inicio, plantao.fim)
  // O relógio de quando o resumo abriu: o diálogo vive minutos, não horas.
  const [agora] = useState(() => Date.now())
  const [foco, setFoco] = useState<string | null>(null)
  const ini = new Date(plantao.inicio).getTime()
  const fim = new Date(plantao.fim).getTime()
  const futuro = ini > agora
  const concluidas = data?.concluidas ?? []
  const abertas = data?.abertas ?? []
  const casos = porCaso(concluidas)
  const campo = concluidas.filter((e) => e.trilha === 'acompanhamento').length
  const edicao = concluidas.length - campo

  const posicao = (iso: string | null) =>
    iso ? Math.min(100, Math.max(0, ((new Date(iso).getTime() - ini) / (fim - ini)) * 100)) : 0
  const pontos = empilhar([
    ...concluidas.map((etapa) => ({ etapa, x: posicao(etapa.concluidoEm), aberta: false })),
    ...abertas.map((etapa) => ({ etapa, x: posicao(etapa.iniciadoEm), aberta: true })),
  ])
  const fileiras = Math.max(1, ...pontos.map((p) => p.fileira + 1))
  const pontoEmFoco = pontos.find((p) => p.etapa.id === foco)

  // Uma marca por hora; rótulo a cada 4h num plantão de 12h, a cada 2h nos curtos.
  const horas = Math.round((fim - ini) / HORA)
  const passoDoRotulo = horas > 8 ? 4 : 2
  const marcas = Array.from({ length: horas + 1 }, (_, k) => ({
    x: (k / horas) * 100,
    rotulo: k % passoDoRotulo === 0 || k === horas ? `${horaEmBrasilia(new Date(ini + k * HORA).toISOString()).slice(0, 2)}h` : null,
  }))
  const agoraX = agora > ini && agora < fim ? ((agora - ini) / (fim - ini)) * 100 : null

  return (
    <Dialogo titulo={`Plantão de ${nome.split(' ')[0]}`} fecharNoCanto rotuloConfirmar="Fechar" onConfirmar={onFechar} onCancelar={onFechar}>
      <div className="-mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span className="capitalize">{diaCurto(plantao.data)}</span>
        <span aria-hidden="true">·</span>
        <span className="tabular-nums">
          {horaEmBrasilia(plantao.inicio)}–{horaEmBrasilia(plantao.fim)}
        </span>
        <span
          className={clsx(
            'rounded-full px-2 py-0.5 text-xs font-semibold',
            plantao.turno === 'noturno' ? 'bg-marca-suave text-marca' : 'bg-atencao/15 text-atencao-tinta',
          )}
        >
          {plantao.turno === 'noturno' ? 'Noite' : 'Dia'}
        </span>
        {agoraX !== null && <span className="font-semibold text-andamento-tinta">em curso</span>}
      </div>

      {futuro ? (
        <p className="rounded-cartao border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
          Este plantão ainda não aconteceu.
        </p>
      ) : error ? (
        <p className="text-sm text-atrasado">Não deu para carregar a produção do plantão.</p>
      ) : isPending ? (
        <div className="space-y-3" aria-label="Carregando">
          <div className="h-16 animate-pulse rounded-cartao bg-muted" />
          <div className="h-12 animate-pulse rounded-cartao bg-muted" />
          <div className="h-24 animate-pulse rounded-cartao bg-muted" />
        </div>
      ) : concluidas.length === 0 && abertas.length === 0 ? (
        <p className="rounded-cartao border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
          Nenhuma etapa no nome dela concluída ou começada neste horário.
        </p>
      ) : (
        <>
          {/* OS TRÊS NÚMEROS */}
          <dl className="grid grid-cols-3 divide-x divide-border rounded-cartao border border-border bg-background/60">
            {[
              { valor: concluidas.length, rotulo: concluidas.length === 1 ? 'etapa concluída' : 'etapas concluídas' },
              { valor: casos.length, rotulo: casos.length === 1 ? 'caso' : 'casos' },
              { valor: abertas.length, rotulo: abertas.length === 1 ? 'ficou aberta' : 'ficaram abertas' },
            ].map((n, i) => (
              <div key={n.rotulo} className="px-3 py-2.5">
                <dd
                  className={clsx(
                    'text-2xl font-extrabold leading-none tracking-tight tabular-nums',
                    i === 2 && n.valor === 0 && 'text-muted-foreground',
                  )}
                >
                  {n.valor}
                </dd>
                <dt className="mt-1 text-xs text-muted-foreground">{n.rotulo}</dt>
              </div>
            ))}
          </dl>

          {/* A LINHA DO TEMPO */}
          <section>
            <h4 className="rotulo-sobrescrito text-muted-foreground">Ao longo do plantão</h4>
            <div className="relative mt-3" style={{ height: `${fileiras * 14 + 10}px` }}>
              <div className="absolute inset-x-0 bottom-[3px] h-1 rounded-full bg-muted" aria-hidden="true" />
              {marcas.map((m) => (
                <span
                  key={m.x}
                  className={clsx('absolute bottom-0 w-px -translate-x-1/2', m.rotulo ? 'h-2.5 bg-border' : 'h-1.5 bg-border/70')}
                  style={{ left: `${m.x}%` }}
                  aria-hidden="true"
                />
              ))}
              {agoraX !== null && (
                <span
                  className="absolute bottom-0 top-0 w-0.5 -translate-x-1/2 rounded-full bg-andamento"
                  style={{ left: `${agoraX}%` }}
                  title="Agora"
                  aria-hidden="true"
                />
              )}
              {pontos.map((p) => (
                <button
                  key={p.etapa.id}
                  type="button"
                  onMouseEnter={() => setFoco(p.etapa.id)}
                  onMouseLeave={() => setFoco(null)}
                  onFocus={() => setFoco(p.etapa.id)}
                  onBlur={() => setFoco(null)}
                  onClick={() => setFoco(p.etapa.id)}
                  aria-label={`${p.aberta ? 'Começou' : 'Concluiu'} ${nomeDaEtapa(p.etapa)} às ${horaEmBrasilia(
                    (p.aberta ? p.etapa.iniciadoEm : p.etapa.concluidoEm) ?? plantao.inicio,
                  )}, ${p.etapa.casoNome}`}
                  className="absolute grid size-5 -translate-x-1/2 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-marca"
                  style={{ left: `${p.x}%`, bottom: `${p.fileira * 14 - 3}px` }}
                >
                  <span
                    className={clsx(
                      'block size-3 rounded-full ring-2 ring-card transition-transform',
                      p.aberta ? clsx('border-2 bg-card', BORDA_DA_TRILHA[p.etapa.trilha]) : COR_DA_TRILHA[p.etapa.trilha],
                      foco === p.etapa.id && 'scale-150',
                    )}
                  />
                </button>
              ))}
            </div>
            <div className="relative mt-1 h-4 text-[0.6875rem] tabular-nums text-muted-foreground" aria-hidden="true">
              {marcas
                .filter((m) => m.rotulo)
                .map((m, i, todas) => (
                  <span
                    key={m.x}
                    className={clsx(
                      'absolute',
                      i === 0 ? 'left-0' : i === todas.length - 1 ? 'right-0' : '-translate-x-1/2',
                    )}
                    style={i === 0 || i === todas.length - 1 ? undefined : { left: `${m.x}%` }}
                  >
                    {m.rotulo}
                  </span>
                ))}
            </div>

            {/* A legenda, e no lugar dela o ponto em foco: a mesma linha, sem pular. */}
            <div className="mt-2 flex min-h-5 flex-wrap items-center gap-x-4 gap-y-1 text-xs">
              {pontoEmFoco ? (
                <span className="font-semibold">
                  <span className="tabular-nums">
                    {horaEmBrasilia(
                      (pontoEmFoco.aberta ? pontoEmFoco.etapa.iniciadoEm : pontoEmFoco.etapa.concluidoEm) ?? plantao.inicio,
                    )}
                  </span>{' '}
                  · {pontoEmFoco.aberta ? 'começou ' : ''}
                  {nomeDaEtapa(pontoEmFoco.etapa)}{' '}
                  <span className="font-normal text-muted-foreground">— {pontoEmFoco.etapa.casoNome}</span>
                </span>
              ) : (
                <>
                  <Legenda cor="bg-grafico" rotulo="Campo" quantas={campo} />
                  <Legenda cor="bg-grafico-comparacao" rotulo="Edição" quantas={edicao} />
                  {abertas.length > 0 && (
                    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                      <span className="size-2.5 rounded-full border-2 border-muted-foreground" aria-hidden="true" />
                      Começou e ficou aberta
                    </span>
                  )}
                </>
              )}
            </div>
          </section>

          {/* POR CASO */}
          {casos.length > 0 && (
            <section>
              <h4 className="rotulo-sobrescrito text-muted-foreground">Concluiu, por caso</h4>
              <ul className="mt-2 space-y-2">
                {casos.map((c) => (
                  <li key={c.casoId} className="rounded-cartao border border-border bg-background/60 px-3 py-2.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate text-sm font-bold">{c.nome}</span>
                      <span className="flex-shrink-0 text-xs text-muted-foreground tabular-nums">
                        {c.etapas.length} {c.etapas.length === 1 ? 'etapa' : 'etapas'}
                      </span>
                    </div>
                    <ul className="mt-1.5 space-y-0.5">
                      {c.etapas.map((e) => (
                        <LinhaDaEtapa key={e.id} etapa={e} hora={e.concluidoEm} acesa={foco === e.id} />
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {abertas.length > 0 && (
            <section>
              <h4 className="rotulo-sobrescrito text-muted-foreground">Começou e ficou aberta</h4>
              <ul className="mt-2 space-y-2">
                {abertas.map((e) => (
                  <li
                    key={e.id}
                    className={clsx(
                      'flex items-center gap-3 rounded-cartao border border-dashed border-border px-3 py-2.5 transition-colors',
                      foco === e.id && 'bg-marca-suave',
                    )}
                  >
                    <span
                      className={clsx('size-2.5 flex-shrink-0 rounded-full border-2', BORDA_DA_TRILHA[e.trilha])}
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold">{nomeDaEtapa(e)}</div>
                      <div className="truncate text-xs text-muted-foreground">{e.casoNome}</div>
                    </div>
                    <div className="flex-shrink-0 text-right text-xs">
                      <div className="font-semibold">{ROTULO_STATUS[e.status] ?? e.status}</div>
                      {e.iniciadoEm && (
                        <div className="text-muted-foreground tabular-nums">desde {horaEmBrasilia(e.iniciadoEm)}</div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <p className="text-xs text-muted-foreground">
            Conta as etapas com o nome dela. O que foi registrado depois do plantão fica fora.
          </p>
        </>
      )}
    </Dialogo>
  )
}

function Legenda({ cor, rotulo, quantas }: { cor: string; rotulo: string; quantas: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
      <span className={clsx('size-2.5 rounded-full', cor)} aria-hidden="true" />
      {rotulo}
      <span className="font-semibold text-foreground tabular-nums">{quantas}</span>
    </span>
  )
}

function LinhaDaEtapa({ etapa, hora, acesa }: { etapa: EtapaDoPlantao; hora: string | null; acesa: boolean }) {
  return (
    <li
      className={clsx(
        '-mx-1.5 flex items-center gap-2.5 rounded-md px-1.5 py-0.5 text-sm transition-colors',
        acesa && 'bg-marca-suave',
      )}
    >
      <span className="w-11 flex-shrink-0 text-xs tabular-nums text-muted-foreground">
        {hora ? horaEmBrasilia(hora) : ''}
      </span>
      <span className={clsx('size-2 flex-shrink-0 rounded-full', COR_DA_TRILHA[etapa.trilha])} aria-hidden="true" />
      <span className="min-w-0 truncate">{nomeDaEtapa(etapa)}</span>
    </li>
  )
}
