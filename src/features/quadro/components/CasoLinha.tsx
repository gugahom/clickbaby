import { useId, useState, type CSSProperties } from 'react'
import { Sanfona } from '@/components/ui/Sanfona'
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
import { IconeCaneta, IconeMais, IconeReabrir } from '@/components/ui/icones'
import { Dropdown } from '@/components/ui/Dropdown'

/** A espinha usa cor crua porque também recebe a cor do Calendar, que é hex. */
const CorDoAlerta: Record<NivelAlerta, string> = {
  // Laranja, não amarelo: `--atencao` colidia com o âmbar do rascunho — ver
  // a nota de `--alerta-proximo` em index.css.
  proximo: 'var(--alerta-proximo)',
  iminente: 'var(--atrasado)',
}

interface PropsCasoLinha {
  caso: CasoQuadro
  etapas: EtapaQuadro[]
  /**
   * Quando presente, o menu do cartão oferece reabrir. Só a aba Concluídos
   * passa — nas outras a ação não existe, e um item permanentemente
   * desabilitado é pior que item nenhum.
   */
  onReabrir?: ((caso: CasoQuadro) => void) | undefined
}

export function CasoLinha({ caso, etapas, onReabrir }: PropsCasoLinha) {
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
      // A cor do anel viaja por variável para o CSS poder usá-la dentro do
      // conic-gradient, que não alcança classe do Tailwind.
      {...(alerta
        ? { style: { '--cor-alerta': CorDoAlerta[alerta.nivel] } as CSSProperties }
        : {})}
      className={clsx(
        // Cartão, não linha de grade. O que separa um caso do seguinte agora é
        // o chão pastel aparecendo no vão, não um filete de 1px — era essa a
        // queixa de "tudo colado". A sombra sobe no hover para dar o retorno
        // de que a coisa inteira é clicável.
        'group relative overflow-hidden rounded-cartao border border-border bg-card shadow-cartao transition-shadow hover:shadow-cartao-alto',
        caso.ehRascunho && 'border-rascunho-borda bg-rascunho-fundo/50',
        /*
          A BORDA É O ALERTA — e ela é alta.
          
          O gestor pediu o card inteiro amarelo e depois vermelho. O FUNDO não
          pode: ele já tem três donos (âmbar de rascunho, verde de pronto para
          entrega, branco do resto) e um quarto significado por cima faria um
          rascunho e um atendimento em uma hora ficarem idênticos. A BORDA
          estava livre — hoje é sempre a mesma linha cinza, sem significado
          nenhum — e é o maior contorno do cartão. É dela que sai a urgência.
          
          Um `ring-2` discreto foi a primeira tentativa e o gestor achou
          tímido, com razão: 2px de vermelho a 45% de opacidade some ao lado da
          espinha. Agora o anel é opaco, e no vermelho uma luz percorre o
          perímetro — ver `.anel-alerta` em index.css, que explica por que ele
          é desenhado com mask em vez de `border` (2px de borda de verdade
          empurrariam o conteúdo e a lista pularia a cada caso que entra ou sai
          da janela).
          
          O fundo ganha só um véu da cor — 6% é pouco o bastante para não
          disputar com o âmbar do rascunho e o suficiente para o cartão inteiro
          parecer envolvido, que é o que ele pediu.
        */
        alerta && 'anel-alerta',
        alerta?.nivel === 'iminente' && 'anel-alerta-vivo',

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
        className="relative w-full py-4 pr-[4.75rem] pl-3.5 text-left transition-colors hover:bg-marca-suave/40 md:pl-4"
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
                <h3 className="truncate text-base font-bold tracking-tight md:text-[17px]">
                  {hora && (
                    <span className="mr-2 text-sm font-medium tabular-nums text-muted-foreground">
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
                          : 'bg-alerta-proximo/12 text-alerta-proximo',
                      )}
                    >
                      {alerta.oQue} {alerta.rotulo}
                    </span>
                  </p>
                )}

                <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-sm text-muted-foreground">
                  {/* Pacote e maternidade viram PÍLULAS DE CONTORNO.
                  
                      Eram texto solto separado por espaço, e a linha lia como
                      uma frase: "BIRTH + REELS GNDI rascunho". São três dados
                      distintos, e a moldura é o que diz onde um termina e o
                      outro começa sem precisar de pontuação.
                  
                      Contorno e não preenchimento: preenchidas, seis pílulas por
                      cartão virariam blocos de cor competindo com a espinha e
                      com o chip de alerta, que são os dois que precisam gritar. */}
                  {caso.pacoteNome ? (
                    <span className="rounded-full border border-border px-2 py-0.5 text-xs font-semibold text-foreground">
                      {caso.pacoteNome}
                    </span>
                  ) : (
                    <span className="rounded-full border border-rascunho-borda px-2 py-0.5 text-xs font-medium text-rascunho">
                      sem pacote
                    </span>
                  )}
                  {caso.maternidadeSigla ? (
                    <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[11px] font-medium">
                      {caso.maternidadeSigla}
                    </span>
                  ) : (
                    <span className="rounded-full border border-rascunho-borda px-2 py-0.5 text-xs font-medium text-rascunho">
                      sem maternidade
                    </span>
                  )}
                  {prontoParaEntrega && (
                    <span className="rounded-full bg-pronto px-2 py-0.5 text-[11px] font-bold text-white">
                      Pronto para entrega
                    </span>
                  )}
                  {caso.ehRascunho && <BadgeRascunho />}
                  {caso.ehTerminal && (
                    <span className="rotulo-sobrescrito rounded-full bg-muted px-2 py-1 text-muted-foreground">
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

            {/* Um filete separando IDENTIDADE de ESTADO.
            
                Acima dele está quem é o caso — hora, nomes, pacote, maternidade
                —, que não muda. Abaixo, o que está acontecendo com ele, que muda
                o dia inteiro. Sem a linha, o cartão era um bloco só e o olho
                percorria as duas coisas como se fossem a mesma leitura.
                
                Só quando há etapas: num rascunho ele separaria o nome de nada. */}
            {etapas.length > 0 && <div className="mt-3 border-t border-border/70" />}

            {/* As três trilhas. Rascunho não tem etapas — nada de "0/0". */}
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
        O MENU DO CARTÃO, no lugar da caneta solta.

        FORA do <button> do cabeçalho: um <button> dentro de outro é HTML
        inválido e o clique interno borbulharia abrindo o detalhe junto — foi o
        defeito da referência da v0, e não vale repetir por economia de markup.

        POR QUE VIROU MENU. A caneta fazia uma coisa só, e o "Reabrir para
        alteração" vivia como um botão solto pendurado ABAIXO do cartão, na aba
        Concluídos — duas ações do mesmo caso em dois lugares e duas formas. No
        menu elas viram uma lista, e a próxima ação de caso entra sem inventar
        outro canto.

        AO LADO DO CHEVRON, NÃO ABAIXO. Antes era `top-11`: 44px de deslocamento
        mais 44px de alvo exigem um cartão de 88px, e um rascunho — que não tem
        etapas nem SLA — fica em 82px. A caneta pendurava para fora da borda,
        justamente no cartão em que ela é a ação principal.

        O TOM DE PENDÊNCIA no rascunho fica: ali o menu é o gesto que tira o
        caso do limbo, e precisa se distinguir do botão quieto dos demais.
      */}
      <div className="absolute top-0.5 right-8">
        <Dropdown
          alinhamento="direita"
          rotulo="Ações do caso"
          onEscolher={(item) => {
            if (item.id === 'editar') setEditando(true)
            if (item.id === 'reabrir') onReabrir?.(caso)
          }}
          itens={[
            {
              id: 'editar',
              rotulo: caso.ehRascunho ? 'Completar cadastro' : 'Editar cadastro',
              icone: <IconeCaneta className="size-4" />,
            },
            ...(onReabrir && caso.statusOperacional === 'encerrado'
              ? [
                  {
                    id: 'reabrir',
                    rotulo: 'Reabrir para alteração',
                    icone: <IconeReabrir className="size-4" />,
                  },
                ]
              : []),
          ]}
          gatilho={
            <span
              aria-label={`Ações de ${titulo}`}
              className={clsx(
                'inline-flex size-11 items-center justify-center rounded-full transition-colors',
                caso.ehRascunho
                  ? 'border border-rascunho-borda bg-card text-rascunho'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <IconeMais className="size-4" />
            </span>
          }
        />
      </div>

      {editando && <EditarCasoDialogo caso={caso} onFechar={() => setEditando(false)} />}

      {/* Fora do <button> do cabeçalho e antes do painel: a faixa é sempre
          visível, aberto ou fechado. Um aviso que só aparecesse ao expandir o
          caso não seria visto na TV, que é onde ele precisa ser visto. */}
      <AvisosDoCaso etapas={etapas} />

      <Sanfona aberto={aberto} id={idPainel} rotuladoPor={idCabecalho}>
        <CasoDetalhe caso={caso} etapas={etapas} sla={sla} />
      </Sanfona>
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
