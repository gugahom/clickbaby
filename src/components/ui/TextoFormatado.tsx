import { useMemo } from 'react'
import clsx from 'clsx'
import { CLASSES_DO_TEXTO_FORMATADO, paraHtml } from '@/lib/textoFormatado'

/**
 * Mostra um texto do `EditorDeTexto` (06/10/2026). O `dangerouslySetInnerHTML`
 * recebe só o que `paraHtml` devolve — refeito pela `sanitizarHtml`, sem
 * atributo nenhum —, nunca o valor como veio do banco.
 */
export function TextoFormatado({ valor, className }: { valor: string; className?: string }) {
  const html = useMemo(() => paraHtml(valor), [valor])
  return <div className={clsx(CLASSES_DO_TEXTO_FORMATADO, className)} dangerouslySetInnerHTML={{ __html: html }} />
}
