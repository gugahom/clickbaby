/**
 * AS ONZE CORES DE EVENTO DO GOOGLE CALENDAR, pelo `colorId` que a API usa —
 * com o nome que aparece no menu de cor da agenda em português, para a equipe
 * reconhecer "Mirtilo" e não um número.
 *
 * É a paleta ATUAL do Google (a de 2022 em diante). Se o Google a mudar, o
 * número continua o mesmo e só o tom desenhado aqui fica diferente — o evento
 * na agenda não depende desta tabela.
 *
 * A regra de QUAL cor cada caso recebe mora no cadastro (maternidades e
 * pacotes, migration 20260930092734), não aqui.
 */
export const CORES_DO_GOOGLE: Record<string, { nome: string; hex: string }> = {
  '1': { nome: 'Lavanda', hex: '#7986CB' },
  '2': { nome: 'Sálvia', hex: '#33B679' },
  '3': { nome: 'Uva', hex: '#8E24AA' },
  '4': { nome: 'Flamingo', hex: '#E67C73' },
  '5': { nome: 'Banana', hex: '#F6BF26' },
  '6': { nome: 'Tangerina', hex: '#F4511E' },
  '7': { nome: 'Pavão', hex: '#039BE5' },
  '8': { nome: 'Grafite', hex: '#616161' },
  '9': { nome: 'Mirtilo', hex: '#3F51B5' },
  '10': { nome: 'Manjericão', hex: '#0B8043' },
  '11': { nome: 'Tomate', hex: '#D50000' },
}

export function corDoGoogle(id: string | null | undefined): { nome: string; hex: string } | null {
  return id ? (CORES_DO_GOOGLE[id] ?? null) : null
}

/**
 * A cor de um caso SEM cor própria: a da agenda. No print do Google da equipe
 * (30/09/2026), os casos da HNSF — que não têm cor — aparecem em Pavão.
 */
export const COR_PADRAO_DA_AGENDA = { nome: 'Pavão (padrão da agenda)', hex: '#039BE5' }

/** A cor com que um parto aparece: a do evento no Google, ou a padrão da agenda. */
export function corDoParto(id: string | null | undefined): { nome: string; hex: string } {
  return corDoGoogle(id) ?? COR_PADRAO_DA_AGENDA
}

/**
 * O TEXTO SOBRE A COR CHEIA: branco ou quase-preto, o que tiver MAIS contraste
 * (fórmula de luminância do WCAG). O Google põe branco em tudo, e no Banana e
 * no Pavão isso fica abaixo de 3:1 — ilegível no celular, ao sol, de relance.
 */
export function textoSobre(hex: string): string {
  const canal = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const l = 0.2126 * canal(1) + 0.7152 * canal(3) + 0.0722 * canal(5)
  const contraBranco = 1.05 / (l + 0.05)
  const contraEscuro = (l + 0.05) / 0.0625 // #1a1a2e ≈ luminância 0.0125
  return contraBranco >= contraEscuro ? '#ffffff' : '#1a1a2e'
}
