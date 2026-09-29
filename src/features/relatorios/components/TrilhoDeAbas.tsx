import clsx from 'clsx'

/**
 * As visões do relatório num trilho — o mesmo desenho das abas do Quadro
 * (`BotaoAba`): um trilho arredondado com a ativa em pílula cheia. Soltas,
 * quatro pílulas não diriam que são alternativas entre si.
 *
 * Rola na horizontal no celular em vez de quebrar linha: quebrada, a quarta
 * aba cairia sozinha embaixo e pareceria outro controle.
 */
export function TrilhoDeAbas<T extends string>({
  abas,
  ativa,
  onTrocar,
}: {
  abas: { id: T; rotulo: string }[]
  ativa: T
  onTrocar: (id: T) => void
}) {
  return (
    <div className="-mx-3 overflow-x-auto px-3 md:mx-0 md:px-0">
      <div
        className="inline-flex items-center gap-1 rounded-full border border-border bg-card p-1 shadow-cartao"
        role="tablist"
        aria-label="Visões do relatório"
      >
        {abas.map((aba) => (
          <button
            key={aba.id}
            type="button"
            role="tab"
            aria-selected={ativa === aba.id}
            onClick={() => onTrocar(aba.id)}
            className={clsx(
              'inline-flex min-h-10 flex-shrink-0 items-center rounded-full px-4 text-sm whitespace-nowrap transition-colors',
              ativa === aba.id
                ? 'bg-marca font-bold text-white'
                : 'font-medium text-muted-foreground hover:bg-marca-suave hover:text-marca',
            )}
          >
            {aba.rotulo}
          </button>
        ))}
      </div>
    </div>
  )
}
