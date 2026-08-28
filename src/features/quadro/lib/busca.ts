import type { CasoQuadro } from '../types'

/**
 * A busca do Quadro.
 *
 * SEM ACENTO E SEM CAIXA. Os nomes vêm do Google Calendar em maiúsculas e com
 * acento ("JÉSSICA", "MAITÊ"), e quem procura digita com uma mão, de pé, num
 * teclado de celular. Exigir "jéssica" para achar "JÉSSICA" faria a busca
 * falhar exatamente para os nomes mais comuns da operação.
 *
 * A normalização é NFD + remoção dos diacríticos: decompõe "é" em "e" + acento
 * e joga o acento fora. Funciona para todo acento do português sem uma tabela
 * de substituição para alguém manter.
 */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

/**
 * Onde a busca olha.
 *
 * Mãe, bebê, pacote e maternidade — as quatro coisas que aparecem no cartão
 * fechado. Buscar em campo invisível devolveria resultado que a pessoa não
 * consegue explicar, e "por que este caso apareceu?" é a pior pergunta que uma
 * busca pode provocar.
 *
 * A sigla entra junto com o nome da maternidade porque a equipe fala por
 * sigla ("GNDI", "HSC") e ela é o que está impresso no cartão.
 */
function textoDoCaso(caso: CasoQuadro): string {
  return normalizar(
    [
      caso.maeNome,
      caso.bebeNome,
      caso.pacoteNome,
      caso.maternidadeNome,
      caso.maternidadeSigla,
    ]
      .filter(Boolean)
      .join(' '),
  )
}

/**
 * Filtra por termo. Termo vazio devolve a lista intacta — sem cópia, para não
 * inutilizar as memoizações de quem chama no caso comum, que é não haver busca.
 *
 * Cada palavra do termo precisa aparecer, em qualquer ordem e em qualquer
 * campo: "jessica basic" acha o caso da Jéssica no pacote BASIC. Casar a
 * frase inteira obrigaria a saber a ordem em que os campos foram concatenados,
 * que é detalhe de implementação e não algo que alguém deva adivinhar.
 */
export function filtrarCasos(casos: CasoQuadro[], termo: string): CasoQuadro[] {
  const alvo = normalizar(termo)
  if (alvo === '') return casos

  const palavras = alvo.split(/\s+/)
  return casos.filter((caso) => {
    const texto = textoDoCaso(caso)
    return palavras.every((p) => texto.includes(p))
  })
}
