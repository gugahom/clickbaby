import { useMemo } from 'react'
import { useRelogioDeMinuto } from '@/lib/useRelogio'
import { CalendarioPage } from '@/features/calendario/CalendarioPage'
import type { ItemDoCalendario } from '@/features/calendario/api/useCalendario'
import { emBrasilia } from '@/features/calendario/lib/datas'
import { COR_DO_RETORNO } from '@/features/calendario/lib/estilos'
import { useCrm } from '../crm/contexto'
import { estaAberto, nomeDoLead, type Lead } from '../lib/leads'

/**
 * A AGENDA DO CRM (24/11/2026, fase B3; decisão de 18/11: o Calendário "importa
 * apenas pra ele" e passa a morar dentro do Comercial — sem sair da barra
 * lateral, porque o ADM também o usa).
 *
 * É O CALENDÁRIO DE SEMPRE (`CalendarioPage`), com os partos, horas marcadas,
 * entregas e prazos, e mais os RETORNOS combinados com os leads abertos — o que
 * o vendedor prometeu fazer em cada dia, ao lado dos partos que vão acontecer. Os
 * retornos seguem a lente Meus · Equipe do cabeçalho, como o Início e os Leads;
 * os itens do calendário são da operação inteira, como em qualquer agenda.
 *
 * Tocar num retorno abre a FICHA do lead na gaveta, ali mesmo: o calendário não
 * tem o que mostrar de um lead que a ficha não mostre melhor.
 */
export function AgendaDoCrm() {
  const { visiveis, abrirLead } = useCrm()
  // O relógio de minuto do Quadro: um retorno que vence com a página aberta fica
  // vermelho sozinho, sem recarregar.
  const relogio = useRelogioDeMinuto()

  const retornos = useMemo(() => {
    const agora = relogio.getTime()
    return visiveis.filter(estaAberto).flatMap((lead): ItemDoCalendario[] => {
      if (!lead.proximoRetornoEm) return []
      return [itemDoRetorno(lead, lead.proximoRetornoEm, agora)]
    })
  }, [visiveis, relogio])

  return (
    <CalendarioPage
      extras={retornos}
      onAbrirExtra={(item) => {
        if (item.leadId) abrirLead(item.leadId)
      }}
      semQuadro
    />
  )
}

function itemDoRetorno(lead: Lead, quando: string, agora: number): ItemDoCalendario {
  const { dia, hora } = emBrasilia(quando)
  const passou = new Date(quando).getTime() < agora
  return {
    chave: `retorno-${lead.id}`,
    tipo: 'retorno',
    dia,
    hora,
    // O atraso não entra no título: o calendário já pinta de vermelho e escreve
    // "vencido" em todo item que passou (`vencido`, logo abaixo).
    titulo: 'Retorno combinado',
    nome: nomeDoLead(lead),
    detalhe: [lead.maternidadeSigla, lead.vendedorNome && `com ${lead.vendedorNome}`].filter(Boolean).join(' · '),
    casoId: '',
    leadId: lead.id,
    feito: false,
    passou,
    // O retorno que passou sem contato fica vermelho, como o prazo vencido.
    vencido: passou,
    rascunho: false,
    corDoGoogle: COR_DO_RETORNO,
    maternidade: lead.maternidadeSigla,
    pacote: null,
    responsavel: lead.vendedorNome,
    etapaId: null,
    encerrado: false,
    google: null,
  }
}
