// Testes do parser de título de evento do Calendar. Sem imports externos
// de propósito (nem deno.land/std) — o parser é uma função pura, o teste
// fica 100% offline e sem dependência nova pra justificar.
import { parseEventoCalendar } from "./parse-evento.ts";

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) {
    return false;
  }
  const aKeys = Object.keys(a as Record<string, unknown>);
  const bKeys = Object.keys(b as Record<string, unknown>);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((k) =>
    deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])
  );
}

function assertEqual(actual: unknown, expected: unknown, msg: string) {
  if (!deepEqual(actual, expected)) {
    throw new Error(
      `${msg}\n  esperado: ${JSON.stringify(expected)}\n  recebido: ${JSON.stringify(actual)}`,
    );
  }
}

// =============================================================================
// Os três exemplos reais do CLAUDE.md
// =============================================================================

Deno.test("exemplo real 1: sem dash, maternidade embutida, BIRTH+REELS reconhecido", () => {
  // BIRTH+REELS virou pacote canônico (cliente confirmou: é a tentativa de
  // venda que já sai com o reels incluído, mesmas etapas do BIRTH mas
  // comercialmente distinto). Antes disso este teste esperava
  // pacote_bruto: null — histórico preservado no comentário do array
  // PACOTES_CANONICOS em parse-evento.ts.
  assertEqual(
    parseEventoCalendar("THAYANE/ALICE BIRTH+REELS GNDI"),
    {
      tipo: "caso",
      mae: "THAYANE",
      bebe: "ALICE",
      pacote_bruto: "BIRTH+REELS",
      maternidade_sigla: "GNDI",
    },
    "THAYANE/ALICE BIRTH+REELS GNDI",
  );
});

Deno.test("exemplo real 2: dash único, sem maternidade", () => {
  assertEqual(
    parseEventoCalendar("KEVELYN/JOAQUIM - BABY REELS"),
    {
      tipo: "caso",
      mae: "KEVELYN",
      bebe: "JOAQUIM",
      pacote_bruto: "BABY REELS",
      maternidade_sigla: null,
    },
    "KEVELYN/JOAQUIM - BABY REELS",
  );
});

Deno.test("exemplo real 3: asterisco, bebê de nome composto, dois dashes", () => {
  assertEqual(
    parseEventoCalendar("*JENNIE/MARIA LUIZA - BASIC - HSC"),
    {
      tipo: "caso",
      mae: "JENNIE",
      bebe: "MARIA LUIZA",
      pacote_bruto: "BASIC",
      maternidade_sigla: "HSC",
    },
    "*JENNIE/MARIA LUIZA - BASIC - HSC",
  );
});

// =============================================================================
// Asterisco: removido, sem virar decisão
// =============================================================================

Deno.test("asterisco é removido e não aparece em mae nem em nenhum outro campo", () => {
  const resultado = parseEventoCalendar("*ANA/PEDRO - STANDARD - CWB");
  assertEqual(
    resultado,
    {
      tipo: "caso",
      mae: "ANA",
      bebe: "PEDRO",
      pacote_bruto: "STANDARD",
      maternidade_sigla: "CWB",
    },
    "*ANA/PEDRO - STANDARD - CWB",
  );
  if (resultado.tipo === "caso" && resultado.mae.includes("*")) {
    throw new Error("mae não deveria conter '*'");
  }
});

Deno.test("título sem asterisco continua funcionando igual", () => {
  assertEqual(
    parseEventoCalendar("ANA/PEDRO - STANDARD - CWB"),
    parseEventoCalendar("*ANA/PEDRO - STANDARD - CWB"),
    "com e sem asterisco devem dar o mesmo resultado",
  );
});

// =============================================================================
// Sem '/': ignorar
// =============================================================================

for (
  const titulo of [
    "Folga Sarah",
    "Aniversário da Morgana",
    "Sorteio de dia das mães",
    "Reunião de equipe 19h",
    "",
    "   ",
  ]
) {
  Deno.test(`sem '/' vira ignorar: "${titulo}"`, () => {
    assertEqual(parseEventoCalendar(titulo), { tipo: "ignorar" }, titulo);
  });
}

// =============================================================================
// Pacote não reconhecido -> pacote_bruto null (mãe/bebê continuam extraídos)
// =============================================================================

Deno.test("pacote desconhecido -> pacote_bruto null, mãe/bebê preservados", () => {
  assertEqual(
    parseEventoCalendar("CARLA/LUCAS - PACOTE INEXISTENTE"),
    {
      tipo: "caso",
      mae: "CARLA",
      bebe: "LUCAS",
      pacote_bruto: null,
      maternidade_sigla: null,
    },
    "CARLA/LUCAS - PACOTE INEXISTENTE",
  );
});

Deno.test("pacote com erro de digitação não vira nenhum pacote canônico por acidente", () => {
  const resultado = parseEventoCalendar("CARLA/LUCAS - BASICC");
  if (resultado.tipo === "caso") {
    assertEqual(resultado.pacote_bruto, null, "BASICC não é BASIC");
  } else {
    throw new Error("deveria ser tipo caso (tem '/')");
  }
});

// =============================================================================
// Maternidade ausente -> sigla null
// =============================================================================

Deno.test("sem maternidade -> maternidade_sigla null", () => {
  assertEqual(
    parseEventoCalendar("BIA/NOAH - MASTER"),
    {
      tipo: "caso",
      mae: "BIA",
      bebe: "NOAH",
      pacote_bruto: "MASTER",
      maternidade_sigla: null,
    },
    "BIA/NOAH - MASTER",
  );
});

Deno.test("última palavra parecida com sigla mas não é uma sigla conhecida -> null", () => {
  const resultado = parseEventoCalendar("BIA/NOAH - MASTER XYZ");
  if (resultado.tipo !== "caso") throw new Error("deveria ser tipo caso");
  assertEqual(resultado.maternidade_sigla, null, "XYZ não é sigla conhecida");
});

// =============================================================================
// Variações de espaçamento e grafia dos 8 pacotes canônicos
// =============================================================================

const variacoesDePacote: Array<{ titulo: string; pacoteEsperado: string }> = [
  { titulo: "A/B - BASIC", pacoteEsperado: "BASIC" },
  { titulo: "A/B - basic", pacoteEsperado: "basic" },
  { titulo: "A/B - BASIC+REELS", pacoteEsperado: "BASIC+REELS" },
  { titulo: "A/B - BASIC + REELS", pacoteEsperado: "BASIC + REELS" },
  { titulo: "A/B - BASIC+ REELS", pacoteEsperado: "BASIC+ REELS" },
  { titulo: "A/B - basic  +  reels", pacoteEsperado: "basic + reels" },
  { titulo: "A/B - BASIC REELS", pacoteEsperado: "BASIC REELS" },
  { titulo: "A/B - basic reels", pacoteEsperado: "basic reels" },
  { titulo: "A/B - STANDARD", pacoteEsperado: "STANDARD" },
  { titulo: "A/B - BABY REELS", pacoteEsperado: "BABY REELS" },
  { titulo: "A/B - Baby  Reels", pacoteEsperado: "Baby Reels" },
  { titulo: "A/B - MASTER", pacoteEsperado: "MASTER" },
  { titulo: "A/B - MASTER+ÁLBUM", pacoteEsperado: "MASTER+ÁLBUM" },
  { titulo: "A/B - MASTER + ÁLBUM", pacoteEsperado: "MASTER + ÁLBUM" },
  { titulo: "A/B - MASTER+ALBUM", pacoteEsperado: "MASTER+ALBUM" },
  { titulo: "A/B - master + album", pacoteEsperado: "master + album" },
  { titulo: "A/B - BIRTH", pacoteEsperado: "BIRTH" },
  { titulo: "A/B - BIRTH+REELS", pacoteEsperado: "BIRTH+REELS" },
  { titulo: "A/B - BIRTH + REELS", pacoteEsperado: "BIRTH + REELS" },
  { titulo: "A/B - birth+reels", pacoteEsperado: "birth+reels" },
];

for (const { titulo, pacoteEsperado } of variacoesDePacote) {
  Deno.test(`reconhece variação de grafia/espaço: "${titulo}"`, () => {
    const resultado = parseEventoCalendar(titulo);
    if (resultado.tipo !== "caso") throw new Error("deveria ser tipo caso");
    assertEqual(
      resultado.pacote_bruto,
      pacoteEsperado,
      `pacote_bruto de "${titulo}"`,
    );
  });
}

Deno.test("BASIC REELS e BASIC+REELS continuam sendo pacotes diferentes (venda vs contrato)", () => {
  const semMais = parseEventoCalendar("A/B - BASIC REELS");
  const comMais = parseEventoCalendar("A/B - BASIC+REELS");
  if (semMais.tipo !== "caso" || comMais.tipo !== "caso") {
    throw new Error("ambos deveriam ser tipo caso");
  }
  assertEqual(semMais.pacote_bruto, "BASIC REELS", "sem '+'");
  assertEqual(comMais.pacote_bruto, "BASIC+REELS", "com '+'");
});

Deno.test("BIRTH, BASIC+REELS e BIRTH+REELS são três pacotes distintos, sem regressão", () => {
  const birth = parseEventoCalendar("A/B - BIRTH");
  const basicReels = parseEventoCalendar("A/B - BASIC+REELS");
  const birthReels = parseEventoCalendar("A/B - BIRTH+REELS");
  if (birth.tipo !== "caso" || basicReels.tipo !== "caso" || birthReels.tipo !== "caso") {
    throw new Error("os três deveriam ser tipo caso");
  }
  assertEqual(birth.pacote_bruto, "BIRTH", "BIRTH continua BIRTH, sem virar BIRTH+REELS por engano");
  assertEqual(basicReels.pacote_bruto, "BASIC+REELS", "BASIC+REELS continua BASIC+REELS, sem virar BIRTH+REELS");
  assertEqual(birthReels.pacote_bruto, "BIRTH+REELS", "BIRTH+REELS reconhecido como o novo pacote");
});

Deno.test("BIRTH+REELS com maternidade embutida, sem dash (o próprio exemplo do CLAUDE.md)", () => {
  const resultado = parseEventoCalendar("A/B BIRTH+REELS HSC");
  if (resultado.tipo !== "caso") throw new Error("deveria ser tipo caso");
  assertEqual(resultado.pacote_bruto, "BIRTH+REELS", "pacote embutido sem dash");
  assertEqual(resultado.maternidade_sigla, "HSC", "sigla embutida sem dash");
});

Deno.test("BIRTH+REELS com maternidade via dash", () => {
  const resultado = parseEventoCalendar("A/B - BIRTH+REELS - CWB");
  if (resultado.tipo !== "caso") throw new Error("deveria ser tipo caso");
  assertEqual(resultado.pacote_bruto, "BIRTH+REELS", "pacote com dash");
  assertEqual(resultado.maternidade_sigla, "CWB", "sigla com dash");
});

// =============================================================================
// Variações de sigla de maternidade
// =============================================================================

for (const sigla of ["GNDI", "HSC", "HNSG", "HNSF", "CWB"]) {
  Deno.test(`reconhece sigla de maternidade: ${sigla}`, () => {
    const resultado = parseEventoCalendar(`A/B - STANDARD - ${sigla}`);
    if (resultado.tipo !== "caso") throw new Error("deveria ser tipo caso");
    assertEqual(resultado.maternidade_sigla, sigla, sigla);
  });

  Deno.test(`reconhece sigla minúscula: ${sigla.toLowerCase()}`, () => {
    const resultado = parseEventoCalendar(`A/B - STANDARD - ${sigla.toLowerCase()}`);
    if (resultado.tipo !== "caso") throw new Error("deveria ser tipo caso");
    assertEqual(resultado.maternidade_sigla, sigla, sigla.toLowerCase());
  });

  Deno.test(`reconhece sigla embutida sem dash: ${sigla}`, () => {
    const resultado = parseEventoCalendar(`A/B STANDARD ${sigla}`);
    if (resultado.tipo !== "caso") throw new Error("deveria ser tipo caso");
    assertEqual(resultado.pacote_bruto, "STANDARD", "pacote junto com sigla embutida");
    assertEqual(resultado.maternidade_sigla, sigla, sigla);
  });
}

// =============================================================================
// Bebê de nome composto com dash (o parser suporta; sem dash, é limitação
// conhecida documentada no código-fonte)
// =============================================================================

Deno.test("bebê de nome composto é extraído inteiro quando há dash", () => {
  const resultado = parseEventoCalendar("RITA/JOÃO PEDRO - MASTER - HNSF");
  if (resultado.tipo !== "caso") throw new Error("deveria ser tipo caso");
  assertEqual(resultado.bebe, "JOÃO PEDRO", "bebê de dois nomes");
});

// =============================================================================
// Mãe e bebê nunca perdem espaço nas pontas
// =============================================================================

Deno.test("espaços extras ao redor de mãe/bebê são removidos", () => {
  const resultado = parseEventoCalendar("  CARLA  /  LUCAS   - BASIC");
  if (resultado.tipo !== "caso") throw new Error("deveria ser tipo caso");
  assertEqual(resultado.mae, "CARLA", "mae sem espaço nas pontas");
  assertEqual(resultado.bebe, "LUCAS", "bebe sem espaço nas pontas");
});


// ---------------------------------------------------------------------------
// As três maternidades novas (28/08/2026). Duas delas têm nome de mais de uma
// palavra em alguma forma, que é o que a versão anterior deste parser não
// conseguia ler: ela comparava só a ÚLTIMA palavra do título.
// ---------------------------------------------------------------------------

Deno.test("maternidade nova em segmento próprio", () => {
  assertEqual(
    parseEventoCalendar("ANA/PEDRO - BABY REELS - ROCIO"),
    { tipo: "caso", mae: "ANA", bebe: "PEDRO", pacote_bruto: "BABY REELS", maternidade_sigla: "ROCIO" },
    "ROCIO como segmento próprio",
  );
});

Deno.test("LUIZA DE MARILAC como segmento inteiro", () => {
  assertEqual(
    parseEventoCalendar("ANA/PEDRO - BABY REELS - LUIZA DE MARILAC"),
    { tipo: "caso", mae: "ANA", bebe: "PEDRO", pacote_bruto: "BABY REELS", maternidade_sigla: "MARILAC" },
    "nome de três palavras em segmento próprio",
  );
});

// O caso que quebrava: nome de três palavras EMBUTIDO, sem "-" separando.
// Comparando só a última palavra, o parser achava "MARILAC" e deixava "BABY
// REELS LUIZA DE" como texto de pacote — que não casa com nada, e o caso
// virava rascunho pendente sem pacote.
Deno.test("LUIZA DE MARILAC embutida no segmento do pacote", () => {
  assertEqual(
    parseEventoCalendar("ANA/PEDRO - BABY REELS LUIZA DE MARILAC"),
    { tipo: "caso", mae: "ANA", bebe: "PEDRO", pacote_bruto: "BABY REELS", maternidade_sigla: "MARILAC" },
    "nome de três palavras embutido",
  );
});

Deno.test("MARILAC sozinho continua valendo", () => {
  assertEqual(
    parseEventoCalendar("ANA/PEDRO - BASIC MARILAC"),
    { tipo: "caso", mae: "ANA", bebe: "PEDRO", pacote_bruto: "BASIC", maternidade_sigla: "MARILAC" },
    "forma curta",
  );
});

Deno.test("MACK e MACKENZIE apontam para a mesma sigla", () => {
  for (const forma of ["MACK", "MACKENZIE"]) {
    assertEqual(
      parseEventoCalendar(`ANA/PEDRO - STANDARD ${forma}`),
      { tipo: "caso", mae: "ANA", bebe: "PEDRO", pacote_bruto: "STANDARD", maternidade_sigla: "MACKENZIE" },
      `duas formas, uma sigla: ${forma}`,
    );
  }
});

// Sem "-" nenhum, que é o terceiro caminho do parser.
Deno.test("maternidade nova sem hífen no título", () => {
  assertEqual(
    parseEventoCalendar("ANA/PEDRO BIRTH+REELS ROCIO"),
    { tipo: "caso", mae: "ANA", bebe: "PEDRO", pacote_bruto: "BIRTH+REELS", maternidade_sigla: "ROCIO" },
    "caminho sem hífen",
  );
});
