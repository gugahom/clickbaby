import type { ReactNode } from 'react'
import clsx from 'clsx'
import { ROTULO_PAPEL } from '@/features/equipe/lib/apresentacao'
import { FASES_DA_ETAPA, ROTULO_FASE_CAMPO, type EtapaTipo } from '@/features/quadro/types'
import { iniciais } from '@/lib/iniciais'
import type { FaseDaPessoa, MetricaPorEtapa, MetricaPorPessoa } from '../api/useMetricas'
import { ETAPAS_DE_EDICAO, type LinhaDaPessoa } from '../lib/kpis'
import { ORDEM_DAS_ETAPAS, formatarMinutos, rotuloDaEtapa } from '../lib/metricas'

/**
 * O MINI PERFIL DE UMA PESSOA (29/09/2026, pedido do gestor: "sempre que
 * clicarmos em um funcionário, abra um mini perfil (…) com todas as infos que
 * coletamos nos cards (…) quantidade de produção e tempo médio em cada etapa").
 *
 * Substitui as três linhas de resumo que abriam dentro da tabela. Continua
 * sendo o mesmo gesto — tocar na pessoa —, e o que abre agora é tudo o que os
 * cards registram da pessoa no mês, em quatro blocos, do mais importante ao resto:
 *   1. os quatro números da pessoa (partos, edições, prazo, ajustes);
 *   2. PRODUÇÃO POR ETAPA — quantas fez e o tempo médio, ao lado do da equipe;
 *   3. FASES DO CAMPO — quanto tempo os partos e as entradas da pessoa passam em
 *      cada fase (deslocamento, CCO, cuidados…);
 *   4. o que mais os cards guardam: material, passagens, atribuições, entregas,
 *      termos, avaliações.
 *
 * TEMPO MÉDIO É MÉDIA, como ele pediu, e só das etapas COM RELÓGIO de verdade
 * (ciclo ≥ 5 min — ver 20260929020655). Onde parte das edições não teve
 * relógio, a linha diz quantas tiveram: uma média de 3 edições de 20 não é a
 * média das 20. A comparação com a equipe é NEUTRA, sem verde nem vermelho:
 * editar mais rápido não é, sozinho, editar melhor.
 */
export function PerfilDaPessoa({
  linha,
  pessoa,
  porEtapa,
  fases,
  rotuloDoMes,
}: {
  linha: LinhaDaPessoa
  pessoa: MetricaPorPessoa | undefined
  /** Todas as linhas do mês, de todo mundo — a média da equipe sai daqui. */
  porEtapa: MetricaPorEtapa[]
  fases: FaseDaPessoa[]
  rotuloDoMes: string
}) {
  const daPessoa = porEtapa.filter((m) => m.pessoaId === linha.pessoaId)
  const mediaDaEquipe = (tipo: EtapaTipo) => {
    const todas = porEtapa.filter((m) => m.tipo === tipo)
    const medidas = todas.reduce((acc, m) => acc + m.medidas, 0)
    return medidas > 0 ? todas.reduce((acc, m) => acc + m.somaMin, 0) / medidas : null
  }

  const producao = ORDEM_DAS_ETAPAS.map((tipo) => daPessoa.find((m) => m.tipo === tipo)).filter(
    (m): m is MetricaPorEtapa => m !== undefined && m.concluidas > 0,
  )

  const fasesDaPessoa = fases.filter((f) => f.pessoaId === linha.pessoaId)
  const mediaDaFase = (tipo: EtapaTipo, fase: string) => {
    const todas = fases.filter((f) => f.tipo === tipo && f.fase === fase)
    const etapas = todas.reduce((acc, f) => acc + f.etapas, 0)
    return etapas > 0 ? todas.reduce((acc, f) => acc + f.somaMin, 0) / etapas : null
  }

  const concluidasPorOutra = daPessoa.reduce((acc, m) => acc + m.concluidasPorOutra, 0)
  const registros: { rotulo: string; valor: number; atencao?: boolean; dica?: string }[] = [
    { rotulo: 'Material baixado', valor: pessoa?.materialBaixou ?? 0 },
    { rotulo: 'Material subido', valor: pessoa?.materialSubiu ?? 0 },
    { rotulo: 'Passagens de turno dadas', valor: pessoa?.passagensDadas ?? 0 },
    { rotulo: 'Passagens de turno recebidas', valor: pessoa?.passagensRecebidas ?? 0 },
    { rotulo: 'Etapas atribuídas a alguém', valor: pessoa?.atribuicoesFeitas ?? 0 },
    { rotulo: 'Entregas confirmadas', valor: pessoa?.entregasConfirmadas ?? 0 },
    { rotulo: 'Termos de imagem registrados', valor: pessoa?.termosRegistrados ?? 0 },
    { rotulo: 'Avaliações registradas', valor: pessoa?.avaliacoesFeitas ?? 0 },
    {
      rotulo: 'Concluídas por outra pessoa',
      valor: concluidasPorOutra,
      dica: 'Etapas desta pessoa em que quem apertou "concluir" foi outra pessoa, registrando no lugar.',
    },
    {
      rotulo: 'Etapas de campo em paralelo',
      valor: linha.emParalelo,
      atencao: true,
      dica: 'Etapas de campo desta pessoa que se cruzam no tempo com outra do mesmo tipo, em outro caso.',
    },
  ].filter((r) => r.valor > 0)

  return (
    <section className="rounded-painel border border-border bg-card p-4 shadow-sm md:p-5">
      <header className="flex items-center gap-3 border-b border-border pb-4">
        <span
          className="grid size-12 flex-shrink-0 place-items-center rounded-full bg-marca text-base font-bold text-white"
          aria-hidden="true"
        >
          {iniciais(linha.nome)}
        </span>
        <div className="min-w-0">
          <h2 className="truncate text-lg leading-tight font-bold text-foreground">{linha.nome}</h2>
          <p className="text-sm text-muted-foreground">
            {ROTULO_PAPEL[pessoa?.papel ?? ''] ?? pessoa?.papel ?? '—'}
            {pessoa && !pessoa.ativo && ' · cadastro inativo'}
            {' · '}
            {linha.dias} {linha.dias === 1 ? 'dia' : 'dias'} com trabalho em {rotuloDoMes.toLowerCase()}
          </p>
        </div>
      </header>

      <div className="grid grid-cols-4 gap-2 border-b border-border py-4">
        <Numero rotulo="Partos" valor={String(linha.partos)} />
        <Numero rotulo="Edições" valor={String(linha.edicoes)} />
        <Numero
          rotulo="No prazo"
          valor={linha.taxaPrazo === null ? '—' : `${Math.round(linha.taxaPrazo * 100)}%`}
          dica={
            linha.taxaPrazo === null
              ? `Só ${linha.comPrazo} fotos e reels com prazo — abaixo de 5 a taxa seria sorte`
              : `${linha.comPrazo} fotos e reels com prazo`
          }
        />
        <Numero rotulo="Ajustes" valor={String(linha.ajustes)} />
      </div>

      <Bloco titulo="Produção por etapa">
        {producao.length === 0 ? (
          <Vazio>Nenhuma etapa concluída no mês.</Vazio>
        ) : (
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th className="pb-1.5 text-left font-semibold">Etapa</th>
                <th className="pb-1.5 text-right font-semibold">Feitas</th>
                <th className="pb-1.5 text-right font-semibold">Tempo médio</th>
                <th className="pb-1.5 pl-2 text-right font-semibold">Equipe</th>
              </tr>
            </thead>
            <tbody>
              {producao.map((m) => {
                const media = m.medidas > 0 ? m.somaMin / m.medidas : null
                // Só na EDIÇÃO: no campo, registrar depois (início = fim) é permitido
                // (seção 9 do CLAUDE.md) e não diz nada sobre o relógio.
                const edicao = ETAPAS_DE_EDICAO.includes(m.tipo)
                const semRelogio = edicao && m.medidas < m.concluidas
                const pouco = semRelogio && m.medidas / m.concluidas < 0.5
                return (
                  <tr key={m.tipo} className="border-t border-border/70 align-top">
                    <td className="py-2 pr-2">
                      <div className="font-semibold text-foreground">{rotuloDaEtapa(m.tipo)}</div>
                      {semRelogio && (
                        <div className={clsx('text-xs', pouco ? 'font-semibold text-atencao-tinta' : 'text-muted-foreground')}>
                          {m.medidas} de {m.concluidas} com relógio
                        </div>
                      )}
                    </td>
                    <td className="py-2 text-right font-semibold text-foreground">{m.concluidas}</td>
                    <td className="py-2 text-right font-bold text-foreground">{formatarMinutos(media)}</td>
                    <td className="py-2 pl-2 text-right text-muted-foreground">{formatarMinutos(mediaDaEquipe(m.tipo))}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Bloco>

      <Bloco titulo="Fases do campo" nota="tempo médio por etapa">
        {fasesDaPessoa.length === 0 ? (
          <Vazio>Nenhuma fase registrada nos cards neste mês.</Vazio>
        ) : (
          <table className="w-full text-sm tabular-nums">
            <tbody>
              {(['entrada', 'nascimento'] as const).map((tipo) => {
                const doTipo = (FASES_DA_ETAPA[tipo] ?? [])
                  .map((fase) => fasesDaPessoa.find((f) => f.tipo === tipo && f.fase === fase))
                  .filter((f): f is FaseDaPessoa => f !== undefined)
                if (doTipo.length === 0) return null
                return [
                  <tr key={tipo}>
                    <th colSpan={4} className="pt-2 pb-1 text-left text-xs font-semibold text-muted-foreground">
                      {rotuloDaEtapa(tipo)}
                    </th>
                  </tr>,
                  ...doTipo.map((f) => (
                    <tr key={`${tipo}-${f.fase}`} className="border-t border-border/70">
                      <td className="py-1.5 pr-2 font-semibold text-foreground">{ROTULO_FASE_CAMPO[f.fase]}</td>
                      <td className="py-1.5 text-right text-muted-foreground" title="Etapas em que a fase foi registrada">
                        {f.etapas}×
                      </td>
                      <td className="py-1.5 text-right font-bold text-foreground">{formatarMinutos(f.mediaMin)}</td>
                      <td className="py-1.5 pl-2 text-right text-muted-foreground">
                        {formatarMinutos(mediaDaFase(tipo, f.fase))}
                      </td>
                    </tr>
                  )),
                ]
              })}
            </tbody>
          </table>
        )}
      </Bloco>

      {registros.length > 0 && (
        <Bloco titulo="Também registrou">
          <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
            {registros.map((r) => (
              <div key={r.rotulo} className="flex items-baseline justify-between gap-3" title={r.dica}>
                <dt className="text-muted-foreground">{r.rotulo}</dt>
                <dd className={clsx('font-bold tabular-nums', r.atencao ? 'text-atencao-tinta' : 'text-foreground')}>
                  {r.valor}
                </dd>
              </div>
            ))}
          </dl>
        </Bloco>
      )}
    </section>
  )
}

function Numero({ rotulo, valor, dica }: { rotulo: string; valor: string; dica?: string }) {
  return (
    <div className="min-w-0" title={dica}>
      <div className="truncate text-xs text-muted-foreground">{rotulo}</div>
      <div className="text-2xl leading-tight font-extrabold tracking-tight text-foreground tabular-nums">{valor}</div>
    </div>
  )
}

function Bloco({ titulo, nota, children }: { titulo: string; nota?: string; children: ReactNode }) {
  return (
    <div className="border-b border-border py-4 last:border-b-0 last:pb-0">
      <h3 className="mb-2 rotulo-sobrescrito text-acento">
        {titulo}
        {nota && <span className="ml-2 font-normal tracking-normal text-muted-foreground normal-case">{nota}</span>}
      </h3>
      {children}
    </div>
  )
}

function Vazio({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>
}
