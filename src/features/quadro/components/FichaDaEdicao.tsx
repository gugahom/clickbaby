import { useState, type ReactNode } from 'react'
import { ModalAmplo } from '@/components/ui/ModalAmplo'
import { Alerta } from '@/components/ui/Alerta'
import { BotaoCopiar } from '@/components/ui/BotaoCopiar'
import { formatarDataHora, rotularDia } from '@/lib/formato'
import { useUrlDaCapa } from '../api/useAcoes'
import type { CasoQuadro, EtapaQuadro } from '../types'
import { Entregaveis } from './Entregaveis'
import { HistoricoDoCaso } from './HistoricoDoCaso'

/**
 * A FICHA DO CARTÃO — o MASTER e o FOTO/LIVRO abertos "como num ClickUp ou
 * Trello" (21/09/2026, pedido do gestor).
 *
 * O cartão da seção foi ganhando coisa — prazo, pedidos, fase, e agora capa e
 * link da prova —, e ele é pequeno de propósito: é para varrer a lista. A ficha
 * é o outro gesto, o de parar num trabalho só e ver TUDO dele.
 *
 * NADA AQUI É UM SEGUNDO CAMINHO. Os controles do alto são os MESMOS do cartão
 * (quem os monta é a QuadroPage, e passa para os dois), os links são a mesma
 * lista do card do Quadro, e o histórico é o mesmo do card. A ficha só junta
 * num lugar o que estava espalhado — uma correção num deles vale nos três.
 *
 * ABRE POR CIMA DA SEÇÃO, como irmã e não filha do modal dela: um `<dialog>`
 * aberto com `showModal()` entra no topo da pilha e deixa o de baixo inerte, e
 * montá-lo DENTRO do outro misturaria os dois no mesmo Esc.
 */
export function FichaDaEdicao({
  caso,
  etapa,
  tipo,
  hoje,
  controles,
  onFechar,
}: {
  caso: CasoQuadro
  /** A etapa da seção — o vídeo horizontal ou o fotolivro. */
  etapa: EtapaQuadro
  tipo: 'master' | 'fotolivro' | 'click_home'
  hoje: string
  /** Fase, prazo, pedidos e play/concluir — os mesmos do cartão. */
  controles: (onErro: (mensagem: string | null) => void) => ReactNode
  onFechar: () => void
}) {
  const [erro, setErro] = useState<string | null>(null)
  const nome = caso.bebeNome ? `${caso.maeNome} · ${caso.bebeNome}` : caso.maeNome

  return (
    <ModalAmplo
      tamanho="ficha"
      titulo={
        tipo === 'master'
          ? 'Vídeo do MASTER'
          : tipo === 'fotolivro'
            ? 'Foto/Livro'
            : 'Click Home'
      }
      subtitulo={
        <div className="mt-0.5">
          <p className="truncate text-lg font-extrabold tracking-tight">{nome}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            {caso.pacoteNome && (
              <span className="rounded-full bg-marca-suave px-2 py-0.5 text-[11px] font-bold text-marca">
                {caso.pacoteNome}
              </span>
            )}
            {caso.maternidadeSigla && <span>{caso.maternidadeSigla}</span>}
            <span>· {caso.dia ? rotularDia(caso.dia, hoje) : 'sem data'}</span>
          </p>
        </div>
      }
      onFechar={onFechar}
    >
      <div className="h-full overflow-y-auto p-4 md:p-5">
        {erro && (
          <div className="mb-3">
            <Alerta onFechar={() => setErro(null)}>{erro}</Alerta>
          </div>
        )}

        {/* O QUE SE FAZ, no alto — e é a mesma linha de controles do cartão. */}
        <div className="flex flex-wrap items-center gap-2">{controles(setErro)}</div>

        <div className="mt-5 grid gap-6 md:grid-cols-[minmax(0,1fr)_19rem]">
          <div className="min-w-0 space-y-6">
            {tipo === 'fotolivro' && <AprovacaoDoFotolivro etapa={etapa} />}

            {/* O VÍDEO TERMINADO espera em Entregáveis (21/09/2026) — a ficha
                diz onde ele está, e os dois links estão em "Links do caso". */}
            {/* O ENSAIO esperando a família escolher (22/09/2026) — a ficha
                diz onde ele está, e o link está em "Links do caso". */}
            {tipo === 'click_home' && etapa.faseClickHome === 'enviar_para_escolha' && (
              <Bloco titulo="Escolha da família">
                <p className="text-sm font-medium">
                  Galeria pronta. O ensaio está na aba Entregáveis, esperando o ADM
                  mandar o link para a família escolher as fotos — ele está em “Links
                  do caso”, logo abaixo.
                </p>
              </Bloco>
            )}

            {tipo === 'master' && etapa.status === 'pronto_para_entrega' && (
              <Bloco titulo="Entrega">
                <p className="text-sm font-medium">
                  Edição finalizada. O vídeo está na aba Entregáveis, esperando o ADM
                  confirmar a entrega — os links estão em “Links do caso”, logo abaixo.
                </p>
              </Bloco>
            )}

            <Bloco titulo="Pedidos do cliente">
              {etapa.observacao ? (
                <p className="rounded-md border-l-[3px] border-atencao bg-atencao/12 px-3 py-2 text-sm whitespace-pre-line">
                  {etapa.observacao}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nenhum pedido registrado. Os pedidos da família entram pela pastilha
                  “Pedidos”, lá em cima.
                </p>
              )}
            </Bloco>

            <Bloco titulo="Links do caso">
              <Entregaveis caso={caso} aberto />
            </Bloco>
          </div>

          <aside className="min-w-0 space-y-6">
            <Bloco titulo="Detalhes">
              <dl className="space-y-2 text-sm">
                <Dado rotulo="Com quem está" valor={etapa.responsavelNome} />
                <Dado rotulo="Assume na virada" valor={etapa.proximoResponsavelNome} />
                <Dado rotulo="Estação" valor={etapa.estacao} />
                <Dado rotulo="Prazo combinado" valor={formatarDataHora(etapa.previsaoEm)} />
                <Dado rotulo="Começou em" valor={formatarDataHora(etapa.iniciadoEm)} />
                <Dado rotulo="Prazo do pacote" valor={formatarDataHora(caso.venceEm)} />
              </dl>
            </Bloco>

            <Bloco titulo="Histórico do caso">
              <HistoricoDoCaso casoId={caso.id} />
            </Bloco>
          </aside>
        </div>
      </div>
    </ModalAmplo>
  )
}

/**
 * A CAPA, O LINK E ONDE A PROVA ESTÁ. É o que a ficha do fotolivro tem a mais:
 * no cartão pequeno a aprovação é uma pílula ("Na fila do ADM"); aqui é a capa
 * em tamanho de ver, o link para copiar, e quem mandou e quando.
 */
function AprovacaoDoFotolivro({ etapa }: { etapa: EtapaQuadro }) {
  const { data: capa, isPending } = useUrlDaCapa(etapa.fotolivroCapa)
  const [falhouCopiar, setFalhouCopiar] = useState(false)

  const situacao =
    etapa.faseAlbum === 'aguardando_aprovacao'
      ? etapa.fotolivroEnviadoEm
        ? `Enviado ao cliente${etapa.fotolivroEnviadoPorNome ? ` por ${etapa.fotolivroEnviadoPorNome}` : ''} em ${formatarDataHora(etapa.fotolivroEnviadoEm)}. Esperando a resposta.`
        : 'Na fila do ADM, na aba Entregáveis — ainda não foi mandado ao cliente.'
      : etapa.faseAlbum === 'pronto_para_entrega'
        ? 'Livro pronto, na aba Entregáveis — esperando a confirmação da entrega.'
        : null

  return (
    <Bloco titulo="Aprovação do cliente">
      {situacao && <p className="mb-3 text-sm font-medium">{situacao}</p>}

      {etapa.fotolivroCapa || etapa.fotolivroLink ? (
        <div className="flex flex-wrap items-start gap-4">
          {etapa.fotolivroCapa &&
            (capa ? (
              // Clicar abre a capa inteira noutra aba — a URL é assinada e
              // expira em uma hora, então não há o que vazar por muito tempo.
              <a href={capa} target="_blank" rel="noreferrer" className="flex-shrink-0">
                <img
                  src={capa}
                  alt="Capa do Foto/Livro"
                  className="max-h-64 w-auto rounded-md border border-border object-contain"
                />
              </a>
            ) : (
              <p className="text-xs text-muted-foreground">
                {isPending ? 'Carregando a capa…' : 'Não foi possível mostrar a capa.'}
              </p>
            ))}

          {etapa.fotolivroLink && (
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold">Link para o cliente</p>
              <div className="flex items-center gap-1">
                {/* rel="noreferrer": o link é credencial de acesso à prova da
                    família, e sem isto viaja no cabeçalho Referer. */}
                <a
                  href={etapa.fotolivroLink}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 flex-1 truncate text-sm text-marca underline underline-offset-2"
                >
                  {etapa.fotolivroLink}
                </a>
                <BotaoCopiar texto={etapa.fotolivroLink} onFalha={() => setFalhouCopiar(true)} />
              </div>
              {falhouCopiar && (
                <p className="text-xs text-muted-foreground">
                  Não deu para copiar. Selecione o link e copie à mão.
                </p>
              )}
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Ainda sem capa e sem link. Os dois entram quando a diagramação terminar e o
          Foto/Livro for mandado para aprovação.
        </p>
      )}
    </Bloco>
  )
}

function Bloco({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="rotulo-sobrescrito mb-2 text-muted-foreground">{titulo}</h3>
      {children}
    </section>
  )
}

/** Uma linha de detalhe. Vazio vira travessão — "não tem" e não "não carregou". */
function Dado({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{rotulo}</dt>
      <dd className="text-right font-medium">{valor ?? '—'}</dd>
    </div>
  )
}
