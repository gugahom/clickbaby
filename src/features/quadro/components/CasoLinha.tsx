import { useId, useState } from 'react'
import clsx from 'clsx'
import { Chevron } from '@/components/ui/icones'
import { formatarHora } from '@/lib/formato'
import { alertaDeHorario, type NivelAlerta } from '../lib/alerta-horario'
import { corDoCaso } from '../lib/cores-calendar'
import { CLASSE_URGENCIA, estadoSla } from '../lib/sla'
import { useRelogioDeMinuto } from '../lib/useRelogio'
import type { CasoQuadro, EtapaQuadro } from '../types'
import { CasoDetalhe } from './CasoDetalhe'
import { TrilhasDoCaso } from './TrilhasDoCaso'
import { AvisosDoCaso } from './AvisosDoCaso'
import { EditarCasoDialogo } from './EditarCasoDialogo'
import { IconeCaneta } from '@/components/ui/icones'
import { BotaoIcone } from '@/components/ui/BotaoIcone'

/** A espinha usa cor crua porque também recebe a cor do Calendar, que é hex. */
const CorDoAlerta: Record<NivelAlerta, string> = {
  proximo: 'var(--atencao)',
  iminente: 'var(--atrasado)',
}

interface PropsCasoLinha {
  caso: CasoQuadro
  etapas: EtapaQuadro[]
}

export function CasoLinha({ caso, etapas }: PropsCasoLinha) {
  const [aberto, setAberto] = useState(false)
  const [editando, setEditando] = useState(false)
  const idPainel = useId()
  const idCabecalho = useId()

  // O relógio faz o rótulo do SLA andar sozinho: sem ele, um caso aberto na
  // tela mostraria o prazo congelado no instante em que carregou.
  const agora = useRelogioDeMinuto()
  const sla = estadoSla(caso, agora)
  const cor = corDoCaso(caso.corCalendar)
  const hora = formatarHora(caso.previsaoEm)
  const alerta = alertaDeHorario(caso, etapas, agora)

  const titulo = caso.bebeNome ? `${caso.maeNome} · ${caso.bebeNome}` : caso.maeNome

  // Todas as etapas feitas e o caso ainda aberto: é o único estado em que o
  // caso está esperando por uma PESSOA, não por trabalho. Por isso ganha peso
  // próprio — é a informação mais acionável do Quadro.
  const prontoParaEntrega =
    !caso.ehTerminal &&
    caso.etapasTotal > 0 &&
    caso.etapasConcluidas === caso.etapasTotal

  return (
    <div
      className={clsx(
        // Cartão, não linha de grade. O que separa um caso do seguinte agora é
        // o chão pastel aparecendo no vão, não um filete de 1px — era essa a
        // queixa de "tudo colado". A sombra sobe no hover para dar o retorno
        // de que a coisa inteira é clicável.
        'group relative overflow-hidden rounded-cartao border border-border bg-card shadow-cartao transition-shadow hover:shadow-cartao-alto',
        caso.ehRascunho && 'border-rascunho-borda bg-rascunho-fundo/50',
        /*
          O ANEL, SÓ NO VERMELHO.
          
          O gestor pediu o card inteiro amarelo e depois vermelho. O card
          inteiro já tem três donos — âmbar de rascunho, verde de pronto para
          entrega, branco do resto — e um quarto significado por cima faria a
          cor deixar de dizer qualquer coisa: um rascunho amarelo e um
          atendimento em uma hora ficariam idênticos.
          
          Então a urgência mora na ESPINHA (abaixo), que é estreita, some do
          resto e já é o canal de "o que importa neste caso agora" — o pronto
          para entrega usa o mesmo truque. O anel só entra na meia hora final,
          quando vale gastar a atualização visual do cartão inteiro.
        */
        alerta?.nivel === 'iminente' && 'ring-2 ring-atrasado/45',
        prontoParaEntrega && 'border-pronto-borda bg-pronto-fundo',
        caso.ehTerminal && 'opacity-60 shadow-none',
      )}
    >
      {/*
        Cabeçalho clicável + painel IRMÃO, não painel dentro do botão. A
        referência da v0 envolvia a linha inteira num <button> e depois
        renderizava outros <button> lá dentro (HTML inválido) — quebraria
        assim que as ações da próxima fatia chegassem.
      */}
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
        className="relative w-full py-3.5 pr-[4.75rem] pl-3.5 text-left transition-colors hover:bg-marca-suave/60 md:pl-4"
      >
        <div className="flex items-stretch gap-3 md:gap-4">
          {/* Espinha do caso: a cor herdada do Calendar. Era 4px e sumia — a
              equipe usa essa cor para agrupar na agenda, então ela tem que
              valer alguma coisa aqui. items-stretch faz acompanhar a altura da
              linha sozinha.

              Pronto para entrega ROUBA a espinha: naquele estado, "quem é este
              caso na agenda" importa menos que "este aqui está te esperando". */}
          {/*
            A ESPINHA É O ALERTA.
            
            Precedência: hora chegando > pronto para entrega > cor do Calendar.
            Os dois primeiros não coexistem na prática (um caso pronto para
            entrega já passou de todo horário marcado), mas a ordem está
            escrita para não depender disso.
            
            No vermelho ela pulsa. Numa TV a quatro metros, texto de 13px não
            se lê e cor parada compete com as outras oito do quadro —
            movimento, não. É o mesmo recurso do marcador de etapa em
            andamento, e continua raro o bastante para funcionar.
          */}
          <div
            className={clsx(
              'flex-shrink-0 rounded-full transition-all',
              alerta ? 'w-2.5' : 'w-1.5',
              alerta?.nivel === 'iminente' && 'motion-safe:animate-pulse',
            )}
            style={{
              backgroundColor: alerta
                ? CorDoAlerta[alerta.nivel]
                : prontoParaEntrega
                  ? 'var(--pronto)'
                  : cor,
            }}
            aria-hidden="true"
          />

          <div className="min-w-0 flex-1">
            <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between md:gap-4">
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-[15px] font-semibold md:text-base">
                  {hora && (
                    <span className="mr-2 font-mono text-sm text-muted-foreground">
                      {hora}
                    </span>
                  )}
                  {titulo}
                </h3>

                {/*
                  A contagem, para quem está perto. A espinha diz "olhe aqui" do
                  outro lado da sala; isto diz QUANTO falta, que é a pergunta de
                  quem já olhou. Nomeia também O QUÊ — sem isso, um card com
                  banho e fechamento marcados no mesmo dia não diz para qual dos
                  dois está apitando.
                */}
                {alerta && (
                  <p className="mt-1">
                    <span
                      className={clsx(
                        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold',
                        alerta.nivel === 'iminente'
                          ? 'bg-atrasado text-white'
                          : 'bg-atencao/15 text-atencao',
                      )}
                    >
                      {alerta.oQue} {alerta.rotulo}
                    </span>
                  </p>
                )}

                <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-sm text-muted-foreground">
                  {caso.pacoteNome ? (
                    <span className="font-medium text-foreground">{caso.pacoteNome}</span>
                  ) : (
                    <span className="text-rascunho">sem pacote</span>
                  )}
                  {caso.maternidadeSigla ? (
                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                      {caso.maternidadeSigla}
                    </span>
                  ) : (
                    <span className="text-rascunho">sem maternidade</span>
                  )}
                  {prontoParaEntrega && (
                    <span className="rounded-full bg-pronto px-2 py-0.5 text-[11px] font-semibold text-white">
                      Pronto para entrega
                    </span>
                  )}
                  {caso.ehRascunho && <BadgeRascunho />}
                  {caso.ehTerminal && (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs uppercase">
                      {caso.statusOperacional}
                    </span>
                  )}
                </div>
              </div>

              {sla.rotulo && (
                <span
                  className={clsx(
                    'hidden flex-shrink-0 text-sm md:inline',
                    CLASSE_URGENCIA[sla.urgencia],
                  )}
                >
                  {sla.rotulo}
                </span>
              )}
            </div>

            {/* As duas trilhas. Rascunho não tem etapas — nada de "0/0". */}
            <TrilhasDoCaso etapas={etapas} />

            {/* No mobile o SLA não cabe na linha do título; desce para cá. */}
            {sla.rotulo && (
              <div className="mt-1.5 md:hidden">
                <span className={clsx('text-sm', CLASSE_URGENCIA[sla.urgencia])}>
                  {sla.rotulo}
                </span>
              </div>
            )}
          </div>

        </div>

        {/* Chevron aponta para BAIXO quando fechado (abre para baixo) e para
            CIMA quando aberto. A referência tinha isto invertido.

            Saiu do fluxo e foi para a calha reservada à direita (o `pr-14` do
            cabeçalho) para dividir esse espaço com o botão de editar sem
            disputar lugar com o rótulo de SLA, que vive no alto à direita. */}
        <Chevron
          className={clsx(
            'absolute top-3.5 right-3 size-5 text-muted-foreground transition-transform',
            aberto && 'rotate-180',
          )}
        />
      </button>

      {/*
        FORA do <button>. Um <button> dentro de outro é HTML inválido e o
        clique interno borbulharia abrindo o detalhe junto — foi o defeito da
        referência da v0, e não vale repetir por economia de markup.

        Ancorado no TOPO, não na base: a faixa de avisos ocupa o rodapé do
        cartão quando existe, e um botão absoluto ali cairia por cima do texto.

        SEMPRE VISÍVEL, nunca só no hover. A primeira versão revelava no hover
        no desktop; em celular, que é o aparelho real da operação (seção 6),
        hover não existe — o botão ficaria invisível e clicável ao mesmo tempo,
        que é o pior dos dois mundos. Fica quieto pelo contraste, não pela
        opacidade.

        No rascunho ele é o gesto principal do cartão: é o que tira o caso do
        limbo. Por isso ganha borda e a cor da pendência; nos demais é
        conveniência e fica em cinza.

        AO LADO DO CHEVRON, NÃO ABAIXO DELE.
        
        Antes era `top-11`: 44px de deslocamento mais 44px de alvo exigem um
        cartão de 88px para caber. Um rascunho não tem etapas nem SLA, então o
        cartão dele é mais curto que isso — e a caneta ficava pendurada para
        fora da borda inferior, justamente no cartão em que ela é a ação
        principal.
        
        Lado a lado, a posição não depende mais da altura do cartão: o alvo
        está no mesmo lugar num rascunho de duas linhas e num MASTER com três
        trilhas. O `pr` do cabeçalho reserva a calha para os dois.
      */}
      <BotaoIcone
        rotulo={`${caso.ehRascunho ? 'Completar' : 'Editar'} cadastro de ${titulo}`}
        tom={caso.ehRascunho ? 'pendencia' : 'neutro'}
        onClick={() => setEditando(true)}
        // top-0.5 centra os 44px do alvo na linha dos 20px do chevron.
        className="absolute top-0.5 right-8"
      >
        <IconeCaneta className="size-4" />
      </BotaoIcone>

      {editando && <EditarCasoDialogo caso={caso} onFechar={() => setEditando(false)} />}

      {/* Fora do <button> do cabeçalho e antes do painel: a faixa é sempre
          visível, aberto ou fechado. Um aviso que só aparecesse ao expandir o
          caso não seria visto na TV, que é onde ele precisa ser visto. */}
      <AvisosDoCaso etapas={etapas} />

      <div id={idPainel} role="region" aria-labelledby={idCabecalho} hidden={!aberto}>
        {aberto && <CasoDetalhe caso={caso} etapas={etapas} sla={sla} />}
      </div>
    </div>
  )
}

export function BadgeRascunho() {
  return (
    <span className="rounded border border-rascunho-borda bg-rascunho-fundo px-1.5 py-0.5 text-xs font-medium text-rascunho">
      rascunho
    </span>
  )
}
