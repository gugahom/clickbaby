import { useState } from 'react'
import { Dialogo } from '@/components/ui/Dialogo'
import { Botao } from '@/components/ui/Botao'
import { BotaoCopiar } from '@/components/ui/BotaoCopiar'
import { Alerta } from '@/components/ui/Alerta'
import { formatarMoeda } from '@/lib/formato'
import {
  useDespesas,
  useEntregaveis,
  useRegistrarEntregavel,
  type EntregavelResumo,
  type TipoEntregavel,
} from '../api/useAcoes'
import { DialogoDespesa } from './DespesasDoCaso'
import { SeletorDeTermo } from './SeletorDeTermo'
import { termoSugerido } from '../lib/termo'
import { mensagemDeErro } from '../lib/erros'
import type { CasoQuadro, EtapaQuadro, TermoStatus } from '../types'

interface ItemDeConferencia {
  id: string
  rotulo: string
  /**
   * O link que esta caixa confere. É o que aparece embaixo dela — e, quando
   * não existe, o tipo com que o link novo é registrado ali mesmo. Sem um link
   * deste tipo a caixa não se marca e o caso não sai do diálogo: ver "TODO LINK
   * SEGURA O ENVIO", logo abaixo.
   */
  tipo: TipoEntregavel
}

/**
 * Os pacotes que entregam TAMBÉM pelo cadeado, além de Google e WeTransfer
 * (21/09/2026, pedido do gestor: "BASIC E STANDARD precisam de 3 links").
 *
 * São os dois NOMEADOS, e não a família BASIC inteira: BASIC + REELS
 * (`basic-reels-venda`) e BASIC REELS (`basic-reels-contrato`) ficam com Google
 * e WeTransfer. Conferido no remoto no mesmo dia: dos casos enviados desde
 * 11/09, nenhum BASIC REELS levou cadeado, e BASIC e STANDARD levaram em metade
 * — que é a metade que este pedido fecha. Se outro pacote passar a entregar
 * pelo cadeado, é o slug dele que entra aqui.
 */
const COM_CADEADO: ReadonlySet<string> = new Set(['basic', 'standard'])

/**
 * O QUE SE CONFERE, POR PACOTE (11/09/2026, pedido do gestor; o cadeado de
 * BASIC e STANDARD entrou em 21/09).
 *
 * NOS PACOTES NORMAIS, DUAS CAIXAS. Fotos e reels viraram UMA: a família
 * recebe os dois no mesmo álbum do Google, e conferir em duas linhas o que
 * mora num endereço só era pedir a mesma verificação duas vezes. A outra é o
 * WeTransfer, que não estava no checklist e é o segundo endereço que a família
 * recebe de verdade. BASIC e STANDARD ganham a TERCEIRA, o cadeado — ver
 * `COM_CADEADO`.
 *
 * O RÓTULO DA PRIMEIRA DEPENDE DE HAVER REELS, e isso vem de antes: o MASTER
 * perdeu o reels de fábrica em 03/09/2026, e pedir a conferência de um vertical
 * que não existe é ensinar a marcar caixa sem olhar — que estraga a única coisa
 * que este checklist faz. A condição olha as ETAPAS do caso, não o slug do
 * pacote: um MASTER que vender o vertical ganha a etapa por `adicionar_etapa` e
 * o rótulo volta sozinho, sem ninguém lembrar de mexer aqui.
 *
 * NO BIRTH, UMA CAIXA SÓ. Os dois pacotes de pós-parto entregam pelo mesmo
 * formato — o link único de foto+vídeo, o "cadeado" — e é por ele que a
 * entrega acontece.
 *
 * TODO LINK SEGURA O ENVIO (21/09/2026, pedido do gestor). Desde 15/09 só o
 * link PRINCIPAL (Google; cadeado no BIRTH) segurava o botão, e o WeTransfer
 * era uma caixa marcável sem link nenhum — o caso ia para Entregáveis com um
 * endereço de dois, e a caixa dizia "WeTransfer completo" sobre um WeTransfer
 * que não existia. O argumento de então era "um caso sem WeTransfer existe"; o
 * gestor disse que não existe, em nenhum pacote. Agora cada caixa só se marca
 * com o seu link registrado, e o botão só acende com TODAS marcadas.
 *
 * O BANCO CONTINUA MAIS FROUXO: `liberar_para_entrega` e `confirmar_entrega`
 * exigem ao menos um entregável. É o arranjo que o projeto já aceitava — o
 * diálogo é mais estrito que o banco, nunca mais frouxo —, e os dois únicos
 * caminhos até essas RPCs passam por este diálogo.
 *
 * `pacoteSlug` e não `pacoteNome`: BIRTH e BIRTH+REELS são dois slugs
 * (`birth`, `birth-reels`) que começam pelo mesmo prefixo — comparar o NOME
 * exigiria listar as duas grafias e reencontrar a mesma armadilha se um
 * terceiro pacote de BIRTH nascer um dia.
 */
function itensDaConferencia(
  caso: CasoQuadro,
  etapas: EtapaQuadro[],
): ItemDeConferencia[] {
  const slug = caso.pacoteSlug ?? ''
  const cadeado: ItemDeConferencia = {
    id: 'cadeado_completo',
    rotulo: 'Link CADEADO completo',
    tipo: 'cadeado',
  }

  if (slug.startsWith('birth')) return [cadeado]

  const temReels = etapas.some((e) => e.tipo === 'reels')

  return [
    {
      id: 'google_completo',
      rotulo: temReels
        ? 'Fotos e reels completos no Google'
        : 'Fotos completas no Google',
      tipo: 'google_photos',
    },
    {
      id: 'wetransfer_completo',
      rotulo: 'WeTransfer completo',
      tipo: 'wetransfer',
    },
    ...(COM_CADEADO.has(slug) ? [cadeado] : []),
  ]
}

interface PropsDialogoConfirmarEntrega {
  caso: CasoQuadro
  /**
   * ENVIO é quem terminou o trabalho dizendo "pode entregar"; CONFIRMACAO é o
   * ADM dizendo "entreguei". A conferência é a MESMA lista nos dois — e é o
   * ponto: quem edita marca o que produziu, quem entrega marca o que viu. Duas
   * pessoas olhando a mesma lista pegam o que uma sozinha deixaria passar.
   */
  modo: 'envio' | 'confirmacao'
  /** Para saber se este caso tem reels — ver itensDaConferencia. */
  etapas: EtapaQuadro[]
  ocupado: boolean
  erro: string | null
  onCancelar: () => void
  /**
   * O termo vem junto porque a confirmação o exige — ver "O TERMO ENTRA NA
   * CONFIRMAÇÃO", abaixo. No modo ENVIO ele é sempre nulo: quem envia é quem
   * editou, e o contrato não é assunto dela.
   */
  onConfirmar: (termo: TermoStatus | null) => void
}

/**
 * O checklist que HABILITA o botão, não que registra dado nenhum.
 *
 * O gestor pediu isto depois de reparar que "Confirmar entrega" virava um
 * segundo clique de confirmação sem checar NADA — a pessoa podia confirmar
 * sem ter de fato subido as fotos. As caixas aqui são a conferência final,
 * item por item, antes do gesto que não tem volta.
 *
 * DE PROPÓSITO NÃO VIRA COLUNA NOVA NO BANCO. O que a RPC exige continua
 * sendo o mesmo de sempre — pelo menos um entregável registrado. Este
 * checklist é a certeza de QUEM está confirmando, não um registro que o
 * sistema audita depois; guardar cada caixinha marcada criaria uma segunda
 * fonte de verdade sobre o que foi entregue, competindo com os links de
 * `entregaveis` que já são essa fonte.
 *
 * O LINK FICA DEBAIXO DA CAIXA (11/09/2026, pedido do gestor), e quando não
 * existe ele NASCE AQUI. Conferir "fotos completas" sem o endereço à mão
 * obrigava a fechar o diálogo, procurar o link na lista do card e abrir de
 * novo — e quem faz isso três vezes na quarta marca sem olhar.
 *
 * A CAIXA ESPERA PELO LINK (21/09/2026). Marcar continua sendo um gesto
 * humano de conferência — o link existir não marca nada sozinho —, mas não se
 * confere o que não existe: sem link daquele tipo, a caixa fica apagada e a
 * linha diz o que falta. Até esta data só o botão esperava, e só pelo link
 * principal.
 */
export function DialogoConfirmarEntrega({
  caso,
  modo,
  etapas,
  ocupado,
  erro,
  onCancelar,
  onConfirmar,
}: PropsDialogoConfirmarEntrega) {
  const itens = itensDaConferencia(caso, etapas)
  const { data: links } = useEntregaveis(caso.id, true)

  const [conferidos, setConferidos] = useState<Set<string>>(new Set())
  // O BIRTH já abre marcado como "sem contrato" — ver termoSugerido. Um caso
  // que já tem resposta (corrigindo um engano, ou reconfirmando) abre nela.
  const [termo, setTermo] = useState<TermoStatus | null>(
    caso.termoStatus ?? termoSugerido(caso.pacoteSlug),
  )
  const { data: despesas } = useDespesas(caso.id, true)
  const [lancandoDespesa, setLancandoDespesa] = useState(false)

  const totalDespesas = (despesas ?? []).reduce((soma, d) => soma + d.valor, 0)
  const qtdDespesas = (despesas ?? []).length

  // Enquanto os links não chegam, falta tudo: habilitar o botão por um instante
  // e desabilitar logo depois seria um convite a clicar no meio.
  const temLink = (item: ItemDeConferencia) =>
    (links ?? []).some((l) => l.tipo === item.tipo)
  // Uma caixa marcada cujo link sumiu (apagado no card enquanto o diálogo
  // estava aberto) deixa de contar: a marca era sobre um link que não existe mais.
  const conferido = (item: ItemDeConferencia) => conferidos.has(item.id) && temLink(item)

  function alternar(id: string) {
    setConferidos((atual) => {
      const proximo = new Set(atual)
      if (proximo.has(id)) proximo.delete(id)
      else proximo.add(id)
      return proximo
    })
  }

  return (
    <>
    {/* O lançamento abre FORA do diálogo de envio, como irmão e não filho: um
        <dialog> aberto por cima do outro entra no topo da pilha, e montá-lo
        dentro do primeiro misturaria os dois no mesmo Esc. */}
    {lancandoDespesa && (
      <DialogoDespesa caso={caso} onFechar={() => setLancandoDespesa(false)} />
    )}
    <Dialogo
      titulo={
        modo === 'envio'
          ? 'Enviar para Entregáveis?'
          : 'Confirmar entrega e encerrar o caso?'
      }
      rotuloConfirmar={modo === 'envio' ? 'Enviar' : 'Confirmar entrega'}
      confirmarDestrutivo={modo === 'confirmacao'}
      confirmarDesabilitado={
        links === undefined ||
        itens.some((item) => !conferido(item)) ||
        (modo === 'confirmacao' && termo === null)
      }
      ocupado={ocupado}
      erro={erro}
      onCancelar={onCancelar}
      onConfirmar={() => onConfirmar(modo === 'confirmacao' ? termo : null)}
    >
      <p className="text-sm text-muted-foreground">
        {caso.maeNome}
        {caso.bebeNome ? ` · ${caso.bebeNome}` : ''}.{' '}
        {modo === 'envio'
          ? 'O caso sai do Quadro e vai para Entregáveis, onde o ADM confere e entrega.'
          : 'Os links passam a contar como confirmados e o caso é encerrado. Não há como desfazer.'}
      </p>

      <ul className="space-y-1">
        {itens.map((item) => (
          <ItemConferido
            key={item.id}
            casoId={caso.id}
            item={item}
            links={(links ?? []).filter((l) => l.tipo === item.tipo)}
            carregando={links === undefined}
            marcado={conferido(item)}
            gesto={modo === 'envio' ? 'enviar' : 'confirmar'}
            onAlternar={() => alternar(item.id)}
          />
        ))}
      </ul>

      {/* O TERMO ENTRA NA CONFIRMAÇÃO (22/09/2026, pedido do gestor), e só nela.

          É a coluna TERMO da planilha de atendimento, e quem a fecha é a
          Morgana — a mesma pessoa que confirma a entrega, no mesmo minuto em
          que está com o contrato da família. No ENVIO ele não aparece: quem
          envia é quem acabou de editar, e responder pelo contrato não é
          trabalho dela.

          TRAVA O BOTÃO (decisão do gestor), ao contrário das despesas logo
          abaixo: o campo existe para a mídia filtrar depois, e um filtro cheio
          de "não informado" não responde nada. O BANCO NÃO TRAVA —
          `confirmar_entrega` encerra sem termo, como sempre; é o arranjo de
          sempre, a tela mais estrita que o banco. */}
      {modo === 'confirmacao' && (
        <section className="rounded-md border border-border px-3 py-2.5">
          <SeletorDeTermo
            valor={termo}
            onEscolher={setTermo}
            {...(termoSugerido(caso.pacoteSlug) !== null && caso.termoStatus === null
              ? { sugerido: 'BIRTH é vendido depois do parto e não tem contrato — troque se este teve.' }
              : {})}
          />
        </section>
      )}

      {/* AS DESPESAS APARECEM NA HORA DE ENVIAR (14/09/2026, pedido do gestor).
          Quem lança o gasto é quem trabalhou no caso, e este é o último momento
          em que ela está com ele na mão — depois de enviar, o card sai do
          Quadro e o Uber daquela madrugada vira lembrança.

          NÃO TRAVA NADA. Despesa não é status do caso (invariante 3.5), e nem
          todo atendimento tem gasto: travar o envio em "tem despesa" obrigaria
          a inventar uma para quem foi de carro próprio. */}
      <section className="rounded-md border border-border px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold">Despesas do caso</span>
          {qtdDespesas > 0 && (
            <span className="text-sm font-bold tabular-nums">{formatarMoeda(totalDespesas)}</span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {despesas === undefined
            ? 'Vendo o que foi lançado…'
            : qtdDespesas === 0
              ? modo === 'envio'
                ? 'Nenhuma despesa lançada. Se teve Uber ou refeição neste atendimento, lance antes de enviar.'
                : 'Nenhuma despesa lançada neste caso.'
              : `${qtdDespesas} ${qtdDespesas === 1 ? 'lançamento' : 'lançamentos'} neste caso.`}
        </p>
        <button
          type="button"
          onClick={() => setLancandoDespesa(true)}
          className="mt-1 inline-flex min-h-11 items-center text-sm font-semibold text-marca underline underline-offset-2"
        >
          Lançar despesa
        </button>
      </section>
    </Dialogo>
    </>
  )
}

/**
 * UMA LINHA DA CONFERÊNCIA: a caixa, o link que ela confere, e o jeito de
 * criar esse link quando ele ainda não existe.
 *
 * TODOS os links daquele tipo aparecem, não só o último: um caso com dois
 * álbuns do Google tem duas coisas para a pessoa abrir, e mostrar um só
 * esconderia justamente o que ela precisaria conferir.
 */
function ItemConferido({
  casoId,
  item,
  links,
  carregando,
  marcado,
  gesto,
  onAlternar,
}: {
  casoId: string
  item: ItemDeConferencia
  links: EntregavelResumo[]
  carregando: boolean
  marcado: boolean
  /** O que o botão do diálogo faz — é o que a linha diz que está faltando para. */
  gesto: 'enviar' | 'confirmar'
  onAlternar: () => void
}) {
  const semLink = !carregando && links.length === 0
  const registrar = useRegistrarEntregavel()
  const [adicionando, setAdicionando] = useState(false)
  const [url, setUrl] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  function salvar() {
    setErro(null)
    registrar
      .mutateAsync({ casoId, tipo: item.tipo, url })
      .then(() => {
        setAdicionando(false)
        setUrl('')
      })
      .catch((e) => setErro(mensagemDeErro(e)))
  }

  return (
    <li>
      {/* min-h-11: a linha inteira é o alvo de toque (seção 6 do CLAUDE.md),
          não só o quadrado de 16px do checkbox. */}
      {/* Apagada enquanto o link não existe — ver "A CAIXA ESPERA PELO LINK".
          `carregando` também trava: marcar no instante antes de o link chegar
          seria conferir no escuro. */}
      <label
        className={
          carregando || semLink
            ? 'flex min-h-11 cursor-not-allowed items-center gap-2.5 rounded-md px-1 text-sm font-medium text-muted-foreground'
            : 'flex min-h-11 cursor-pointer items-center gap-2.5 rounded-md px-1 text-sm font-medium transition-colors hover:bg-muted'
        }
      >
        <input
          type="checkbox"
          checked={marcado}
          disabled={carregando || semLink}
          onChange={onAlternar}
          className="size-5 flex-shrink-0 rounded border-border accent-marca disabled:opacity-50"
        />
        {item.rotulo}
      </label>

      {/* Alinhado com o rótulo, não com a caixa: o link é a evidência daquele
          item, e recuá-lo diz isso sem precisar de moldura. */}
      <div className="ml-[2.1rem] space-y-1 pb-1">
        {carregando ? (
          <p className="text-xs text-muted-foreground">Buscando o link…</p>
        ) : links.length > 0 ? (
          links.map((link) => <LinhaDoLink key={link.id} url={link.url} />)
        ) : adicionando ? (
          <div className="space-y-1.5">
            <input
              type="url"
              inputMode="url"
              autoFocus
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://"
              className="min-h-11 w-full rounded-md border border-border bg-background px-3 text-base"
            />
            <div className="flex items-center gap-2">
              <Botao
                onClick={salvar}
                disabled={url.trim() === '' || registrar.isPending}
              >
                Salvar link
              </Botao>
              <Botao
                variante="fantasma"
                onClick={() => {
                  setErro(null)
                  setAdicionando(false)
                }}
                disabled={registrar.isPending}
              >
                Cancelar
              </Botao>
            </div>
            {erro && <Alerta onFechar={() => setErro(null)}>{erro}</Alerta>}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {/* Todo link segura o botão, e a linha diz isso com todas as
                letras: um "Sem link ainda" neutro ao lado de um botão apagado
                deixa a pessoa procurando o que falta. */}
            <span className="text-xs font-semibold text-atencao-tinta">
              Falta este link para {gesto}.
            </span>
            <button
              type="button"
              onClick={() => {
                setErro(null)
                setAdicionando(true)
              }}
              className="inline-flex min-h-11 items-center text-sm font-semibold text-marca underline underline-offset-2"
            >
              Adicionar link
            </button>
          </div>
        )}
      </div>
    </li>
  )
}

/**
 * O link, clicável e copiável.
 *
 * `rel="noreferrer"`: a url é credencial de acesso à galeria da família (seção
 * 10 do CLAUDE.md) e sem isso ela viaja no cabeçalho Referer para o destino.
 *
 * A falha do copiar aparece AQUI DENTRO, e não num alerta do painel de trás: o
 * `<dialog>` modal inertiza o resto da página, então a frase ficaria invisível
 * atrás do backdrop e a pessoa acharia que copiou — e mandaria nada para a
 * família.
 */
function LinhaDoLink({ url }: { url: string }) {
  const [falhouCopiar, setFalhouCopiar] = useState(false)

  return (
    <div>
      <div className="flex items-center gap-1">
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="min-w-0 flex-1 truncate text-xs text-marca underline underline-offset-2"
        >
          {url}
        </a>
        <BotaoCopiar texto={url} onFalha={() => setFalhouCopiar(true)} />
      </div>
      {falhouCopiar && (
        <p className="text-xs text-muted-foreground">
          Não deu para copiar. Selecione o link e copie à mão.
        </p>
      )}
    </div>
  )
}
