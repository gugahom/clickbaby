import type { EtapaQuadro, StatusEtapa } from '../types'

/**
 * Três faixas, não duas.
 *
 * A trilha no banco tem dois valores (acompanhamento e edição), e o REELS sai
 * de dentro da edição. É uma separação de TELA, e é deliberada: o gestor pediu
 * que a edição de reels aconteça na seção própria — a estação de edição é
 * outro lugar físico, com outra pessoa.
 *
 * Vive na lib, e não no componente, porque agora tem DOIS leitores: a fita
 * completa do cartão e o resumo compacto do modo TV. Enquanto a definição
 * morava dentro de um deles, o outro teria que copiá-la — e duas cópias da
 * pergunta "isto é edição ou é reels" divergem na primeira vez que alguém
 * mexer numa só.
 */
export type Faixa = 'acompanhamento' | 'edicao' | 'reels'

export const ROTULO_FAIXA: Record<Faixa, string> = {
  acompanhamento: 'Acompanhamento',
  edicao: 'Edição',
  reels: 'Reels',
}

/**
 * O mesmo rótulo, abreviado, para o resumo compacto do modo TV.
 *
 * Medido: com "ACOMPANHAMENTO" por extenso as três faixas pedem 628px numa
 * coluna que oferece 561, e o resumo quebra em duas linhas — 29px a mais por
 * cartão, vezes todos os cartões da tela. "ACOMP." devolve 83px e a linha
 * fecha.
 *
 * Abreviar não é encolher: o corpo continua em 11px, que é o que a TV precisa.
 * E a leitura não sofre porque a ordem é sempre a mesma e a palavra aparece em
 * todo cartão — depois do segundo, ninguém lê o rótulo, só conta a posição.
 * O nome inteiro continua na fita do cartão aberto.
 */
export const ROTULO_FAIXA_CURTO: Record<Faixa, string> = {
  acompanhamento: 'Acomp.',
  edicao: 'Edição',
  reels: 'Reels',
}

/** As três faixas de um caso, sempre nesta ordem, sempre as três. */
export interface FaixaDeEtapas {
  faixa: Faixa
  etapas: EtapaQuadro[]
}

/**
 * A divisão em faixas, num lugar só.
 *
 * A fita completa e o resumo compacto precisam concordar sobre o que é
 * "edição" e o que é "reels" — se divergirem, o mesmo caso conta uma coisa
 * aberto e outra fechado, e quem confia no resumo da TV olha o card e vê
 * número diferente.
 *
 * Tupla de três, não lista: os chamadores desestruturam por posição, e um
 * `find` por faixa devolveria `undefined` que ninguém sabe tratar.
 */
export function faixasDoCaso(
  etapas: EtapaQuadro[],
): readonly [FaixaDeEtapas, FaixaDeEtapas, FaixaDeEtapas] {
  return [
    {
      faixa: 'acompanhamento',
      etapas: etapas.filter((e) => e.trilha === 'acompanhamento'),
    },
    {
      faixa: 'edicao',
      etapas: etapas.filter((e) => e.trilha === 'edicao' && e.tipo !== 'reels'),
    },
    { faixa: 'reels', etapas: etapas.filter((e) => e.tipo === 'reels') },
  ]
}

/**
 * A etapa que responde "onde esta faixa está agora".
 *
 * A ordem de prioridade não é arbitrária, é a ordem em que a pergunta importa
 * para quem olha a tela da parede:
 *
 *   1. o que está ACONTECENDO — em andamento, e as duas fases do vídeo do
 *      MASTER, que são trabalho em curso com outro nome;
 *   2. o que PAROU no meio — pausada, que é o que precisa de alguém;
 *   3. o que tem DONO mas não começou — atribuída;
 *   4. o que vem A SEGUIR — a primeira pendente por `ordem`.
 *
 * Devolve `null` só quando toda a faixa está concluída ou dispensada. Aí não
 * há "atual": a faixa acabou, e quem chama mostra isso em vez de uma etapa.
 */
export function etapaAtualDaFaixa(etapas: EtapaQuadro[]): EtapaQuadro | null {
  const peso: Record<StatusEtapa, number> = {
    em_andamento: 0,
    em_alteracao: 0,
    pronto_para_entrega: 0,
    pausada: 1,
    atribuida: 2,
    pendente: 3,
    concluida: 9,
    dispensada: 9,
  }

  const candidatas = etapas.filter((e) => peso[e.status] < 9)
  if (candidatas.length === 0) return null

  return (
    [...candidatas].sort(
      (a, b) => peso[a.status] - peso[b.status] || a.ordem - b.ordem || a.rodada - b.rodada,
    )[0] ?? null
  )
}
