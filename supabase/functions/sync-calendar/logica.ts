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
  // SEM o título do evento, deliberadamente. O título do Calendar é
  // "MÃE/BEBÊ - PACOTE [MATERNIDADE]" — nome de mãe e de recém-nascido, que
  // a seção 10 do CLAUDE.md trata como dado sensível de saúde e de menor.
  // O evento_id resolve o debug sem isso: é um id opaco do Google, e quem
  // precisa investigar abre o evento por ele no próprio Calendar.
  erros: Array<{ evento_id: string; erro: string }>;
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

// -----------------------------------------------------------------------
// Autorização: só service_role chama o sync
// -----------------------------------------------------------------------
//
// POR QUE ISTO EXISTE
// `verify_jwt = true` (o padrão da plataforma, agora versionado em
// config.toml) exige uma credencial válida do projeto. Isso soa como
// proteção e não é: a ANON KEY é uma credencial válida, e ela é pública
// por definição — vai no bundle do frontend. Sem a checagem abaixo,
// qualquer pessoa que abrisse o DevTools do site disparava o sync e
// recebia de volta o resumo do lote.
//
// DOIS FORMATOS DE CREDENCIAL, DESCOBERTO NA PRÁTICA
// O projeto tem chaves nos dois formatos que o Supabase suporta hoje:
//   - legado: um JWT com claim `role` ("service_role" ou "anon");
//   - novo:   `sb_secret_...` / `sb_publishable_...`, que NÃO são JWT e
//             não carregam claim nenhuma.
// O runtime da Edge Function injeta SUPABASE_SERVICE_ROLE_KEY no formato
// NOVO. Uma checagem que só comparasse com ela recusaria a service_role
// key legada — que é credencial legítima do mesmo projeto. Foi exatamente
// o que aconteceu na primeira tentativa de invocar em produção.
//
// Por isso há dois caminhos de aceite, e eles têm garantias DIFERENTES:
//
//   1. Igualdade com a chave injetada. Não depende de mais nada: quem não
//      tem a chave não passa. Cobre o formato novo.
//
//   2. JWT com claim role = "service_role". Cobre o formato legado, e
//      DEPENDE de `verify_jwt = true` ter validado a assinatura antes —
//      esta função não verifica assinatura, só lê a claim. Se alguém
//      puser verify_jwt = false, este caminho passa a aceitar JWT forjado.
//      É por isso que a linha está versionada em config.toml com este
//      aviso ao lado, e não deixada no padrão do painel.
//
// Nada além desses dois passa: anon nos dois formatos cai fora (o JWT anon
// tem role "anon"; a publishable não é JWT e não é igual à secret).

/** Compara sem vazar em quanto tempo as strings divergem. */
function comparaConstante(a: string, b: string): boolean {
  // O comprimento da chave não é segredo (os dois formatos são públicos),
  // só o conteúdo — por isso sair cedo aqui não entrega nada.
  if (a.length !== b.length) return false;
  let diferenca = 0;
  for (let i = 0; i < a.length; i++) {
    diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diferenca === 0;
}

/**
 * Lê as claims de um JWT. NÃO verifica assinatura — quem verifica é o
 * gateway, com verify_jwt = true. Ver o caminho 2 acima.
 */
export function lerClaims(token: string): Record<string, unknown> | null {
  const partes = token.split(".");
  if (partes.length !== 3) return null;
  try {
    const base64 = partes[1].replace(/-/g, "+").replace(/_/g, "/");
    const completo = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const claims = JSON.parse(atob(completo));
    return typeof claims === "object" && claims !== null ? claims : null;
  } catch {
    return null;
  }
}

export interface ResultadoAutorizacao {
  autorizado: boolean;
  /** Motivo da recusa, para o log do servidor. Nunca ecoa token nem chave. */
  motivo?: string;
}

export function autorizarChamada(
  cabecalhoAuthorization: string | null | undefined,
  serviceRoleKey: string,
): ResultadoAutorizacao {
  const cabecalho = (cabecalhoAuthorization ?? "").trim();
  const casa = cabecalho.match(/^Bearer\s+(.+)$/i);
  if (!casa) return { autorizado: false, motivo: "sem Authorization: Bearer" };

  const token = casa[1].trim();

  // Caminho 1 — a chave injetada, em qualquer formato.
  if (serviceRoleKey && comparaConstante(token, serviceRoleKey)) {
    return { autorizado: true };
  }

  // Caminho 2 — JWT legado cuja assinatura o gateway já validou.
  const claims = lerClaims(token);
  if (claims === null) {
    return { autorizado: false, motivo: "credencial não é a service_role key nem um JWT" };
  }

  const papel = typeof claims.role === "string" ? claims.role : null;
  if (papel !== "service_role") {
    return { autorizado: false, motivo: `papel "${papel ?? "ausente"}" não pode disparar o sync` };
  }

  return { autorizado: true };
}
