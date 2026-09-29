import { useState } from 'react'
import { Botao } from '@/components/ui/Botao'
import { useDefinirPesoDoItem, usePesosDosItens, type PesoDoItem } from '../api/useMetricas'
import { ITENS_DE_PONTUACAO, formatarPontos, pontosComUnidade, type ItemDePontuacao } from '../lib/pontos'
import { Cartao } from './PainelDaEquipe'

/**
 * A RÉGUA DO RANKING POR PONTOS (29/09/2026, pedido do gestor e do André).
 *
 * Nasce com a tabela que eles mandaram (migration 20260929210556) e se ajusta
 * AQUI: "a gente precisa começar a usar pra ver (…) identificar os erros". Um
 * peso novo vale de hoje em diante — o mês que já passou continua contado com
 * o peso que valia nele —, e no mesmo dia corrige.
 *
 * A coluna do RATEIO é conta, não configuração: metade do peso para cada uma
 * de duas pessoas, como na planilha deles. Com três, é um terço — a tela mostra
 * o caso comum.
 */
export function TabelaDePontuacao() {
  const pesos = usePesosDosItens()

  return (
    <Cartao titulo="Pontuação por etapa">
      <p className="mb-3 text-sm text-muted-foreground">
        Quanto cada etapa concluída vale no ranking. Quando a etapa passa de mão (uma pessoa começa e outra
        termina), os pontos se dividem em partes iguais. Um peso novo vale a partir de hoje.
      </p>
      {pesos.error ? (
        <p className="text-sm text-atrasado">Não deu para carregar os pesos: {pesos.error.message}</p>
      ) : pesos.isPending ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Carregando…</p>
      ) : (
        <div className="-mx-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="py-2 pr-3 pl-4 font-semibold">Etapa</th>
                <th className="hidden py-2 pr-3 font-semibold md:table-cell">Categoria</th>
                <th className="py-2 pr-3 text-right font-semibold">Pontos</th>
                <th className="hidden py-2 pr-3 text-right font-semibold sm:table-cell">Em 2 pessoas</th>
                <th className="py-2 pr-4 font-semibold">
                  <span className="sr-only">Mudar</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {ITENS_DE_PONTUACAO.map((i) => (
                <LinhaDoPeso
                  key={i.id}
                  item={i.id}
                  rotulo={i.rotulo}
                  categoria={i.categoria}
                  detalhe={i.detalhe}
                  peso={pesos.data?.find((p) => p.item === i.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Cartao>
  )
}

function LinhaDoPeso({
  item,
  rotulo,
  categoria,
  detalhe,
  peso,
}: {
  item: ItemDePontuacao
  rotulo: string
  categoria: string
  detalhe: string
  peso: PesoDoItem | undefined
}) {
  const definir = useDefinirPesoDoItem()
  const [valor, setValor] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const atual = peso?.pontos ?? 0

  function salvar() {
    const n = Number(valor.replace(',', '.'))
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      setErro('De 0 a 100')
      return
    }
    setErro(null)
    definir.mutate(
      { item, pontos: n },
      {
        onSuccess: () => setValor(''),
        onError: (e) => setErro(e instanceof Error ? e.message : 'Não deu para salvar'),
      },
    )
  }

  return (
    <tr className="border-b border-border align-middle">
      <td className="py-2.5 pr-3 pl-4">
        <div className="font-semibold text-foreground">{rotulo}</div>
        <div className="text-xs text-muted-foreground">{detalhe}</div>
      </td>
      <td className="hidden py-2.5 pr-3 text-muted-foreground md:table-cell">{categoria}</td>
      <td
        className={atual === 0 ? 'py-2.5 pr-3 text-right text-muted-foreground tabular-nums' : 'py-2.5 pr-3 text-right font-bold text-foreground tabular-nums'}
        title={peso ? `Desde ${peso.vigenteDesde.split('-').reverse().join('/')}` : undefined}
      >
        {atual === 0 ? 'não pontua' : pontosComUnidade(atual)}
      </td>
      <td className="hidden py-2.5 pr-3 text-right text-muted-foreground tabular-nums sm:table-cell">
        {atual === 0 ? '—' : `${pontosComUnidade(atual / 2)} para cada`}
      </td>
      <td className="py-2.5 pr-4">
        <div className="flex items-center justify-end gap-2">
          <label className="sr-only" htmlFor={`peso-${item}`}>
            Novo peso de {rotulo}, em pontos
          </label>
          <input
            id={`peso-${item}`}
            type="text"
            inputMode="decimal"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && valor !== '' && salvar()}
            placeholder={formatarPontos(atual)}
            className="h-9 w-20 rounded-xl border border-border bg-card px-3 text-right text-sm tabular-nums"
          />
          <Botao onClick={salvar} disabled={definir.isPending || valor === ''}>
            {definir.isPending ? '…' : 'Definir'}
          </Botao>
        </div>
        {erro && <div className="mt-1 text-right text-xs font-semibold text-atrasado">{erro}</div>}
      </td>
    </tr>
  )
}
