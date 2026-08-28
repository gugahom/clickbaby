/**
 * Ícones inline em vez de uma dependência de biblioteca (a referência da v0
 * trazia lucide-react para isto). Seção 12 do CLAUDE.md: não instalar
 * biblioteca sem justificar.
 *
 * `aria-hidden` em todos: quem dá o nome acessível é o botão que os contém.
 * Traço de 2px e viewBox de 24 em todos, para o grupo de ações da etapa ficar
 * óptico-consistente quando os cinco aparecem lado a lado.
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

export function IconePlay({ className }: PropsIcone) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      {/* Preenchido, não contornado: é a ação de partida e precisa de peso
          óptico maior que as vizinhas. */}
      <path d="M8 5.5v13a1 1 0 0 0 1.54.84l10-6.5a1 1 0 0 0 0-1.68l-10-6.5A1 1 0 0 0 8 5.5Z" />
    </svg>
  )
}

export function IconeCheck({ className }: PropsIcone) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="m5 13 4.5 4.5L19 7" />
    </svg>
  )
}

export function IconeCaneta({ className }: PropsIcone) {
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
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}

export function IconeHandoff({ className }: PropsIcone) {
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
      {/* Duas setas trocando de sentido: passagem entre duas pessoas, não
          "avançar". */}
      <path d="M3 8h14l-3.5-3.5" />
      <path d="M21 16H7l3.5 3.5" />
    </svg>
  )
}

export function IconePause({ className }: PropsIcone) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      {/* Preenchido como o play, e no mesmo lugar do grupo: os dois são a mesma
          alavanca em estados opostos, não duas ações diferentes. */}
      <rect x="7" y="5" width="3.5" height="14" rx="1" />
      <rect x="13.5" y="5" width="3.5" height="14" rx="1" />
    </svg>
  )
}

export function IconeAtribuir({ className }: PropsIcone) {
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
      {/* Pessoa + sinal de mais: designar alguém. Ocupa o mesmo lugar do
          handoff no grupo, porque as duas respondem "quem é o responsável" —
          mudam só o momento e o que aconteceu de fato. */}
      <path d="M15 20v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V20" />
      <circle cx="8.5" cy="7" r="3.5" />
      <path d="M19 8v6M22 11h-6" />
    </svg>
  )
}

export function IconeRendicao({ className }: PropsIcone) {
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
      {/* Duas pessoas com uma seta entre elas: quem está e quem assume. NÃO é
          o handoff (que é uma pessoa e uma seta de saída) — aqui as duas
          coexistem na tela, porque a troca ainda não aconteceu. */}
      <circle cx="6" cy="7" r="3" />
      <path d="M1.5 20v-1a4 4 0 0 1 4-4h1" />
      <circle cx="18" cy="7" r="3" />
      <path d="M22.5 20v-1a4 4 0 0 0-4-4h-1" />
      <path d="M10 11.5h4M12.5 10l1.5 1.5-1.5 1.5" />
    </svg>
  )
}

export function IconeNota({ className }: PropsIcone) {
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
      {/* Balão com linhas: um recado sobre a etapa. Distinto da caneta, que
          edita o CADASTRO do caso — são coisas diferentes e ficam perto uma da
          outra na tela. */}
      <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.2a8.4 8.4 0 0 1-.9-3.8 8.4 8.4 0 0 1 8.4-9 8.4 8.4 0 0 1 8.6 8.5z" />
      <path d="M8.5 10.5h7M8.5 14h4.5" />
    </svg>
  )
}

export function IconeDesfazer({ className }: PropsIcone) {
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
      {/* Seta girando para trás: desfazer. Deliberadamente NÃO é uma lixeira —
          reabrir não apaga nada, devolve a etapa ao trabalho. */}
      <path d="M3 8v5h5" />
      <path d="M3.5 12.5a8.5 8.5 0 1 0 2.4-5.4L3 10" />
    </svg>
  )
}

export function IconeLupa({ className }: PropsIcone) {
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
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  )
}

export function IconeX({ className }: PropsIcone) {
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
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}

/** Seta em círculo: trazer de volta o que já tinha saído. */
export function IconeReabrir({ className }: PropsIcone) {
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
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  )
}

/** Círculo com barra: "isto não vai acontecer". */
export function IconeDispensar({ className }: PropsIcone) {
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
      <circle cx="12" cy="12" r="9" />
      <path d="M5.6 5.6l12.8 12.8" />
    </svg>
  )
}
