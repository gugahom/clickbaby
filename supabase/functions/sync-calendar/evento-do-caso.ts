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

export function montarEventoDoCaso(caso: CasoParaOGoogle): Record<string, unknown> {
  const inicio = new Date(caso.previsao_em);
  return {
    id: idDoEventoDoCaso(caso.caso_id),
    summary: montarTituloDoEvento(caso),
    // Nada além disto na descrição: o texto do evento fica no Google, e o
    // que o sistema sabe do caso (situação clínica, links) não sai daqui.
    description: "Criado pelo calendário do sistema ClickBaby.",
    start: { dateTime: inicio.toISOString(), timeZone: "America/Sao_Paulo" },
    end: { dateTime: new Date(inicio.getTime() + DURACAO_MS).toISOString(), timeZone: "America/Sao_Paulo" },
    ...(caso.cor_calendar ? { colorId: caso.cor_calendar } : {}),
  };
}
