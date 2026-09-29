import { useState } from 'react'
import { Botao } from '@/components/ui/Botao'
import type { EtapaTipo } from '@/features/quadro/types'
import { useDefinirPadrao, type MetricaDaEquipe, type PadraoDeTempo } from '../api/useMetricas'
import { ORDEM_DAS_ETAPAS, formatarMinutos, rotuloDaEtapa } from '../lib/metricas'
import { Cartao } from './PainelDaEquipe'

/**
 * A RÉGUA — os "padrões de tempo conhecidos por todas" que o plano (seção 6)
 * combinou e ninguém tinha definido: `padroes_tempo` existia vazia desde o
 * schema inicial.
 *
 * O NÚMERO É DA GESTÃO; a mediana medida é só a sugestão, e o campo nasce
 * vazio com ela de marca-d'água. O comentário da tabela diz "calibrar com 30 a
 * 60 dias de dados reais", então abaixo de 30 medidas a linha avisa.
 * Uma régua nova é linha nova no banco; a anterior fica no histórico.
 */
const AMOSTRA_PARA_CALIBRAR = 30

export function PadroesDeTempo({ equipe, padroes }: { equipe: MetricaDaEquipe[]; padroes: PadraoDeTempo[] }) {
  const tipos = ORDEM_DAS_ETAPAS.filter(
    (t) => equipe.some((e) => e.tipo === t && e.medidas > 0) || padroes.some((p) => p.tipo === t),
  )

  return (
    <Cartao titulo="Padrões de tempo">
      {tipos.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Nada medido neste período.</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="py-2 pr-3 font-semibold">Etapa</th>
              <th className="py-2 pr-3 text-right font-semibold">Equipe</th>
              <th className="py-2 pr-3 text-right font-semibold">Padrão</th>
              <th className="py-2 font-semibold">
                <span className="sr-only">Definir</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {tipos.map((t) => (
              <LinhaDoPadrao
                key={t}
                tipo={t}
                daEquipe={equipe.find((e) => e.tipo === t)}
                padrao={padroes.find((p) => p.tipo === t)}
              />
            ))}
          </tbody>
        </table>
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
  const mediana = daEquipe?.medianaMin ?? null
  const medidas = daEquipe?.medidas ?? 0

  function salvar() {
    const n = Number(minutos)
    if (!Number.isInteger(n) || n <= 0) {
      setErro('Minutos, maior que zero')
      return
    }
    setErro(null)
    definir.mutate(
      { tipo, minutos: n },
      {
        onSuccess: () => setMinutos(''),
        onError: (e) => setErro(e instanceof Error ? e.message : 'Não deu para salvar'),
      },
    )
  }

  return (
    <tr className="border-b border-border align-middle">
      <td className="py-2.5 pr-3 font-semibold text-foreground">{rotuloDaEtapa(tipo)}</td>
      <td className="py-2.5 pr-3 text-right tabular-nums">
        <span className="font-bold text-foreground">{formatarMinutos(mediana)}</span>
        <span
          className={medidas < AMOSTRA_PARA_CALIBRAR ? 'ml-1.5 text-xs text-atencao-tinta' : 'ml-1.5 text-xs text-muted-foreground'}
          title={medidas < AMOSTRA_PARA_CALIBRAR ? 'Poucas medidas para calibrar a régua' : undefined}
        >
          {medidas} med.
        </span>
      </td>
      <td className="py-2.5 pr-3 text-right tabular-nums">
        {padrao ? (
          <span className="font-bold text-foreground" title={`Desde ${padrao.vigenteDesde.split('-').reverse().join('/')}`}>
            {formatarMinutos(padrao.minutos)}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="py-2.5">
        <div className="flex items-center justify-end gap-2">
          <label className="sr-only" htmlFor={`padrao-${tipo}`}>
            Novo padrão de {rotuloDaEtapa(tipo)}, em minutos
          </label>
          <input
            id={`padrao-${tipo}`}
            type="number"
            inputMode="numeric"
            min={1}
            value={minutos}
            onChange={(e) => setMinutos(e.target.value)}
            placeholder={mediana !== null ? String(Math.round(mediana)) : 'min'}
            className="h-9 w-20 rounded-xl border border-border bg-card px-3 text-sm tabular-nums"
          />
          <Botao onClick={salvar} disabled={definir.isPending || minutos === ''}>
            {definir.isPending ? '…' : 'Definir'}
          </Botao>
        </div>
        {erro && <div className="mt-1 text-right text-xs font-semibold text-atrasado">{erro}</div>}
      </td>
    </tr>
  )
}
