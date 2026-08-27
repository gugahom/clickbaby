import { ROTULO_ETAPA, type EtapaQuadro } from '../types'

interface PropsAvisosDoCaso {
  etapas: EtapaQuadro[]
}

/**
 * As observações das etapas ABERTAS, na faixa de baixo do card.
 *
 * POR QUE ISTO EXISTE
 * `caso_etapas.observacao` só era escrita ao concluir, e só aparecia dentro do
 * caso expandido. Servia para contar como foi. O gestor precisa do contrário:
 * a coordenação sabe de manhã que o banho vai ser no quarto 115 às 14h, e quem
 * chega no plantão tem que ver isso no Quadro — sem abrir caso nenhum, de
 * longe, na TV da sala.
 *
 * POR QUE SÓ AS ETAPAS ABERTAS
 * Um aviso é sobre trabalho que vem. Depois que a etapa fecha ele cumpriu o
 * papel, e a observação que `concluir_etapa` grava é de outra natureza — é
 * relato do que aconteceu, que pertence ao histórico e não à faixa de destaque.
 * Mostrar as duas juntas acumularia texto no card a cada etapa concluída, até
 * a faixa virar ruído permanente e ninguém mais ler.
 *
 * POR QUE FORA DAS TRILHAS
 * O texto é livre e comprido; dentro da trilha ele quebraria a leitura em
 * coluna que faz as duas linhas funcionarem. Aqui embaixo, com fundo próprio,
 * ele é o que salta depois do estado — que é a ordem em que a pessoa lê.
 */
export function AvisosDoCaso({ etapas }: PropsAvisosDoCaso) {
  const avisos = etapas.filter(
    (e) =>
      e.observacao !== null &&
      e.observacao.trim() !== '' &&
      e.status !== 'concluida' &&
      e.status !== 'dispensada',
  )

  if (avisos.length === 0) return null

  return (
    <div className="border-t border-rascunho-borda bg-rascunho-fundo">
      {avisos.map((etapa) => (
        <p
          key={etapa.id}
          className="px-3 py-1.5 text-sm text-rascunho md:px-4"
        >
          <span className="font-bold tracking-wide uppercase">
            {ROTULO_ETAPA[etapa.tipo]}
          </span>
          <span className="mx-1.5 opacity-60" aria-hidden="true">
            —
          </span>
          <span className="font-medium">{etapa.observacao}</span>
        </p>
      ))}
    </div>
  )
}
