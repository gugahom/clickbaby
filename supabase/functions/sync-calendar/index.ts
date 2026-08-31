// Edge Function do sync do Google Calendar — fatia 2 (seção 7 do CLAUDE.md).
//
// Esta função é a COLA entre o parser (_shared/parse-evento.ts) e a RPC
// sync_upsert_caso: lê eventos do Calendar, parseia o título, resolve
// pacote/maternidade para id, e chama a RPC com tudo já resolvido. Nenhuma
// regra de negócio mora aqui — quem decide o que persistir é a RPC
// (SECURITY DEFINER); quem decide o que um título significa é o parser.
// Este arquivo só orquestra.
//
// Ainda NÃO tem cron configurado (próxima fatia) — invocação manual por
// enquanto. Ver instruções de configuração e teste no final deste arquivo.

import { createClient } from "npm:@supabase/supabase-js@2";
import { parseEventoCalendar } from "../_shared/parse-evento.ts";
import {
  autorizarChamada,
  contabilizarAcao,
  COR_CINZA_GOOGLE,
  eventoIndicaCancelamento,
  eventoTemApenasData,
  inicioDoEvento,
  type MaternidadeResumida,
  novoResumoVazio,
  type PacoteResumido,
  previsaoParaCasoConhecido,
  resolverMaternidadeId,
  resolverPacoteId,
  resolverPrevisaoEm,
  type ResumoSync,
} from "./logica.ts";

// -----------------------------------------------------------------------
// Janela de leitura — DUAS janelas, não uma. Constantes nomeadas, fácil de
// ajustar sem caçar números mágicos no meio do código.
//
// A PRIMEIRA VERSÃO DESTA MUDANÇA (31/08/2026, mesmo dia) juntava as duas
// coisas numa constante só e alargou de 3 para 21 dias. A intenção era
// certa — um caso ATRASADO fica aberto por semanas de propósito (invariante
// 3.5 do CLAUDE.md), e com 3 dias um evento assim saía da consulta ao Google
// antes do trabalho terminar, então nenhuma correção feita nele depois
// chegava ao sync. Mas alargar a janela de CONSULTA alargou junto a janela
// de INTAKE: no primeiro disparo depois do deploy, 18 eventos com mais de 10
// dias — nunca vistos pelo sync, porque a janela de 3 dias sempre os
// excluiu — viraram rascunho pendente de uma vez, muitos deles sem pacote
// ou maternidade reconhecíveis (histórico com formato de título antigo).
// O gestor viu isso acontecer e é o motivo desta segunda volta.
//
// A DISTINÇÃO QUE FALTAVA: "quanto tempo um caso JÁ CONHECIDO pode ficar
// aberto e ainda receber correção" é uma pergunta; "quanto tempo no passado
// um evento NUNCA VISTO ainda pode virar caso novo" é outra — e são
// perguntas com respostas diferentes. A primeira precisa ser larga (um caso
// atrasado trava semanas). A segunda precisa ficar estreita: intake é sobre
// o que está ACONTECENDO agora, não uma varredura do histórico do calendar
// toda vez que o cron roda.
//
// DIAS_PARA_TRAS_CONSULTA (21) é só o que pedimos ao Google — a janela
// ampla, usada para reencontrar casos JÁ ABERTOS cujo evento ainda existe
// nela (correção, card cinza) e para a checagem de deleção
// (cancelarEventosDeletados). DIAS_PARA_TRAS_NOVO_CASO (3, o valor
// original) é o teto de idade que um evento DESCONHECIDO pode ter para
// ainda virar caso — ver a checagem em processarEvento, logo abaixo do
// parse. Um evento antigo e desconhecido não é processado; um evento
// antigo mas já ligado a um caso aberto continua sendo.
// -----------------------------------------------------------------------

const DIAS_PARA_TRAS_CONSULTA = 21;
const DIAS_PARA_TRAS_NOVO_CASO = 3;
const SEMANAS_PARA_FRENTE = 6;

const ESCOPO_CALENDAR_SOMENTE_LEITURA = "https://www.googleapis.com/auth/calendar.readonly";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

interface ContaServicoGoogle {
  client_email: string;
  private_key: string;
}

interface EventoGoogle {
  id: string;
  summary?: string;
  colorId?: string;
  start?: { dateTime?: string; date?: string };
}

// -----------------------------------------------------------------------
// Autenticação com a service account (JWT Bearer flow, RFC 7523) — só com
// o que o Deno já tem (Web Crypto), sem lib de JWT. Justificativa: assinar
// um JWT RS256 é ~15 linhas com crypto.subtle; instalar uma dependência
// pra isso trocaria pouco código por uma superfície de manutenção maior.
// -----------------------------------------------------------------------

function base64UrlDeBytes(bytes: Uint8Array): string {
  let binario = "";
  for (const b of bytes) binario += String.fromCharCode(b);
  return btoa(binario).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDeTexto(texto: string): string {
  return base64UrlDeBytes(new TextEncoder().encode(texto));
}

function pemParaArrayBuffer(pem: string): ArrayBuffer {
  const corpo = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const binario = atob(corpo);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes.buffer;
}

async function obterAccessToken(contaServico: ContaServicoGoogle): Promise<string> {
  const agora = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: contaServico.client_email,
    scope: ESCOPO_CALENDAR_SOMENTE_LEITURA,
    aud: GOOGLE_TOKEN_URL,
    iat: agora,
    exp: agora + 3600,
  };

  const semAssinar = `${base64UrlDeTexto(JSON.stringify(header))}.${base64UrlDeTexto(JSON.stringify(payload))}`;

  const chave = await crypto.subtle.importKey(
    "pkcs8",
    pemParaArrayBuffer(contaServico.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const assinatura = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    chave,
    new TextEncoder().encode(semAssinar),
  );

  const jwt = `${semAssinar}.${base64UrlDeBytes(new Uint8Array(assinatura))}`;

  const resposta = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!resposta.ok) {
    throw new Error(`Falha ao obter access token do Google (${resposta.status}): ${await resposta.text()}`);
  }

  const dados = await resposta.json();
  return dados.access_token as string;
}

// -----------------------------------------------------------------------
// Leitura de eventos — paginada, janela configurável acima.
// -----------------------------------------------------------------------

async function buscarEventos(
  accessToken: string,
  calendarId: string,
  timeMin: string,
  timeMax: string,
): Promise<EventoGoogle[]> {
  const eventos: EventoGoogle[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    );
    url.searchParams.set("timeMin", timeMin);
    url.searchParams.set("timeMax", timeMax);
    url.searchParams.set("singleEvents", "true"); // expande recorrências
    url.searchParams.set("maxResults", "250");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const resposta = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!resposta.ok) {
      throw new Error(
        `Falha ao buscar eventos do Calendar (${resposta.status}): ${await resposta.text()}`,
      );
    }

    const dados = await resposta.json();
    eventos.push(...(dados.items ?? []));
    pageToken = dados.nextPageToken;
  } while (pageToken);

  return eventos;
}

// -----------------------------------------------------------------------
// Processamento de um evento — parseia, resolve, chama a RPC. Erro aqui
// nunca deve derrubar o lote inteiro (tratado no chamador).
// -----------------------------------------------------------------------

async function processarEvento(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  evento: EventoGoogle,
  pacotes: readonly PacoteResumido[],
  maternidades: readonly MaternidadeResumida[],
  idsAbertosConhecidos: ReadonlySet<string>,
  limiteNovoCaso: Date,
): Promise<string> {
  const resultadoParse = parseEventoCalendar(evento.summary ?? "");

  if (resultadoParse.tipo === "ignorar") {
    return "ignorado";
  }

  // FORA DA JANELA DE INTAKE (31/08/2026, correção do mesmo dia — ver a nota
  // grande no topo do arquivo). Um evento com mais de DIAS_PARA_TRAS_NOVO_CASO
  // dias e que NENHUM caso aberto já referencia não vira caso: a janela ampla
  // de consulta (DIAS_PARA_TRAS_CONSULTA) existe para reencontrar casos JÁ
  // ABERTOS, não para descobrir histórico do Calendar que o sync nunca viu.
  // Um evento conhecido (já é o event_id de um caso aberto) passa direto —
  // é exatamente o que essa janela ampla precisa continuar cobrindo.
  const conhecido = idsAbertosConhecidos.has(evento.id);

  if (!conhecido) {
    const inicio = inicioDoEvento(evento.start);
    if (inicio && inicio < limiteNovoCaso) {
      return "fora_da_janela";
    }
  }

  const cancelado = eventoIndicaCancelamento(evento.colorId);

  // O DIA DE UM CASO CONHECIDO SEMPRE ACOMPANHA O CALENDAR, com ou sem hora
  // (31/08/2026, a pedido do gestor). "Sem hora não vira caso" (abaixo) é
  // regra de INTAKE — um evento nunca visto ainda não tem informação
  // suficiente pra nascer. Um caso que JÁ EXISTE e foi reagendado é outra
  // pergunta: a equipe arrasta o card pro dia certo e às vezes perde a hora
  // nesse gesto, e o card não pode continuar mostrando o dia ERRADO só por
  // isso. Ver `previsaoParaCasoConhecido` em logica.ts.
  const previsaoEm = conhecido
    ? previsaoParaCasoConhecido(evento.start)
    : resolverPrevisaoEm(evento.start);

  if (!previsaoEm && !cancelado) {
    // DIA MARCADO, HORA AINDA NÃO, e o evento é DESCONHECIDO (30/08/2026, a
    // pedido do gestor). Um evento de dia inteiro (só `date`, sem
    // `dateTime`) significa que a equipe já sabe o DIA mas ainda não
    // decidiu a HORA — não é um cadastro incompleto por erro, é um
    // cadastro incompleto DE PROPÓSITO. O Quadro ordena e destaca por
    // horário; um card sem hora não tem o que mostrar ali, e mostrar
    // meia-noite como se fosse hora real inventaria um dado que ninguém
    // informou.
    //
    // Por isso NENHUM caso nasce aqui: nem caso normal, nem rascunho. O
    // evento volta a ser lido em todo disparo seguinte (está dentro da
    // janela), e assim que alguém adicionar a hora no Calendar, o próximo
    // ciclo do cron cria o caso normalmente. Um evento CONHECIDO nunca cai
    // aqui — `previsaoParaCasoConhecido` só devolve null se não houver
    // `date` nem `dateTime` nenhum, o que é erro de verdade.
    if (eventoTemApenasData(evento.start)) {
      return "sem_horario";
    }
    throw new Error("Evento sem start.dateTime nem start.date — não dá pra derivar previsao_em.");
  }

  const pacoteId = resolverPacoteId(resultadoParse.pacote_bruto, pacotes);
  const maternidadeId = resolverMaternidadeId(resultadoParse.maternidade_sigla, maternidades);

  const { data: acao, error } = await supabase.rpc("sync_upsert_caso", {
    p_google_event_id: evento.id,
    p_mae_nome: resultadoParse.mae,
    p_bebe_nome: resultadoParse.bebe,
    p_pacote_id: pacoteId,
    p_maternidade_id: maternidadeId,
    p_previsao_em: previsaoEm,
    p_cor_calendar: evento.colorId ?? null,
    p_cancelado: cancelado,
  });

  if (error) {
    throw new Error(`sync_upsert_caso falhou: ${error.message}`);
  }

  return acao as string;
}

// -----------------------------------------------------------------------
// Detecção de evento DELETADO — sem passar pelo card cinza.
// -----------------------------------------------------------------------
//
// ATÉ 31/08/2026 só o card cinza cancelava (eventoIndicaCancelamento). Um
// evento apagado direto do Calendar simplesmente para de vir na resposta da
// API — não sobra rastro nenhum nela —, e o caso ficava aberto no Quadro
// pra sempre, órfão do evento que o originou.
//
// COMO SE PROVA QUE FOI DELEÇÃO E NÃO "SÓ ESTÁ FORA DA JANELA": um evento
// cujo `previsao_em` já registrado cai DENTRO de [timeMin, timeMax] — a
// mesma janela que acabou de ser consultada — deveria necessariamente ter
// vindo na resposta do Google, se ainda existisse. Se o id dele não está no
// lote e a data dele estava dentro do alcance da consulta, não sobrou outra
// explicação: o evento foi apagado. Fora da janela não conta — aí o
// silêncio é falta de alcance, não deleção.
interface CasoAbertoResumido {
  google_calendar_event_id: string;
  previsao_em: string | null;
}

/**
 * `abertos` chega já lido pelo chamador — a mesma consulta alimenta tanto o
 * gate de intake (idsAbertosConhecidos, em processarEvento) quanto esta
 * checagem. Um SELECT só, dois usos, e as duas partes enxergam exatamente o
 * mesmo instantâneo do banco.
 */
async function cancelarEventosDeletados(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  eventos: readonly EventoGoogle[],
  abertos: readonly CasoAbertoResumido[],
  timeMin: string,
  timeMax: string,
  resumo: ResumoSync,
): Promise<void> {
  const idsNoCalendar = new Set(eventos.map((e) => e.id));

  for (const caso of abertos) {
    // Só entra na suspeita de deleção quem CAÍA dentro da janela consultada
    // — é o que prova que o evento DEVERIA ter vindo na resposta do Google
    // se ainda existisse (ver a nota grande em cima da função, no topo do
    // arquivo original desta checagem).
    if (!caso.previsao_em || caso.previsao_em < timeMin || caso.previsao_em > timeMax) continue;

    const eventId = caso.google_calendar_event_id;
    if (idsNoCalendar.has(eventId)) continue;

    const { data: acao, error: erroCancelar } = await supabase.rpc("sync_cancelar_caso", {
      p_google_event_id: eventId,
    });

    if (erroCancelar) {
      resumo.erros.push({ evento_id: eventId, erro: `sync_cancelar_caso falhou: ${erroCancelar.message}` });
      continue;
    }
    if (acao === "caso_cancelado") resumo.deletados++;
  }
}

// -----------------------------------------------------------------------
// Handler HTTP
// -----------------------------------------------------------------------

Deno.serve(async (req) => {
  const resumo = novoResumoVazio();

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  // Segunda camada, ANTES de qualquer trabalho. O gateway com
  // verify_jwt = true já barrou quem não tem JWT válido; aqui barra quem
  // tem o JWT ERRADO — e a anon key, que é pública, é o JWT errado.
  // Ver o comentário longo em logica.ts sobre por que as duas camadas não
  // se sobrepõem.
  const autorizacao = autorizarChamada(
    req.headers.get("Authorization"),
    supabaseServiceRoleKey ?? "",
  );
  if (!autorizacao.autorizado) {
    console.warn(`sync-calendar: chamada recusada (${autorizacao.motivo})`);
    return new Response(
      JSON.stringify({ erro: "nao autorizado" }, null, 2),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const contaServicoJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
    const calendarId = Deno.env.get("GOOGLE_CALENDAR_ID");

    if (!contaServicoJson) throw new Error("Secret GOOGLE_SERVICE_ACCOUNT_JSON não configurado.");
    if (!calendarId) throw new Error("Secret GOOGLE_CALENDAR_ID não configurado.");
    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes (deveriam ser injetados automaticamente pelo runtime da Edge Function).");
    }

    const contaServico: ContaServicoGoogle = JSON.parse(contaServicoJson);
    const accessToken = await obterAccessToken(contaServico);

    const agora = Date.now();
    const timeMin = new Date(agora - DIAS_PARA_TRAS_CONSULTA * 24 * 60 * 60 * 1000).toISOString();
    const timeMax = new Date(agora + SEMANAS_PARA_FRENTE * 7 * 24 * 60 * 60 * 1000).toISOString();
    const limiteNovoCaso = new Date(agora - DIAS_PARA_TRAS_NOVO_CASO * 24 * 60 * 60 * 1000);

    const eventos = await buscarEventos(accessToken, calendarId, timeMin, timeMax);
    resumo.total_eventos_lidos = eventos.length;

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    const [
      { data: pacotes, error: erroPacotes },
      { data: maternidades, error: erroMaternidades },
      { data: abertos, error: erroAbertos },
    ] = await Promise.all([
      supabase.from("pacotes").select("id, nome"),
      supabase.from("maternidades").select("id, sigla"),
      // Um SELECT só, dois usos: o gate de intake (idsAbertosConhecidos,
      // abaixo) e a checagem de deleção (cancelarEventosDeletados, no fim).
      // Sem bound de data — o gate de intake precisa saber se o evento é
      // conhecido independente de quão velho `previsao_em` seja.
      supabase
        .from("casos")
        .select("google_calendar_event_id, previsao_em")
        .not("google_calendar_event_id", "is", null)
        .not("status_operacional", "in", "(encerrado,cancelado)"),
    ]);

    if (erroPacotes) throw new Error(`Falha ao ler pacotes: ${erroPacotes.message}`);
    if (erroMaternidades) throw new Error(`Falha ao ler maternidades: ${erroMaternidades.message}`);
    if (erroAbertos) throw new Error(`Falha ao ler casos abertos: ${erroAbertos.message}`);

    const casosAbertos = (abertos ?? []) as CasoAbertoResumido[];
    const idsAbertosConhecidos = new Set(casosAbertos.map((c) => c.google_calendar_event_id));

    for (const evento of eventos) {
      try {
        const acao = await processarEvento(
          supabase,
          evento,
          pacotes as PacoteResumido[],
          maternidades as MaternidadeResumida[],
          idsAbertosConhecidos,
          limiteNovoCaso,
        );
        if (acao === "ignorado") {
          resumo.ignorados++;
        } else if (acao === "sem_horario") {
          resumo.sem_horario++;
        } else if (acao === "fora_da_janela") {
          resumo.fora_da_janela++;
        } else {
          contabilizarAcao(resumo, acao);
        }
      } catch (erroEvento) {
        // Um evento problemático não pode travar o lote inteiro.
        //
        // O título NÃO entra aqui nem no console: ele carrega nome de mãe e
        // de bebê, e a seção 10 do CLAUDE.md proíbe isso tanto em resposta
        // quanto em log — o log da Edge Function é retido e visível no
        // painel, ou seja, é telemetria como qualquer outra. O evento_id é
        // suficiente para achar o evento no Calendar.
        resumo.erros.push({
          evento_id: evento.id,
          erro: erroEvento instanceof Error ? erroEvento.message : String(erroEvento),
        });
      }
    }

    // Fecha o lote verificando quem SUMIU — ver a nota grande em
    // cancelarEventosDeletados. Vem depois do laço principal de propósito:
    // precisa da lista completa de ids que o Google devolveu AGORA.
    await cancelarEventosDeletados(supabase, eventos, casosAbertos, timeMin, timeMax, resumo);

    return new Response(JSON.stringify(resumo, null, 2), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (erro) {
    return new Response(
      JSON.stringify({
        erro: erro instanceof Error ? erro.message : String(erro),
        ...resumo,
      }, null, 2),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});

// =============================================================================
// COMO CONFIGURAR E TESTAR (ver também a mensagem que acompanha este código)
//
// 1. Secrets (nunca a chave no código):
//      supabase secrets set GOOGLE_SERVICE_ACCOUNT_JSON="$(cat caminho/para/service-account.json)"
//      supabase secrets set GOOGLE_CALENDAR_ID="seu-calendario@group.calendar.google.com"
//
//    SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY NÃO precisam ser configurados
//    -- o runtime da Edge Function já injeta os dois automaticamente.
//
// 2. IMPORTANTE, fora do código: a conta de serviço precisa ser
//    convidada como leitora do calendário (Configurações do Calendar ->
//    "Compartilhar com pessoas específicas" -> adicionar o client_email
//    da service account, permissão "Ver todos os detalhes do evento").
//    Sem isso, toda chamada à API retorna 404/403 mesmo com a
//    autenticação certa.
//
// 3. QUEM PODE CHAMAR: so service_role. A anon key NAO serve, de proposito --
//    ela e publica (vai no bundle do frontend), e ate esta trava existir
//    qualquer pessoa que lesse o bundle disparava o sync e recebia de volta
//    nome de mae e bebe no corpo da resposta. Ver autorizarChamada em
//    logica.ts e [functions.sync-calendar] em config.toml.
//
// 4. Testar localmente:
//      supabase functions serve sync-calendar --env-file supabase/.env.local
//      curl -i --request POST http://127.0.0.1:54321/functions/v1/sync-calendar \
//        --header "Authorization: Bearer $SERVICE_ROLE_KEY_LOCAL"
//
// 5. Testar no remoto:
//      supabase functions deploy sync-calendar
//      curl -i --request POST https://<project-ref>.supabase.co/functions/v1/sync-calendar \
//        --header "Authorization: Bearer $SERVICE_ROLE_KEY"
//
//    A chave vem de variavel de ambiente na hora de chamar, nunca colada
//    num arquivo do repo.
//
// 6. QUEM CHAMA EM PRODUCAO: o job "sync-calendar" do pg_cron, a cada
//    minuto (migration 20260828015512, intervalo revisado em
//    20260831132545). O disparo sai de dentro do banco via
//    pg_net, com a URL e a chave lidas do Vault -- nenhum cliente precisa
//    delas. Ate essa migration NADA chamava esta funcao automaticamente: ela
//    estava no ar e o intake principal do sistema era 100% manual.
//
//    Ligar num ambiente e um gesto explicito:
//      SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... //        node scripts/configurar-sync-cron.mjs
//    Sem os segredos, o job acorda e volta a dormir sem erro -- e o que mantem
//    o banco local quieto depois de um db reset.
//
//    Conferir o que ele fez:
//      select * from cron.job_run_details order by start_time desc limit 10;
// =============================================================================
