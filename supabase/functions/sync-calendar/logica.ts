// Partes PURAS do sync do Google Calendar (seção 7 do CLAUDE.md) — sem
// rede, sem banco, sem Deno.serve. Separado de index.ts de propósito: um
// módulo que chama Deno.serve no nível superior não pode ser importado por
// um teste sem subir um servidor de verdade. Aqui só ficam decisão e
// resolução, testáveis com deno test comum.
//
// index.ts (a Edge Function em si) é a cola: chama o Google, chama estas
// funções, chama a RPC. Nenhuma regra de negócio mora lá.

import { normalizar } from "../_shared/parse-evento.ts";

// -----------------------------------------------------------------------
// Card cinza -> cancelamento
// -----------------------------------------------------------------------

// "Graphite" na paleta de cores de evento do Google Calendar — é o cinza
// que o cliente usa pra sinalizar cancelamento (seção 7 do CLAUDE.md).
// CONFIRMADO com o Gustavo: é esse o tom usado, colorId "8".
//
// Google não numera as cores por nome na API, só por colorId ("1".."11");
// o mapeamento colorId -> nome vem do endpoint colors().get() da Calendar
// API (https://developers.google.com/calendar/api/v3/reference/colors) e
// é uma paleta FIXA, igual em qualquer conta:
//   1 Lavender  2 Sage      3 Grape    4 Flamingo  5 Banana  6 Tangerine
//   7 Peacock   8 Graphite  9 Blueberry 10 Basil   11 Tomato
export const COR_CINZA_GOOGLE = "8";

// Atenção à API do Google: colorId só vem preenchido quando o evento tem
// cor DIFERENTE da padrão do calendar — um evento com a cor padrão chega
// SEM o campo colorId (undefined), não com algum valor "0" ou neutro.
// Tratamos ausência do campo como "não é cinza, não cancela" — comparação
// direta (===) já cobre isso sem `if` especial: undefined/null nunca é
// igual a "8".
export function eventoIndicaCancelamento(colorId: string | null | undefined): boolean {
  return colorId === COR_CINZA_GOOGLE;
}

// -----------------------------------------------------------------------
// Resolução de pacote_bruto/maternidade_sigla (saída do parser) para uuid
// -----------------------------------------------------------------------
//
// Reusa o normalizar() do parser (mesma regra dos dois lados: maiúsculas,
// sem acento, espaço único, "+" sem espaço ao redor) para casar
// pacote_bruto contra pacotes.nome — evita duplicar a lógica de comparação
// numa segunda forma que puder divergir da primeira com o tempo.

export interface PacoteResumido {
  id: string;
  nome: string;
}

export interface MaternidadeResumida {
  id: string;
  sigla: string;
}

export function resolverPacoteId(
  pacoteBruto: string | null,
  pacotes: readonly PacoteResumido[],
): string | null {
  if (!pacoteBruto) return null;
  const alvo = normalizar(pacoteBruto);
  return pacotes.find((p) => normalizar(p.nome) === alvo)?.id ?? null;
}

export function resolverMaternidadeId(
  maternidadeSigla: string | null,
  maternidades: readonly MaternidadeResumida[],
): string | null {
  if (!maternidadeSigla) return null;
  const alvo = maternidadeSigla.toUpperCase();
  return maternidades.find((m) => m.sigla.toUpperCase() === alvo)?.id ?? null;
}

// -----------------------------------------------------------------------
// previsao_em a partir do start do evento (dateTime com hora, ou date sem
// hora para evento de dia inteiro)
// -----------------------------------------------------------------------

export function resolverPrevisaoEm(
  start: { dateTime?: string | null; date?: string | null } | null | undefined,
): string | null {
  if (!start) return null;
  if (start.dateTime) return start.dateTime;
  if (start.date) return `${start.date}T00:00:00Z`;
  return null;
}

// -----------------------------------------------------------------------
// Resumo do lote — o que a Edge Function devolve na resposta HTTP
// -----------------------------------------------------------------------

export interface ResumoSync {
  total_eventos_lidos: number;
  criados: number;
  atualizados: number;
  cancelados: number;
  rascunhos: number;
  ignorados: number;
  sem_efeito: number;
  erros: Array<{ evento_id: string; titulo?: string; erro: string }>;
}

export function novoResumoVazio(): ResumoSync {
  return {
    total_eventos_lidos: 0,
    criados: 0,
    atualizados: 0,
    cancelados: 0,
    rascunhos: 0,
    ignorados: 0,
    sem_efeito: 0,
    erros: [],
  };
}

// Ação retornada por sync_upsert_caso -> em qual balde do resumo ela cai.
export function contabilizarAcao(resumo: ResumoSync, acao: string): void {
  switch (acao) {
    case "caso_criado":
      resumo.criados++;
      break;
    case "rascunho_criado":
      resumo.rascunhos++;
      break;
    case "caso_atualizado":
      resumo.atualizados++;
      break;
    case "caso_cancelado":
      resumo.cancelados++;
      break;
    case "sem_efeito":
      resumo.sem_efeito++;
      break;
    default:
      // Ação desconhecida (ex.: a RPC ganhou um valor novo e este módulo
      // não foi atualizado) -- conta como erro em vez de silenciosamente
      // sumir do resumo.
      resumo.erros.push({
        evento_id: "(desconhecido)",
        erro: `sync_upsert_caso retornou uma ação não reconhecida: "${acao}"`,
      });
  }
}
