import {
  IconeDespesa,
  IconeEquipe,
  IconeKanban,
  IconeRelatorio,
} from '@/components/ui/icones'

/**
 * PARA ONDE SE PODE IR, numa tabela só.
 *
 * Antes esta lista era três `{condição && <Item/>}` dentro da faixa do
 * cabeçalho. Com uma segunda forma de navegação — a barra lateral no
 * computador, a faixa no celular —, as condições teriam que ser escritas duas
 * vezes, e a primeira tela nova entraria numa delas e não na outra.
 *
 * QUEM VÊ O QUÊ é o mesmo recorte das guardas de rota (`RotaDeGestao`,
 * `RotaDoFinanceiro`): um destino que a guarda devolveria é porta pintada na
 * parede. Ao criar rota nova, a entrada aqui e a guarda mudam juntas.
 */
export type GrupoDeDestino = 'operacao' | 'gestao'

export interface Destino {
  /** O caminho, relativo ao basename `/quadro`. */
  para: string
  rotulo: string
  grupo: GrupoDeDestino
  /** O componente do ícone — quem desenha escolhe o tamanho. */
  Icone: (props: { className?: string }) => React.ReactNode
  /**
   * `end` do NavLink. Só o Quadro precisa: sem isso o "/" casa com toda rota
   * filha e dois itens acendem juntos em /equipe.
   */
  fim?: boolean
  /** O que a tela faz. É o título do link quando o ícone está sozinho. */
  descricao: string
}

/**
 * OPERAÇÃO é onde o trabalho acontece; GESTÃO é o que se olha SOBRE ele.
 *
 * A divisão só aparece na tela quando existem os dois grupos: para quem tem só
 * o Quadro, um título "Operação" sozinho em cima de um item é decoração que
 * diz menos que o próprio item.
 */
export const ROTULO_DO_GRUPO: Record<GrupoDeDestino, string> = {
  operacao: 'Operação',
  gestao: 'Gestão',
}

/**
 * O NOME É "QUADRO" (28/09/2026); até aqui a barra dizia "Painel" apontando
 * para esta mesma tela. O vocabulário da operação (seção 2 do CLAUDE.md) chama
 * aquilo de Quadro — é o quadro branco que o sistema substituiu —, e com o
 * ícone ao lado a discordância ficaria pior: nenhum desenho representa
 * "Painel".
 *
 * O papel é `string` e não `PapelSistema`: ele chega do contexto de auth como
 * veio do banco, e o recorte aqui é por comparação de igualdade — apertar o
 * tipo pediria uma conversão no chamador que não afirma nada de novo.
 */
export function destinosDe(papel: string | undefined): Destino[] {
  const destinos: Destino[] = [
    {
      para: '/',
      rotulo: 'Quadro',
      grupo: 'operacao',
      fim: true,
      descricao: 'Os casos do dia',
      Icone: IconeKanban,
    },
  ]

  // Equipe e Relatórios são da gestão; Despesas, do financeiro e da gestão —
  // quem RECOLHE o gasto. Quem lança lança no card, e não precisa desta porta.
  if (papel === 'gestao') {
    destinos.push({
      para: '/equipe',
      rotulo: 'Equipe',
      grupo: 'gestao',
      descricao: 'Cadastro, acesso e papéis',
      Icone: IconeEquipe,
    })
  }

  if (papel === 'gestao' || papel === 'financeiro') {
    destinos.push({
      para: '/despesas',
      rotulo: 'Despesas',
      grupo: 'gestao',
      descricao: 'Recolhimento do mês',
      Icone: IconeDespesa,
    })
  }

  // Relatórios nasceu VAZIA (28/09/2026, pedido do gestor). Ela aparece na
  // barra mesmo assim: a aba é o lugar onde as telas novas vão chegar, e é
  // dele o pedido de criá-la antes do conteúdo.
  if (papel === 'gestao') {
    destinos.push({
      para: '/relatorios',
      rotulo: 'Relatórios',
      grupo: 'gestao',
      descricao: 'Os números da operação',
      Icone: IconeRelatorio,
    })
  }

  return destinos
}

/**
 * Os destinos já separados por grupo, na ordem em que aparecem. Grupo vazio
 * não entra: o financeiro tem Despesas e mais nada da gestão, e uma seção com
 * título e nada dentro é promessa que a tela não cumpre.
 */
export function agruparDestinos(destinos: Destino[]): {
  grupo: GrupoDeDestino
  destinos: Destino[]
}[] {
  const grupos: GrupoDeDestino[] = ['operacao', 'gestao']

  return grupos
    .map((grupo) => ({ grupo, destinos: destinos.filter((d) => d.grupo === grupo) }))
    .filter((g) => g.destinos.length > 0)
}
