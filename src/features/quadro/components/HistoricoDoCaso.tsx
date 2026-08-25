import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { supabase } from '@/lib/supabase'
import { formatarDataHora } from '@/lib/formato'
import {
  descreverEvento,
  type EventoHistorico,
  type TomEvento,
} from '../lib/historico'

/**
 * Histórico do caso: quem fez o quê, em ordem.
 *
 * A invariante 3.2 diz que "o histórico de quem fez o quê é o produto". Até
 * agora ele existia só no banco — `eventos` era legível apenas por adm, e
 * nenhuma tela o desenhava. Esta é a tela.
 *
 * Ordem DECRESCENTE, ao contrário do histórico de etapas logo acima. Ali a
 * ordem é o roteiro do pacote (entrada, nascimento, banho...) e ler de cima
 * para baixo é ler o plano. Aqui a pergunta é outra — "o que aconteceu por
 * último?" — e num caso com trinta eventos a resposta não pode estar no fim da
 * rolagem.
 *
 * Buscado só com o card aberto: são muitos eventos por caso e nenhum aparece na
 * lista fechada.
 */
export function HistoricoDoCaso({ casoId }: { casoId: string }) {
  const { data, isPending, error } = useQuery({
    queryKey: ['historico', casoId],
    queryFn: async (): Promise<EventoHistorico[]> => {
      const { data, error } = await supabase
        .from('eventos')
        .select('id, tipo, payload, ocorrido_em, pessoa:pessoas(nome)')
        .eq('caso_id', casoId)
        .order('ocorrido_em', { ascending: false })
        .limit(50)
      if (error) throw error
      return (data ?? []) as unknown as EventoHistorico[]
    },
  })

  if (isPending) {
    return <p className="text-xs text-muted-foreground">Carregando histórico…</p>
  }

  if (error) {
    return (
      <p className="text-xs text-muted-foreground">
        Não foi possível carregar o histórico.
      </p>
    )
  }

  const linhas = (data ?? []).map(descreverEvento)

  if (linhas.length === 0) {
    return <p className="text-xs text-muted-foreground">Nada registrado ainda.</p>
  }

  return (
    <ol className="space-y-0">
      {linhas.map((linha, i) => (
        <li key={linha.id} className="flex gap-3">
          {/* Trilho: o ponto marca o fato, a linha liga ao anterior. O último
              não tem trilho para baixo — senão a lista parece cortada. */}
          <div className="flex flex-col items-center pt-1.5">
            <span
              className={clsx('size-2 flex-shrink-0 rounded-full', PONTO[linha.tom])}
              aria-hidden="true"
            />
            {i < linhas.length - 1 && (
              <span className="w-px flex-1 bg-border" aria-hidden="true" />
            )}
          </div>

          <div className="min-w-0 flex-1 pb-3">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span
                className={clsx(
                  'text-sm',
                  linha.tom === 'marco' ? 'font-semibold' : 'font-medium',
                  linha.tom === 'sistema' && 'text-muted-foreground',
                )}
              >
                {linha.acao}
              </span>
              {/* Sem ator humano = trigger ou sync. Dizer "sistema" é mais
                  honesto que deixar em branco e parecer dado faltando. */}
              <span className="text-xs text-muted-foreground">
                {linha.quem ?? 'sistema'}
              </span>
            </div>
            <div className="text-xs text-muted-foreground">
              {formatarDataHora(linha.quando)}
              {linha.detalhe && ` · ${linha.detalhe}`}
            </div>
          </div>
        </li>
      ))}
    </ol>
  )
}

const PONTO: Record<TomEvento, string> = {
  marco: 'bg-concluido',
  normal: 'bg-marca',
  alerta: 'bg-atrasado',
  sistema: 'bg-muted-foreground/30',
}
