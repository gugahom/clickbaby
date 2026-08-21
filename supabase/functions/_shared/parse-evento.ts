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

// Siglas de maternidade conhecidas (seção 7 do CLAUDE.md).
const SIGLAS_MATERNIDADE = ["GNDI", "HSC", "HNSG", "HNSF", "CWB"] as const;

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove acento: ÁLBUM -> ALBUM
    .toUpperCase()
    .replace(/\s*\+\s*/g, "+") // "BASIC + REELS" -> "BASIC+REELS"
    .replace(/\s+/g, " ")
    .trim();
}

const PACOTES_CANONICOS_NORMALIZADOS = PACOTES_CANONICOS.map(normalizar);
const SIGLAS_NORMALIZADAS = SIGLAS_MATERNIDADE.map(normalizar);

// Retorna o texto ORIGINAL (só com espaço nas pontas colapsado), não uma
// versão reescrita — "pacote_bruto reconhecido" é o que veio no título,
// não uma forma canônica imposta por cima.
function combinaComPacoteCanonico(texto: string): string | null {
  const normalizado = normalizar(texto);
  return PACOTES_CANONICOS_NORMALIZADOS.includes(normalizado)
    ? texto.trim().replace(/\s+/g, " ")
    : null;
}

function combinaComSigla(texto: string): string | null {
  const normalizado = normalizar(texto);
  const indice = SIGLAS_NORMALIZADAS.indexOf(normalizado);
  return indice === -1 ? null : SIGLAS_MATERNIDADE[indice];
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
    const ultimaPalavra = palavras[palavras.length - 1];
    const siglaTentativa = ultimaPalavra ? combinaComSigla(ultimaPalavra) : null;

    if (siglaTentativa && palavras.length > 1) {
      const pacoteReconhecido = combinaComPacoteCanonico(
        palavras.slice(0, -1).join(" "),
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
  const ultimaPalavra = restoPalavras[restoPalavras.length - 1];
  const siglaTentativa = ultimaPalavra ? combinaComSigla(ultimaPalavra) : null;
  const pacoteTexto = siglaTentativa
    ? restoPalavras.slice(0, -1).join(" ")
    : restoPalavras.join(" ");

  return {
    tipo: "caso",
    mae,
    bebe,
    pacote_bruto: pacoteTexto ? combinaComPacoteCanonico(pacoteTexto) : null,
    maternidade_sigla: siglaTentativa,
  };
}
