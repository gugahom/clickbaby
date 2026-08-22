/**
 * Traduz o erro cru de uma RPC em mensagem para quem está no corredor da
 * maternidade às 3h.
 *
 * As RPCs levantam `raise exception` com texto já legível, mas escrito para
 * quem lê log: contém UUID, nome de coluna e o valor do enum
 * ("status 'em_andamento'"). Isso não é mensagem de tela.
 *
 * A tradução casa por TRECHO da mensagem, não por código: todas as exceções de
 * plpgsql chegam como P0001, então o código não distingue nada. É acoplamento
 * ao texto das migrations — por isso cada padrão aponta a RPC de origem, e o
 * fallback nunca mostra UUID cru.
 */

interface ErroPostgrest {
  message?: string
  code?: string
}

interface Traducao {
  padrao: RegExp
  mensagem: string
}

const TRADUCOES: Traducao[] = [
  // Comum a todas as RPCs.
  {
    padrao: /não corresponde a nenhuma pessoa ativa/i,
    mensagem:
      'Sua sessão não está vinculada a uma pessoa ativa. Saia e entre de novo.',
  },

  // iniciar_etapa
  {
    padrao: /só pode ser iniciada a partir de/i,
    mensagem: 'Esta etapa já foi iniciada ou já está concluída.',
  },

  // concluir_etapa
  {
    padrao: /só pode ser concluída a partir de/i,
    mensagem: 'Esta etapa já está concluída.',
  },

  // transferir_etapa
  {
    padrao: /não tem responsável atual/i,
    mensagem:
      'Esta etapa ainda não tem responsável. Inicie a etapa antes de transferir.',
  },
  {
    padrao: /já é o responsável atual/i,
    mensagem: 'Essa pessoa já é a responsável pela etapa.',
  },
  {
    padrao: /trabalho terminado não pode ser transferido/i,
    mensagem: 'Etapa concluída não pode ser transferida.',
  },
  {
    padrao: /não existe ou está inativa/i,
    mensagem: 'Essa pessoa não está mais ativa no cadastro.',
  },

  // confirmar_entrega
  {
    padrao: /não tem nenhum entregável registrado/i,
    mensagem:
      'Este caso ainda não tem link de entrega registrado. É preciso registrar ao menos um antes de confirmar.',
  },
  {
    padrao: /já tem entrega confirmada/i,
    mensagem: 'A entrega deste caso já foi confirmada.',
  },

  // confirmar_entrega e cancelar_caso
  {
    padrao: /só atendimento ou adm/i,
    mensagem: 'Só atendimento ou gestão pode fazer isso.',
  },
  {
    padrao: /já está em status terminal/i,
    mensagem: 'Este caso já foi encerrado ou cancelado.',
  },

  // cancelar_caso
  {
    padrao: /motivo de cancelamento não pode ser vazio/i,
    mensagem: 'Escreva o motivo do cancelamento.',
  },

  // Não encontrado — some quando a tela está velha e outra pessoa mexeu.
  {
    padrao: /não encontrad[ao]/i,
    mensagem: 'Este registro não existe mais. Atualize a tela.',
  },

  // GRANT/RLS barrando. Não deveria acontecer: a tela não oferece o que o
  // papel não pode. Se aparecer, é bug de gating, e a mensagem precisa dizer
  // isso sem expor nome de tabela.
  {
    padrao: /permission denied|42501/i,
    mensagem: 'Você não tem permissão para esta ação.',
  },
]

/** Rede: mensagem some, ação some. Vale distinguir de erro de regra. */
const PADRAO_REDE = /failed to fetch|networkerror|load failed/i

export function mensagemDeErro(erro: unknown): string {
  const bruto =
    typeof erro === 'object' && erro !== null && 'message' in erro
      ? String((erro as ErroPostgrest).message ?? '')
      : String(erro ?? '')

  if (PADRAO_REDE.test(bruto)) {
    return 'Sem conexão com o servidor. A ação não foi registrada — tente de novo.'
  }

  for (const { padrao, mensagem } of TRADUCOES) {
    if (padrao.test(bruto)) return mensagem
  }

  // Fallback: nunca devolver UUID para a tela. Se um caso novo aparecer aqui,
  // ele deve virar uma linha em TRADUCOES.
  const semUuid = bruto.replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    'este registro',
  )
  return semUuid.trim() || 'Não foi possível concluir a ação.'
}
