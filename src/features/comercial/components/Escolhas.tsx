import clsx from 'clsx'

/**
 * UMA PERGUNTA, AS RESPOSTAS EM BOTÕES (seção 6: seleção, não digitação). Os
 * diálogos do comercial são quase só isto — como foi o contato, quando voltar,
 * por que perdeu —, e um registro em três toques depende de nenhuma dessas
 * perguntas abrir uma lista.
 */
export function Escolhas<T extends string>({
  rotulo,
  opcoes,
  escolhida,
  onEscolher,
  ajuda,
}: {
  rotulo: string
  opcoes: { id: T; rotulo: string }[]
  escolhida: T | null
  onEscolher: (id: T) => void
  ajuda?: string
}) {
  return (
    <fieldset>
      <legend className="text-sm font-medium">{rotulo}</legend>
      {ajuda && <p className="mt-0.5 text-xs text-muted-foreground">{ajuda}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        {opcoes.map((o) => (
          <button
            key={o.id}
            type="button"
            aria-pressed={escolhida === o.id}
            onClick={() => onEscolher(o.id)}
            className={clsx(
              'min-h-10 rounded-full border px-3.5 text-sm font-semibold transition-colors',
              escolhida === o.id
                ? 'border-marca bg-marca text-white'
                : 'border-border bg-card hover:border-marca/40 hover:bg-marca-suave',
            )}
          >
            {o.rotulo}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

/** A caixa de nota dos diálogos. Texto livre só aqui (seção 6). */
export function CampoNota({
  rotulo,
  valor,
  aoMudar,
  opcional = true,
  placeholder,
}: {
  rotulo: string
  valor: string
  aoMudar: (v: string) => void
  opcional?: boolean
  placeholder?: string
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">
        {rotulo}
        {opcional && <span className="ml-1 text-xs text-muted-foreground">(opcional)</span>}
      </span>
      <textarea
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        rows={2}
        placeholder={placeholder}
        className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2 text-base"
      />
    </label>
  )
}
