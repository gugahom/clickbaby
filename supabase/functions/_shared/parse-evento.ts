// Parser puro do título de um evento do Google Calendar (seção 7 do
// CLAUDE.md). Sem rede, sem banco, sem nenhuma API privilegiada do Deno —
// só string in, estrutura out. A Edge Function do sync (ainda não escrita)
// decide o que fazer com o resultado, inclusive "isso vira rascunho
// pendente"; este módulo NUNCA toma essa decisão sozinho, só reporta null
// onde não teve certeza.
//
// Convenção observada nos dados reais do cliente:
//   MÃE/BEBÊ [-] PACOTE [SIGLA_MATERNIDADE]
//   ex.: THAYANE/ALICE BIRTH+REELS GNDI
//        KEVELYN/JOAQUIM - BABY REELS
//        *JENNIE/MARIA LUIZA - BASIC - HSC

export type ResultadoParseEvento =
  | {
      tipo: "caso";
      mae: string;
      bebe: string;
      pacote_bruto: string | null;
      maternidade_sigla: string | null;
    }
  | { tipo: "ignorar" };

// Vocabulário finito de pacotes — mesmos 9 nomes do seed real
// (supabase/seed.sql). O match é por IGUALDADE depois de normalizar
// (maiúsculas, sem acento, espaço único, "+" sem espaço ao redor) — não é
// fuzzy match. Uma grafia genuinamente diferente de qualquer um destes 9
// fica null de propósito (ex.: um "BIRTH REELS" sem o "+" não é o mesmo
// pacote de "BIRTH+REELS" — mesma distinção que já existe entre BASIC
// REELS e BASIC+REELS).
//
// BIRTH+REELS foi adicionado à lista canônica depois do exemplo do
// CLAUDE.md ter sido escrito com esse título — na época em que o parser
// original foi feito, "BIRTH+REELS" não batia com nenhum pacote (virava
// null de propósito). Não é caso especial de matching, é só mais um item
// da lista, como qualquer outro.
const PACOTES_CANONICOS = [
  "BASIC",
  "BASIC+REELS",
  "BASIC REELS",
  "STANDARD",
  "BABY REELS",
  "MASTER",
  "MASTER+ALBUM",
  "BIRTH",
  "BIRTH+REELS",
] as const;

// Maternidades conhecidas (seção 7 do CLAUDE.md).
//
// Cada uma tem a SIGLA que vai para o banco e as FORMAS como ela aparece
// escrita no título do evento. As cinco primeiras só têm uma forma, e por
// isso a versão anterior deste arquivo dava conta comparando a última
// PALAVRA do título. As três novas quebraram isso: "LUIZA DE MARILAC" são
// três palavras, e comparar só a última acharia "MARILAC" e deixaria "LUIZA
// DE" grudado no nome do pacote — que aí não casa com nada e o caso vira
// rascunho pendente.
//
// A sigla é o que aparece no chip do cartão. As formas são o que a equipe
// digita, e uma sigla pode ter várias.
const MATERNIDADES = [
  { sigla: "GNDI", formas: ["GNDI"] },
  { sigla: "HSC", formas: ["HSC"] },
  { sigla: "HNSG", formas: ["HNSG"] },
  { sigla: "HNSF", formas: ["HNSF"] },
  { sigla: "CWB", formas: ["CWB"] },
  { sigla: "ROCIO", formas: ["ROCIO"] },
  { sigla: "MACKENZIE", formas: ["MACKENZIE", "MACK"] },
  { sigla: "MARILAC", formas: ["LUIZA DE MARILAC", "MARILAC"] },
] as const;

// Exportado para o sync (supabase/functions/sync-calendar) reusar na hora
// de casar pacote_bruto (saída deste parser) contra pacotes.nome no banco
// — mesma regra de normalização dos dois lados, sem duplicar a lógica.
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove acento: ÁLBUM -> ALBUM
    .toUpperCase()
    .replace(/\s*\+\s*/g, "+") // "BASIC + REELS" -> "BASIC+REELS"
    .replace(/\s+/g, " ")
    .trim();
}

const PACOTES_CANONICOS_NORMALIZADOS = PACOTES_CANONICOS.map(normalizar);

// Todas as formas, achatadas e ordenadas da MAIS LONGA para a mais curta.
// A ordem é a regra inteira: "LUIZA DE MARILAC" tem que ser tentada antes de
// "MARILAC", senão a curta casa primeiro e sobra "LUIZA DE" como pacote.
const FORMAS_MATERNIDADE = MATERNIDADES
  .flatMap((m) => m.formas.map((f) => ({ sigla: m.sigla, palavras: normalizar(f).split(" ") })))
  .sort((a, b) => b.palavras.length - a.palavras.length);

// Retorna o texto ORIGINAL (só com espaço nas pontas colapsado), não uma
// versão reescrita — "pacote_bruto reconhecido" é o que veio no título,
// não uma forma canônica imposta por cima.
function combinaComPacoteCanonico(texto: string): string | null {
  const normalizado = normalizar(texto);
  return PACOTES_CANONICOS_NORMALIZADOS.includes(normalizado)
    ? texto.trim().replace(/\s+/g, " ")
    : null;
}

/** O segmento INTEIRO é uma maternidade conhecida? */
function combinaComSigla(texto: string): string | null {
  const alvo = normalizar(texto);
  const achada = FORMAS_MATERNIDADE.find((f) => f.palavras.join(" ") === alvo);
  return achada ? achada.sigla : null;
}

/**
 * Arranca a maternidade do FIM de uma lista de palavras.
 *
 * Devolve a sigla e o que sobrou antes dela — que é o texto do pacote. Sem
 * isso, um título com a maternidade embutida ("BABY REELS LUIZA DE MARILAC")
 * só poderia ser lido palavra a palavra, e nomes de várias palavras ficariam
 * de fora.
 */
function extrairMaternidadeDoFim(
  palavras: string[],
): { sigla: string; restante: string[] } | null {
  for (const forma of FORMAS_MATERNIDADE) {
    const n = forma.palavras.length;
    if (palavras.length < n) continue;
    const cauda = palavras.slice(-n).map((p) => normalizar(p)).join(" ");
    if (cauda === forma.palavras.join(" ")) {
      return { sigla: forma.sigla, restante: palavras.slice(0, -n) };
    }
  }
  return null;
}

export function parseEventoCalendar(titulo: string): ResultadoParseEvento {
  let texto = titulo.trim();

  // O '*' que antecede alguns nomes: significado ainda não confirmado com
  // o cliente (seção 7 do CLAUDE.md). Só removemos pra não atrapalhar o
  // parse — nenhuma decisão é tomada com base na presença dele.
  if (texto.startsWith("*")) {
    texto = texto.slice(1).trim();
  }

  const indiceBarra = texto.indexOf("/");
  if (indiceBarra === -1) {
    // Sem '/': folga, aniversário, sorteio, reunião interna — não é caso.
    return { tipo: "ignorar" };
  }

  const mae = texto.slice(0, indiceBarra).trim();
  const resto = texto.slice(indiceBarra + 1).trim().replace(/\s+/g, " ");

  // '-' sempre separa segmentos (bebê / pacote / maternidade); nunca
  // aparece dentro de um nome de pacote (que usa '+'). Quando o título não
  // tem nenhum '-', os segmentos ficam só espaço-separados e a extração
  // vira mais ambígua — ver o branch de 1 segmento mais abaixo.
  const segmentos = resto
    .split(/\s*-\s*/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (segmentos.length >= 3) {
    // BEBÊ - PACOTE - MATERNIDADE (o formato mais explícito). Mais de 3
    // segmentos é incomum; tratamos o miolo inteiro como texto de pacote.
    const bebe = segmentos[0];
    const siglaTentativa = combinaComSigla(segmentos[segmentos.length - 1]);
    const pacoteTexto = siglaTentativa
      ? segmentos.slice(1, -1).join(" ")
      : segmentos.slice(1).join(" ");
    return {
      tipo: "caso",
      mae,
      bebe,
      pacote_bruto: combinaComPacoteCanonico(pacoteTexto),
      maternidade_sigla: siglaTentativa,
    };
  }

  if (segmentos.length === 2) {
    // BEBÊ - PACOTE[ MATERNIDADE], maternidade embutida sem "-" própria.
    const bebe = segmentos[0];
    const palavras = segmentos[1].split(" ").filter((p) => p.length > 0);
    const achada = extrairMaternidadeDoFim(palavras);
    const siglaTentativa = achada ? achada.sigla : null;

    if (achada && achada.restante.length > 0) {
      const pacoteReconhecido = combinaComPacoteCanonico(
        achada.restante.join(" "),
      );
      if (pacoteReconhecido) {
        return {
          tipo: "caso",
          mae,
          bebe,
          pacote_bruto: pacoteReconhecido,
          maternidade_sigla: siglaTentativa,
        };
      }
    }

    // Sem sigla destacável no fim, ou remover a suposta sigla não deixou
    // um pacote reconhecível: tenta o segmento inteiro como pacote.
    const pacoteInteiro = combinaComPacoteCanonico(segmentos[1]);
    return {
      tipo: "caso",
      mae,
      bebe,
      pacote_bruto: pacoteInteiro,
      maternidade_sigla: pacoteInteiro ? null : siglaTentativa,
    };
  }

  // Nenhum "-" no título. A convenção observada não tem bebê de mais de
  // uma palavra nesse estilo (ex.: "ALICE BIRTH+REELS GNDI") — então a
  // primeira palavra é o bebê, e o resto é PACOTE [MATERNIDADE embutida],
  // sem separador nenhum entre os dois. Limitação conhecida: um bebê de
  // nome composto SEM "-" no título não é extraído corretamente por este
  // branch (não apareceu nos dados reais até agora).
  const palavras = (segmentos[0] ?? "").split(" ").filter((p) => p.length > 0);
  const bebe = palavras[0] ?? "";
  const restoPalavras = palavras.slice(1);
  const achada = extrairMaternidadeDoFim(restoPalavras);
  const siglaTentativa = achada ? achada.sigla : null;
  const pacoteTexto = achada
    ? achada.restante.join(" ")
    : restoPalavras.join(" ");

  return {
    tipo: "caso",
    mae,
    bebe,
    pacote_bruto: pacoteTexto ? combinaComPacoteCanonico(pacoteTexto) : null,
    maternidade_sigla: siglaTentativa,
  };
}
