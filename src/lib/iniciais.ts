/**
 * "Maria Eduarda Santos" -> "MS". Primeira e última palavra, no máximo duas letras.
 *
 * Mora em `lib/` e não dentro do `Avatar` porque o círculo do responsável na
 * trilha do card (15/09/2026) usa a mesma regra — duas cópias da mesma conta
 * dariam iniciais diferentes para a mesma pessoa no primeiro ajuste feito numa
 * só. E exportá-la do arquivo do componente quebraria o fast refresh do Vite.
 */
export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '?'
  const primeira = partes[0]?.[0] ?? ''
  const ultima = partes.length > 1 ? (partes[partes.length - 1]?.[0] ?? '') : ''
  return (primeira + ultima).toUpperCase()
}
