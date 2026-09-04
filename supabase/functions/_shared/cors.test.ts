// Testes do CORS das Edge Functions.
//
// POR QUE ESTE ARQUIVO EXISTE
// O bug que ele tranca não aparecia em lugar nenhum: o `supabase functions
// serve` responde ao preflight por conta própria, então o cadastro de pessoa
// funcionava no local e falhava em produção com "Failed to send a request to
// the Edge Function" — a mensagem que o supabase-js dá quando o pedido nem sai.
// Não havia teste, não havia log, e o erro não distingue preflight barrado de
// falta de rede. Estas asserções são a única coisa que roda no local e enxerga
// a diferença.
//
// Sem imports externos, mesma escolha do parse-evento.test.ts: são funções
// puras e o teste fica offline.
import { cabecalhosCors, responderPreflight } from "./cors.ts";

function assertEqual(recebido: unknown, esperado: unknown, msg: string) {
  if (recebido !== esperado) {
    throw new Error(
      `${msg}\n  esperado: ${JSON.stringify(esperado)}\n  recebido: ${JSON.stringify(recebido)}`,
    );
  }
}

function pedido(
  metodo: string,
  origem: string | null,
  pedeCabecalhos?: string,
): Request {
  const headers = new Headers();
  if (origem !== null) headers.set("Origin", origem);
  if (pedeCabecalhos) {
    headers.set("Access-Control-Request-Headers", pedeCabecalhos);
  }
  return new Request("https://exemplo.test/functions/v1/admin-pessoas", {
    method: metodo,
    headers,
  });
}

const PROD = "https://clickbaby.com.br";

// ---------------------------------------------------------------------------
// O preflight
// ---------------------------------------------------------------------------

Deno.test("OPTIONS de produção volta 204 liberando a origem — era o 405 que barrava tudo", () => {
  const r = responderPreflight(pedido("OPTIONS", PROD));
  if (r === null) throw new Error("preflight não foi reconhecido");

  assertEqual(r.status, 204, "preflight tem que ser 2xx");
  assertEqual(r.headers.get("Access-Control-Allow-Origin"), PROD, "origem liberada");
});

Deno.test("o preflight devolve os cabeçalhos PEDIDOS — a lista fixa era armadilha", () => {
  // O supabase-js manda cabeçalhos que mudam com a versão e com a configuração.
  // Com lista fixa, um deles de fora derruba o preflight e o erro volta a ser o
  // mesmo "Failed to send a request", que não diz o que aconteceu.
  const pedidos = "authorization, apikey, content-type, x-supabase-api-version, traceparent";
  const r = responderPreflight(pedido("OPTIONS", PROD, pedidos));

  assertEqual(
    r?.headers.get("Access-Control-Allow-Headers"),
    pedidos,
    "o preflight tem que devolver o que foi pedido",
  );
});

Deno.test("sem lista pedida, cai no piso do que o supabase-js sempre manda", () => {
  const r = responderPreflight(pedido("OPTIONS", PROD));
  const permitidos = (r?.headers.get("Access-Control-Allow-Headers") ?? "")
    .toLowerCase();

  // Omitir QUALQUER um destes faz o navegador reprovar o preflight que a
  // função acabou de aprovar — e o erro volta a ser o mesmo de antes.
  for (const h of ["authorization", "apikey", "content-type", "x-client-info"]) {
    if (!permitidos.includes(h)) {
      throw new Error(`"${h}" ficou de fora do Access-Control-Allow-Headers`);
    }
  }
});

Deno.test("DELETE está entre os métodos liberados — excluir pessoa passa pelo mesmo preflight", () => {
  const permitidos = (responderPreflight(pedido("OPTIONS", PROD))
    ?.headers.get("Access-Control-Allow-Methods") ?? "").toUpperCase();

  if (!permitidos.includes("DELETE")) {
    throw new Error(`DELETE ficou de fora: "${permitidos}"`);
  }
});

Deno.test("POST não é preflight — segue para a função", () => {
  assertEqual(responderPreflight(pedido("POST", PROD)), null, "POST tem que passar");
});

// ---------------------------------------------------------------------------
// Quais origens entram
// ---------------------------------------------------------------------------

Deno.test("localhost em qualquer porta entra — é o dev de quem programa", () => {
  for (const origem of ["http://localhost:5173", "http://127.0.0.1:4173"]) {
    assertEqual(
      cabecalhosCors(origem)["Access-Control-Allow-Origin"],
      origem,
      `${origem} devia ser aceita`,
    );
  }
});

Deno.test("preview do Cloudflare Pages entra — o subdomínio muda a cada deploy", () => {
  const origem = "https://abc123.clickbaby.pages.dev";
  assertEqual(
    cabecalhosCors(origem)["Access-Control-Allow-Origin"],
    origem,
    "preview devia ser aceito",
  );
});

Deno.test("origem desconhecida NÃO ganha o cabeçalho — a lista é lista", () => {
  for (const origem of [
    "https://clickbaby.com.br.evil.test",
    "http://clickbaby.com.br",
    "https://outrapessoa.pages.dev",
  ]) {
    const cors = cabecalhosCors(origem);
    if ("Access-Control-Allow-Origin" in cors) {
      throw new Error(`${origem} não devia ser liberada`);
    }
  }
});

Deno.test("toda resposta varia por origem — sem Vary um cache serve uma origem para outra", () => {
  assertEqual(cabecalhosCors(PROD)["Vary"], "Origin", "falta o Vary");
  assertEqual(cabecalhosCors(null)["Vary"], "Origin", "falta o Vary sem origem");
});

Deno.test("o Content-Type continua saindo — o front lê o JSON de erro por ele", () => {
  assertEqual(
    cabecalhosCors(PROD)["Content-Type"],
    "application/json",
    "a resposta tem que continuar sendo JSON",
  );
});
