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
 * UMA LINHA, NUNCA DUAS
 * Com dois avisos a faixa virava um bloco e passava a competir com o card em
 * vez de acompanhá-lo. Os avisos entram lado a lado numa linha só, com corte
 * por reticências — o texto inteiro fica no title e dentro do caso expandido.
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

  // UMA linha, sempre. Com dois avisos a faixa virava um bloco de duas linhas
  // e roubava a atenção do card inteiro — ela é um lembrete, não o conteúdo.
  // Estourando a largura, corta com reticências; o texto completo fica no
  // title e, inteiro, dentro do caso expandido.
  const completo = avisos
    .map((e) => `${ROTULO_ETAPA[e.tipo]} — ${e.observacao}`)
    .join('  ·  ')

  return (
    <div className="border-t border-rascunho-borda bg-rascunho-fundo">
      <p
        className="truncate px-3 py-2 text-sm text-rascunho md:px-4"
        title={completo}
      >
        {avisos.map((etapa, i) => (
          <span key={etapa.id}>
            {i > 0 && (
              <span className="mx-2 opacity-40" aria-hidden="true">
                ·
              </span>
            )}
            <span className="font-bold tracking-wide uppercase">
              {ROTULO_ETAPA[etapa.tipo]}
            </span>
            <span className="mx-1.5 opacity-60" aria-hidden="true">
              —
            </span>
            <span className="font-medium">{etapa.observacao}</span>
          </span>
        ))}
      </p>
    </div>
  )
}
