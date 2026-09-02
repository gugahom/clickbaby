import { useId, useState, type CSSProperties } from 'react'
import { Sanfona } from '@/components/ui/Sanfona'
import clsx from 'clsx'
import { Chevron } from '@/components/ui/icones'
import { formatarHora } from '@/lib/formato'
import { useAuth } from '@/features/auth/contexto'
import { alertaDeHorario, type NivelAlerta } from '../lib/alerta-horario'
import { corDoCaso } from '../lib/cores-calendar'
import { CLASSE_URGENCIA, estadoSla } from '../lib/sla'
import { podeCancelar } from '../lib/acoes'
import { mensagemDeErro } from '../lib/erros'
import { useCancelarCaso } from '../api/useAcoes'
import { useRelogioDeMinuto } from '../lib/useRelogio'
import type { CasoQuadro, EtapaQuadro } from '../types'
import { CasoDetalhe } from './CasoDetalhe'
import { ResumoDasTrilhas, TrilhasDoCaso } from './TrilhasDoCaso'
import { AvisosDoCaso } from './AvisosDoCaso'
import { EditarCasoDialogo } from './EditarCasoDialogo'
import { Dialogo } from '@/components/ui/Dialogo'
import { IconeCaneta, IconeMais, IconeReabrir, IconeX } from '@/components/ui/icones'
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
  /**
   * Modo TV: o cartão mostra só o estado atual de cada faixa, e o resto vem
   * ao abrir. Ver `ResumoDasTrilhas` para a razão de existir e o que se perde.
   */
  compacto?: boolean
}

export function CasoLinha({ caso, etapas, onReabrir, compacto = false }: PropsCasoLinha) {
  const [aberto, setAberto] = useState(false)
  const [editando, setEditando] = useState(false)
  const [descartando, setDescartando] = useState(false)
  const [erroDescarte, setErroDescarte] = useState<string | null>(null)
  const idPainel = useId()
  const idCabecalho = useId()

  const { pessoa } = useAuth()
  const cancelar = useCancelarCaso()

  // O relógio faz o rótulo do SLA andar sozinho: sem ele, um caso aberto na
  // tela mostraria o prazo congelado no instante em que carregou.
  const agora = useRelogioDeMinuto()
  const sla = estadoSla(caso, agora)
  const cor = corDoCaso(caso.corCalendar)
  const hora = formatarHora(caso.previsaoEm)
  const alerta = alertaDeHorario(caso, etapas, agora)

  const titulo = caso.bebeNome ? `${caso.maeNome} · ${caso.bebeNome}` : caso.maeNome

  /*
   * DESCARTAR RASCUNHO — mesma RPC de cancelar_caso, caminho mais curto.
   *
   * O gestor teve que descartar ~40 rascunhos criados por engano (o
   * alargamento da janela do sync, corrigido na mesma sessão) um por um: abrir
   * o card, achar "Cancelar caso" no rodapé do detalhe, digitar um motivo só
   * pra preencher o campo obrigatório. Um rascunho pendente nunca virou
   * contrato — não há decisão comercial nenhuma nisso, só ruído do sync que
   * precisa sumir.
   *
   * Por isso este atalho: mesmo `cancelar_caso`, mesma restrição de papel
   * (`podeCancelar` — é decisão que continua exigindo atendimento/adm, a RPC
   * não sabe a diferença), mas direto do menu do cartão, com motivo padrão em
   * vez de campo de texto. Só aparece em rascunho ainda aberto — um caso de
   * verdade continua exigindo o motivo escrito, porque ali cancelar É uma
   * decisão sobre o contrato.
   */
  const papel = pessoa?.papelSistema ?? 'operador'
  const descarte = podeCancelar(caso, papel)

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
        className={clsx(
          'relative w-full pr-[4.75rem] pl-3.5 text-left transition-colors hover:bg-marca-suave/40 md:pl-4',
          // O ar vertical é a primeira coisa que sobra numa tela lida de
          // longe: ele existe para o dedo, e na parede não há dedo nenhum.
          compacto ? 'py-2.5' : 'py-4',
        )}
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
                {/*
                  O NOME CRESCEU (30/08/2026, a pedido do gestor).

                  Era 16px no celular, 17 no desktop — o mesmo corpo do resto
                  do cartão, distinguido só pelo negrito. O gestor leu isso
                  como "apagado", e é uma leitura correta: mãe, pacote e
                  maternidade são a LINHA DO CALENDAR, a frase que a equipe já
                  usa para identificar um caso ("THAYANE/ALICE BIRTH+REELS
                  GNDI"), e o cartão a servia em três registros diferentes —
                  nome em negrito, pacote em 12px, sigla em 11px cinza.

                  Agora o nome tem tamanho de título e os dois outros têm peso
                  de dado, não de etiqueta. Os pixels vêm do título da página,
                  que encolheu na mesma leva: um se lê uma vez por turno, o
                  outro cem vezes.

                  A HORA fica pequena e cinza de propósito. Ela qualifica o
                  nome, não compete com ele — e num dia com doze casos é a
                  coluna que o olho percorre, não a que ele procura.

                  QUEBRA EM DUAS LINHAS, NÃO CORTA. Era `truncate`, e a 18px
                  isso passou a morder nomes reais: "04:30 JESSICA · CARLOS
                  RAFAEL" mede 269px nos 242 que sobram em 375px, e virava
                  "CARLOS RAFAE…". Cortar o nome de um bebê para caber é
                  perder justamente o dado que identifica o caso. `line-clamp-2`
                  deixa a segunda linha acontecer e ainda põe um teto: um nome
                  absurdamente longo para em duas linhas em vez de esticar o
                  cartão. Nomes curtos seguem em uma linha só — o cartão só
                  cresce quando há motivo.
                */}
                <h3 className="line-clamp-2 text-lg font-extrabold tracking-tight md:text-xl">
                  {hora && (
                    <span className="mr-2 text-sm font-semibold tabular-nums text-muted-foreground">
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

                <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm text-muted-foreground">
                  {/* Pacote e maternidade são PÍLULAS, e agora com peso.

                      Eram texto solto separado por espaço, e a linha lia como
                      uma frase: "BIRTH + REELS GNDI rascunho". São três dados
                      distintos, e a moldura é o que diz onde um termina e o
                      outro começa sem precisar de pontuação.

                      O QUE MUDOU: o pacote ganhou preenchimento. A regra
                      anterior — todas de contorno, para nenhuma competir com a
                      espinha e com o chip de alerta — está certa para as
                      pílulas de ESTADO, que aparecem várias por cartão e são
                      justamente as que gritam. O pacote não é estado: é
                      identidade, aparece uma vez, e é o dado mais
                      consequente da linha (ele define o checklist inteiro do
                      caso). O tom é o azul suave da marca, de croma baixo —
                      preenche sem virar sinal.

                      A maternidade fica de contorno, e é isso que mantém as
                      duas distinguíveis: preenchida vs. vazada diz mais
                      depressa "pacote" e "onde" do que ler as duas. */}
                  {caso.pacoteNome ? (
                    <span className="rounded-full bg-marca-suave px-2.5 py-0.5 text-[13px] font-bold text-marca">
                      {caso.pacoteNome}
                    </span>
                  ) : (
                    <span className="rounded-full border border-rascunho-borda px-2 py-0.5 text-xs font-semibold text-rascunho">
                      sem pacote
                    </span>
                  )}
                  {caso.maternidadeSigla ? (
                    <span className="rounded-full border border-border px-2 py-0.5 font-mono text-xs font-bold text-foreground">
                      {caso.maternidadeSigla}
                    </span>
                  ) : (
                    <span className="rounded-full border border-rascunho-borda px-2 py-0.5 text-xs font-semibold text-rascunho">
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
            {etapas.length > 0 && !compacto && (
              <div className="mt-3 border-t border-border/70" />
            )}

            {/* As três trilhas. Rascunho não tem etapas — nada de "0/0".
                No modo TV, só o estado atual de cada uma: a fita inteira
                volta ao abrir o cartão. */}
            {compacto ? (
              // Some ao abrir: a fita inteira aparece logo abaixo, e as duas
              // juntas diriam a mesma coisa duas vezes — a segunda contando
              // menos que a primeira.
              etapas.length > 0 &&
              !aberto && (
                <div className="mt-1.5">
                  <ResumoDasTrilhas etapas={etapas} />
                </div>
              )
            ) : (
              <TrilhasDoCaso etapas={etapas} />
            )}

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
          rotulo={`Ações de ${titulo}`}
          onEscolher={(item) => {
            if (item.id === 'editar') setEditando(true)
            if (item.id === 'reabrir') onReabrir?.(caso)
            if (item.id === 'descartar') {
              setErroDescarte(null)
              setDescartando(true)
            }
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
            ...(caso.ehRascunho && !caso.ehTerminal
              ? [
                  {
                    id: 'descartar',
                    rotulo: 'Descartar rascunho',
                    icone: <IconeX className="size-4" />,
                    destrutivo: true,
                    desabilitado: !descarte.habilitada,
                    motivo: descarte.motivo,
                  },
                ]
              : []),
          ]}
          gatilho={
            <span
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

      {descartando && (
        <Dialogo
          titulo="Descartar este rascunho?"
          rotuloConfirmar="Descartar rascunho"
          confirmarDestrutivo
          ocupado={cancelar.isPending}
          erro={erroDescarte}
          onCancelar={() => setDescartando(false)}
          onConfirmar={() => {
            setErroDescarte(null)
            cancelar
              .mutateAsync({
                casoId: caso.id,
                motivo: 'Rascunho descartado — evento do Calendar sem pacote/maternidade confiáveis.',
              })
              .then(
                () => setDescartando(false),
                (e) => setErroDescarte(mensagemDeErro(e)),
              )
          }}
        >
          <p className="text-sm text-muted-foreground">
            {titulo}. Ele nunca chegou a ter pacote e maternidade resolvidos — não é
            um caso cancelado, é ruído do sync que não precisa mais aparecer. Não há
            como desfazer.
          </p>
        </Dialogo>
      )}

      {/* Fora do <button> do cabeçalho e antes do painel: a faixa é sempre
          visível, aberto ou fechado. Um aviso que só aparecesse ao expandir o
          caso não seria visto na TV, que é onde ele precisa ser visto. */}
      <AvisosDoCaso etapas={etapas} />

      <Sanfona aberto={aberto} id={idPainel} rotuladoPor={idCabecalho}>
        {/* O que o resumo compacto deixou de fora volta AQUI, antes do
            detalhe: sem isto, abrir um cartão no modo TV mostraria o histórico
            e as ações sem nunca mostrar as etapas que existem. */}
        {compacto && etapas.length > 0 && (
          <div className="px-3.5 pb-1 md:px-4">
            <TrilhasDoCaso etapas={etapas} />
          </div>
        )}
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
