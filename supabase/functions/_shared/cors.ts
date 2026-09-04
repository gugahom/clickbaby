// CORS das Edge Functions chamadas PELO NAVEGADOR.
//
// O QUE QUEBROU SEM ISTO
// A tela de Equipe cadastrava pessoa e recebia "Failed to send a request to the
// Edge Function" — a mensagem que o supabase-js dá quando o pedido nem sai. Não
// saía mesmo: `functions.invoke` manda `Authorization` e `Content-Type`, o que
// obriga o navegador a fazer um preflight `OPTIONS` antes do POST. A função
// respondia 405 e sem cabeçalho de CORS nenhum, então o navegador barrava o
// POST antes de ele existir.
//
// O local não acusou. O `supabase functions serve` responde ao preflight por
// conta própria, então o mesmo botão funcionava aqui e falhava em produção —
// e o erro do supabase-js não distingue "preflight barrado" de "sem rede".
//
// CORS NÃO É A AUTORIZAÇÃO DESTA FUNÇÃO, e é importante não confundir as duas.
// Quem autoriza é o JWT do chamador, conferido lá dentro contra
// `papel_sistema = 'gestao'`. Um site hostil não consegue forjar essa chamada:
// o token vive no localStorage, que é isolado por origem, então o navegador
// não o anexa a pedido de terceiro. A lista abaixo não é a tranca — é a porta
// dizendo de onde ela aceita ser aberta.
//
// POR QUE UMA LISTA E NÃO `*`
// `*` funcionaria e seria seguro pelo parágrafo acima. A lista existe porque é
// barata e porque documenta, num lugar só, de quais endereços este app é
// servido. O preço é conhecido: origem fora da lista falha exatamente como
// falhava hoje, sem mensagem útil. Se um endereço novo aparecer (outro domínio,
// outro host), ACRESCENTE AQUI — não troque por `*` para destravar.

const ORIGENS_FIXAS = new Set([
  "https://clickbaby.com.br",
  "https://www.clickbaby.com.br",
]);

/** Dev na máquina de quem programa — qualquer porta do Vite. */
const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/;

/** Preview do Cloudflare Pages: subdomínio aleatório a cada deploy. */
const PREVIEW = /^https:\/\/[a-z0-9-]+\.clickbaby\.pages\.dev$/;

function origemPermitida(origem: string): boolean {
  return ORIGENS_FIXAS.has(origem) || LOCAL.test(origem) || PREVIEW.test(origem);
}

/**
 * Os cabeçalhos que TODA resposta desta função precisa levar — inclusive as de
 * erro. Uma resposta 409 sem eles chega ao front como falha de rede, e a
 * mensagem em português que a função escreveu se perde no caminho.
 *
 * `Vary: Origin` não é enfeite: a resposta muda conforme a origem, e sem ele um
 * cache intermediário serve a resposta de uma origem para outra.
 */
export function cabecalhosCors(origem: string | null): Record<string, string> {
  const base: Record<string, string> = {
    "Content-Type": "application/json",
    "Vary": "Origin",
  };

  if (origem && origemPermitida(origem)) {
    base["Access-Control-Allow-Origin"] = origem;
  }

  return base;
}

/** O piso: o que o supabase-js sempre manda. */
const CABECALHOS_BASE = "authorization, apikey, content-type, x-client-info";

/**
 * Responde ao preflight, se for um. Devolve `null` quando o pedido é de
 * verdade e deve seguir para a função.
 *
 * ELE DEVOLVE O QUE FOI PEDIDO, e não uma lista fixa. A lista fixa foi a
 * primeira versão disto e é uma armadilha da mesma família do bug que este
 * arquivo conserta: o supabase-js manda cabeçalhos que MUDAM com a versão e com
 * a configuração (`x-supabase-api-version`, `traceparent` quando o tracing
 * está ligado), e basta um deles ficar de fora para o navegador reprovar o
 * preflight que a função acabou de aprovar — de novo com a mesma mensagem
 * inútil, "Failed to send a request to the Edge Function".
 *
 * Devolver o pedido não afrouxa nada que importe: quem decide se a chamada vale
 * é a ORIGEM (acima) e o JWT (dentro da função). O navegador só pergunta "posso
 * mandar estes cabeçalhos?"; a resposta não dá acesso a nada por si só.
 */
export function responderPreflight(req: Request): Response | null {
  if (req.method !== "OPTIONS") return null;

  const pedidos = req.headers.get("Access-Control-Request-Headers");

  return new Response(null, {
    status: 204,
    headers: {
      ...cabecalhosCors(req.headers.get("Origin")),
      "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": pedidos && pedidos.trim() !== ""
        ? pedidos
        : CABECALHOS_BASE,
      "Access-Control-Max-Age": "86400",
    },
  });
}
