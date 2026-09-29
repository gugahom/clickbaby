/**
 * UMA RAZÃO CONTRA O TODO — "23 de 25 registradas por ela mesma".
 *
 * Barra de um tom só: o preenchimento no azul dos gráficos, o trilho num passo
 * mais claro do mesmo tom, para a barra inteira ler como uma coisa só. Não há
 * verde "bom" nem vermelho "ruim": estes números dizem como a pessoa REGISTRA,
 * e pintar isso de status transformaria hábito em nota.
 */
export function Medidor({
  rotulo,
  parte,
  todo,
  explicacao,
}: {
  rotulo: string
  parte: number
  todo: number
  explicacao: string
}) {
  const fracao = todo === 0 ? 0 : parte / todo

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-semibold text-foreground">{rotulo}</span>
        <span className="text-sm font-bold text-foreground">
          {todo === 0 ? '—' : `${Math.round(fracao * 100)}%`}
          <span className="ml-1.5 text-xs font-normal text-muted-foreground tabular-nums">
            {parte} de {todo}
          </span>
        </span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-grafico-faixa"
        role="meter"
        aria-label={rotulo}
        aria-valuemin={0}
        aria-valuemax={todo}
        aria-valuenow={parte}
      >
        <div className="h-full rounded-full bg-grafico" style={{ width: `${fracao * 100}%` }} />
      </div>
      <p className="text-xs text-muted-foreground">{explicacao}</p>
    </div>
  )
}
