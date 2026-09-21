import { useMemo, useState, type LiHTMLAttributes } from 'react'
import { useSearchParams } from 'react-router'
import clsx from 'clsx'
import { Botao } from '@/components/ui/Botao'
import { dataPorExtenso, diasAtras, hojeNoFuso } from '@/lib/formato'
import { useConcluidos, useQuadro } from './api/useQuadro'
import {
  useMoverAlbum,
  useMoverVideoMaster,
  usePedirAlteracaoDaEtapa,
  useReabrirCaso,
  useRetornarDaUti,
  type EtapaTipo,
} from './api/useAcoes'
import { useRealtimeQuadro } from './api/useRealtimeQuadro'
import { mensagemDeErro } from './lib/erros'
import {
  DIAS_INICIAIS,
  DIAS_POR_PAGINA,
  agruparPorDia,
  blocosAbertos,
  blocosVisiveis,
  dividirEmDuasColunas,
  semFuturo,
} from './lib/agrupar-por-dia'
import {
  casosComVideoAberto,
  casosComVideoMasterAberto,
  casosComAlbumAberto,
  reelsAbertosDaSecao,
  videosMasterAbertos,
  albunsAbertos,
  casosConcluidos,
  casosNaUti,
} from './lib/secoes'
import { ordenarPorUrgencia } from './lib/alerta-horario'
import { filtrarCasos } from './lib/busca'
import { useRelogioDeMinuto } from '@/lib/useRelogio'
import { useTelaLarga } from './lib/useTelaLarga'
import { useModoTv } from './lib/useModoTv'
import { DiaBloco } from './components/DiaBloco'
import { CasoLinha } from './components/CasoLinha'
import { CartaoLateral } from './components/CartaoLateral'
import { PainelLateral } from './components/PainelLateral'
import { PainelDobravel } from './components/PainelDobravel'
import {
  SecaoEmModal,
  type ColunaDaSecao,
  type ItemDaSecao,
} from './components/SecaoEmModal'
import { RascunhosPainel } from './components/RascunhosPainel'
import { EntregasPainel } from './components/EntregasPainel'
import { CartaoDeEdicao } from './components/CartaoDeEdicao'
import { FaseDoVideo } from './components/FaseDoVideo'
import { FaseDoAlbum } from './components/FaseDoAlbum'
import { PrazoDaEtapa } from './components/PrazoDaEtapa'
import { PedidosDaEtapa } from './components/PedidosDaEtapa'
import { AcoesDaEtapa } from './components/AcoesDaEtapa'
import { CampoBusca } from './components/CampoBusca'
import { ReabrirCasoDialogo } from './components/ReabrirCasoDialogo'
import { DialogoAprovacaoDoFotolivro } from './components/DialogoAprovacaoDoFotolivro'
import { FichaDaEdicao } from './components/FichaDaEdicao'
import { DialogoFinalizarVideo } from './components/DialogoFinalizarVideo'
import { AtribuicaoDaSecao } from './components/AtribuicaoDaSecao'
import type { FotolivroNaEntrega, VideoNaEntrega } from './components/EntregasPainel'
import type { BlocoDia, CasoQuadro } from './types'
import {
  FASES_ALBUM_ANTES_DA_APROVACAO,
  FASES_ALBUM_NA_TELA,
  FASES_VIDEO_NA_TELA,
  FASE_ALBUM_APROVACAO,
  FASE_VIDEO_FINAL,
  ROTULO_FASE_ALBUM,
  ROTULO_FASE_VIDEO,
  faseDoVideo,
} from './types'
import type { EtapaQuadro, FaseAlbum, FaseVideoMaster } from './types'

/**
 * Aba só existe no mobile. No desktop as duas colunas convivem, porque a
 * pergunta "o que temos hoje" e a pergunta "quem está na UTI" são olhadas ao
 * mesmo tempo — inclusive na TV da sala de edição.
 */
/**
 * As duas etapas que voltam SOZINHAS para a fase de alteração, sem reabrir o
 * caso. É a mesma lista de `SECAO_DA_ETAPA` (AcoesDoCaso) e de
 * `SEM_FAIXA_NO_CARD` (AvisosDoCaso), e pelo mesmo motivo de sempre: são as que
 * têm esteira própria e não seguram o encerramento.
 */
const TEM_SECAO_PROPRIA = new Set<EtapaTipo>(['edicao_video', 'album'])

type Aba =
  | 'lista'
  | 'uti'
  | 'reels'
  | 'master'
  | 'fotolivro'
  | 'concluidos'
  | 'rascunhos'
  | 'entregas'

/** Mapa vazio estável: `new Map()` inline nasce sem tipo e vira `any` nos usos. */
const SEM_ETAPAS: Map<string, EtapaQuadro[]> = new Map()

export function QuadroPage() {

  const [aba, setAba] = useState<Aba>('lista')
  const [diasVisiveis, setDiasVisiveis] = useState(DIAS_INICIAIS)
  const { data, isPending, error } = useQuadro()
  const retornarDaUti = useRetornarDaUti()
  const [erroUti, setErroUti] = useState<string | null>(null)
  const [erroReels, setErroReels] = useState<string | null>(null)
  const [erroMaster, setErroMaster] = useState<string | null>(null)
  const [erroFotolivro, setErroFotolivro] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [reabrindo, setReabrindo] = useState<CasoQuadro | null>(null)
  // O fotolivro que está indo para aprovação pelo arrastar ou pelo "concluir"
  // do cartão — o seletor de fase abre o mesmo diálogo por conta própria.
  const [aprovandoFotolivro, setAprovandoFotolivro] = useState<{
    etapa: EtapaQuadro
    caso: CasoQuadro
  } | null>(null)
  // O vídeo que está terminando a edição pelo arrastar ou pelo ✓ do cartão —
  // o seletor de fase abre o mesmo diálogo por conta própria.
  const [finalizandoVideo, setFinalizandoVideo] = useState<{
    etapa: EtapaQuadro
    caso: CasoQuadro
  } | null>(null)
  // A ficha do cartão do MASTER ou do Foto/Livro — ver FichaDaEdicao.
  const [ficha, setFicha] = useState<{
    casoId: string
    etapaId: string
    tipo: 'master' | 'fotolivro'
  } | null>(null)
  const [erroReabrir, setErroReabrir] = useState<string | null>(null)
  const reabrirCaso = useReabrirCaso()

  /*
   * O CASO QUE O SINO MANDOU ABRIR (17/09/2026).
   *
   * Vem na URL (`/?caso=<id>`) e não em estado global: é onde o React Router
   * já guarda "para onde você foi", o botão de voltar funciona de graça, e o
   * endereço vira algo que uma pessoa pode mandar para outra — "olha este
   * caso" — sem inventarmos uma tela de caso que não existe.
   *
   * Ele NÃO é limpo depois de usado. O anel e o card aberto continuam
   * enquanto a pessoa estiver ali; sai quando ela navega. Limpar exigiria um
   * efeito mexendo no histórico durante a renderização, e o ganho seria uma
   * barra de endereços mais curta.
   */
  const casoEmFoco = useSearchParams()[0].get('caso')
  /*
   * A ABA SEGUE O CASO EM FOCO. Uma notificação de caso já entregue abre a aba
   * Entregáveis; de caso encerrado, Concluídos. Sem isto o clique levaria a um
   * Quadro onde aquele caso não está, que é pior do que não levar a lugar
   * nenhum.
   *
   * Ajuste DURANTE a renderização, que é o padrão que o React documenta para
   * estado derivado de entrada — e o mesmo que `CampoEstacao` usa. Num efeito,
   * a tela renderizaria uma vez na aba errada antes de se corrigir.
   */
  const [focoAplicado, setFocoAplicado] = useState<string | null>(null)
  const focoPendente = casoEmFoco !== null && casoEmFoco !== focoAplicado
  const alvoDoFoco =
    focoPendente && data ? (data.casos.find((c) => c.id === casoEmFoco) ?? null) : null

  /*
   * O ARQUIVO SÓ VEM QUANDO ALGUÉM PEDE (18/09/2026, correção 4 da lentidão).
   *
   * O Quadro deixou de carregar os casos arquivados — ver useConcluidos. A aba
   * os busca quando é aberta, e o FOCO também: um link para um caso que não
   * está no Quadro só pode apontar para o arquivo, e a aba certa só se sabe
   * depois de procurá-lo lá.
   */
  const focoNoArquivo = focoPendente && data !== undefined && alvoDoFoco === null
  const doArquivo = useConcluidos(aba === 'concluidos' || focoNoArquivo)

  if (focoPendente && alvoDoFoco) {
    setFocoAplicado(casoEmFoco)
    setAba(
      alvoDoFoco.ehTerminal
        ? 'concluidos'
        : alvoDoFoco.liberadoParaEntregaEm !== null
          ? 'entregas'
          : alvoDoFoco.ehRascunho
            ? 'rascunhos'
            : 'lista',
    )
  } else if (focoNoArquivo && ((doArquivo.data && !doArquivo.isFetching) || doArquivo.isError)) {
    // Procurado no arquivo. Se nem lá estiver — link velho, rascunho
    // descartado —, a tela fica onde está, como antes.
    setFocoAplicado(casoEmFoco)
    if (doArquivo.data?.casos.some((c) => c.id === casoEmFoco)) setAba('concluidos')
  }
  // Arrastar entre as colunas do modal cai nas MESMAS RPCs do seletor de fase
  // do cartão — o atalho não é um segundo caminho de escrita.
  const moverVideo = useMoverVideoMaster()
  const moverAlbum = useMoverAlbum()
  const pedirAlteracao = usePedirAlteracaoDaEtapa()

  const hoje = hojeNoFuso()
  const agora = useRelogioDeMinuto()
  const telaLarga = useTelaLarga()
  const [modoTv] = useModoTv()
  // Mantém o Quadro igual em todos os aparelhos — ver useRealtimeQuadro.
  const { conectado } = useRealtimeQuadro()

  const buscando = busca.trim() !== ''

  const {
    blocos,
    rascunhos,
    entregas,
    naUti,
    emReels,
    emMaster,
    emFotolivro,
    fotolivrosNaEntrega,
    videosNaEntrega,
    totalAbertos,
    totalGeral,
  } = useMemo(() => {
    const todos = data?.casos ?? []
    const etapas = data?.etapasPorCaso ?? SEM_ETAPAS

    // A busca filtra ANTES do agrupamento, e por isso vale para tudo de uma
    // vez: dias, rascunhos e as três seções — e os concluídos, logo abaixo,
    // pela mesma função. Filtrar depois exigiria repetir a regra em cada lista,
    // e elas divergiriam na primeira vez que alguem mexesse em uma só.
    const casos = filtrarCasos(todos, busca)

    /*
     * O QUADRO PERDE O QUE JÁ FOI ENVIADO (06/09/2026, pedido do gestor).
     *
     * Isto abre uma exceção na regra de visibilidade da invariante 3.5 — "um
     * dia só sai da tela quando todos os casos dele estão encerrados ou
     * cancelados". A regra existia para que trabalho parado não sumisse de
     * vista; um caso enviado não é trabalho parado, é trabalho terminado
     * esperando OUTRA pessoa. E ele não sai de vista: está na aba
     * Entregáveis, que desde 06/09 é visível para a equipe inteira.
     *
     * O que se perderia sem essa condição: o Quadro do dia continuaria
     * mostrando cartões que ninguém mais vai tocar, e "0 de 4 concluídos"
     * mediria a entrega do ADM em vez do trabalho do turno.
     */
    const noQuadro = casos.filter((c) => c.liberadoParaEntregaEm === null)

    // A urgência entra POR CIMA da ordem por hora, não no lugar dela: quem não
    // está em alerta mantém a posição cronológica. Ver ordenarPorUrgencia.
    //
    // SEM FUTURO (30/08/2026, a pedido do gestor): o Quadro corta em `hoje`.
    // Ver a nota de `semFuturo` em agrupar-por-dia.ts.
    const abertos = semFuturo(blocosAbertos(agruparPorDia(noQuadro)), hoje).map((bloco) => ({
      ...bloco,
      casos: ordenarPorUrgencia(bloco.casos, etapas, agora),
    }))

    return {
      blocos: abertos,
      rascunhos: casos.filter((c) => c.ehRascunho && !c.ehTerminal && !c.naUti),
      /*
       * ENVIADOS e ainda abertos, na ordem em que foram enviados.
       *
       * Ordem de envio e não de prazo: prazo é a régua do Quadro, onde o
       * trabalho ainda acontece. Aqui o trabalho acabou, e quem espera há mais
       * tempo é quem tem que ser atendido primeiro.
       *
       * Estes casos SAEM do Quadro (ver `noQuadro` acima): daqui em diante o
       * caso é assunto de quem entrega, não do turno.
       */
      entregas: casos
        .filter((c) => c.liberadoParaEntregaEm !== null && !c.ehTerminal)
        .sort((a, b) =>
          (a.liberadoParaEntregaEm ?? '').localeCompare(b.liberadoParaEntregaEm ?? ''),
        ),
      naUti: casosNaUti(casos),
      emReels: casosComVideoAberto(casos, etapas),
      emMaster: casosComVideoMasterAberto(casos, etapas),
      emFotolivro: casosComAlbumAberto(casos, etapas),
      /*
       * O FOTO/LIVRO EM ENTREGÁVEIS (21/09/2026, pedido do gestor). Duas
       * passagens: a PROVA para o ADM mandar ao cliente (sai quando ele marca
       * "Enviado ao cliente"), e o LIVRO PRONTO para ele confirmar a entrega.
       * Na seção o cartão fica onde está nas duas — o que muda é quem precisa
       * agir. Derivado das etapas, como o resto: a fase e o carimbo dizem tudo.
       */
      fotolivrosNaEntrega: casos
        .filter((c) => c.statusOperacional !== 'cancelado')
        .flatMap((caso) =>
          (etapas.get(caso.id) ?? [])
            .filter((e) => e.tipo === 'album')
            .flatMap((etapa): FotolivroNaEntrega[] =>
              etapa.faseAlbum === 'aguardando_aprovacao' && etapa.fotolivroEnviadoEm === null
                ? [{ caso, etapa, momento: 'aprovacao' }]
                : etapa.faseAlbum === 'pronto_para_entrega'
                  ? [{ caso, etapa, momento: 'entrega' }]
                  : [],
            ),
        ),
      /*
       * O VÍDEO DO MASTER EM ENTREGÁVEIS (21/09/2026, pedido do gestor): o vídeo
       * terminado, com os dois links, esperando a Morgana confirmar a entrega.
       * Na seção ele fica em "Pronto para entrega" até lá.
       */
      videosNaEntrega: casos
        .filter((c) => c.statusOperacional !== 'cancelado')
        .flatMap((caso): VideoNaEntrega[] =>
          (etapas.get(caso.id) ?? [])
            .filter((e) => e.tipo === 'edicao_video' && e.status === FASE_VIDEO_FINAL)
            .map((etapa) => ({ caso, etapa })),
        ),
      totalAbertos: abertos.reduce((soma, b) => soma + b.total, 0),
      // O denominador do "3 de 88". Sem ele a busca diria "3 casos" e não
      // haveria como saber se sobrou pouco por filtro ou por dia vazio. Corta
      // futuro pelo mesmo motivo que `abertos`: senão a busca vazia diria
      // "88" enquanto a tela mostra só os dias até hoje.
      totalGeral: semFuturo(blocosAbertos(agruparPorDia(todos)), hoje).reduce(
        (soma, b) => soma + b.total,
        0,
      ),
    }
    // `agora` entra nas dependências porque a ordem depende dele: um caso entra
    // na janela de alerta sozinho, com o relógio andando, e precisa subir sem
    // que ninguém recarregue. O relógio bate de minuto em minuto e são ~90
    // casos — reagrupar custa nada. `hoje` entra pelo mesmo motivo que
    // `semFuturo` existe: à meia-noite um dia deixa de ser futuro sozinho.
  }, [data, busca, agora, hoje])

  // A aba Concluídos lê do ARQUIVO, que tem consulta própria — ver useConcluidos.
  const concluidos = useMemo(
    () => casosConcluidos(filtrarCasos(doArquivo.data?.casos ?? [], busca)),
    [doArquivo.data, busca],
  )

  if (error) {
    return (
      <Aviso titulo="Não foi possível carregar o Quadro">
        {error instanceof Error ? error.message : 'Erro desconhecido.'}
      </Aviso>
    )
  }

  const etapasPorCaso = data?.etapasPorCaso ?? SEM_ETAPAS
  // A aba conta os casos, os Foto/Livros e os vídeos que esperam o ADM — todos
  // são "alguém precisa entregar", e o anel verde gira para todos.
  const naEntrega = entregas.length + fotolivrosNaEntrega.length + videosNaEntrega.length
  // Os cartões de Concluídos leem as etapas do ARQUIVO, que é a consulta deles.
  // O mapa do Quadro fica de reserva para o que está nos dois lugares — o
  // MASTER encerrado com o vídeo ainda aberto.
  const etapasDoArquivo = doArquivo.data?.etapasPorCaso ?? SEM_ETAPAS
  const etapasDoConcluido = (casoId: string): EtapaQuadro[] =>
    etapasDoArquivo.get(casoId) ?? etapasPorCaso.get(casoId) ?? []

  // O corte por dia NUNCA leva o turno junto — ver `blocosVisiveis`.
  // E o dia do caso em foco também não: uma notificação que aponta para um dia
  // fora do corte levaria a pessoa a um Quadro sem o card dela.
  const mostrados = (() => {
    const base = blocosVisiveis(blocos, diasVisiveis, hoje)
    const doFoco =
      casoEmFoco === null
        ? undefined
        : blocos.find((b) => b.casos.some((c) => c.id === casoEmFoco))
    if (!doFoco || base.includes(doFoco)) return base
    // Filtrar sobre `blocos` mantém a ordem crescente sem reordenar nada.
    return blocos.filter((b) => base.includes(b) || b === doFoco)
  })()
  const restantes = blocos.length - mostrados.length

  /*
   * O MODO TV É ESCOLHIDO, NÃO ADIVINHADO (01/09/2026, a pedido do gestor).
   *
   * A versão anterior ligava as duas colunas sozinha a partir de sete cartões.
   * O gestor pediu o contrário: "ficariam as 2 opções, a lista normal como
   * temos, e essa opção de dividir o espaço entre 2 dias". Ele tem razão — a
   * escolha não depende de quantos casos existem hoje, depende de quem está
   * olhando. Ver `useModoTv`.
   *
   * `telaLarga` continua no E porque o layout precisa de largura de verdade:
   * duas colunas de 300px não cabem um cartão. O botão só aparece onde ele
   * funciona (ver o cabeçalho), então esta condição não deveria falhar sozinha
   * — ela existe para a janela que ENCOLHE depois de o modo estar ligado.
   */
  const [atrasados, doTurno] = dividirEmDuasColunas(mostrados, hoje)

  /*
   * DUAS COLUNAS SÓ QUANDO HÁ DUAS PERGUNTAS.
   *
   * Se nenhum dia ficou para trás — ou se, ao contrário, só há dias velhos na
   * tela — não existe a divisão "o que atrasou / o que vem": existe uma lista
   * só. Meia tela em branco ao lado dela não organiza nada, e o gestor já
   * tinha dito isso da primeira vez, sobre o movimento baixo.
   */
  const emDuasColunas =
    telaLarga && modoTv && atrasados.length > 0 && doTurno.length > 0

  // Fora do modo TV é uma coluna só, mas com a mesma forma — assim o JSX
  // abaixo tem um caminho, não dois.
  const colunasDeDias = emDuasColunas ? [atrasados, doTurno] : [mostrados]

  /**
   * O QUE NASCE ABERTO: o que já está atrasado, e hoje (17/09/2026, pedido do
   * gestor).
   *
   * A REGRA ANTIGA ERA POSIÇÃO, e é isso que estava errado. Fora do modo TV
   * abriam "os dois primeiros dias" da lista — e a lista é do MAIS VELHO para
   * o mais novo, então os dois abertos eram os dois dias mais antigos e HOJE
   * vinha fechado. Medido no remoto em 17/09: quatro dias com trabalho aberto
   * (13, 15 e 16 de setembro com um caso cada, e hoje com SETE), e os que
   * nasciam abertos eram 13 e 15.
   *
   * O CAMINHO PELO QUAL ELE VIU ISSO foi a UTI: um caso volta da UTI para um
   * dia de dois meses atrás — aquele dia tinha sumido do Quadro justamente
   * porque só lhe restava o caso na UTI (ver `montarBloco`) — e reaparece
   * fechado, obrigando a procurar e abrir. As palavras dele: "como está já
   * atrasado, apareça com destaque ali". Vale para toda volta, não só a da
   * UTI: reabertura de caso, devolução de Entregáveis, um cancelamento
   * desfeito.
   *
   * A REGRA NOVA É SIGNIFICADO: **atrasado abre, hoje abre**, amanhã e o bloco
   * SEM DATA nascem fechados. Atrasado abre porque é o que cobra alguém agora;
   * amanhã fica fechado porque é prévia, não turno.
   *
   * ISTO REVISA O DESENHO DO MODO TV de 01/09 ("anteontem fechado com a
   * possibilidade de abrir, ontem inteiro à mostra"), e a revisão é do mesmo
   * gestor. O medo de então — abrir tudo enche a tela — continua endereçado
   * por outro lado: `blocosVisiveis` mostra no máximo `diasVisiveis` blocos, e
   * um dia sem trabalho aberto nem chega aqui.
   *
   * Não é a mesma coisa que o `emAtraso` do cabeçalho: lá é a cor, aqui é a
   * sanfona. As duas respondem "este dia ficou para trás" e é de propósito que
   * usem o mesmo `diasAtras`.
   */
  const abrePorPadrao = (bloco: BlocoDia): boolean => {
    if (buscando) return true
    // Sem data não é passado — é ausência de dado (ver `semFuturo`). Abrir por
    // suspeita seria afirmar o que o dado não diz.
    if (bloco.dia === null) return false
    return diasAtras(bloco.dia, hoje) >= 0
  }

  const listaPorDia = (
    <>
      {blocos.length === 0 ? (
        buscando ? (
          <Aviso titulo={`Nada encontrado para “${busca.trim()}”`}>
            A busca olha nome da mãe, do bebê, pacote e maternidade. O caso pode
            estar em Rascunhos ou Concluídos — as abas filtram pelo mesmo termo.
          </Aviso>
        ) : (
          <Aviso titulo="Nenhum dia aberto">
            Todo caso previsto já foi resolvido ou está na UTI. Um dia só sai do
            Quadro quando não sobra trabalho nele — nunca por passagem de data.
          </Aviso>
        )
      ) : (
        <div className="space-y-5">
          {/*
            DUAS COLUNAS NA TV, uma no resto (01/09/2026, a pedido do gestor).

            A tela vai ficar ligada numa TV de 70" na sala, e o pedido dele foi
            literal: "o principal é ter todos os cards à vista". Num dia cheio
            — ontem com cinco casos abertos e hoje com oito — a lista de uma
            coluna só passa da altura da tela, e uma tela na parede ninguém
            rola.

            O espaço para isso já existia e estava sendo desperdiçado: o cartão
            usa perto de 40% da largura e o resto é vão. Em duas colunas o
            conteúdo continua do mesmo tamanho e a capacidade vertical dobra.

            LIGA POR BOTÃO, não sozinha — ver `useModoTv` e o cabeçalho. E
            junto com as colunas vem o cartão compacto (`ResumoDasTrilhas`):
            só as colunas cortam o conteúdo de ~3600px para ~2200px, o que
            ainda é o triplo dos 784px que a lista tem de altura útil em
            1080p. Metade da altura do cartão era a fita das etapas; é dela
            que sai o resto.

            A ESQUERDA É O ATRASO, A DIREITA É O TURNO — ver
            `dividirEmDuasColunas`. Não é uma lista repartida ao meio: são
            duas perguntas, e um dia nunca atravessa de uma para a outra.
          */}
          <div
            className={clsx(
              emDuasColunas &&
                // `items-start`: sem isto as duas colunas esticam até a altura
                // da mais alta, e o vão da mais curta vira uma faixa clicável
                // que não é cartão nenhum.
                'grid grid-cols-2 items-start gap-5',
            )}
          >
            {colunasDeDias.map((coluna, indiceColuna) => (
              <div key={indiceColuna} className="space-y-5">
                {coluna.map((bloco) => (
                  <DiaBloco
                    // A chave carrega o estado de busca E o modo de propósito:
                    // o DiaBloco guarda "aberto" em estado próprio, e sem
                    // remontar ele ignoraria a mudança dos dois. Um resultado
                    // escondido dentro de um dia fechado é uma busca que
                    // respondeu e não mostrou; e ligar o modo TV precisa
                    // reaplicar quem abre e quem fecha.
                    // `casoEmFoco` entra na chave pelo mesmo motivo que a
                    // busca: o bloco guarda "aberto" em estado próprio, e o
                    // dia que recebe o foco precisa nascer aberto de novo.
                    key={`${bloco.dia ?? 'sem-data'}-${buscando}-${emDuasColunas}-${casoEmFoco ?? ''}`}
                    bloco={bloco}
                    hoje={hoje}
                    etapasPorCaso={etapasPorCaso}
                    {...(casoEmFoco ? { casoEmFoco } : {})}
                    abertoInicialmente={
                      abrePorPadrao(bloco) ||
                      // O dia do caso em foco abre, seja ele de quando for.
                      (casoEmFoco !== null && bloco.casos.some((c) => c.id === casoEmFoco))
                    }
                    compacto={emDuasColunas}
                  />
                ))}
              </div>
            ))}
          </div>

          {/* Ida e volta. Sem o "exibir menos", carregar mais era um caminho
              de mão única: quem abrisse 30 dias para procurar um caso ficava
              com os 30 rolando embaixo pelo resto do turno, e a única saída
              era recarregar a página — que também perde o que estiver aberto. */}
          {(restantes > 0 || diasVisiveis > DIAS_INICIAIS) && (
            <div className="flex flex-col gap-2 pt-1 pb-2 sm:flex-row sm:justify-center">
              {restantes > 0 && (
                <Botao
                  onClick={() => setDiasVisiveis((n) => n + DIAS_POR_PAGINA)}
                  className="w-full sm:w-auto"
                >
                  Carregar mais dias ({restantes} restantes)
                </Botao>
              )}
              {diasVisiveis > DIAS_INICIAIS && (
                // Contorno, não primário: desfazer não disputa atenção com
                // avançar.
                <Botao
                  variante="contorno"
                  onClick={() => setDiasVisiveis(DIAS_INICIAIS)}
                  className="w-full sm:w-auto"
                >
                  Exibir menos
                </Botao>
              )}
            </div>
          )}
        </div>
      )}
    </>
  )

  const conteudoUti = (
    <>
      {naUti.map((caso) => (
        <CartaoLateral
          key={caso.id}
          caso={caso}
          hoje={hoje}
          destaque="uti"
          detalhe={`Na UTI há ${duracaoDesde(caso.utiDesde, agora)}`}
          acao={
            <Botao
              variante="contorno"
              onda
              disabled={retornarDaUti.isPending}
              onClick={() => {
                setErroUti(null)
                retornarDaUti
                  .mutateAsync({ casoId: caso.id })
                  .catch((e) => setErroUti(mensagemDeErro(e)))
              }}
              className="px-3 text-xs"
            >
              Voltar da UTI
            </Botao>
          }
        />
      ))}
    </>
  )

  const conteudoReels = emReels.map((caso) => (
    <CartaoDeEdicao
      key={caso.id}
      caso={caso}
      hoje={hoje}
      etapas={etapasPorCaso.get(caso.id) ?? []}
      daSecao={reelsAbertosDaSecao(etapasPorCaso.get(caso.id) ?? [])}
      onErro={setErroReels}
    />
  ))

  /*
   * OS CONTROLES DO MASTER E DO FOTO/LIVRO, num lugar só (21/09/2026). O cartão
   * da seção e a FICHA (FichaDaEdicao) mostram exatamente os mesmos — a ficha
   * só os põe numa tela maior. `onErro` é de quem mostra: o alerta da seção no
   * cartão, o da própria ficha nela.
   */
  const controlesDoMaster = (
    caso: CasoQuadro,
    etapa: EtapaQuadro,
    onErro: (mensagem: string | null) => void,
  ) => (
    <>
      {/* PRAZO e PEDIDOS entram ao lado da fase (16/09/2026, pedido do
          gestor): a data combinada para ESTE vídeo, e o que a família pediu
          — prints, link de música. Ver PrazoDaEtapa e PedidosDaEtapa. */}
      <AtribuicaoDaSecao etapa={etapa} onErro={onErro} />
      <PrazoDaEtapa etapa={etapa} onErro={onErro} />
      <PedidosDaEtapa etapa={etapa} onErro={onErro} />
      <FaseDoVideo etapa={etapa} nomeDoCaso={nomeDoCaso(caso)} onErro={onErro} />
      {/* EM PRONTO O VÍDEO ESTÁ EM ENTREGÁVEIS (21/09/2026): parado aqui,
          esperando a Morgana confirmar a entrega — a pílula diz onde ele está. */}
      {etapa.status === FASE_VIDEO_FINAL && (
        <span className="inline-flex items-center rounded-full bg-atencao/15 px-2.5 py-1 text-xs font-bold text-atencao-tinta">
          Em Entregáveis
        </span>
      )}
      <AcoesDaEtapa
        etapa={etapa}
        etapas={etapasPorCaso.get(caso.id) ?? []}
        onErro={onErro}
        /* TERMINAR A EDIÇÃO COBRA OS DOIS LINKS (21/09/2026). Era um
           `concluir_etapa` direto, sem link e sem Entregáveis — foi assim que a
           maioria dos vídeos concluiu sem link nenhum. Em pronto o cartão não
           conclui nada: o fim é a confirmação da entrega. */
        concluirComo={
          etapa.status === FASE_VIDEO_FINAL
            ? null
            : {
                rotulo: 'Finalizar a edição e mandar para Entregáveis',
                aoTocar: () => setFinalizandoVideo({ etapa, caso }),
              }
        }
      />
    </>
  )

  const controlesDoFotolivro = (
    caso: CasoQuadro,
    etapa: EtapaQuadro,
    onErro: (mensagem: string | null) => void,
  ) => (
    <>
      <AtribuicaoDaSecao etapa={etapa} onErro={onErro} />
      <PrazoDaEtapa etapa={etapa} onErro={onErro} />
      <PedidosDaEtapa etapa={etapa} onErro={onErro} />
      <FaseDoAlbum etapa={etapa} nomeDoCaso={nomeDoCaso(caso)} onErro={onErro} />
      {/* ONDE O LIVRO ESTÁ FORA DA SEÇÃO (21/09/2026). Nas duas fases que
          passam por Entregáveis o cartão fica parado aqui, e sem esta pílula
          a seção não diria se a prova já foi mandada ao cliente ou ainda
          espera o ADM — que é exatamente a pergunta de quem cobra. */}
      {etapa.faseAlbum === FASE_ALBUM_APROVACAO && (
        <span
          className={clsx(
            'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold',
            etapa.fotolivroEnviadoEm
              ? 'bg-muted text-muted-foreground'
              : 'bg-atencao/15 text-atencao-tinta',
          )}
        >
          {etapa.fotolivroEnviadoEm ? 'Enviado ao cliente' : 'Na fila do ADM'}
        </span>
      )}
      {etapa.faseAlbum === 'pronto_para_entrega' && (
        <span className="inline-flex items-center rounded-full bg-atencao/15 px-2.5 py-1 text-xs font-bold text-atencao-tinta">
          Em Entregáveis
        </span>
      )}
      <AcoesDaEtapa
        etapa={etapa}
        etapas={etapasPorCaso.get(caso.id) ?? []}
        onErro={onErro}
        /* TERMINAR A DIAGRAMAÇÃO MANDA PARA APROVAÇÃO (21/09/2026). Era um
           `concluir_etapa`, e o livro inteiro acabava e saía da seção — "o
           card simplesmente se move sozinho". Depois da aprovação o cartão
           não conclui nada: quem anda é a fase, e o fim é a confirmação da
           entrega em Entregáveis. */
        concluirComo={
          etapa.faseAlbum === null || FASES_ALBUM_ANTES_DA_APROVACAO.has(etapa.faseAlbum)
            ? {
                rotulo: 'Terminar a diagramação e mandar para aprovação',
                aoTocar: () => setAprovandoFotolivro({ etapa, caso }),
              }
            : null
        }
      />
    </>
  )

  /*
   * A FICHA ABERTA guarda só os ids: o caso e a etapa são lidos do Quadro a cada
   * render, para a ficha acompanhar o Realtime como o cartão acompanha. Se o
   * caso sair do Quadro (arquivou), a ficha some junto.
   */
  const abrirFicha = (
    caso: CasoQuadro,
    etapa: EtapaQuadro | undefined,
    tipo: 'master' | 'fotolivro',
  ) => {
    if (etapa) setFicha({ casoId: caso.id, etapaId: etapa.id, tipo })
  }

  const cartaoMaster = (caso: CasoQuadro, raiz?: LiHTMLAttributes<HTMLLIElement>) => (
    <CartaoDeEdicao
      key={caso.id}
      {...(raiz ? { raiz } : {})}
      caso={caso}
      hoje={hoje}
      etapas={etapasPorCaso.get(caso.id) ?? []}
      daSecao={videosMasterAbertos(etapasPorCaso.get(caso.id) ?? [])}
      // Uma rodada só: o rótulo de bloco do reels ("Parto") não se aplica.
      rotularLinha={() => 'Vídeo'}
      /*
       * A FASE E O RELÓGIO, LADO A LADO (09/09/2026, pedido do gestor).
       *
       * Até aqui a seção MASTER só tinha o seletor de fase, e a decisão estava
       * escrita como "o vídeo não anda por play/pause/concluir". Ela media
       * bem o TRAJETO do vídeo — Editando, Alterações, Pronto, Enviado — e não
       * media nada do TEMPO dentro dele: um vídeo de dez dias úteis ficava
       * "Editando" a semana inteira, incluindo os dias em que ninguém sentou
       * nele. Sem pausa não há como dizer onde o tempo foi, e tempo de edição
       * de vídeo é justamente o que a empresa quer cobrar (seção 9).
       *
       * As duas coisas não brigam porque respondem a perguntas diferentes — a
       * fase é ONDE o vídeo está no fluxo, o relógio é QUANTO se trabalhou —,
       * e o banco já as tratava juntas: `mover_video_master` sempre carimbou
       * `iniciado_em`, `pausa_acumulada` e `pausado_em`, e `faseDoVideo`
       * sempre leu `pausada` como "Editando". Faltava a porta na tela.
       *
       * As GUARDAS de `AcoesDaEtapa` continuam valendo sem mudança: em
       * ALTERAÇÕES e em PRONTO o play aparece desabilitado dizendo que ali
       * quem manda é a fase. É o certo — nesses dois estados o vídeo não está
       * sendo editado, está esperando alguém de fora.
       */
      acoesDaLinha={(etapa) => controlesDoMaster(caso, etapa, setErroMaster)}
      // A linha já diz a fase por extenso; um selo repetindo em outras
      // palavras logo acima seria ruído.
      comSelo={false}
      // Quatro controles numa ponta só espremiam o nome da etapa — ver
      // `acoesAbaixo` em CartaoDeEdicao.
      acoesAbaixo
      rotuloObservacao="Pedidos do cliente"
      onAbrir={() => abrirFicha(caso, videosMasterAbertos(etapasPorCaso.get(caso.id) ?? [])[0], 'master')}
      onErro={setErroMaster}
    />
  )
  const conteudoMaster = emMaster.map((caso) => cartaoMaster(caso))

  /*
   * O CARTÃO DO FOTOLIVRO — a fase E o relógio, como ficou o MASTER em 09/09.
   *
   * `comSelo={false}` pelo mesmo motivo de lá: a linha já diz a fase por
   * extenso, e um selo repetindo em outras palavras logo acima seria ruído.
   *
   * O PLAY/PAUSE fica junto de propósito, e aqui ele vale ainda mais que no
   * vídeo: das dez fases só UMA é trabalho acontecendo, e sem o relógio o
   * tempo de diagramação — a única parte que a equipe controla — ficaria
   * enterrado num mês de espera por cliente e gráfica.
   */
  const cartaoFotolivro = (caso: CasoQuadro, raiz?: LiHTMLAttributes<HTMLLIElement>) => (
    <CartaoDeEdicao
      key={caso.id}
      {...(raiz ? { raiz } : {})}
      caso={caso}
      hoje={hoje}
      etapas={etapasPorCaso.get(caso.id) ?? []}
      daSecao={albunsAbertos(etapasPorCaso.get(caso.id) ?? [])}
      // Uma etapa por caso, e o rótulo do bloco do reels ("Parto") não se
      // aplica. O nome repete o da seção de propósito: é o mesmo nome que a
      // etapa tem no card, e ler dois nomes para a mesma coisa foi exatamente
      // o que o gestor pediu para acabar em 10/09.
      rotularLinha={() => 'Foto/Livro'}
      acoesDaLinha={(etapa) => controlesDoFotolivro(caso, etapa, setErroFotolivro)}
      comSelo={false}
      acoesAbaixo
      rotuloObservacao="Pedidos do cliente"
      onAbrir={() => abrirFicha(caso, albunsAbertos(etapasPorCaso.get(caso.id) ?? [])[0], 'fotolivro')}
      onErro={setErroFotolivro}
    />
  )
  const conteudoFotolivro = emFotolivro.map((caso) => cartaoFotolivro(caso))

  /*
   * O MESMO DIÁLOGO, DOIS EFEITOS (16/09/2026, pedido do gestor).
   *
   * Marcar "Foto" reabre o CASO; marcar "Vídeo" ou "Foto/Livro" devolve só a
   * ETAPA para a fase de alteração, com o caso seguindo encerrado. Quem decide
   * é o TIPO, e a divisão mora aqui e não no diálogo — ele pergunta, esta
   * função executa. Ver ReabrirCasoDialogo e a migration 20260916215022.
   *
   * O PEDIDO DAS SEÇÕES VAI PRIMEIRO. Se a reabertura do caso falhar, o vídeo
   * já voltou e a pessoa vê o erro e tenta de novo só a parte que faltou; na
   * ordem inversa, um caso reaberto por engano precisaria ser encerrado outra
   * vez à mão.
   *
   * A rodada é a MAIOR de cada tipo: um vídeo que já passou por alteração antes
   * tem duas linhas, e quem volta é a última — a que foi entregue.
   */
  async function confirmarReabertura(
    caso: CasoQuadro,
    motivo: string,
    escolhidas: EtapaTipo[],
  ) {
    const doCaso = etapasDoConcluido(caso.id)
    const comSecao = escolhidas.filter((t) => TEM_SECAO_PROPRIA.has(t))
    const pelaReabertura = escolhidas.filter((t) => !TEM_SECAO_PROPRIA.has(t))

    setErroReabrir(null)
    try {
      for (const tipo of comSecao) {
        const etapa = doCaso
          .filter((e) => e.tipo === tipo)
          .reduce<EtapaQuadro | null>(
            (maior, e) => (maior === null || e.rodada > maior.rodada ? e : maior),
            null,
          )
        if (etapa) {
          await pedirAlteracao.mutateAsync({ casoEtapaId: etapa.id, motivo })
        }
      }
      if (pelaReabertura.length > 0) {
        await reabrirCaso.mutateAsync({
          casoId: caso.id,
          motivo,
          etapas: pelaReabertura,
        })
      }
      setReabrindo(null)
    } catch (e) {
      setErroReabrir(mensagemDeErro(e))
    }
  }

  const CRITERIO_REELS =
    'Vídeo liberado para editar, em andamento ou pausado. O caso segue na lista do dia.'
  const CRITERIO_MASTER =
    'Horizontal do MASTER, do backlog ao enviado. Prazo de 10 dias úteis.'
  const CRITERIO_FOTOLIVRO =
    'Foto/Livro do pagamento à entrega. Segue depois do caso encerrar.'
  const CRITERIO_UTI = 'Fora do dia e com o prazo de entrega congelado.'

  /*
   * MASTER E FOTO/LIVRO EM MODAL (15/09/2026). Cada cartão vai junto com a FASE
   * em que o caso está, para o modal poder mostrar a mesma lista em colunas.
   * Os cartões são os mesmos da aba do celular — só a moldura muda.
   *
   * A fase do MASTER sai de `faseDoVideo`, que lê `pausada` como "Editando" —
   * a mesma leitura do seletor, para a coluna e a pílula nunca discordarem.
   */
  const itensMaster: ItemDaSecao[] = emMaster.map((caso) => {
    const video = videosMasterAbertos(etapasPorCaso.get(caso.id) ?? [])[0]
    return {
      id: caso.id,
      fase: video ? faseDoVideo(video.status) : null,
      cartao: (raiz) => cartaoMaster(caso, raiz),
    }
  })
  const itensFotolivro: ItemDaSecao[] = emFotolivro.map((caso) => ({
    id: caso.id,
    fase: albunsAbertos(etapasPorCaso.get(caso.id) ?? [])[0]?.faseAlbum ?? null,
    cartao: (raiz) => cartaoFotolivro(caso, raiz),
  }))

  /*
   * AS COLUNAS DO MASTER, SEM SAÍDA (21/09/2026). "Pronto para entrega" é a
   * última coluna e SEGURA o cartão: o vídeo terminado espera nela, em
   * Entregáveis, até a Morgana confirmar a entrega — é a confirmação que o tira
   * da seção. De 16/09 a 21/09 ela era coluna de saída: soltar ali pedia um link
   * e concluía o vídeo na hora. Soltar nela agora abre o pedido dos dois links.
   */
  const colunasMaster: ColunaDaSecao[] = [
    ...FASES_VIDEO_NA_TELA.map((fase) => ({ id: fase, rotulo: ROTULO_FASE_VIDEO[fase] })),
    { id: FASE_VIDEO_FINAL, rotulo: ROTULO_FASE_VIDEO[FASE_VIDEO_FINAL] },
  ]
  // SEM COLUNA DE SAÍDA NO FOTO/LIVRO (21/09/2026): "Pronto para entrega" é a
  // última coluna e SEGURA o cartão até a Morgana confirmar a entrega em
  // Entregáveis. Até aqui soltar nela concluía a etapa.
  const colunasFotolivro: ColunaDaSecao[] = FASES_ALBUM_NA_TELA.map((fase) => ({
    id: fase,
    rotulo: ROTULO_FASE_ALBUM[fase],
  }))

  /*
   * SOLTAR UM CARTÃO NUMA COLUNA — o atalho do arrastar (16/09/2026, pedido do
   * gestor). Cai nas MESMAS RPCs do seletor de fase, e o erro vai para o mesmo
   * alerta da seção: o arrastar não é um segundo caminho de escrita, é outra
   * mão no mesmo caminho.
   */
  const soltarNoMaster = async (casoId: string, fase: string) => {
    const video = videosMasterAbertos(etapasPorCaso.get(casoId) ?? [])[0]
    if (!video) return false
    setErroMaster(null)
    // PRONTO pede os dois links antes: o cartão não muda de coluna agora, e sim
    // quando o diálogo gravar — o remendo do Quadro o leva para lá.
    if (fase === FASE_VIDEO_FINAL) {
      const caso = emMaster.find((c) => c.id === casoId)
      if (caso && video.status !== FASE_VIDEO_FINAL) setFinalizandoVideo({ etapa: video, caso })
      return false
    }
    try {
      await moverVideo.mutateAsync({ casoEtapaId: video.id, fase: fase as FaseVideoMaster })
      return true
    } catch (e) {
      setErroMaster(mensagemDeErro(e))
      return false
    }
  }

  const soltarNoFotolivro = async (casoId: string, fase: string) => {
    const album = albunsAbertos(etapasPorCaso.get(casoId) ?? [])[0]
    if (!album) return false
    setErroFotolivro(null)
    // A aprovação pede capa e link antes: o cartão não muda de coluna agora, e
    // sim quando o diálogo gravar — o remendo do Quadro o leva para lá.
    if (fase === FASE_ALBUM_APROVACAO) {
      const caso = emFotolivro.find((c) => c.id === casoId)
      if (caso) setAprovandoFotolivro({ etapa: album, caso })
      return false
    }
    try {
      await moverAlbum.mutateAsync({ casoEtapaId: album.id, fase: fase as FaseAlbum })
      return true
    } catch (e) {
      setErroFotolivro(mensagemDeErro(e))
      return false
    }
  }

  const painelReels = (
    <PainelLateral
      titulo="Reels"
      quantidade={emReels.length}
      criterio={CRITERIO_REELS}
      vazio="Nenhum vídeo aberto."
      erro={erroReels}
    >
      {conteudoReels}
    </PainelLateral>
  )

  const painelUti = (
    <PainelLateral
      titulo="UTI"
      quantidade={naUti.length}
      criterio={CRITERIO_UTI}
      vazio="Nenhum bebê na UTI."
      erro={erroUti}
    >
      {conteudoUti}
    </PainelLateral>
  )

  const painelMaster = (
    <PainelLateral
      titulo="Master"
      quantidade={emMaster.length}
      criterio={CRITERIO_MASTER}
      vazio="Nenhum vídeo de MASTER em andamento."
      erro={erroMaster}
    >
      {conteudoMaster}
    </PainelLateral>
  )

  const painelFotolivro = (
    <PainelLateral
      titulo="Foto/Livro"
      quantidade={emFotolivro.length}
      criterio={CRITERIO_FOTOLIVRO}
      vazio="Nenhum Foto/Livro em produção."
      erro={erroFotolivro}
    >
      {conteudoFotolivro}
    </PainelLateral>
  )

  const listaConcluidos =
    concluidos.length === 0 ? (
      <Aviso
        titulo={
          buscando
            ? `Nada concluído para “${busca.trim()}”`
            : 'Nenhum caso concluído ainda'
        }
      >
        Casos encerrados e cancelados aparecem aqui.
      </Aviso>
    ) : (
      <div className="space-y-2 p-3 md:p-4">
        {concluidos.map((caso) => (
          // O botão solto de reabrir saiu daqui e virou item do menu do
          // próprio cartão — ver CasoLinha. Ele pendurava abaixo do cartão,
          // fora da moldura dele, e era a única ação da tela que morava do
          // lado de fora do objeto sobre o qual agia.
          <CasoLinha
            // A chave carrega o foco: um card já montado e fechado ignoraria
            // o `emFoco`, que só vale no nascimento do estado.
            key={`${caso.id}-${caso.id === casoEmFoco ? 'foco' : ''}`}
            caso={caso}
            etapas={etapasDoConcluido(caso.id)}
            emFoco={caso.id === casoEmFoco}
            onReabrir={(c) => {
              setErroReabrir(null)
              setReabrindo(c)
            }}
          />
        ))}
      </div>
    )

  return (
    <div className="flex h-full flex-col">
      {/* Sem `bg-card`: o chão pastel passa por baixo do cabeçalho da página
          agora, e quem separa é o `backdrop-blur` mais a borda. O branco aqui
          criava uma segunda faixa logo abaixo da faixa da marca, e as duas
          juntas empurravam a lista para o meio da tela. */}
      <header className="sticky top-0 z-10 flex-shrink-0 border-b border-border/70 bg-background/80 px-3 py-4 backdrop-blur-md md:px-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {/* O SOBRESCRITO. A data por extenso saiu do cabeçalho da marca,
                onde é referência curta, e aparece aqui por extenso porque
                acima do título ela é contexto: diz de que dia é este painel
                antes de a pessoa ler qualquer caso. */}
            <p className="rotulo-sobrescrito text-acento">{dataPorExtenso(hoje)}</p>
            {/*
              "Painel de atividades" no título, "Quadro" na aba.
              
              Não é inconsistência: são duas coisas. O título nomeia a TELA
              inteira, que hoje tem quatro visões; a aba nomeia UMA delas, e
              trocar o rótulo dela para "Painel de atividades" a colocaria em
              pé de igualdade com Rascunhos e Concluídos — que são recortes
              dela, não irmãs.
              
              `truncate` porque em 375px o título novo é quase o dobro do
              antigo e disputaria a linha com os botões de aba.
            */}
            {/*
              MENOR, E NA FONTE DO RESTO (30/08/2026, a pedido do gestor).

              Era 24px no celular e 36px no desktop, em Syne ExtraBold. Num
              painel operacional o título é a coisa que menos se lê: quem abre
              esta tela já sabe onde está, e o que precisa achar são os CASOS.
              Ele estava comprando três linhas de altura — sobrescrito, título,
              abas — antes do primeiro dado da tela aparecer.

              O tamanho que ele devolve não se perde: vai para o cabeçalho do
              cartão, que é o que se lê cem vezes por turno. É a mesma tinta,
              gasta onde rende.

              Em 375px agora cabe numa linha só, mas `text-balance` fica: se um
              dia a tela ganhar um título mais longo, ele reparte as duas linhas
              de forma pareja em vez de deixar uma palavra órfã.
            */}
            <h1 className="mt-0.5 text-lg font-extrabold tracking-tight text-balance md:text-2xl">
              Painel de atividades
            </h1>
            {/*
              O "x casos em x dias" saiu (28/08/2026, a pedido do gestor). Era
              um número que ninguém usa para decidir nada: quem olha o Quadro
              quer ver os CASOS, e a contagem ocupava a linha logo abaixo do
              título, que é a mais lida da tela.
              
              O aviso de conexão fica — ele não é estatística, é a única coisa
              que diz que a tela pode estar velha. E só aparece quando está
              ruim: um selo verde permanente vira ruído que ninguém lê.
            */}
            {!conectado && !isPending && (
              <p className="mt-0.5">
                <span
                  className="rounded-full bg-atencao/15 px-2 py-0.5 text-[11px] font-medium text-atencao"
                  title="Sem conexão ao vivo. A tela pode não refletir o que outra pessoa acabou de fazer."
                >
                  fora do ao vivo
                </span>
              </p>
            )}
          </div>

          {/* No desktop só resta a escolha entre o Quadro e o arquivo; UTI e
              Reels estão sempre visíveis na coluna direita. */}
          {/* As abas viram um GRUPO com moldura própria: um trilho arredondado
              onde a ativa é uma pílula cheia. Soltas, três pílulas lado a lado
              não diziam que eram alternativas entre si — pareciam três botões
              independentes, e um deles por acaso aceso. */}
          <div
            className="hidden flex-shrink-0 items-center gap-1 rounded-full border border-border bg-card p-1 shadow-cartao lg:flex"
            role="group"
            aria-label="Visão"
          >
            <BotaoAba ativa={aba === 'lista'} onClick={() => setAba('lista')}>
              Quadro
            </BotaoAba>
            {/* ENTREGÁVEIS fica entre Quadro e Rascunhos porque é o passo
                seguinte do trabalho, e é visível para TODA A EQUIPE: quem
                enviou quer saber se já foi entregue, e o caso sumiu do Quadro.
                Só a CONFIRMAÇÃO é do ADM e da gestão — o botão lá dentro, não
                a aba.

                O anel verde girando é o mesmo recurso do vídeo parado na seção
                REELS (`.anel-alerta` em index.css), e vale pela mesma razão:
                tem gente esperando uma pessoa, não trabalho. Ele só aparece com
                fila — se girasse sempre, não chamaria ninguém. */}
            <BotaoAba
              ativa={aba === 'entregas'}
              onClick={() => setAba('entregas')}
              contagem={naEntrega}
              anel={naEntrega > 0}
            >
              Entregáveis
            </BotaoAba>
            {/* Rascunhos é MODO de trabalho, não vizinhança: alguém entra,
                padroniza dez cadastros e sai. Por isso aba, e não mais a tira
                amarela que ocupava o topo da lista do dia. O contador em
                âmbar é o que puxa para cá. */}
            <BotaoAba
              ativa={aba === 'rascunhos'}
              onClick={() => setAba('rascunhos')}
              contagem={rascunhos.length}
              tom="rascunho"
            >
              Rascunhos
            </BotaoAba>
            <BotaoAba
              ativa={aba === 'concluidos'}
              onClick={() => setAba('concluidos')}
            >
              Concluídos
            </BotaoAba>
          </div>
        </div>

        {/*
          A BUSCA É UMA SÓ, e serve a aba que estiver aberta.
          
          Uma por aba seria mais arrumado e pior de usar: quem procura a
          Jéssica não sabe se ela está no Quadro, nos Rascunhos ou nos
          Concluídos — é por não saber que está procurando. Com um campo só, o
          termo continua valendo ao trocar de aba, e a resposta é achar em vez
          de digitar de novo.
          
          Linha própria, e não ao lado do título: num aparelho de 375px ela
          espremeria o título e os botões de aba num beco.
        */}
        <div className="mt-3 flex">
          {/* O contador vive AQUI agora, e não mais como subtítulo permanente.
              É a diferença entre estatística e resposta: "88 casos em 37 dias"
              ninguém usa para decidir nada; "3 de 88" é o que diz que a busca
              funcionou, e some junto com ela. */}
          <CampoBusca
            valor={busca}
            onMudar={setBusca}
            {...(buscando && !isPending
              ? { resultado: `${totalAbertos} de ${totalGeral}` }
              : {})}
          />
        </div>

        {/* Mobile: as duas colunas não cabem lado a lado, então viram abas. */}
        <div
          className="mt-3 flex gap-1 overflow-x-auto lg:hidden"
          role="group"
          aria-label="Seções"
        >
          <BotaoAba ativa={aba === 'lista'} onClick={() => setAba('lista')}>
            Lista
          </BotaoAba>
          {/* Mesma hierarquia do desktop: Reels primeiro, depois Master e
              UTI. No mobile não dá para uma seção ser "maior", então quem
              carrega a ordem é a posição — e a tira rola para a direita. */}
          <BotaoAba ativa={aba === 'reels'} onClick={() => setAba('reels')}>
            Reels ({emReels.length})
          </BotaoAba>
          <BotaoAba ativa={aba === 'master'} onClick={() => setAba('master')}>
            Master ({emMaster.length})
          </BotaoAba>
          <BotaoAba ativa={aba === 'fotolivro'} onClick={() => setAba('fotolivro')}>
            Foto/Livro ({emFotolivro.length})
          </BotaoAba>
          <BotaoAba ativa={aba === 'uti'} onClick={() => setAba('uti')}>
            UTI ({naUti.length})
          </BotaoAba>
          <BotaoAba
            ativa={aba === 'entregas'}
            onClick={() => setAba('entregas')}
            anel={naEntrega > 0}
          >
            Entregáveis ({naEntrega})
          </BotaoAba>
          <BotaoAba
            ativa={aba === 'rascunhos'}
            onClick={() => setAba('rascunhos')}
            contagem={rascunhos.length}
            tom="rascunho"
          >
            Rascunhos
          </BotaoAba>
          <BotaoAba ativa={aba === 'concluidos'} onClick={() => setAba('concluidos')}>
            Concluídos
          </BotaoAba>
        </div>
      </header>

      {/* overflow-hidden, não auto: no desktop quem rola são as três caixas
          (lista, UTI, Reels), cada uma por dentro. Um scroll de página aqui
          faria as seções crescerem e se empurrarem de novo. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {isPending ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            Carregando casos…
          </p>
        ) : aba === 'concluidos' ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            {/* O arquivo só é buscado quando a aba abre — ver useConcluidos. A
                espera aparece na primeira vez; depois ele fica em memória. */}
            {doArquivo.data ? (
              listaConcluidos
            ) : doArquivo.error ? (
              <Aviso titulo="Não foi possível carregar os concluídos">
                {doArquivo.error instanceof Error
                  ? doArquivo.error.message
                  : 'Erro desconhecido.'}
              </Aviso>
            ) : (
              <p className="p-8 text-center text-sm text-muted-foreground">
                Carregando concluídos…
              </p>
            )}
          </div>
        ) : aba === 'entregas' ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <EntregasPainel
              entregas={entregas}
              fotolivros={fotolivrosNaEntrega}
              videos={videosNaEntrega}
              etapasPorCaso={etapasPorCaso}
              hoje={hoje}
            />
          </div>
        ) : aba === 'rascunhos' ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <RascunhosPainel rascunhos={rascunhos} hoje={hoje} />
          </div>
        ) : (
          <>
            {/* Desktop: lista larga à esquerda; à direita, UTI e Reels dividem
                a altura em duas linhas IGUAIS (grid-rows-2). Cada uma rola por
                dentro, então nenhuma empurra a outra por mais casos que tenha. */}
            <div
              className={clsx(
                'hidden min-h-0 flex-1 lg:grid lg:gap-4 lg:p-4',
                /*
                  A COLUNA LATERAL ENCOLHE NO MODO TV EM TELA MÉDIA.
                  
                  O gestor reportou que a TV dele não mostrava o botão de modo
                  TV. Não era papel — o botão nunca teve trava de papel; era
                  LARGURA: uma TV de 1920 com o navegador em 150% reporta
                  1280px, e o limite estava em 1536.
                  
                  Baixar o limite sozinho não bastava. Com o lateral em 30rem,
                  sobram 356px por coluna a 1280 — e aí o cartão compacto fica
                  MAIS ALTO (231px) do que a 1920 (113px), porque tudo quebra
                  em três linhas. Duas colunas assim são piores que uma.
                  
                  Com 18rem o lateral continua mostrando os cartões de reels e
                  a coluna vai a 452px: cartão de 171px, conteúdo 20% menor.
                  A partir de 1536 ele volta aos 30rem — a proporção validada a
                  1920 fica exatamente como estava.
                */
                emDuasColunas
                  ? 'lg:grid-cols-[minmax(0,1fr)_18rem] 2xl:grid-cols-[minmax(0,1fr)_30rem]'
                  : 'lg:grid-cols-[minmax(0,1fr)_30rem]',
              )}
            >
              {/* Sem painel branco em volta: o chão pastel precisa aparecer
                  ENTRE os cartões, senão eles voltam a ser linhas de uma
                  grade e a separação do item 5 não existe. */}
              <div className="min-h-0 overflow-y-auto pr-1">{listaPorDia}</div>
              {/*
                REELS EM CIMA E COM A SOBRA; MASTER e UTI dobráveis embaixo.
                
                Era `grid-rows-2` com UTI e Reels em metades iguais — e a UTI,
                quase sempre vazia, guardava meia coluna para dizer "nenhum
                bebê na UTI" enquanto a lista de reels, que é o trabalho do
                turno, rolava dentro da outra metade.
                
                `min-h-0` no contêiner e no REELS é o que faz a divisão
                funcionar: sem ele, um filho flex se recusa a encolher abaixo
                do próprio conteúdo e a coluna transborda a tela — que é
                exatamente o "scroll pra achar" que não se quer.
              */}
              <div className="flex min-h-0 flex-col gap-3">
                <div className="min-h-0 flex-1">{painelReels}</div>
                {/* MASTER e FOTO/LIVRO abrem em MODAL, não em sanfona
                    (15/09/2026, pedido do gestor): ver SecaoEmModal. A UTI
                    continua sanfona logo abaixo — quase não tem ação dentro. */}
                <SecaoEmModal
                  titulo="Master"
                  quantidade={emMaster.length}
                  criterio={CRITERIO_MASTER}
                  vazio="Nenhum vídeo de MASTER em andamento."
                  erro={erroMaster}
                  onLimparErro={() => setErroMaster(null)}
                  itens={itensMaster}
                  colunas={colunasMaster}
                  onMoverFase={soltarNoMaster}
                  chaveModo="master"
                />
                {/* FOTO/LIVRO entra DEPOIS do Master, e não antes: o vídeo
                    horizontal tem prazo de dez dias úteis correndo, o
                    fotolivro leva semanas e a maior parte da espera é de
                    gente de fora. A ordem da coluna é a ordem da urgência. */}
                <SecaoEmModal
                  titulo="Foto/Livro"
                  quantidade={emFotolivro.length}
                  criterio={CRITERIO_FOTOLIVRO}
                  vazio="Nenhum Foto/Livro em produção."
                  erro={erroFotolivro}
                  onLimparErro={() => setErroFotolivro(null)}
                  itens={itensFotolivro}
                  colunas={colunasFotolivro}
                  onMoverFase={soltarNoFotolivro}
                  chaveModo="fotolivro"
                />
                <PainelDobravel
                  titulo="UTI"
                  quantidade={naUti.length}
                  criterio={CRITERIO_UTI}
                  vazio="Nenhum bebê na UTI."
                  erro={erroUti}
                >
                  {conteudoUti}
                </PainelDobravel>
              </div>
            </div>

            {/* Mobile: uma seção por vez, e aí o scroll é da página mesmo. */}
            <div className="min-h-0 flex-1 overflow-y-auto p-3 lg:hidden">
              {aba === 'lista' && listaPorDia}
              {aba === 'uti' && painelUti}
              {aba === 'reels' && painelReels}
              {aba === 'master' && painelMaster}
              {aba === 'fotolivro' && painelFotolivro}
            </div>
          </>
        )}
      </div>

      {(() => {
        if (!ficha) return null
        const caso = data?.casos.find((c) => c.id === ficha.casoId)
        const etapa = etapasPorCaso.get(ficha.casoId)?.find((e) => e.id === ficha.etapaId)
        if (!caso || !etapa) return null
        return (
          <FichaDaEdicao
            caso={caso}
            etapa={etapa}
            tipo={ficha.tipo}
            hoje={hoje}
            controles={(onErro) =>
              ficha.tipo === 'master'
                ? controlesDoMaster(caso, etapa, onErro)
                : controlesDoFotolivro(caso, etapa, onErro)
            }
            onFechar={() => setFicha(null)}
          />
        )
      })()}

      {finalizandoVideo && (
        <DialogoFinalizarVideo
          etapa={finalizandoVideo.etapa}
          nomeDoCaso={nomeDoCaso(finalizandoVideo.caso)}
          onFechar={() => setFinalizandoVideo(null)}
        />
      )}

      {aprovandoFotolivro && (
        <DialogoAprovacaoDoFotolivro
          etapa={aprovandoFotolivro.etapa}
          nomeDoCaso={nomeDoCaso(aprovandoFotolivro.caso)}
          onFechar={() => setAprovandoFotolivro(null)}
        />
      )}

      {reabrindo && (
        <ReabrirCasoDialogo
          caso={reabrindo}
          etapas={etapasDoConcluido(reabrindo.id)}
          ocupado={reabrirCaso.isPending || pedirAlteracao.isPending}
          erro={erroReabrir}
          onCancelar={() => setReabrindo(null)}
          onConfirmar={(motivo, escolhidas) =>
            confirmarReabertura(reabrindo, motivo, escolhidas)
          }
        />
      )}
    </div>
  )
}

function BotaoAba({
  ativa,
  onClick,
  contagem,
  tom = 'marca',
  anel = false,
  children,
}: {
  ativa: boolean
  onClick: () => void
  /** Quando presente, vira selo em vez de "(n)" no meio do texto. */
  contagem?: number
  tom?: 'marca' | 'rascunho'
  /**
   * O anel verde que corre em volta da pílula. Mesmo recurso do cartão de
   * vídeo parado na seção REELS — ali em vermelho, aqui em verde: lá é prazo
   * correndo, aqui é trabalho pronto esperando alguém.
   */
  anel?: boolean
  children: React.ReactNode
}) {
  /*
   * <button> cru e não o Botao: dentro do trilho, a moldura e a sombra do
   * Botao desenhariam uma segunda caixa dentro da caixa. Aqui a pílula ativa
   * é só fundo cheio, e as inativas não têm forma nenhuma até o hover — é o
   * trilho que dá a forma do conjunto.
   */
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativa}
      className={clsx(
        // min-h-11: a seção 6 pede 44px, e trocar o Botao por <button> cru
        // tinha deixado as abas em 36px. O trilho do desktop encolhe junto
        // com o padding dele, então o grupo não engorda por causa disso.
        'inline-flex min-h-11 flex-shrink-0 cursor-pointer items-center gap-2 rounded-full px-4 text-sm transition-colors',
        ativa
          ? 'bg-marca font-bold text-white'
          : 'font-medium text-muted-foreground hover:bg-marca-suave hover:text-marca',
        // `relative` é o que o ::after do anel precisa para se ancorar.
        anel && 'relative anel-alerta anel-alerta-vivo',
      )}
      {...(anel
        ? { style: { '--cor-alerta': 'var(--pronto)' } as React.CSSProperties }
        : {})}
    >
      {children}
      {contagem !== undefined && contagem > 0 && (
        <span
          className={clsx(
            'rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums',
            ativa
              ? 'bg-white/25 text-white'
              : tom === 'rascunho'
                // CHEIO, e não um tint. É o único contador da tela que pede
                // ação — rascunho é cadastro incompleto esperando alguém — e
                // um disco pintado é o que faz o olho voltar para ele.
                ? 'bg-contador text-white'
                : 'bg-muted text-muted-foreground',
          )}
        >
          {contagem}
        </span>
      )}
    </button>
  )
}

/** "4h", "2d" — quanto tempo desde um instante. */
function duracaoDesde(iso: string | null, agora: Date): string {
  if (!iso) return '—'
  const horas = (agora.getTime() - new Date(iso).getTime()) / 3_600_000
  if (horas < 1) return `${Math.max(1, Math.round(horas * 60))}min`
  if (horas < 48) return `${Math.round(horas)}h`
  return `${Math.round(horas / 24)}d`
}

function Aviso({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-lg p-8 text-center">
      <h2 className="font-semibold">{titulo}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{children}</p>
    </div>
  )
}

/** O nome do caso como o resto da tela mostra — mãe e bebê. */
function nomeDoCaso(caso: CasoQuadro): string {
  return caso.bebeNome ? `${caso.maeNome} · ${caso.bebeNome}` : caso.maeNome
}
