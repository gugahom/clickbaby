// O TÍTULO QUE O SISTEMA ESCREVE PRECISA VOLTAR IGUAL (ver evento-do-caso.ts).
// Todo pacote e toda maternidade do cadastro, com e sem New Born, com e sem
// nome de bebê: o parser e os resolvedores do sync têm de devolver o mesmo
// caso que foi escrito.
//
// As listas são as do cadastro (supabase/seed.sql). Pacote ou maternidade nova
// entra aqui — e se o parser não a reconhecer, este teste é o que avisa, ANTES
// de um caso criado pelo calendário trocar de checklist sozinho.

import { parseEventoCalendar } from "../_shared/parse-evento.ts";
import { resolverMaternidadeId, resolverPacoteId } from "./logica.ts";
import { BEBE_SEM_NOME, idDoEventoDoCaso, montarEventoDoCaso, montarTituloDoEvento } from "./evento-do-caso.ts";

function assertEqual(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg}\n  esperado: ${e}\n  recebido: ${a}`);
}

const PACOTES = [
  "BABY REELS",
  "BASIC",
  "BASIC + REELS",
  "BASIC REELS",
  "BIRTH",
  "BIRTH + REELS",
  "MASTER",
  "MASTER + ÁLBUM",
  "STANDARD",
].map((nome, i) => ({ id: `p${i}`, nome }));

const MATERNIDADES = ["CWB", "GNDI", "HNSF", "HNSG", "HSC", "MACKENZIE", "MARILAC", "ROCIO"].map((sigla, i) => ({
  id: `m${i}`,
  sigla,
}));

Deno.test("todo título escrito pelo sistema volta ao mesmo pacote, maternidade, mãe, bebê e adicional", () => {
  let conferidos = 0;
  for (const p of PACOTES) {
    for (const m of MATERNIDADES) {
      for (const clickHome of [false, true]) {
        for (const bebe of ["JOSÉ", null]) {
          const titulo = montarTituloDoEvento({
            mae_nome: "ANA MARIA",
            bebe_nome: bebe,
            pacote_nome: p.nome,
            maternidade_sigla: m.sigla,
            click_home: clickHome,
          });
          const lido = parseEventoCalendar(titulo);
          if (lido.tipo !== "caso") throw new Error(`o parser ignorou "${titulo}"`);
          assertEqual(
            {
              mae: lido.mae,
              bebe: lido.bebe,
              pacote: resolverPacoteId(lido.pacote_bruto, PACOTES),
              maternidade: resolverMaternidadeId(lido.maternidade_sigla, MATERNIDADES),
              click_home: lido.click_home,
            },
            { mae: "ANA MARIA", bebe: bebe ?? BEBE_SEM_NOME, pacote: p.id, maternidade: m.id, click_home: clickHome },
            `ida e volta de "${titulo}"`,
          );
          conferidos++;
        }
      }
    }
  }
  assertEqual(conferidos, 9 * 8 * 2 * 2, "combinações conferidas");
});

Deno.test("o id do evento só usa o alfabeto que o Google aceita, e é sempre o mesmo para o mesmo caso", () => {
  const id = idDoEventoDoCaso("0F8FAD5B-D9CB-469F-A165-70867728950E");
  assertEqual(/^[a-v0-9]{5,1024}$/.test(id), true, "alfabeto base32hex");
  assertEqual(id, "cb0f8fad5bd9cb469fa16570867728950e", "determinístico, sem hífens e minúsculo");
});

Deno.test("o evento tem uma hora de duração, o fuso de Brasília, e cor só quando a regra dá uma", () => {
  const base = {
    caso_id: "0f8fad5b-d9cb-469f-a165-70867728950e",
    mae_nome: "ANA",
    bebe_nome: "JOSÉ",
    pacote_nome: "BASIC",
    maternidade_sigla: "HSC",
    click_home: false,
    previsao_em: "2026-10-14T13:00:00+00:00",
  };
  const comCor = montarEventoDoCaso({ ...base, cor_calendar: "9" });
  assertEqual(comCor.colorId, "9", "cor da regra");
  assertEqual(comCor.start, { dateTime: "2026-10-14T13:00:00.000Z", timeZone: "America/Sao_Paulo" }, "início");
  assertEqual(comCor.end, { dateTime: "2026-10-14T14:00:00.000Z", timeZone: "America/Sao_Paulo" }, "fim, uma hora depois");

  const semCor = montarEventoDoCaso({ ...base, cor_calendar: null });
  assertEqual("colorId" in semCor, false, "sem cor, a agenda usa a padrão");
});
