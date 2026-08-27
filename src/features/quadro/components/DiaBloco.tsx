import { useId, useState } from 'react'
import clsx from 'clsx'
import { Chevron } from '@/components/ui/icones'
import { diasAtras, rotularDia } from '@/lib/formato'
import type { BlocoDia, EtapaQuadro } from '../types'
import { CasoLinha } from './CasoLinha'
import { Diafragma } from './Diafragma'

interface PropsDiaBloco {
  bloco: BlocoDia
  hoje: string
  etapasPorCaso: Map<string, EtapaQuadro[]>
  abertoInicialmente: boolean
}

/**
 * Um dia do Quadro: cabeçalho de seção sobre o chão pastel, e os casos como
 * cartões brancos empilhados com respiro entre eles.
 *
 * A mudança em relação à versão anterior é de material, não de arranjo. Antes
 * tudo vivia dentro de um único painel branco e o que separava um caso do
 * seguinte era uma linha de 1px — o resultado se lia como planilha, e era
 * exatamente a queixa. Agora o chão aparece entre os cartões, e é ele que
 * separa. A borda ficou só para fechar a forma.
 *
 * O cabeçalho do dia NÃO é cartão de propósito: se fosse, competiria com os
 * casos. Ele fica direto no chão, como rótulo de prateleira.
 */
export function DiaBloco({
  bloco,
  hoje,
  etapasPorCaso,
  abertoInicialmente,
}: PropsDiaBloco) {
  const [aberto, setAberto] = useState(abertoInicialmente)
  const idPainel = useId()
  const idCabecalho = useId()
  const rotulo = bloco.dia === null ? 'Sem data prevista' : rotularDia(bloco.dia, hoje)
  const atraso = bloco.dia === null ? 0 : diasAtras(bloco.dia, hoje)
  const emAtraso = atraso > 0

  // Casos terminais não aparecem aqui: vão para a aba Concluídos. O bloco do
  // dia continua existindo enquanto sobrar caso aberto (invariante 3.5) — quem
  // some é o caso resolvido, não o dia.
  //
  // Casos na UTI também não: eles saem do dia e vivem na seção UTI, que guarda
  // de que dia eram.
  const ativos = bloco.casos.filter((c) => !c.ehTerminal && !c.naUti)

  return (
    <section>
      <h2>
        {/*
          <button> cru, e não o Botao: isto é um controle de sanfona que ocupa a
          linha inteira, não uma ação. A mola de escala do Botao encolheria o
          cartão/cabeçalho todo a cada toque, o que numa lista rolando lê como
          falha de renderização, não como resposta. A confirmação aqui já vem do
          chevron girando e do painel abrindo.
        */}
        <button
          type="button"
          id={idCabecalho}
          onClick={() => setAberto((v) => !v)}
          aria-expanded={aberto}
          aria-controls={idPainel}
          className={clsx(
            'flex w-full items-center gap-3 rounded-cartao px-3 py-2.5 text-left transition-colors md:gap-4 md:px-4',
            emAtraso ? 'bg-atrasado/8 hover:bg-atrasado/12' : 'hover:bg-card/70',
          )}
        >
          {/* O diafragma: uma pá por caso, acesa quando o caso se resolve. É a
              mesma informação do "0 de 5" ao lado, visível sem ler — inclusive
              da TV da sala de edição. */}
          <Diafragma
            total={bloco.total}
            feitos={bloco.resolvidos}
            emAtraso={emAtraso}
            className="size-9 md:size-10"
          />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {/* first-letter, não `capitalize`: o Intl devolve
                  "terça-feira, 18 de agosto" e `capitalize` viraria
                  "Terça-Feira, 18 De Agosto". */}
              <span className="text-base font-bold tracking-tight first-letter:uppercase md:text-lg">
                {rotulo}
              </span>
              {emAtraso && (
                <span className="rounded-full bg-atrasado px-2 py-0.5 text-[11px] font-semibold text-white">
                  {atraso === 1 ? 'há 1 dia' : `há ${atraso} dias`}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {/*
                Denominador honesto: "resolvidos" conta casos em estado
                TERMINAL (encerrado OU cancelado), não casos com todas as
                etapas feitas. Cancelado resolve o dia sem nunca ter sido
                concluído — invariante 3.5.
              */}
              {bloco.resolvidos} de {bloco.total}{' '}
              {bloco.total === 1 ? 'concluído' : 'concluídos'}
            </p>
          </div>

          <Chevron
            className={clsx(
              'size-5 flex-shrink-0 text-muted-foreground transition-transform',
              aberto && 'rotate-180',
            )}
          />
        </button>
      </h2>

      <div id={idPainel} role="region" aria-labelledby={idCabecalho} hidden={!aberto}>
        {aberto && (
          <div className="mt-1.5 space-y-2">
            {ativos.map((caso) => (
              <CasoLinha
                key={caso.id}
                caso={caso}
                etapas={etapasPorCaso.get(caso.id) ?? []}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
