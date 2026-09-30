import type { ReactNode } from 'react'
import clsx from 'clsx'
import { BotaoIcone } from '@/components/ui/BotaoIcone'
import { IconeX } from '@/components/ui/icones'
import { ROTULO_PAPEL } from '@/features/equipe/lib/apresentacao'
import { FASES_DA_ETAPA, ROTULO_FASE_CAMPO, type EtapaTipo } from '@/features/quadro/types'
import { iniciais } from '@/lib/iniciais'
import type {
  DentroDoPadrao,
  FaseDaPessoa,
  MetricaPorEtapa,
  MetricaPorPessoa,
  PadraoDeTempo,
  PontosDaPessoa,
} from '../api/useMetricas'
import { ETAPAS_DE_EDICAO, type LinhaDaPessoa } from '../lib/kpis'
import { ORDEM_DAS_ETAPAS, formatarMinutos, rotuloDaEtapa } from '../lib/metricas'
import { ITENS_DE_PONTUACAO, formatarPontos, pontosComUnidade } from '../lib/pontos'

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
 *
 * O PADRÃO DE TEMPO entra na produção (30/09/2026, pedido do gestor: "os
 * padrões que esperam (…) para que seja feito nessa média"): embaixo do tempo
 * médio, o padrão em vigor, e ao lado, quantas das medidas ficaram dentro dele.
 * Aqui há cor, ao contrário da comparação com a equipe: o padrão é a régua que
 * a própria gestão escolheu, e ficar abaixo da metade dela é o que ela pediu
 * para enxergar.
 */
export interface PadraoNoPerfil {
  /** De todo mundo, no período. */
  dentro: DentroDoPadrao[]
  /** A régua em vigor hoje, uma por etapa. */
  vigentes: PadraoDeTempo[]
}

export function PerfilDaPessoa({
  linha,
  pessoa,
  porEtapa,
  fases,
  pontos,
  padrao,
  rotuloDoPeriodo,
  onFechar,
}: {
  linha: LinhaDaPessoa
  pessoa: MetricaPorPessoa | undefined
  /** Todas as linhas do mês, de todo mundo — a média da equipe sai daqui. */
  porEtapa: MetricaPorEtapa[]
  fases: FaseDaPessoa[]
  /** Os pontos de todo mundo no período — os desta pessoa saem daqui. */
  pontos: PontosDaPessoa[]
  padrao: PadraoNoPerfil
  /** Como a frase termina: "em dezembro de 2027", "nos últimos 7 dias". */
  rotuloDoPeriodo: string
  /** O "xiszinho" (pedido do gestor): fecha o perfil e a tabela ocupa a largura. */
  onFechar: () => void
}) {
  const daPessoa = porEtapa.filter((m) => m.pessoaId === linha.pessoaId)
  const mediaDaEquipe = (tipo: EtapaTipo) => {
    const todas = porEtapa.filter((m) => m.tipo === tipo)
    const medidas = todas.reduce((acc, m) => acc + m.medidas, 0)
    return medidas > 0 ? todas.reduce((acc, m) => acc + m.somaMin, 0) / medidas : null
  }

  const dentroDaPessoa = (tipo: EtapaTipo) =>
    padrao.dentro.find((d) => d.pessoaId === linha.pessoaId && d.tipo === tipo)
  const padraoDa = (tipo: EtapaTipo) => padrao.vigentes.find((p) => p.tipo === tipo)

  const producao = ORDEM_DAS_ETAPAS.map((tipo) => daPessoa.find((m) => m.tipo === tipo)).filter(
    (m): m is MetricaPorEtapa => m !== undefined && m.concluidas > 0,
  )

  const fasesDaPessoa = fases.filter((f) => f.pessoaId === linha.pessoaId)
  // Na ordem da tabela de pontos da gestão, e só o que rendeu alguma coisa.
  const pontosDaPessoa = ITENS_DE_PONTUACAO.map((i) =>
    pontos.find((p) => p.pessoaId === linha.pessoaId && p.item === i.id),
  ).filter((p): p is PontosDaPessoa => p !== undefined && p.etapas > 0)
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
    <section className="h-full rounded-painel border border-border bg-card p-4 shadow-sm md:p-5">
      <header className="flex items-center gap-3 border-b border-border pb-4">
        <span
          className="grid size-12 flex-shrink-0 place-items-center rounded-full bg-marca text-base font-bold text-white"
          aria-hidden="true"
        >
          {iniciais(linha.nome)}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg leading-tight font-bold text-foreground">{linha.nome}</h2>
          <p className="text-sm text-muted-foreground">
            {ROTULO_PAPEL[pessoa?.papel ?? ''] ?? pessoa?.papel ?? '—'}
            {pessoa && !pessoa.ativo && ' · cadastro inativo'}
            {' · '}
            {linha.dias} {linha.dias === 1 ? 'dia' : 'dias'} com trabalho {rotuloDoPeriodo}
          </p>
        </div>
        <BotaoIcone rotulo="Fechar o perfil" onClick={onFechar} className="-mt-1 -mr-1 self-start">
          <IconeX className="size-5" />
        </BotaoIcone>
      </header>

      <div className="grid grid-cols-5 gap-2 border-b border-border py-4">
        <Numero rotulo="Pontos" valor={formatarPontos(linha.pontos)} />
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

      <Bloco titulo="Pontos" nota="o peso de cada etapa, dividido quando passou de mão">
        {pontosDaPessoa.length === 0 ? (
          <Vazio>Nenhum ponto no período.</Vazio>
        ) : (
          <table className="w-full text-sm tabular-nums">
            <tbody>
              {pontosDaPessoa.map((p) => (
                <tr key={p.item} className="border-t border-border/70 first:border-t-0">
                  <td className="py-1.5 pr-2 font-semibold text-foreground">
                    {ITENS_DE_PONTUACAO.find((i) => i.id === p.item)?.rotulo ?? p.item}
                  </td>
                  <td className="py-1.5 text-right text-muted-foreground">
                    {p.etapas}×
                    {p.divididas > 0 && (
                      <span className="ml-1 text-xs" title="Etapas que passaram de mão e tiveram os pontos divididos">
                        ({p.divididas} {p.divididas === 1 ? 'dividida' : 'divididas'})
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 pl-2 text-right font-bold text-foreground">{pontosComUnidade(p.pontos)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Bloco>

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
                <th className="pb-1.5 pl-2 text-right font-semibold">No padrão</th>
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
                    <td className="py-2 text-right">
                      <div className="font-bold text-foreground">{formatarMinutos(media)}</div>
                      {padraoDa(m.tipo) && (
                        <div className="text-xs text-muted-foreground">padrão {formatarMinutos(padraoDa(m.tipo)?.minutos ?? null)}</div>
                      )}
                    </td>
                    <td className="py-2 pl-2 text-right text-muted-foreground">{formatarMinutos(mediaDaEquipe(m.tipo))}</td>
                    <td className="py-2 pl-2 text-right">
                      <NoPadrao d={dentroDaPessoa(m.tipo)} />
                    </td>
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

/** "8 de 10" dentro do padrão; âmbar abaixo da metade. Sem régua, um traço. */
function NoPadrao({ d }: { d: DentroDoPadrao | undefined }) {
  if (!d || d.comPadrao === 0) {
    return <span className="text-muted-foreground" title="Sem padrão definido para esta etapa">—</span>
  }
  const abaixo = d.dentro / d.comPadrao < 0.5
  return (
    <span
      className={clsx('font-semibold', abaixo ? 'text-atencao-tinta' : 'text-foreground')}
      title={`${d.dentro} de ${d.comPadrao} etapas medidas dentro do padrão`}
    >
      {d.dentro}/{d.comPadrao}
    </span>
  )
}
