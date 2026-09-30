import { useState, type KeyboardEvent } from 'react'
import clsx from 'clsx'
import { Botao } from '@/components/ui/Botao'
import type { EtapaTipo } from '@/features/quadro/types'
import {
  useDefinirPadrao,
  useDentroDoPadrao,
  type MetricaDaEquipe,
  type PadraoDeTempo,
  type Periodo,
} from '../api/useMetricas'
import { ETAPAS_DE_EDICAO } from '../lib/kpis'
import { ORDEM_DAS_ETAPAS, formatarMinutos, rotuloDaEtapa } from '../lib/metricas'
import { Cartao } from './PainelDaEquipe'

/**
 * A RÉGUA — os "padrões de tempo conhecidos por todas" que o plano (seção 6)
 * combinou e ninguém tinha definido: `padroes_tempo` existia vazia desde o
 * schema inicial.
 *
 * O NÚMERO É DA GESTÃO; a mediana medida é só a sugestão. Uma régua nova é
 * linha nova no banco; a anterior fica no histórico.
 *
 * REFEITA EM 30/09/2026 (pedido do gestor: "uma forma de eles escolherem os
 * padrões que esperam (…) para que seja feito nessa média"). A primeira versão
 * só listava as etapas com medição no mês — em produção, antes de 01/10, a aba
 * abria dizendo "nada medido" e não deixava definir padrão nenhum. Agora:
 *   * TODA ETAPA aparece, com ou sem medição, separada em campo e edição;
 *   * o padrão se escolhe em HORAS e MINUTOS (ninguém pensa em "150 minutos"),
 *     e a mediana do mês vira um atalho "usar 1h35";
 *   * cada linha diz quantas etapas do mês ficaram DENTRO do padrão — é o que
 *     transforma a régua em cobrança, e o mesmo número aparece no perfil de
 *     cada pessoa.
 */
const AMOSTRA_PARA_CALIBRAR = 30

export function PadroesDeTempo({
  equipe,
  padroes,
  periodo,
  rotuloDoPeriodo,
}: {
  equipe: MetricaDaEquipe[]
  padroes: PadraoDeTempo[]
  periodo: Periodo
  /** "em outubro de 2026" */
  rotuloDoPeriodo: string
}) {
  const dentro = useDentroDoPadrao(periodo)
  const somaDoTipo = (tipo: EtapaTipo) => {
    const linhas = (dentro.data ?? []).filter((d) => d.tipo === tipo)
    return {
      comPadrao: linhas.reduce((acc, d) => acc + d.comPadrao, 0),
      dentro: linhas.reduce((acc, d) => acc + d.dentro, 0),
    }
  }

  const grupos: { titulo: string; nota: string; tipos: EtapaTipo[] }[] = [
    {
      titulo: 'Campo',
      nota: 'Registrar depois é permitido no campo, então o relógio daqui costuma medir menos que o trabalho.',
      tipos: ORDEM_DAS_ETAPAS.filter((t) => !ETAPAS_DE_EDICAO.includes(t)),
    },
    { titulo: 'Edição', nota: 'Do play ao concluir, sem as pausas.', tipos: ORDEM_DAS_ETAPAS.filter((t) => ETAPAS_DE_EDICAO.includes(t)) },
  ]

  return (
    <Cartao titulo="Padrões de tempo">
      <p className="mb-4 max-w-3xl text-sm text-muted-foreground">
        O tempo que a gestão espera de cada etapa. O relatório passa a contar quantas etapas ficaram dentro dele — aqui, e
        no perfil de cada pessoa. Um padrão novo vale a partir de hoje; antes do primeiro padrão de uma etapa, vale o
        primeiro.
      </p>
      <div className="-mx-4 overflow-x-auto">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="py-2.5 pr-4 pl-5 font-semibold">Etapa</th>
              <th className="px-4 py-2.5 text-right font-semibold">Padrão</th>
              <th className="px-4 py-2.5 text-right font-semibold">Equipe {rotuloDoPeriodo}</th>
              <th className="px-4 py-2.5 font-semibold">Dentro do padrão</th>
              <th className="py-2.5 pr-5 pl-4 text-right font-semibold">Definir</th>
            </tr>
          </thead>
          {grupos.map((g) => (
            <tbody key={g.titulo}>
              <tr>
                <th colSpan={5} className="bg-muted/40 py-2 pr-5 pl-5 text-left">
                  <span className="rotulo-sobrescrito text-acento">{g.titulo}</span>
                  <span className="ml-2 text-xs font-normal text-muted-foreground">{g.nota}</span>
                </th>
              </tr>
              {g.tipos.map((t) => (
                <LinhaDoPadrao
                  key={t}
                  tipo={t}
                  daEquipe={equipe.find((e) => e.tipo === t)}
                  padrao={padroes.find((p) => p.tipo === t)}
                  dentro={somaDoTipo(t)}
                />
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </Cartao>
  )
}

/** 95 → { h: '1', min: '35' } */
const emHorasEMinutos = (minutos: number) => ({ h: String(Math.floor(minutos / 60)), min: String(minutos % 60) })

function LinhaDoPadrao({
  tipo,
  daEquipe,
  padrao,
  dentro,
}: {
  tipo: EtapaTipo
  daEquipe: MetricaDaEquipe | undefined
  padrao: PadraoDeTempo | undefined
  dentro: { comPadrao: number; dentro: number }
}) {
  const definir = useDefinirPadrao()
  const [horas, setHoras] = useState('')
  const [minutos, setMinutos] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const mediana = daEquipe?.medianaMin ?? null
  const medidas = daEquipe?.medidas ?? 0
  const rotulo = rotuloDaEtapa(tipo)
  const digitou = horas !== '' || minutos !== ''

  function salvar() {
    const h = horas === '' ? 0 : Number(horas)
    const m = minutos === '' ? 0 : Number(minutos)
    if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || m < 0 || m > 59) {
      setErro('Horas inteiras e minutos de 0 a 59')
      return
    }
    const total = h * 60 + m
    if (total <= 0) {
      setErro('O padrão precisa ser maior que zero')
      return
    }
    setErro(null)
    definir.mutate(
      { tipo, minutos: total },
      {
        onSuccess: () => {
          setHoras('')
          setMinutos('')
        },
        onError: (e) => setErro(e instanceof Error ? e.message : 'Não deu para salvar'),
      },
    )
  }

  function usarMediana() {
    if (mediana === null) return
    const { h, min } = emHorasEMinutos(Math.max(1, Math.round(mediana)))
    setHoras(h)
    setMinutos(min)
  }

  const taxa = dentro.comPadrao > 0 ? dentro.dentro / dentro.comPadrao : null
  const campo = 'h-9 w-14 rounded-xl border border-border bg-card px-2 text-right text-sm tabular-nums'
  const aoEnter = (e: KeyboardEvent) => e.key === 'Enter' && digitou && salvar()

  return (
    <tr className="border-b border-border align-middle last:border-b-0">
      <td className="py-3 pr-4 pl-5 font-semibold text-foreground">{rotulo}</td>
      <td className="px-4 py-3 text-right tabular-nums">
        {padrao ? (
          <span className="text-base font-extrabold text-foreground" title={`Desde ${padrao.vigenteDesde.split('-').reverse().join('/')}`}>
            {formatarMinutos(padrao.minutos)}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">sem padrão</span>
        )}
      </td>
      <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">
        <span className="font-semibold text-foreground">{formatarMinutos(mediana)}</span>
        <span
          className={clsx('ml-1.5 text-xs', medidas > 0 && medidas < AMOSTRA_PARA_CALIBRAR ? 'text-atencao-tinta' : 'text-muted-foreground')}
          title={medidas > 0 && medidas < AMOSTRA_PARA_CALIBRAR ? 'Poucas medidas para calibrar a régua' : 'Mediana do mês'}
        >
          {medidas} med.
        </span>
      </td>
      <td className="px-4 py-3">
        {taxa === null ? (
          <span className="text-xs text-muted-foreground">{padrao ? 'nada medido no período' : '—'}</span>
        ) : (
          <div className="flex items-center gap-2.5">
            <span className="relative h-2 w-24 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <span className="absolute inset-y-0 left-0 rounded-full bg-grafico" style={{ width: `${Math.round(taxa * 100)}%` }} />
            </span>
            <span className={clsx('text-sm font-bold tabular-nums', taxa < 0.5 ? 'text-atencao-tinta' : 'text-foreground')}>
              {Math.round(taxa * 100)}%
            </span>
            <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
              {dentro.dentro} de {dentro.comPadrao}
            </span>
          </div>
        )}
      </td>
      <td className="py-3 pr-5 pl-4">
        <div className="flex items-center justify-end gap-1.5">
          {mediana !== null && !digitou && padrao?.minutos !== Math.max(1, Math.round(mediana)) && (
            <button
              type="button"
              onClick={usarMediana}
              className="mr-1 text-xs font-semibold whitespace-nowrap text-marca hover:underline"
              title="Preencher com a mediana da equipe no período"
            >
              usar {formatarMinutos(mediana)}
            </button>
          )}
          <label className="sr-only" htmlFor={`padrao-h-${tipo}`}>
            Horas do novo padrão de {rotulo}
          </label>
          <input
            id={`padrao-h-${tipo}`}
            type="number"
            inputMode="numeric"
            min={0}
            value={horas}
            onChange={(e) => setHoras(e.target.value)}
            onKeyDown={aoEnter}
            placeholder={padrao ? emHorasEMinutos(padrao.minutos).h : '0'}
            className={campo}
          />
          <span className="text-xs text-muted-foreground">h</span>
          <label className="sr-only" htmlFor={`padrao-min-${tipo}`}>
            Minutos do novo padrão de {rotulo}
          </label>
          <input
            id={`padrao-min-${tipo}`}
            type="number"
            inputMode="numeric"
            min={0}
            max={59}
            value={minutos}
            onChange={(e) => setMinutos(e.target.value)}
            onKeyDown={aoEnter}
            placeholder={padrao ? emHorasEMinutos(padrao.minutos).min : '0'}
            className={campo}
          />
          <span className="mr-1 text-xs text-muted-foreground">min</span>
          <Botao onClick={salvar} disabled={definir.isPending || !digitou}>
            {definir.isPending ? '…' : 'Definir'}
          </Botao>
        </div>
        {erro && <div className="mt-1 text-right text-xs font-semibold text-atrasado">{erro}</div>}
      </td>
    </tr>
  )
}
