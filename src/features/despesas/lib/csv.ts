/**
 * CSV PARA A PLANILHA DO FINANCEIRO.
 *
 * O arquivo vai ser aberto no Excel em português, e três detalhes decidem se ele
 * abre legível ou vira uma coluna só com tudo grudado:
 *
 *   - SEPARADOR `;`, não vírgula. No Excel pt-BR a vírgula é o separador
 *     DECIMAL; um CSV separado por vírgula abre com "24" numa coluna e "90"
 *     na outra.
 *   - DECIMAL COM VÍRGULA ("24,90"), pelo mesmo motivo: é o que o Excel pt-BR
 *     reconhece como número e deixa somar.
 *   - BOM UTF-8 no início. Sem ele o Excel lê em Windows-1252 e "Substituição"
 *     vira "SubstituiÃ§Ã£o".
 */

/** Escapa um campo: aspas duplas em volta quando há separador, aspas ou quebra de linha. */
function campo(valor: string): string {
  return /[;"\n\r]/.test(valor) ? `"${valor.replace(/"/g, '""')}"` : valor
}

/** 24.9 -> '24,90' — número que o Excel pt-BR soma, sem "R$" que o faria virar texto. */
export function numeroParaCsv(valor: number): string {
  return valor.toFixed(2).replace('.', ',')
}

export function montarCsv(cabecalho: string[], linhas: string[][]): string {
  const corpo = [cabecalho, ...linhas].map((l) => l.map(campo).join(';')).join('\r\n')
  return '﻿' + corpo
}

/**
 * Baixa o texto como arquivo.
 *
 * Blob + link temporário, sem biblioteca: é o caminho que funciona em todo
 * navegador que a operação usa, e não traz dependência nova (seção 12).
 */
export function baixarCsv(nomeArquivo: string, conteudo: string): void {
  const blob = new Blob([conteudo], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = nomeArquivo
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
