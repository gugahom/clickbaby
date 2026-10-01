import {
  IconeCalendario,
  IconeDespesa,
  IconeEquipe,
  IconeKanban,
  IconeRelatorio,
} from '@/components/ui/icones'
import type { Tela } from '@/features/auth/telas'

/**
 * PARA ONDE SE PODE IR, numa tabela só.
 *
 * Antes esta lista era três `{condição && <Item/>}` dentro da faixa do
 * cabeçalho. Com uma segunda forma de navegação — a barra lateral no
 * computador, a faixa no celular —, as condições teriam que ser escritas duas
 * vezes, e a primeira tela nova entraria numa delas e não na outra.
 *
 * QUEM VÊ O QUÊ é a LISTA DE TELAS da pessoa (30/09/2026 — até ali era o
 * papel), a mesma que `RotaDaTela` confere na rota: um destino que a guarda
 * devolveria é porta pintada na parede. Ao criar rota nova, a tela entra no
 * enum `tela`, em `TELAS` e aqui.
 */
export type GrupoDeDestino = 'operacao' | 'gestao'

/**
 * Um destino DENTRO de outro (29/09/2026, pedido do gestor: "essa parte de
 * relatórios pode ser um dropdown que vem com essas duas opções, de interno e
 * externo"). Na barra lateral eles abrem embaixo do pai; na faixa do celular,
 * que não tem onde abrir nada, viram pílulas próprias com o nome completo.
 */
export interface SubDestino {
  para: string
  /** O nome dentro do grupo aberto: "Interno". */
  rotulo: string
  /** O nome sozinho, na faixa do celular: "Relatório interno". */
  rotuloCompleto: string
  fim?: boolean
  descricao: string
}

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
  /** Com filhos, o destino vira um grupo que abre — ver `SubDestino`. */
  filhos?: SubDestino[]
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
 * O padrão de cada papel (quando a gestão não escolheu) está em
 * `telasPadraoDoPapel`: o Quadro para todos, o Calendário para quem não é
 * fotógrafa, Despesas do financeiro e da gestão, Equipe e Relatórios da gestão.
 */
export function destinosDe(telas: Set<Tela>): Destino[] {
  const destinos: Destino[] = []

  if (telas.has('quadro')) {
    destinos.push({
      para: '/',
      rotulo: 'Quadro',
      grupo: 'operacao',
      fim: true,
      descricao: 'Os casos do dia',
      Icone: IconeKanban,
    })
  }

  // O Calendário fica na Operação: é a agenda do trabalho, não um número
  // sobre ele.
  if (telas.has('calendario')) {
    destinos.push({
      para: '/calendario',
      rotulo: 'Calendário',
      grupo: 'operacao',
      descricao: 'Partos, horas marcadas, prazos e feriados',
      Icone: IconeCalendario,
    })
  }

  // Despesas é de quem RECOLHE o gasto. Quem lança lança no card, e não
  // precisa desta porta.
  if (telas.has('equipe')) {
    destinos.push({
      para: '/equipe',
      rotulo: 'Equipe',
      grupo: 'gestao',
      descricao: 'Cadastro, acesso e papéis',
      Icone: IconeEquipe,
    })
  }

  if (telas.has('despesas')) {
    destinos.push({
      para: '/despesas',
      rotulo: 'Despesas',
      grupo: 'gestao',
      descricao: 'Recolhimento do mês',
      Icone: IconeDespesa,
    })
  }

  // Relatórios nasceu VAZIA (28/09/2026, pedido do gestor), ganhou o relatório
  // interno (das pessoas) e, em 29/09, o externo (da operação inteira) — e
  // virou um grupo que abre nos dois. O interno continua em /relatorios, para
  // nenhum link antigo quebrar.
  if (telas.has('relatorios')) {
    destinos.push({
      para: '/relatorios',
      rotulo: 'Relatórios',
      grupo: 'gestao',
      descricao: 'Os números da equipe e da operação',
      Icone: IconeRelatorio,
      filhos: [
        {
          para: '/relatorios',
          rotulo: 'Interno',
          rotuloCompleto: 'Relatório interno',
          fim: true,
          descricao: 'A equipe: produção, prazo, pontos',
        },
        {
          para: '/relatorios/externo',
          rotulo: 'Externo',
          rotuloCompleto: 'Relatório externo',
          descricao: 'A operação inteira, com filtros',
        },
      ],
    })
  }

  // O COMERCIAL (01/10/2026): quem tem a tela Comercial e NÃO tem Relatórios
  // entra no relatório externo já no modo comercial — é a porta dele até a
  // página comercial existir. Quem tem as duas liga o modo pelo próprio
  // relatório externo, e não ganha um destino repetido.
  if (telas.has('comercial') && !telas.has('relatorios')) {
    destinos.push({
      para: '/relatorios/externo?comercial=1',
      rotulo: 'Comercial',
      grupo: 'gestao',
      descricao: 'Ofertas pós-parto: reels, New Born e Foto/Livro',
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
