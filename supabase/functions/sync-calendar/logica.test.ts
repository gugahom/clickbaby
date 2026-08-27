// Testes de unidade das partes puras do sync (logica.ts) — sem rede, sem
// banco. O teste real deste sync é rodar contra o Google de verdade
// (documentado no PR/CLAUDE.md); isto cobre só a decisão e a resolução.
import {
  autorizarChamada,
  contabilizarAcao,
  COR_CINZA_GOOGLE,
  eventoIndicaCancelamento,
  novoResumoVazio,
  resolverMaternidadeId,
  resolverPacoteId,
  resolverPrevisaoEm,
} from "./logica.ts";
import { parseEventoCalendar } from "../_shared/parse-evento.ts";

function assertEqual(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`${msg}\n  esperado: ${e}\n  recebido: ${a}`);
  }
}

// =============================================================================
// eventoIndicaCancelamento — card cinza
// =============================================================================

Deno.test("colorId 8 (Graphite) indica cancelamento", () => {
  assertEqual(eventoIndicaCancelamento("8"), true, "8 é o cinza");
  assertEqual(eventoIndicaCancelamento(COR_CINZA_GOOGLE), true, "usando a constante");
});

Deno.test("qualquer outro colorId da paleta não indica cancelamento", () => {
  for (const cor of ["1", "2", "3", "4", "5", "6", "7", "9", "10", "11"]) {
    assertEqual(eventoIndicaCancelamento(cor), false, `colorId ${cor} não é cinza`);
  }
});

Deno.test("evento sem colorId (cor padrão do calendar) não indica cancelamento", () => {
  assertEqual(eventoIndicaCancelamento(null), false, "null");
  assertEqual(eventoIndicaCancelamento(undefined), false, "undefined");
});


// =============================================================================
// resolverPacoteId
// =============================================================================

const PACOTES_TESTE = [
  { id: "id-basic", nome: "BASIC" },
  { id: "id-basic-reels-venda", nome: "BASIC + REELS" },
  { id: "id-basic-reels-contrato", nome: "BASIC REELS" },
  { id: "id-master-album", nome: "MASTER + ÁLBUM" },
  { id: "id-birth-reels", nome: "BIRTH + REELS" },
];

Deno.test("resolverPacoteId casa pacote_bruto exato", () => {
  assertEqual(resolverPacoteId("BASIC", PACOTES_TESTE), "id-basic", "BASIC exato");
});

Deno.test("resolverPacoteId ignora diferença de espaço/plus entre pacote_bruto e nome", () => {
  // pacote_bruto do parser vem "cru" do título (ex.: "BASIC+REELS", sem
  // espaço); pacotes.nome no banco é "BASIC + REELS", com espaço. Têm que
  // casar mesmo assim -- normalizar() dos dois lados resolve isso.
  assertEqual(resolverPacoteId("BASIC+REELS", PACOTES_TESTE), "id-basic-reels-venda", "BASIC+REELS -> BASIC + REELS");
  assertEqual(resolverPacoteId("MASTER+ALBUM", PACOTES_TESTE), "id-master-album", "sem acento casa com ÁLBUM");
});

Deno.test("resolverPacoteId distingue BASIC REELS de BASIC+REELS mesmo resolvendo id", () => {
  assertEqual(resolverPacoteId("BASIC REELS", PACOTES_TESTE), "id-basic-reels-contrato", "sem +");
  assertEqual(resolverPacoteId("BASIC+REELS", PACOTES_TESTE), "id-basic-reels-venda", "com +");
});

Deno.test("resolverPacoteId com BIRTH+REELS", () => {
  assertEqual(resolverPacoteId("BIRTH+REELS", PACOTES_TESTE), "id-birth-reels", "BIRTH+REELS");
});

Deno.test("resolverPacoteId retorna null para pacote_bruto null", () => {
  assertEqual(resolverPacoteId(null, PACOTES_TESTE), null, "null de entrada");
});

Deno.test("resolverPacoteId retorna null quando não bate com nenhum pacote cadastrado", () => {
  assertEqual(resolverPacoteId("PACOTE INEXISTENTE", PACOTES_TESTE), null, "não cadastrado");
});

Deno.test("resolverPacoteId retorna null quando a lista de pacotes está vazia", () => {
  assertEqual(resolverPacoteId("BASIC", []), null, "lista vazia");
});


// =============================================================================
// resolverMaternidadeId
// =============================================================================

const MATERNIDADES_TESTE = [
  { id: "id-gndi", sigla: "GNDI" },
  { id: "id-hsc", sigla: "HSC" },
];

Deno.test("resolverMaternidadeId casa sigla exata", () => {
  assertEqual(resolverMaternidadeId("GNDI", MATERNIDADES_TESTE), "id-gndi", "GNDI");
});

Deno.test("resolverMaternidadeId é case-insensitive", () => {
  assertEqual(resolverMaternidadeId("gndi", MATERNIDADES_TESTE), "id-gndi", "minúscula");
});

Deno.test("resolverMaternidadeId retorna null para sigla null", () => {
  assertEqual(resolverMaternidadeId(null, MATERNIDADES_TESTE), null, "null de entrada");
});

Deno.test("resolverMaternidadeId retorna null quando a maternidade não está cadastrada", () => {
  assertEqual(resolverMaternidadeId("CWB", MATERNIDADES_TESTE), null, "CWB não está na lista de teste");
});


// =============================================================================
// resolverPrevisaoEm
// =============================================================================

Deno.test("resolverPrevisaoEm usa dateTime quando presente", () => {
  assertEqual(
    resolverPrevisaoEm({ dateTime: "2026-03-05T14:30:00-03:00" }),
    "2026-03-05T14:30:00-03:00",
    "dateTime",
  );
});

Deno.test("resolverPrevisaoEm usa date (evento de dia inteiro) quando não há dateTime", () => {
  assertEqual(resolverPrevisaoEm({ date: "2026-03-05" }), "2026-03-05T00:00:00Z", "date sem hora");
});

Deno.test("resolverPrevisaoEm prefere dateTime a date quando os dois vêm preenchidos", () => {
  assertEqual(
    resolverPrevisaoEm({ dateTime: "2026-03-05T14:30:00Z", date: "2026-03-05" }),
    "2026-03-05T14:30:00Z",
    "dateTime tem prioridade",
  );
});

Deno.test("resolverPrevisaoEm retorna null sem start nem date/dateTime", () => {
  assertEqual(resolverPrevisaoEm(null), null, "start null");
  assertEqual(resolverPrevisaoEm(undefined), null, "start undefined");
  assertEqual(resolverPrevisaoEm({}), null, "start sem dateTime nem date");
});


// =============================================================================
// contabilizarAcao / novoResumoVazio
// =============================================================================

Deno.test("contabilizarAcao incrementa o balde certo do resumo", () => {
  const resumo = novoResumoVazio();
  contabilizarAcao(resumo, "caso_criado");
  contabilizarAcao(resumo, "rascunho_criado");
  contabilizarAcao(resumo, "rascunho_criado");
  contabilizarAcao(resumo, "caso_atualizado");
  contabilizarAcao(resumo, "caso_cancelado");
  contabilizarAcao(resumo, "sem_efeito");

  assertEqual(resumo.criados, 1, "criados");
  assertEqual(resumo.rascunhos, 2, "rascunhos");
  assertEqual(resumo.atualizados, 1, "atualizados");
  assertEqual(resumo.cancelados, 1, "cancelados");
  assertEqual(resumo.sem_efeito, 1, "sem_efeito");
  assertEqual(resumo.erros.length, 0, "sem erros");
});

Deno.test("contabilizarAcao registra como erro uma ação desconhecida, em vez de sumir com ela", () => {
  const resumo = novoResumoVazio();
  contabilizarAcao(resumo, "acao_que_nao_existe");
  assertEqual(resumo.erros.length, 1, "1 erro registrado");
  assertEqual(
    resumo.criados + resumo.atualizados + resumo.cancelados + resumo.rascunhos + resumo.sem_efeito,
    0,
    "nenhum balde normal incrementado por engano",
  );
});

Deno.test("novoResumoVazio começa zerado", () => {
  assertEqual(
    novoResumoVazio(),
    {
      total_eventos_lidos: 0,
      criados: 0,
      atualizados: 0,
      cancelados: 0,
      rascunhos: 0,
      ignorados: 0,
      sem_efeito: 0,
      erros: [],
    },
    "resumo inicial",
  );
});


// =============================================================================
// Ponta a ponta: parser real + resolução real, contra uma cópia exata do
// seed real de maternidades (supabase/seed.sql / migration
// 20260821113040). pgTAP não consegue chamar TypeScript, então a metade
// "isso realmente está no banco" é provada separadamente em
// supabase/tests/database/seed_maternidades.test.sql -- juntos, os dois
// testes provam a ponta a ponta que um teste só, sozinho, não conseguiria
// (nenhum dos dois lados roda o outro lado).
// =============================================================================

const MATERNIDADES_SEED_REAL = [
  { id: "id-gndi", sigla: "GNDI" },
  { id: "id-hsc", sigla: "HSC" },
  { id: "id-hnsg", sigla: "HNSG" },
  { id: "id-cwb", sigla: "CWB" },
  { id: "id-hnsf", sigla: "HNSF" },
];

Deno.test("ponta a ponta: parser extrai a sigla do título e ela resolve contra o seed real de maternidades", () => {
  const resultado = parseEventoCalendar("MARIA/JOÃO BASIC HNSG");
  if (resultado.tipo !== "caso") throw new Error("deveria ser tipo caso");
  assertEqual(resultado.maternidade_sigla, "HNSG", "parser extrai HNSG do título");

  const maternidadeId = resolverMaternidadeId(resultado.maternidade_sigla, MATERNIDADES_SEED_REAL);
  assertEqual(maternidadeId, "id-hnsg", "sigla extraída pelo parser resolve para a maternidade certa do seed");
});

Deno.test("ponta a ponta: as 5 siglas do seed real são todas reconhecidas pelo parser", () => {
  // Garante que ninguém adicionou uma maternidade no seed com uma sigla
  // que o parser não reconhece (ou vice-versa) -- as duas listas (aqui e
  // em parse-evento.ts) precisam ser o mesmo conjunto de 5.
  for (const { sigla } of MATERNIDADES_SEED_REAL) {
    const resultado = parseEventoCalendar(`A/B - STANDARD - ${sigla}`);
    if (resultado.tipo !== "caso") throw new Error("deveria ser tipo caso");
    assertEqual(resultado.maternidade_sigla, sigla, `parser reconhece a sigla do seed: ${sigla}`);
  }
});

// =============================================================================
// autorizarChamada — a segunda camada
//
// O teste que importa aqui é o NEGATIVO: a anon key é uma credencial
// legítima do projeto, aceita pelo gateway, e é pública. Se ela passar, a
// função está aberta para qualquer pessoa que leia o bundle do frontend.
//
// O projeto tem credencial nos DOIS formatos do Supabase (JWT legado e
// sb_secret/sb_publishable), então os dois entram aqui — a primeira
// invocação em produção falhou justamente por a checagem cobrir só um.
// =============================================================================

function jwtFalso(role: string): string {
  const b64 = (o: unknown) =>
    btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return [
    b64({ alg: "HS256", typ: "JWT" }),
    b64({ iss: "supabase", ref: "projetofalso", role, iat: 1, exp: 2 }),
    "assinaturairrelevante",
  ].join(".");
}

const JWT_SERVICE_ROLE = jwtFalso("service_role");
const JWT_ANON = jwtFalso("anon");
// Formato novo: opaco, sem claims. É o que o runtime injeta.
const SECRET_NOVA = "sb_secret_" + "N".repeat(30);
const PUBLISHABLE = "sb_publishable_" + "P".repeat(30);

Deno.test("caminho 1: a chave injetada (formato novo) autoriza", () => {
  assertEqual(
    autorizarChamada(`Bearer ${SECRET_NOVA}`, SECRET_NOVA).autorizado,
    true,
    "é exatamente a chave injetada",
  );
});

Deno.test("caminho 2: JWT legado com role service_role autoriza", () => {
  // Este é o caso que quebrou em produção: a chave injetada está no formato
  // novo, então a igualdade falha e só a claim salva.
  assertEqual(
    autorizarChamada(`Bearer ${JWT_SERVICE_ROLE}`, SECRET_NOVA).autorizado,
    true,
    "service_role legada continua valendo",
  );
});

Deno.test("ANON KEY é RECUSADA nos dois formatos — o ponto desta camada", () => {
  assertEqual(
    autorizarChamada(`Bearer ${JWT_ANON}`, SECRET_NOVA).autorizado,
    false,
    "anon legada (JWT com role anon)",
  );
  assertEqual(
    autorizarChamada(`Bearer ${PUBLISHABLE}`, SECRET_NOVA).autorizado,
    false,
    "publishable nova (opaca, não é a secret)",
  );
});

Deno.test("credencial opaca que não é a chave injetada é recusada", () => {
  assertEqual(
    autorizarChamada(`Bearer sb_secret_${"X".repeat(30)}`, SECRET_NOVA).autorizado,
    false,
    "parece uma secret, mas não é a nossa",
  );
});

Deno.test("Bearer aceita variação de caixa e espaço", () => {
  assertEqual(
    autorizarChamada(`bearer   ${SECRET_NOVA}`, SECRET_NOVA).autorizado,
    true,
    "minúsculo e espaço extra ainda é um Bearer válido",
  );
});

Deno.test("sem Authorization, sem Bearer, ou vazio: recusado", () => {
  for (const cabecalho of [null, undefined, "", "   ", SECRET_NOVA, `Basic ${SECRET_NOVA}`]) {
    assertEqual(
      autorizarChamada(cabecalho, SECRET_NOVA).autorizado,
      false,
      `cabeçalho ${JSON.stringify(cabecalho)} não autoriza`,
    );
  }
});

Deno.test("sem a chave injetada, o caminho 1 não vira coringa", () => {
  // Se serviceRoleKey vier vazia, a igualdade não pode "casar" com um token
  // vazio nem liberar geral — só o caminho 2 (claim verificada) decide.
  assertEqual(
    autorizarChamada(`Bearer ${PUBLISHABLE}`, "").autorizado,
    false,
    "opaca sem chave para comparar: nega",
  );
  assertEqual(
    autorizarChamada(`Bearer ${JWT_ANON}`, "").autorizado,
    false,
    "anon sem chave para comparar: nega",
  );
});

Deno.test("o motivo da recusa não devolve o token nem a chave", () => {
  for (const token of [JWT_ANON, PUBLISHABLE]) {
    const motivo = autorizarChamada(`Bearer ${token}`, SECRET_NOVA).motivo ?? "";
    assertEqual(motivo.includes(token), false, "não ecoa o token apresentado");
    assertEqual(motivo.includes(SECRET_NOVA), false, "não vaza a chave do servidor");
  }
});

// =============================================================================
// ResumoSync não carrega nome de paciente
// =============================================================================

Deno.test("o resumo de erros não tem campo de título", () => {
  const resumo = novoResumoVazio();
  resumo.erros.push({ evento_id: "abc123", erro: "sync_upsert_caso falhou" });
  const chaves = Object.keys(resumo.erros[0]).sort();
  assertEqual(
    chaves,
    ["erro", "evento_id"],
    "só id e mensagem — título traz nome de mãe/bebê (seção 10)",
  );
});
