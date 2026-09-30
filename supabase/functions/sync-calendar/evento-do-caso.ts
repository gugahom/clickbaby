// O EVENTO DO GOOGLE A PARTIR DE UM CASO CRIADO NO SISTEMA (30/09/2026).
//
// O caminho de volta do sync: o calendário do sistema cria o caso, e este
// módulo diz como ele aparece na agenda do Google — que continua completa como
// contingência (decisão do usuário).
//
// O TÍTULO É O QUE A EQUIPE JÁ ESCREVE, "MÃE/BEBÊ - PACOTE - SIGLA", e a regra
// que mais importa aqui é que ele VOLTE IGUAL: depois de ligado, o sync relê o
// título a cada 25 segundos e atualiza o caso a partir dele. Um título que o
// parser lesse com outro pacote trocaria o checklist do caso sozinho. O teste
// `evento-do-caso.test.ts` passa todo pacote e toda maternidade do cadastro
// pelo parser e exige o mesmo resultado.
//
// O ID DO EVENTO VEM DO ID DO CASO. O Google aceita que o cliente escolha o id
// (letras a–v e dígitos), e isso torna a escrita idempotente: se o ciclo cair
// depois de criar o evento e antes de ligar o id ao caso, o próximo ciclo tenta
// criar de novo, recebe "já existe" (409) e só liga. Sem isso, cada falha no
// meio deixaria um evento duplicado na agenda.

export interface CasoParaOGoogle {
  caso_id: string;
  mae_nome: string;
  bebe_nome: string | null;
  pacote_nome: string;
  maternidade_sigla: string;
  click_home: boolean;
  previsao_em: string;
  cor_calendar: string | null;
  /** Hora a definir (30/09/2026): o evento é de DIA INTEIRO. */
  previsao_sem_hora?: boolean;
  /** A hora marcada da cesárea, e as observações do calendário (30/09/2026). */
  cesarea_em?: string | null;
  observacao_calendar?: string | null;
}

/** Sem nome de bebê ainda, o título leva "BEBÊ": o parser exige a barra. */
export const BEBE_SEM_NOME = "BEBÊ";

/** Quanto o evento dura na agenda. A equipe usa blocos de uma hora. */
const DURACAO_MS = 60 * 60 * 1000;

/**
 * "ANA/JOSÉ - STANDARD + CLICK HOME - HSC". O adicional vai GRUDADO no pacote,
 * como a equipe escreve ("STANDARD + CLICK HOME"); o parser o reconhece em
 * qualquer ponto do título.
 */
export function montarTituloDoEvento(caso: Pick<CasoParaOGoogle, "mae_nome" | "bebe_nome" | "pacote_nome" | "maternidade_sigla" | "click_home">): string {
  const pacote = caso.click_home ? `${caso.pacote_nome} + CLICK HOME` : caso.pacote_nome;
  return `${caso.mae_nome}/${caso.bebe_nome ?? BEBE_SEM_NOME} - ${pacote} - ${caso.maternidade_sigla}`;
}

/** "cb" + o uuid sem hífens: só dígitos e a–f, dentro do alfabeto do Google. */
export function idDoEventoDoCaso(casoId: string): string {
  return `cb${casoId.replace(/-/g, "").toLowerCase()}`;
}

/** O dia em Brasília de um instante, "2026-10-14". */
export function diaEmSaoPaulo(instante: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(instante));
}

function diaSeguinte(dia: string): string {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Início e fim do evento. HORA A DEFINIR (30/09/2026) é evento de DIA INTEIRO,
 * como a equipe já marca no Google: `date` no início e o dia seguinte no fim
 * (o Google conta o fim de um dia inteiro como exclusivo).
 */
function momentos(previsao: string, semHora: boolean, duracaoMs: number) {
  if (semHora) {
    const dia = diaEmSaoPaulo(previsao);
    return { start: { date: dia }, end: { date: diaSeguinte(dia) } };
  }
  const inicio = new Date(previsao);
  return {
    start: { dateTime: inicio.toISOString(), timeZone: "America/Sao_Paulo" },
    end: { dateTime: new Date(inicio.getTime() + duracaoMs).toISOString(), timeZone: "America/Sao_Paulo" },
  };
}

/** "14:30" em Brasília. */
function horaEmSaoPaulo(instante: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .format(new Date(instante));
}

/**
 * A DESCRIÇÃO do evento que o SISTEMA criou: as observações escritas no
 * calendário (o cadastro da família, no template da equipe), a hora da
 * cesárea, e a marca de origem. Só vale para caso criado pelo sistema — a
 * descrição de um evento que a equipe criou no Google é dela, e não é
 * reescrita (ver a migration 20260930192224).
 */
export function descricaoDoEvento(caso: Pick<CasoParaOGoogle, "cesarea_em" | "observacao_calendar">): string {
  const partes: string[] = [];
  if (caso.observacao_calendar) partes.push(caso.observacao_calendar);
  if (caso.cesarea_em) partes.push(`Cesárea às ${horaEmSaoPaulo(caso.cesarea_em)}`);
  partes.push("Criado pelo calendário do sistema ClickBaby.");
  return partes.join("\n\n");
}

export function montarEventoDoCaso(caso: CasoParaOGoogle): Record<string, unknown> {
  return {
    id: idDoEventoDoCaso(caso.caso_id),
    summary: montarTituloDoEvento(caso),
    // Só o que a pessoa escreveu no calendário para ir à agenda: o que o
    // sistema sabe do caso (situação clínica, links) não sai daqui.
    description: descricaoDoEvento(caso),
    ...momentos(caso.previsao_em, caso.previsao_sem_hora === true, DURACAO_MS),
    ...(caso.cor_calendar ? { colorId: caso.cor_calendar } : {}),
  };
}

// -----------------------------------------------------------------------------
// A MUDANÇA FEITA NO SISTEMA, LEVADA AO EVENTO QUE JÁ EXISTE (30/09/2026).
// -----------------------------------------------------------------------------
//
// Uma pessoa editou ou cancelou o caso no sistema, e o evento no Google precisa
// acompanhar — senão o sync, que relê a agenda a cada ciclo, traria o valor
// velho de volta (a trava no banco segura isso só enquanto a marca existe).
//
// O EVENTO INTEIRO VOLTA (PUT), a partir do que o Google devolveu no GET: o que
// o sistema não controla — descrição, convidados, lembretes — fica como a
// equipe deixou. Um PATCH seria menor, mas "voltar para a cor padrão" num PATCH
// depende de o Google tratar `null` como apagar; com o evento inteiro, a cor
// padrão é simplesmente não mandar `colorId`.
//
// A DURAÇÃO FICA: o evento que a equipe marcou com duas horas continua com duas
// horas na hora nova. Evento de dia inteiro vira evento com hora (a pessoa
// escolheu uma), de uma hora.
//
// O ASTERISCO FICA: "*" antes do nome é uma marca da equipe cujo significado
// ainda não foi confirmado (seção 7 do CLAUDE.md). Reescrever o título sem ele
// apagaria uma informação que o sistema nem sabe ler.
//
// CANCELADO SÓ MUDA A COR, para o cinza: é a convenção de cancelamento da
// própria equipe, e o título fica — a agenda continua dizendo de quem era.

export interface CasoParaAtualizar {
  caso_id: string;
  google_event_id: string;
  versao: number;
  cancelado: boolean;
  mae_nome: string;
  bebe_nome: string | null;
  pacote_nome: string | null;
  maternidade_sigla: string | null;
  click_home: boolean;
  previsao_em: string | null;
  cor_calendar: string | null;
  previsao_sem_hora?: boolean;
  cesarea_em?: string | null;
  observacao_calendar?: string | null;
  /** O caso foi criado pelo sistema: a descrição do evento é nossa. */
  descricao_do_sistema?: boolean;
}

interface MomentoGoogle {
  dateTime?: string;
  date?: string;
  timeZone?: string;
}

export interface EventoDoGoogle {
  summary?: string;
  colorId?: string;
  start?: MomentoGoogle;
  end?: MomentoGoogle;
  [campo: string]: unknown;
}

/** O cinza do Google — o "card cinza" que a equipe usa para cancelar. */
export const COR_DO_CANCELAMENTO = "8";

function duracaoEmMs(evento: EventoDoGoogle): number {
  const inicio = evento.start?.dateTime ? Date.parse(evento.start.dateTime) : NaN;
  const fim = evento.end?.dateTime ? Date.parse(evento.end.dateTime) : NaN;
  const duracao = fim - inicio;
  return Number.isFinite(duracao) && duracao > 0 ? duracao : DURACAO_MS;
}

export function atualizarEventoDoCaso(caso: CasoParaAtualizar, atual: EventoDoGoogle): EventoDoGoogle {
  if (caso.cancelado) {
    return { ...atual, colorId: COR_DO_CANCELAMENTO };
  }
  if (!caso.pacote_nome || !caso.maternidade_sigla || !caso.previsao_em) {
    // A trigger não marca caso sem pacote e maternidade, e editar_caso exige
    // previsão: chegar aqui é defeito, e reescrever o título com buracos seria
    // pior que não escrever.
    throw new Error("Caso sem pacote, maternidade ou previsão — o título não se monta.");
  }
  const titulo = montarTituloDoEvento({
    mae_nome: caso.mae_nome,
    bebe_nome: caso.bebe_nome,
    pacote_nome: caso.pacote_nome,
    maternidade_sigla: caso.maternidade_sigla,
    click_home: caso.click_home,
  });
  const asterisco = (atual.summary ?? "").trimStart().startsWith("*");
  const { colorId: _corAntiga, ...resto } = atual;
  return {
    ...resto,
    summary: asterisco ? `*${titulo}` : titulo,
    ...(caso.descricao_do_sistema ? { description: descricaoDoEvento(caso) } : {}),
    ...momentos(caso.previsao_em, caso.previsao_sem_hora === true, duracaoEmMs(atual)),
    ...(caso.cor_calendar ? { colorId: caso.cor_calendar } : {}),
  };
}
