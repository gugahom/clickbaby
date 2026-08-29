import clsx from 'clsx'
import { formatarDataHora } from '@/lib/formato'
import { useRelogioDeMinuto } from '../lib/useRelogio'
import { ROTULO_ETAPA, ROTULO_RODADA, type CasoQuadro, type EtapaQuadro } from '../types'

interface PropsJanelaDeEntrega {
  caso: CasoQuadro
  etapas: EtapaQuadro[]
}

/**
 * A JANELA DE ENTREGA — o tempo do caso desenhado como espaço.
 *
 * POR QUE ISTO EXISTE
 * A empresa vende um prazo ("48h", "10 dias úteis") e quer evidência objetiva
 * de tempo de edição (seção 9 do CLAUDE.md). Até aqui o sistema tinha os dois
 * dados — quando o relógio armou, quanto cada etapa levou — e não mostrava
 * nenhum deles como DURAÇÃO. "Vence em 22h" é um número; não diz se as 26h já
 * gastas foram de trabalho ou de espera, nem onde o trabalho caiu dentro da
 * janela.
 *
 * Aqui a régua é a janela inteira: começa quando o nascimento conclui e termina
 * no vencimento. A barra cheia é o que já passou. Abaixo, cada edição aparece
 * na POSIÇÃO e na LARGURA reais — quando começou, quanto durou. De relance se
 * lê o que nenhum número dizia: "o prazo está pela metade e a edição de fotos
 * só começou agora", ou "tudo foi feito nas primeiras seis horas e o resto é
 * espera".
 *
 * SÓ APARECE COM O RELÓGIO ARMADO. Sem nascimento concluído não há janela —
 * `vence_em` é nulo, e desenhar uma régua sem as duas pontas seria inventar.
 *
 * AS BARRAS SÃO TEMPO DE PAREDE, não tempo de ciclo: vão do `iniciado_em` ao
 * `concluido_em`, pausas incluídas. É de propósito — a pergunta aqui é "quando
 * isto ocupou a janela", e uma pausa ocupa a janela igual. O tempo de ciclo
 * descontado vive no histórico, que é onde se cobra produtividade.
 */
export function JanelaDeEntrega({ caso, etapas }: PropsJanelaDeEntrega) {
  const agora = useRelogioDeMinuto()

  if (!caso.nascimentoConcluidoEm || !caso.venceEm) return null

  const inicio = new Date(caso.nascimentoConcluidoEm).getTime()
  const fim = new Date(caso.venceEm).getTime()
  const janela = fim - inicio
  if (janela <= 0) return null

  const posicao = (t: number) => ((t - inicio) / janela) * 100
  const limitar = (n: number) => Math.max(0, Math.min(100, n))

  const decorrido = limitar(posicao(agora.getTime()))
  const estourou = agora.getTime() > fim

  // Só o que TEM lugar na régua. Uma etapa que nunca começou não tem posição, e
  // empurrá-la para a esquerda diria que ela aconteceu no início.
  const barras = etapas
    .filter((e) => e.trilha === 'edicao' && e.iniciadoEm)
    .map((e) => {
      const de = new Date(e.iniciadoEm as string).getTime()
      const ate = e.concluidoEm ? new Date(e.concluidoEm).getTime() : agora.getTime()
      const rodadas = etapas.filter((o) => o.tipo === e.tipo).length
      return {
        id: e.id,
        status: e.status,
        esquerda: limitar(posicao(de)),
        largura: Math.max(1.5, limitar(posicao(ate)) - limitar(posicao(de))),
        rotulo:
          rodadas > 1
            ? `${ROTULO_ETAPA[e.tipo]} ${ROTULO_RODADA[e.rodada] ?? e.rodada}`
            : ROTULO_ETAPA[e.tipo],
        titulo: `${ROTULO_ETAPA[e.tipo]} — de ${formatarDataHora(e.iniciadoEm)}${
          e.concluidoEm ? ` a ${formatarDataHora(e.concluidoEm)}` : ', em andamento'
        }`,
      }
    })
    .sort((a, b) => a.esquerda - b.esquerda)

  return (
    <section aria-label="Janela de entrega">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="rotulo-sobrescrito text-acento">Janela de entrega</span>
        <span
          className={clsx(
            'text-xs font-semibold tabular-nums',
            estourou ? 'text-atrasado' : 'text-muted-foreground',
          )}
        >
          {Math.round(decorrido)}% da janela
        </span>
      </div>

      {/* A RÉGUA. `h-2` e não mais grossa: ela é o pano de fundo das barras,
          não o assunto. */}
      <div className="relative h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={clsx(
            'absolute inset-y-0 left-0 rounded-full transition-[width]',
            estourou ? 'bg-atrasado' : 'bg-acento/35',
          )}
          style={{ width: `${decorrido}%` }}
        />
      </div>

      {/* AS EDIÇÕES, cada uma no seu lugar e com a sua largura. Uma linha por
          etapa, e não todas na mesma: sobrepostas, duas edições simultâneas
          viravam uma barra só e o paralelismo — que é a regra de precedência do
          sistema — desapareceria justamente aqui. */}
      {barras.length > 0 && (
        <div className="mt-1.5 space-y-1">
          {barras.map((b) => (
            <div key={b.id} className="relative h-5" title={b.titulo}>
              <div
                className={clsx(
                  'absolute inset-y-0 flex items-center rounded-full px-1.5',
                  b.status === 'concluida'
                    ? 'bg-concluido/15 text-concluido-tinta'
                    : b.status === 'pausada'
                      ? 'bg-atencao/15 text-atencao-tinta'
                      : 'bg-andamento/15 text-andamento-tinta',
                )}
                style={{ left: `${b.esquerda}%`, width: `${b.largura}%` }}
              >
                {/* O rótulo vive DENTRO quando cabe e escapa para fora quando
                    não — uma barra de dez minutos numa janela de 48h tem dois
                    pixels, e um texto cortado ali não seria nome de nada. */}
                <span
                  className={clsx(
                    'text-[11px] font-semibold whitespace-nowrap',
                    b.largura < 18 && 'absolute left-full ml-1.5',
                  )}
                >
                  {b.rotulo}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-1.5 flex justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="tabular-nums">
          nasceu {formatarDataHora(caso.nascimentoConcluidoEm)}
        </span>
        <span className={clsx('tabular-nums', estourou && 'font-semibold text-atrasado')}>
          vence {formatarDataHora(caso.venceEm)}
        </span>
      </div>
    </section>
  )
}
