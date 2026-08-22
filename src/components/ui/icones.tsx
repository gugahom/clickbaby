/**
 * Três ícones inline em vez de uma dependência de biblioteca (a referência da
 * v0 trazia lucide-react para exatamente isto). Seção 12 do CLAUDE.md: não
 * instalar biblioteca sem justificar.
 *
 * `aria-hidden` em todos: quem dá o nome acessível é o botão que os contém.
 */

interface PropsIcone {
  className?: string
}

export function Chevron({ className }: PropsIcone) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

export function IconeLista({ className }: PropsIcone) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
    </svg>
  )
}

export function IconeKanban({ className }: PropsIcone) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="3" y="3" width="7" height="18" rx="1" />
      <rect x="14" y="3" width="7" height="11" rx="1" />
    </svg>
  )
}
