import type { ReactNode } from 'react'
import {
  IconeAjustes,
  IconeCalendario,
  IconeCasa,
  IconeCifrao,
  IconeConversa,
  IconeFunil,
  IconeLeads,
  IconePresente,
  IconeRaio,
  IconeSacola,
  IconeTendencia,
} from '@/components/ui/icones'
import type { Tela } from '@/features/auth/telas'

/**
 * AS PÁGINAS DO CRM, numa tabela só (18/11/2026, pedido do gestor: "um CRM
 * premium (…) mesmo que sejam páginas vazias, uma sidebar com páginas em
 * breve"). A barra lateral, a busca rápida e o título do cabeçalho leem daqui.
 *
 * AS QUE JÁ EXISTEM são as que a fase A sustenta com dado de verdade — Início,
 * Leads, Funil e a distribuição. As "em breve" dizem o que vão ser e em que
 * fase do docs/painel-comercial.md entram; quando o trabalho de hoje já tem
 * outro lugar no sistema (o Calendário, o pós-venda no relatório externo), a
 * página aponta para ele, para ninguém perder o caminho no meio da mudança.
 */
export interface EmBreve {
  fase: string
  resumo: string
  itens: string[]
  /** Onde esse trabalho mora HOJE, enquanto a página não chega. */
  hoje?: { rotulo: string; para: string; tela: Tela }
}

export interface PaginaDoCrm {
  /** O pedaço do endereço depois de /comercial; vazio é o Início. */
  id: string
  rotulo: string
  Icone: (props: { className?: string }) => ReactNode
  emBreve?: EmBreve
}

export interface GrupoDoCrm {
  rotulo?: string
  paginas: PaginaDoCrm[]
}

export const GRUPOS_DO_CRM: GrupoDoCrm[] = [
  {
    paginas: [
      { id: '', rotulo: 'Início', Icone: IconeCasa },
      { id: 'leads', rotulo: 'Leads', Icone: IconeLeads },
      { id: 'funil', rotulo: 'Funil', Icone: IconeFunil },
      {
        id: 'conversas',
        rotulo: 'Conversas',
        Icone: IconeConversa,
        emBreve: {
          fase: 'Fase D',
          resumo: 'As conversas do WhatsApp da empresa dentro do CRM, cada uma ligada ao lead dela.',
          itens: [
            'Uma caixa de entrada com todas as conversas do número da empresa',
            'Cada conversa presa à ficha do lead, com o histórico junto',
            'Responder daqui, sem depender do celular da empresa',
          ],
        },
      },
      {
        id: 'agenda',
        rotulo: 'Agenda',
        Icone: IconeCalendario,
        emBreve: {
          fase: 'Fase B',
          resumo: 'Os partos marcados e os retornos combinados num calendário só, dentro do CRM.',
          itens: [
            'Partos e retornos lado a lado, por dia e por semana',
            'Fechar a venda já cria o caso, sem passar pelo Google',
            'Criar caso passa a ser do comercial',
          ],
          hoje: { rotulo: 'Abrir o Calendário', para: '/calendario', tela: 'calendario' },
        },
      },
    ],
  },
  {
    rotulo: 'Vendas',
    paginas: [
      {
        id: 'pos-venda',
        rotulo: 'Pós-venda',
        Icone: IconePresente,
        emBreve: {
          fase: 'Fase B',
          resumo: 'As ofertas depois do parto — BIRTH, Reels, New Born e Foto/Livro — com o retorno de cada família.',
          itens: [
            'A fila do que falta oferecer, por família',
            'Apresentar, enviado, recusou, vendido — num toque',
            'O retorno agendado de quem disse "agora não"',
          ],
          hoje: { rotulo: 'Abrir o pós-venda', para: '/relatorios/externo?comercial=1', tela: 'comercial' },
        },
      },
      {
        id: 'vendas',
        rotulo: 'Vendas',
        Icone: IconeCifrao,
        emBreve: {
          fase: 'Fase F',
          resumo: 'O que foi vendido, por mês, por pacote e por vendedor.',
          itens: [
            'O valor vendido de cada caso, do pacote aos adicionais',
            'Pix e cartão, com a tabela de preços por maternidade',
            'A planilha do mês pronta para o financeiro',
          ],
        },
      },
      {
        id: 'desempenho',
        rotulo: 'Desempenho',
        Icone: IconeTendencia,
        emBreve: {
          fase: 'Fase C',
          resumo: 'Os números do comercial, depois de um mês de leads registrados aqui.',
          itens: [
            'Conversão por origem, por maternidade e por vendedor',
            'Quanto a repescagem recupera do que tinha passado do prazo',
            'O tempo até o primeiro contato com cada família',
          ],
        },
      },
    ],
  },
  {
    rotulo: 'Crescimento',
    paginas: [
      {
        id: 'automacoes',
        rotulo: 'Automações',
        Icone: IconeRaio,
        emBreve: {
          fase: 'Fase E',
          resumo: 'Um robô de IA no primeiro atendimento do WhatsApp.',
          itens: [
            'Responde a família na hora, inclusive por áudio',
            'Pergunta DPP e maternidade e já cria o lead',
            'Entrega o lead para quem atende aquela maternidade',
          ],
        },
      },
      {
        id: 'monte-seu-pacote',
        rotulo: 'Monte seu pacote',
        Icone: IconeSacola,
        emBreve: {
          fase: 'Fase G',
          resumo: 'A página em que a própria família monta o pacote, como num totem.',
          itens: [
            'Maternidade, pacote e adicionais, com o preço na hora',
            'O pedido chega como lead na fila do vendedor',
            'No endereço principal do site, aberta para qualquer família',
          ],
        },
      },
    ],
  },
  {
    rotulo: 'Ajustes',
    paginas: [{ id: 'configuracoes', rotulo: 'Distribuição', Icone: IconeAjustes }],
  },
]

export const PAGINAS_DO_CRM: PaginaDoCrm[] = GRUPOS_DO_CRM.flatMap((g) => g.paginas)

export function caminhoDaPagina(p: Pick<PaginaDoCrm, 'id'>): string {
  return p.id ? `/comercial/${p.id}` : '/comercial'
}

/** A página do endereço atual ('/comercial/leads' → Leads). */
export function paginaDoCaminho(caminho: string): PaginaDoCrm | undefined {
  const id = caminho.replace(/^\/comercial\/?/, '').split('/')[0] ?? ''
  return PAGINAS_DO_CRM.find((p) => p.id === id)
}
