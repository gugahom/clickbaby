interface PropsAlerta {
  children: React.ReactNode
  onFechar?: () => void
}

/**
 * Erro de ação, em linguagem de tela. O texto que chega aqui já passou por
 * mensagemDeErro() — nunca é o `raise exception` cru da RPC, que fala em UUID
 * e valor de enum.
 *
 * role="alert" para o leitor de tela anunciar sem precisar de foco: a pessoa
 * pode estar com o aparelho na mão e os olhos no parto.
 */
export function Alerta({ children, onFechar }: PropsAlerta) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-md border border-atrasado/40 bg-atrasado/10 px-3 py-2 text-sm"
    >
      <span className="flex-1">{children}</span>
      {onFechar && (
        <button
          type="button"
          onClick={onFechar}
          aria-label="Fechar aviso"
          className="flex-shrink-0 text-muted-foreground hover:text-foreground"
        >
          ✕
        </button>
      )}
    </div>
  )
}
