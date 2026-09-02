import { useId, useState } from 'react'
import { Sanfona } from '@/components/ui/Sanfona'
import clsx from 'clsx'
import { Chevron } from '@/components/ui/icones'
import { dataCurta, diasAtras, ehRotuloRelativo, rotularDia } from '@/lib/formato'
import type { BlocoDia, EtapaQuadro } from '../types'
import { CasoLinha } from './CasoLinha'
import { Diafragma } from './Diafragma'

interface PropsDiaBloco {
  bloco: BlocoDia
  hoje: string
  etapasPorCaso: Map<string, EtapaQuadro[]>
  abertoInicialmente: boolean
  /** Modo TV: os cartões do dia vêm compactos. Ver `ResumoDasTrilhas`. */
  compacto?: boolean
  /**
   * Este bloco é o RESTO de um dia que começou na coluna anterior — só
   * acontece no modo TV, quando um dia grande parte entre as duas colunas
   * (ver `dividirEmDuasColunas`). O cabeçalho se anuncia como continuação
   * para ninguém contar o mesmo dia duas vezes.
   */
  continuacao?: boolean
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
  compacto = false,
  continuacao = false,
}: PropsDiaBloco) {
  const [aberto, setAberto] = useState(abertoInicialmente)
  const idPainel = useId()
  const idCabecalho = useId()
  const rotulo = bloco.dia === null ? 'Sem data prevista' : rotularDia(bloco.dia, hoje)
  // 'Hoje' diz QUANDO e esconde QUAL dia é. Quem escreve num prontuário ou
  // fala no telefone precisa do número, e conferir no relógio do aparelho é
  // um desvio de atenção. Os outros rótulos já trazem a data por extenso.
  const data = bloco.dia && ehRotuloRelativo(bloco.dia, hoje) ? dataCurta(bloco.dia) : null
  const atraso = bloco.dia === null ? 0 : diasAtras(bloco.dia, hoje)
  const emAtraso = atraso > 0

  // Casos terminais não aparecem aqui: vão para a aba Concluídos. O bloco do
  // dia continua existindo enquanto sobrar caso aberto (invariante 3.5) — quem
  // some é o caso resolvido, não o dia.
  //
  // Casos na UTI também não: eles saem do dia e vivem na seção UTI, que guarda
  // de que dia eram.
  const ativos = bloco.casos.filter((c) => !c.ehTerminal && !c.naUti)

  /*
   * A CONTINUAÇÃO NÃO REPETE O CABEÇALHO DO DIA.
   *
   * Quando um dia grande parte entre as duas colunas do modo TV, a versão
   * anterior desenhava o mesmo cabeçalho nos dois pedaços: dois "Hoje 01/09"
   * do mesmo tamanho, cada um com seu diafragma e seu "0 de 8 concluídos",
   * lado a lado na mesma tela. Lia como se houvesse dois dias iguais, e o
   * gestor viu isso na primeira olhada — "ficou bom mas feio com 2 Hoje".
   *
   * A tira de continuação é deliberadamente MENOR e mais apagada que um
   * cabeçalho de dia: ela não anuncia um dia, ela costura o que já estava
   * anunciado do outro lado. Sem diafragma e sem contagem, que são a resposta
   * do DIA inteiro e já foram dadas na coluna da esquerda — repeti-las aqui
   * faria alguém somar duas vezes.
   */
  if (continuacao) {
    return (
      <section>
        <h2>
          <button
            type="button"
            id={idCabecalho}
            onClick={() => setAberto((v) => !v)}
            aria-expanded={aberto}
            aria-controls={idPainel}
            className="flex w-full items-center gap-2 rounded-painel px-3 py-1.5 text-left text-muted-foreground transition-colors hover:bg-muted/60 md:px-4"
          >
            {/* A seta de retorno é o sinal mais curto possível de "vem da
                coluna anterior" — e não precisa de tradução nem de leitura. */}
            <span aria-hidden="true" className="text-base leading-none">
              ↳
            </span>
            <span className="rotulo-sobrescrito">{rotulo}</span>
            {data && (
              <span className="text-xs font-semibold tabular-nums">{data}</span>
            )}
            <span className="rotulo-sobrescrito opacity-70">continua</span>
            <Chevron
              className={clsx(
                'ml-auto size-4 flex-shrink-0 transition-transform',
                aberto && 'rotate-180',
              )}
            />
          </button>
        </h2>

        <Sanfona aberto={aberto} id={idPainel} rotuladoPor={idCabecalho}>
          <div className="mt-1.5 space-y-2">
            {ativos.map((caso) => (
              <CasoLinha
                key={caso.id}
                caso={caso}
                etapas={etapasPorCaso.get(caso.id) ?? []}
                compacto={compacto}
              />
            ))}
          </div>
        </Sanfona>
      </section>
    )
  }

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
          /*
           * FECHADO ganha superfície; ABERTO não.
           *
           * Aberto, o cabeçalho é rótulo de prateleira: os cartões logo abaixo
           * dizem onde o bloco começa e termina, e dar caixa a ele o faria
           * competir com eles.
           *
           * Fechado, os cartões somem e sobra texto solto no chão pastel — sem
           * nada dizendo que aquilo é clicável. É a queixa: um dia fechado
           * precisa parecer um objeto que se seleciona, não um título.
           *
           * A caixa é discreta de propósito. Ela existe para dar borda ao alvo,
           * não para chamar atenção: um dia fechado é justamente o que a pessoa
           * NÃO está olhando agora.
           */
          className={clsx(
            // A borda existe SEMPRE e só troca de cor. Se ela aparecesse e
            // sumisse, o 1px de largura entraria e sairia da caixa a cada
            // abrir/fechar, empurrando o bloco inteiro — e `transition-all`
            // ainda animaria essa largura, transformando um deslocamento de
            // layout em algo que se vê acontecer.
            'flex w-full items-center gap-3 rounded-painel border px-3 py-3 text-left transition-[background-color,border-color,box-shadow] md:gap-4 md:px-4',
            /*
              O rótulo do dia ganhou SUPERFÍCIE, aberto ou fechado.
              
              Ele era texto solto no chão quando aberto, e ficava competindo em
              peso com o primeiro cartão logo abaixo — dois blocos de tamanho
              parecido, um deles sem forma. Agora é uma faixa em rosa muito
              diluído: identifica o dia como cabeçalho sem virar mais um
              cartão, porque não é branco.
              
              A borda continua existindo SEMPRE e só trocando de cor, pela
              mesma razão de antes: o 1px entrando e saindo empurraria o bloco.
            */
            emAtraso
              ? 'border-atrasado/20 bg-atrasado/8 hover:bg-atrasado/12'
              : 'border-acento/15 bg-acento-suave hover:bg-acento-suave/70',
            !aberto && 'shadow-cartao hover:shadow-cartao-alto',
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
              <span className="text-lg font-extrabold tracking-tight first-letter:uppercase md:text-xl">
                {rotulo}
              </span>
              {data && (
                // Peso normal e cor apagada: é referência, não manchete. Se
                // competisse com "Hoje", teria trocado uma leitura rápida por
                // duas.
                <span className="text-sm font-semibold tabular-nums text-muted-foreground">
                  {data}
                </span>
              )}
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

      <Sanfona aberto={aberto} id={idPainel} rotuladoPor={idCabecalho}>
        <div className="mt-1.5 space-y-2">
          {ativos.map((caso) => (
            <CasoLinha
              key={caso.id}
              caso={caso}
              etapas={etapasPorCaso.get(caso.id) ?? []}
              compacto={compacto}
            />
          ))}
        </div>
      </Sanfona>
    </section>
  )
}
