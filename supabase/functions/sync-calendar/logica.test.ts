// Testes de unidade das partes puras do sync (logica.ts) — sem rede, sem
// banco. O teste real deste sync é rodar contra o Google de verdade
// (documentado no PR/CLAUDE.md); isto cobre só a decisão e a resolução.
import {
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
