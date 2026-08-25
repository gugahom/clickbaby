import clsx from 'clsx'

interface PropsAvatar {
  nome: string
  /**
   * Terreno preparado para a foto de perfil. Ainda não existe fonte: `pessoas`
   * não tem coluna de avatar e o Storage do projeto é privado (seção 10 do
   * CLAUDE.md), então a foto vai precisar de bucket próprio e signed URL de
   * curta duração — não é só acrescentar um `<img src>`.
   *
   * Enquanto isso, as iniciais. Elas não são placeholder de rascunho: num
   * aparelho compartilhado que troca de mão a cada turno, o que importa é
   * responder "quem está logado aqui" num relance, e duas letras fazem isso.
   */
  fotoUrl?: string | null
  className?: string
}

/** "Maria Eduarda Santos" -> "MS". Primeira e última palavra, no máximo duas letras. */
function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '?'
  const primeira = partes[0]?.[0] ?? ''
  const ultima = partes.length > 1 ? (partes[partes.length - 1]?.[0] ?? '') : ''
  return (primeira + ultima).toUpperCase()
}

export function Avatar({ nome, fotoUrl, className }: PropsAvatar) {
  const base = clsx(
    'inline-flex size-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-full',
    className,
  )

  if (fotoUrl) {
    return (
      <img
        src={fotoUrl}
        alt={nome}
        className={clsx(base, 'object-cover ring-2 ring-white/25')}
      />
    )
  }

  return (
    <span
      className={clsx(
        base,
        'bg-white/15 text-xs font-semibold tracking-wide text-white ring-2 ring-white/25',
      )}
      // O nome completo já está escrito ao lado no desktop; no mobile some, e
      // aí o title é a única forma de descobrir quem está logado.
      title={nome}
      aria-hidden="true"
    >
      {iniciais(nome)}
    </span>
  )
}
