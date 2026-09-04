/**
 * Traduz a falha de uma chamada a Edge Function para algo que o gestor leia.
 *
 * DOIS ERROS DIFERENTES CHEGAM AQUI, e confundi-los custou um dia de trabalho:
 *
 *   1. A função RESPONDEU e recusou (409 "Já existe uma conta com…", 403, 400).
 *      A mensagem em português está no corpo. Sem lê-la, o usuário vê "Edge
 *      Function returned a non-2xx status code", que não diz nada.
 *
 *   2. O pedido NEM SAIU. O supabase-js chama isso de `FunctionsFetchError` e
 *      escreve "Failed to send a request to the Edge Function" — a mesma frase
 *      para sinal caído, para CORS barrado e para função fora do ar. Foi essa
 *      frase que apareceu na tela de Equipe em 04/09/2026, e ela não dizia o
 *      que estava acontecendo (era o preflight de CORS voltando 405; ver
 *      supabase/functions/_shared/cors.ts).
 *
 * A tradução do caso 2 não tenta adivinhar a causa — nenhuma das três é
 * distinguível do navegador. Ela diz o que se sabe: o pedido não chegou.
 */
export async function mensagemDaFuncao(error: unknown): Promise<string | null> {
  const contexto = (error as { context?: unknown }).context

  if (contexto instanceof Response) {
    try {
      const corpo = (await contexto.json()) as { erro?: unknown }
      if (typeof corpo.erro === 'string') return corpo.erro
    } catch {
      // Resposta sem JSON — cai no genérico abaixo.
    }
  }

  if ((error as { name?: unknown }).name === 'FunctionsFetchError') {
    return 'O pedido não chegou ao servidor de cadastro. Confira a conexão e tente de novo — se continuar, avise quem cuida do sistema.'
  }

  return null
}
