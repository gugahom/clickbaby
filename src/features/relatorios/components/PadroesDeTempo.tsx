import { useState } from 'react'
import { Botao } from '@/components/ui/Botao'
import type { EtapaTipo } from '@/features/quadro/types'
import { useDefinirPadrao, type MetricaDaEquipe, type PadraoDeTempo } from '../api/useMetricas'
import { ORDEM_DAS_ETAPAS, formatarMinutos, rotuloDaEtapa } from '../lib/metricas'
import { Cartao } from './PainelDaEquipe'

/**
 * A RÉGUA — os "padrões de tempo conhecidos por todas" que o plano (seção 6)
 * combinou e que ninguém tinha definido: a tabela `padroes_tempo` existia desde
 * o schema inicial, vazia.
 *
 * O NÚMERO É DA GESTÃO, a mediana é SUGESTÃO. O comentário da própria tabela
 * diz como: "calibrados com 30 a 60 dias de dados reais — nunca chutados no
 * código". Por isso a tela mostra quanto a equipe de fato levou, com o tamanho
 * da amostra, e avisa quando ainda há pouco — mas não preenche nada sozinha.
 *
 * DEFINIR É PARA SEMPRE, no bom sentido: uma régua nova é uma linha nova, e a
 * anterior fica no histórico. No mesmo dia, definir de novo corrige (a régua
 * ainda não valeu). O padrão aparece na ficha de cada pessoa, como um traço na
 * faixa de tempo.
 */
const AMOSTRA_PARA_CALIBRAR = 30

export function PadroesDeTempo({
  equipe,
  padroes,
}: {
  equipe: MetricaDaEquipe[]
  padroes: PadraoDeTempo[]
}) {
  const tipos = ORDEM_DAS_ETAPAS.filter(
    (t) => equipe.some((e) => e.tipo === t) || padroes.some((p) => p.tipo === t),
  )

  return (
    <Cartao
      titulo="Padrões de tempo"
      subtitulo="O tempo esperado de cada etapa. A mediana da equipe é só a sugestão; quem decide o número é a gestão."
    >
      {tipos.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Sem etapas medidas neste período para sugerir um padrão.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {tipos.map((t) => (
            <LinhaDoPadrao
              key={t}
              tipo={t}
              daEquipe={equipe.find((e) => e.tipo === t)}
              padrao={padroes.find((p) => p.tipo === t)}
            />
          ))}
        </ul>
      )}
    </Cartao>
  )
}

function LinhaDoPadrao({
  tipo,
  daEquipe,
  padrao,
}: {
  tipo: EtapaTipo
  daEquipe: MetricaDaEquipe | undefined
  padrao: PadraoDeTempo | undefined
}) {
  const definir = useDefinirPadrao()
  const [minutos, setMinutos] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const sugestao = daEquipe?.medianaMin !== null && daEquipe?.medianaMin !== undefined
    ? Math.round(daEquipe.medianaMin)
    : null
  const poucos = (daEquipe?.medidas ?? 0) < AMOSTRA_PARA_CALIBRAR

  function salvar() {
    const n = Number(minutos)
    if (!Number.isInteger(n) || n <= 0) {
      setErro('Digite o tempo em minutos, maior que zero.')
      return
    }
    setErro(null)
    definir.mutate(
      { tipo, minutos: n },
      {
        onSuccess: () => setMinutos(''),
        onError: (e) => setErro(e instanceof Error ? e.message : 'Não deu para salvar.'),
      },
    )
  }

  return (
    <li className="grid gap-3 py-3 sm:grid-cols-[8rem_1fr_auto] sm:items-center">
      <span className="text-sm font-bold text-foreground">{rotuloDaEtapa(tipo)}</span>

      <div className="text-xs text-muted-foreground">
        {daEquipe && daEquipe.medianaMin !== null ? (
          <>
            A equipe levou <span className="font-semibold text-foreground">{formatarMinutos(daEquipe.medianaMin)}</span>{' '}
            (metade do meio: {formatarMinutos(daEquipe.p25Min)} a {formatarMinutos(daEquipe.p75Min)}) em{' '}
            <span className="tabular-nums">{daEquipe.medidas}</span> medidas.
            {poucos && <span className="ml-1 font-semibold text-atencao-tinta">Ainda poucos dados para calibrar.</span>}
          </>
        ) : (
          'Nada medido neste período.'
        )}
        <div className="mt-0.5">
          {padrao ? (
            <>
              Padrão em vigor: <span className="font-semibold text-foreground">{formatarMinutos(padrao.minutos)}</span>
              , desde {padrao.vigenteDesde.split('-').reverse().join('/')}
            </>
          ) : (
            'Sem padrão definido.'
          )}
        </div>
        {erro && <div className="mt-1 font-semibold text-atrasado">{erro}</div>}
      </div>

      <div className="flex items-center gap-2">
        <label className="sr-only" htmlFor={`padrao-${tipo}`}>
          Padrão de {rotuloDaEtapa(tipo)}, em minutos
        </label>
        <input
          id={`padrao-${tipo}`}
          type="number"
          inputMode="numeric"
          min={1}
          value={minutos}
          onChange={(e) => setMinutos(e.target.value)}
          placeholder={sugestao !== null ? String(sugestao) : 'min'}
          className="h-10 w-20 rounded-xl border border-border bg-card px-3 text-sm tabular-nums"
        />
        {sugestao !== null && minutos === '' && (
          <button
            type="button"
            onClick={() => setMinutos(String(sugestao))}
            className="text-xs font-semibold text-marca hover:underline"
          >
            Usar mediana
          </button>
        )}
        <Botao onClick={salvar} disabled={definir.isPending || minutos === ''}>
          {definir.isPending ? 'Salvando…' : 'Definir'}
        </Botao>
      </div>
    </li>
  )
}
