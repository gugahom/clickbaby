import { useState } from 'react'
import { Dialogo } from '@/components/ui/Dialogo'
import { Botao } from '@/components/ui/Botao'
import { BotaoCopiar } from '@/components/ui/BotaoCopiar'
import { Alerta } from '@/components/ui/Alerta'
import {
  useEntregaveis,
  useRegistrarEntregavel,
  type EntregavelResumo,
  type TipoEntregavel,
} from '../api/useAcoes'
import { mensagemDeErro } from '../lib/erros'
import type { CasoQuadro, EtapaQuadro } from '../types'

interface ItemDeConferencia {
  id: string
  rotulo: string
  /**
   * O link que esta caixa confere. É o que aparece embaixo dela — e, quando
   * não existe, o tipo com que o link novo é registrado ali mesmo.
   */
  tipo: TipoEntregavel
}

/**
 * O QUE SE CONFERE, POR PACOTE (11/09/2026, pedido do gestor).
 *
 * NOS PACOTES NORMAIS, DUAS CAIXAS. Fotos e reels viraram UMA: a família
 * recebe os dois no mesmo álbum do Google, e conferir em duas linhas o que
 * mora num endereço só era pedir a mesma verificação duas vezes. A outra é o
 * WeTransfer, que não estava no checklist e é o segundo endereço que a família
 * recebe de verdade.
 *
 * O RÓTULO DA PRIMEIRA DEPENDE DE HAVER REELS, e isso vem de antes: o MASTER
 * perdeu o reels de fábrica em 03/09/2026, e pedir a conferência de um vertical
 * que não existe é ensinar a marcar caixa sem olhar — que estraga a única coisa
 * que este checklist faz. A condição olha as ETAPAS do caso, não o slug do
 * pacote: um MASTER que vender o vertical ganha a etapa por `adicionar_etapa` e
 * o rótulo volta sozinho, sem ninguém lembrar de mexer aqui.
 *
 * NO BIRTH, UMA CAIXA SÓ. Os dois pacotes de pós-parto entregam pelo mesmo
 * formato — o link único de foto+vídeo, o "cadeado" — e a partir de hoje é por
 * ele que a entrega acontece. As quatro caixas antigas (fotos, reels, cadeado
 * F+V, cadeado F+V com final) conferiam endereços que a operação não produz
 * mais separadamente.
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
  const ehBirth = caso.pacoteSlug?.startsWith('birth') ?? false

  if (ehBirth) {
    return [{ id: 'cadeado_completo', rotulo: 'Link CADEADO completo', tipo: 'cadeado' }]
  }

  const temReels = etapas.some((e) => e.tipo === 'reels')

  return [
    {
      id: 'google_completo',
      rotulo: temReels
        ? 'Fotos e reels completos no Google'
        : 'Fotos completas no Google',
      tipo: 'google_photos',
    },
    { id: 'wetransfer_completo', rotulo: 'WeTransfer completo', tipo: 'wetransfer' },
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
  onConfirmar: () => void
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
 * sendo o mesmo de sempre — pelo menos um entregável registrado
 * (podeConfirmarEntrega, lib/acoes.ts). Este checklist é a certeza de QUEM
 * está confirmando, não um registro que o sistema audita depois; guardar
 * cada caixinha marcada criaria uma segunda fonte de verdade sobre o que
 * foi entregue, competindo com os links de `entregaveis` que já são essa
 * fonte.
 *
 * O LINK FICA DEBAIXO DA CAIXA (11/09/2026, pedido do gestor). Conferir "fotos
 * completas" sem o endereço à mão obrigava a fechar o diálogo, procurar o link
 * na lista do card e abrir de novo — e quem faz isso três vezes na quarta marca
 * sem olhar. Com o link ali, a caixa vira o que ela promete ser: alguém ABRIU e
 * viu.
 *
 * E QUANDO O LINK NÃO EXISTE, ELE NASCE AQUI. É o mesmo raciocínio da conclusão
 * da edição: quem está com o caso na mão é quem tem o endereço. Sem isso, o
 * caminho era cancelar o envio, rolar até a lista de entregáveis do card, somar
 * o link e recomeçar a conferência.
 *
 * A CAIXA NÃO ESPERA PELO LINK. Marcar continua sendo um gesto humano de
 * conferência — não travamos a caixa em "existe um entregável deste tipo",
 * porque um caso sem WeTransfer ficaria impossível de enviar, e a trava de
 * verdade (pelo menos um entregável) já está no banco, onde ela não diverge.
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

  function alternar(id: string) {
    setConferidos((atual) => {
      const proximo = new Set(atual)
      if (proximo.has(id)) proximo.delete(id)
      else proximo.add(id)
      return proximo
    })
  }

  return (
    <Dialogo
      titulo={
        modo === 'envio'
          ? 'Enviar para Entregáveis?'
          : 'Confirmar entrega e encerrar o caso?'
      }
      rotuloConfirmar={modo === 'envio' ? 'Enviar' : 'Confirmar entrega'}
      confirmarDestrutivo={modo === 'confirmacao'}
      confirmarDesabilitado={itens.some((item) => !conferidos.has(item.id))}
      ocupado={ocupado}
      erro={erro}
      onCancelar={onCancelar}
      onConfirmar={onConfirmar}
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
            marcado={conferidos.has(item.id)}
            onAlternar={() => alternar(item.id)}
          />
        ))}
      </ul>
    </Dialogo>
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
  onAlternar,
}: {
  casoId: string
  item: ItemDeConferencia
  links: EntregavelResumo[]
  carregando: boolean
  marcado: boolean
  onAlternar: () => void
}) {
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
      <label className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-md px-1 text-sm font-medium transition-colors hover:bg-muted">
        <input
          type="checkbox"
          checked={marcado}
          onChange={onAlternar}
          className="size-5 flex-shrink-0 rounded border-border accent-marca"
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
            <span className="text-xs text-muted-foreground">Sem link ainda.</span>
            <button
              type="button"
              onClick={() => {
                setErro(null)
                setAdicionando(true)
              }}
              className="text-xs font-medium text-marca underline underline-offset-2"
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
