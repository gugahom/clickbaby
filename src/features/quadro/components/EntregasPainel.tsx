import { useState } from 'react'
import { Botao } from '@/components/ui/Botao'
import { Alerta } from '@/components/ui/Alerta'
import { IconeCheck } from '@/components/ui/icones'
import { formatarDataHora, rotularDia } from '@/lib/formato'
import { useAuth } from '@/features/auth/contexto'
import { Dialogo } from '@/components/ui/Dialogo'
import { IconeDesfazer } from '@/components/ui/icones'
import { BotaoCopiar } from '@/components/ui/BotaoCopiar'
import {
  useConfirmarEntrega,
  useConfirmarEntregaDoVideo,
  useDevolverParaOQuadro,
  useEntregaveis,
  useMarcarFotolivroEnviado,
  useMoverAlbum,
  useUrlDaCapa,
} from '../api/useAcoes'
import { podeConfirmarEntrega, podeEncerrarCaso } from '../lib/acoes'
import { mensagemDeErro } from '../lib/erros'
import { DialogoConfirmarEntrega } from './DialogoConfirmarEntrega'
import { Entregaveis } from './Entregaveis'
import type { CasoQuadro, EtapaQuadro } from '../types'

/**
 * UM FOTO/LIVRO ESPERANDO O ADM (21/09/2026, pedido do gestor). São duas
 * passagens pela aba, e o `momento` diz qual:
 *   aprovacao — a PROVA, para mandar ao cliente. Sai com "Enviado ao cliente";
 *               na seção o cartão continua em "Aguardando aprovação".
 *   entrega   — o LIVRO PRONTO. Sai com "Confirmar entrega", que conclui a
 *               etapa e tira o cartão da seção.
 */
export interface FotolivroNaEntrega {
  caso: CasoQuadro
  etapa: EtapaQuadro
  momento: 'aprovacao' | 'entrega'
}

/**
 * UM VÍDEO DO MASTER ESPERANDO O ADM (21/09/2026, pedido do gestor): terminado,
 * com o link do vídeo e o WeTransfer, em "Pronto para entrega" na seção.
 */
export interface VideoNaEntrega {
  caso: CasoQuadro
  etapa: EtapaQuadro
}

interface PropsEntregasPainel {
  /** Casos ENVIADOS e ainda abertos, na ordem em que foram enviados. */
  entregas: CasoQuadro[]
  /** Os Foto/Livros esperando o ADM — ver FotolivroNaEntrega. */
  fotolivros: FotolivroNaEntrega[]
  /** Os vídeos do MASTER esperando o ADM — ver VideoNaEntrega. */
  videos: VideoNaEntrega[]
  etapasPorCaso: Map<string, EtapaQuadro[]>
  hoje: string
}

/**
 * UMA LINHA DE VÍDEO. "Sinalizado como VÍDEO", nas palavras do gestor, "porque
 * as fotos já foram entregues e o primeiro card já foi — o que está passando
 * mais uma vez nos entregáveis é apenas o vídeo. A Morgana precisa ver isso
 * visualmente." Por isso o selo sólido no alto, a cor própria (o azul do
 * andamento, nem o verde do caso nem a marca do fotolivro), e a frase dizendo
 * que as fotos já foram.
 *
 * SÓ OS DOIS LINKS DO VÍDEO, e ainda não conferidos: a lista inteira do caso
 * traria os links das fotos, já entregues — e é justamente a confusão que o
 * selo existe para evitar.
 */
function LinhaDoVideo({
  item,
  confirma,
  onErro,
}: {
  item: VideoNaEntrega
  confirma: boolean
  onErro: (mensagem: string | null) => void
}) {
  const { caso, etapa } = item
  const { data: links } = useEntregaveis(caso.id, true)
  const confirmar = useConfirmarEntregaDoVideo()
  const [confirmando, setConfirmando] = useState(false)

  const titulo = caso.bebeNome ? `${caso.maeNome} · ${caso.bebeNome}` : caso.maeNome
  const doVideo = (links ?? []).filter(
    (l) => (l.tipo === 'video' || l.tipo === 'video_wetransfer') && l.confirmado_em === null,
  )

  return (
    <li className="rounded-cartao border border-andamento/30 bg-andamento/8 px-3 py-3 shadow-cartao md:px-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-andamento px-2.5 py-0.5 text-[11px] font-extrabold tracking-wide text-white">
              VÍDEO
            </span>
            <span className="truncate font-semibold">{titulo}</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {caso.ehTerminal
              ? 'As fotos já foram entregues — agora é só o vídeo.'
              : 'Vídeo do MASTER pronto para entregar.'}
            {caso.pacoteNome ? ` · ${caso.pacoteNome}` : ''}
          </p>
        </div>

        <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
          {confirma ? (
            <Botao
              onClick={() => {
                onErro(null)
                setConfirmando(true)
              }}
              disabled={confirmar.isPending}
              className="superficie-acento border-0 font-bold text-white shadow-cartao-alto hover:brightness-110"
            >
              <IconeCheck className="size-4" />
              Confirmar entrega do vídeo
            </Botao>
          ) : (
            <span className="text-xs font-medium text-muted-foreground">aguardando o ADM</span>
          )}
        </div>
      </div>

      <div className="mt-3 space-y-2 border-t border-andamento/20 pt-3">
        {links === undefined ? (
          <p className="text-xs text-muted-foreground">Buscando os links…</p>
        ) : doVideo.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sem links do vídeo.</p>
        ) : (
          doVideo.map((link) => (
            <LinkParaCopiar
              key={link.id}
              rotulo={link.tipo === 'video' ? 'Link do vídeo' : 'WeTransfer do vídeo'}
              url={link.url}
            />
          ))
        )}
      </div>

      {confirmando && (
        <Dialogo
          titulo="Confirmar a entrega do vídeo?"
          rotuloConfirmar={confirmar.isPending ? 'Confirmando…' : 'Confirmar entrega'}
          ocupado={confirmar.isPending}
          erro={null}
          onCancelar={() => setConfirmando(false)}
          onConfirmar={() => {
            confirmar.mutateAsync({ casoEtapaId: etapa.id }).then(
              () => setConfirmando(false),
              (e) => {
                setConfirmando(false)
                onErro(mensagemDeErro(e))
              },
            )
          }}
        >
          <p className="text-sm text-muted-foreground">
            {titulo}. O vídeo fica como entregue, os dois links passam a contar como
            conferidos, e o cartão sai da seção MASTER. Se a família pedir alteração
            depois, o caminho é “Pedir alteração no vídeo”, na linha da etapa dentro
            do card.
          </p>
        </Dialogo>
      )}
    </li>
  )
}

/** Um link com rótulo e botão de copiar — o que se manda para a família. */
function LinkParaCopiar({ rotulo, url }: { rotulo: string; url: string }) {
  const [falhou, setFalhou] = useState(false)
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold">{rotulo}</p>
      <div className="flex items-center gap-1">
        {/* rel="noreferrer": o link é credencial de acesso da família. */}
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="min-w-0 flex-1 truncate text-sm text-marca underline underline-offset-2"
        >
          {url}
        </a>
        <BotaoCopiar texto={url} onFalha={() => setFalhou(true)} />
      </div>
      {falhou && (
        <p className="text-xs text-muted-foreground">
          Não deu para copiar. Selecione o link e copie à mão.
        </p>
      )}
    </div>
  )
}

/**
 * UMA LINHA DE FOTO/LIVRO. Marcada como tal com todas as letras — o pedido foi
 * "lá é sinalizado como foto livro" —, e com a cor da marca em vez do verde dos
 * casos: o verde diz "trabalho pronto para fechar o caso", e aqui o caso pode
 * estar encerrado há semanas.
 *
 * Na aprovação a CAPA e o LINK ficam à vista, pela mesma razão dos links do
 * caso: quem manda ao cliente precisa ver o que está mandando.
 */
function LinhaDoFotolivro({
  item,
  confirma,
  onErro,
}: {
  item: FotolivroNaEntrega
  confirma: boolean
  onErro: (mensagem: string | null) => void
}) {
  const { caso, etapa, momento } = item
  const marcar = useMarcarFotolivroEnviado()
  const mover = useMoverAlbum()
  const [confirmando, setConfirmando] = useState(false)
  const [falhouCopiar, setFalhouCopiar] = useState(false)
  const { data: capa } = useUrlDaCapa(momento === 'aprovacao' ? etapa.fotolivroCapa : null)

  const titulo = caso.bebeNome ? `${caso.maeNome} · ${caso.bebeNome}` : caso.maeNome
  const botaoForte =
    'superficie-acento border-0 font-bold text-white shadow-cartao-alto hover:brightness-110'

  return (
    <li className="rounded-cartao border border-marca/25 bg-marca-suave px-3 py-3 shadow-cartao md:px-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-marca px-2 py-0.5 text-[11px] font-bold text-white">
              Foto/Livro
            </span>
            <span className="truncate font-semibold">{titulo}</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {momento === 'aprovacao'
              ? 'Prova pronta: mandar ao cliente para aprovação.'
              : 'Livro pronto: confirmar quando for entregue à família.'}
            {caso.pacoteNome ? ` · ${caso.pacoteNome}` : ''}
          </p>
        </div>

        <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
          {!confirma ? (
            <span className="text-xs font-medium text-muted-foreground">aguardando o ADM</span>
          ) : momento === 'aprovacao' ? (
            <Botao
              onClick={() => {
                onErro(null)
                marcar
                  .mutateAsync({ casoEtapaId: etapa.id })
                  .catch((e) => onErro(mensagemDeErro(e)))
              }}
              disabled={marcar.isPending}
              className={botaoForte}
            >
              <IconeCheck className="size-4" />
              Enviado ao cliente
            </Botao>
          ) : (
            <Botao
              onClick={() => {
                onErro(null)
                setConfirmando(true)
              }}
              disabled={mover.isPending}
              className={botaoForte}
            >
              <IconeCheck className="size-4" />
              Confirmar entrega
            </Botao>
          )}
        </div>
      </div>

      {momento === 'aprovacao' && (
        <div className="mt-3 flex flex-wrap items-start gap-3 border-t border-marca/20 pt-3">
          {capa && (
            <a href={capa} target="_blank" rel="noreferrer" className="flex-shrink-0">
              <img
                src={capa}
                alt="Capa do Foto/Livro"
                className="h-24 w-auto rounded-md border border-border object-contain"
              />
            </a>
          )}
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
      )}

      {confirmando && (
        <Dialogo
          titulo="Confirmar a entrega do Foto/Livro?"
          rotuloConfirmar={mover.isPending ? 'Confirmando…' : 'Confirmar entrega'}
          ocupado={mover.isPending}
          erro={null}
          onCancelar={() => setConfirmando(false)}
          onConfirmar={() => {
            mover.mutateAsync({ casoEtapaId: etapa.id, fase: 'entregue' }).then(
              () => setConfirmando(false),
              (e) => {
                setConfirmando(false)
                onErro(mensagemDeErro(e))
              },
            )
          }}
        >
          <p className="text-sm text-muted-foreground">
            {titulo}. O Foto/Livro fica como entregue e sai da seção. Se a família
            pedir alteração depois, o caminho é “Pedir alteração no Foto/Livro”,
            na linha da etapa dentro do card.
          </p>
        </Dialogo>
      )}
    </li>
  )
}

/**
 * UMA LINHA DA LISTA.
 *
 * É componente próprio porque precisa PERGUNTAR quantos links o caso tem, e
 * isso é um hook — que não se chama dentro de um `map`.
 *
 * ANTES ELE DEDUZIA. A versão anterior passava `temEntregavel = true` sem
 * consultar, com um comentário explicando que a dedução era segura: `liberar_
 * para_entrega` recusa caso sem link, e link não se apagava. A segunda metade
 * dessa frase deixou de ser verdade em 07/09/2026, quando apagar link virou uma
 * ação da tela — e a dedução passaria a acender o botão de confirmar num caso
 * sem link nenhum, para o banco recusar depois. A consulta não custa nada:
 * `useEntregaveis` já é chamado logo abaixo, pelo próprio bloco de links, e o
 * TanStack Query serve as duas com uma requisição só.
 */
function LinhaDeEntrega({
  caso,
  etapas,
  hoje,
  papel,
  confirma,
  onErro,
  onConfirmar,
}: {
  caso: CasoQuadro
  etapas: EtapaQuadro[]
  hoje: string
  papel: string
  confirma: boolean
  onErro: (mensagem: string | null) => void
  onConfirmar: () => void
}) {
  const { data: links } = useEntregaveis(caso.id, true)
  const devolver = useDevolverParaOQuadro()
  const [devolvendo, setDevolvendo] = useState(false)
  const [motivo, setMotivo] = useState('')

  const titulo = caso.bebeNome ? `${caso.maeNome} · ${caso.bebeNome}` : caso.maeNome
  const entrega = podeConfirmarEntrega(caso, (links ?? []).length > 0, etapas, papel)

  return (
    <li className="rounded-cartao border border-pronto-borda bg-pronto-fundo px-3 py-3 shadow-cartao md:px-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-semibold">{titulo}</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span>{caso.dia ? rotularDia(caso.dia, hoje) : 'sem data'}</span>
            {caso.pacoteNome && (
              <span className="font-medium text-foreground">{caso.pacoteNome}</span>
            )}
            {caso.maternidadeSigla && (
              <span className="rounded bg-muted px-1.5 py-0.5 font-mono">
                {caso.maternidadeSigla}
              </span>
            )}
          </div>
          {caso.liberadoParaEntregaEm && (
            // Quem enviou e quando: é o que responde "posso cobrar de alguém se
            // o link estiver errado?".
            <p className="mt-1 text-xs text-muted-foreground">
              Enviado por {caso.liberadoParaEntregaPorNome ?? 'alguém'} em{' '}
              {formatarDataHora(caso.liberadoParaEntregaEm)}
            </p>
          )}
        </div>

        <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
          {confirma ? (
            <>
              {/* DEVOLVER fica ao lado de confirmar porque são as duas saídas da
                  mesma conferência: "está bom" e "não está bom". Botão quieto de
                  contorno — é o caminho menos frequente, e o gesto forte da tela
                  continua sendo o que fecha o caso. */}
              <Botao
                variante="fantasma"
                onClick={() => {
                  onErro(null)
                  setMotivo('')
                  setDevolvendo(true)
                }}
                disabled={devolver.isPending}
              >
                <IconeDesfazer className="size-4" />
                Devolver ao Quadro
              </Botao>

              <Botao
                onClick={onConfirmar}
                disabled={!entrega.habilitada}
                title={entrega.motivo}
                className="superficie-acento border-0 font-bold text-white shadow-cartao-alto hover:brightness-110"
              >
                <IconeCheck className="size-4" />
                Confirmar entrega
              </Botao>
            </>
          ) : (
            // Sem botão, e não com botão cinza: uma fileira de botões
            // desabilitados ensina a ignorar o que está desabilitado, e esta
            // pessoa não tem o que fazer aqui além de acompanhar.
            <span className="text-xs font-medium text-muted-foreground">
              aguardando o ADM
            </span>
          )}
        </div>
      </div>

      {/* Os links ficam à vista, e é o motivo de a tela existir: quem entrega
          precisa ABRIR o álbum e conferir antes de dizer que entregou.
          Escondê-los atrás de um clique tornaria a conferência opcional. */}
      <div className="mt-3 border-t border-pronto-borda pt-3">
        <Entregaveis caso={caso} aberto />
      </div>

      {devolvendo && (
        <Dialogo
          titulo="Devolver o caso ao Quadro?"
          rotuloConfirmar="Devolver"
          confirmarDesabilitado={motivo.trim() === ''}
          ocupado={devolver.isPending}
          erro={null}
          onCancelar={() => setDevolvendo(false)}
          onConfirmar={() => {
            onErro(null)
            devolver
              .mutateAsync({ casoId: caso.id, motivo: motivo.trim() })
              .then(() => setDevolvendo(false))
              .catch((e) => {
                setDevolvendo(false)
                onErro(mensagemDeErro(e))
              })
          }}
        >
          <p className="text-sm text-muted-foreground">
            {titulo} volta para a lista do dia dele. As etapas continuam
            concluídas — o que voltou foi a entrega. Se o material em si estiver
            errado, reabra a etapa no card.
          </p>
          <label className="block">
            <span className="text-sm font-medium">Por quê?</span>
            <textarea
              autoFocus
              rows={2}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="ex.: link do álbum de outra família"
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-base"
            />
          </label>
        </Dialogo>
      )}
    </li>
  )
}

/**
 * A aba ENTREGÁVEIS — onde o caso pronto vira caso entregue.
 *
 * O QUE MUDOU E POR QUÊ (pedido do gestor, 06/09/2026)
 * Antes, quem terminava a edição clicava "Confirmar entrega" no próprio card e
 * o caso encerrava. Isso juntava duas coisas que a operação faz separadas: o
 * trabalho de foto/vídeo, que é da fotógrafa, e a ENTREGA à família, que é do
 * ADM. Agora quem termina ENVIA para cá — e o caso sai do Quadro — e quem
 * entrega confirma aqui.
 *
 * A LISTA É DE TODO MUNDO; a CONFIRMAÇÃO é do ADM e da gestão. Quem enviou
 * precisa poder ver se já foi entregue, ainda mais agora que o caso sumiu do
 * Quadro — esconder a aba deixaria a fotógrafa sem nenhum lugar para olhar. O
 * que é restrito é o botão, e a trava de verdade está em `confirmar_entrega`
 * (migration 20260906151515): esconder botão não é permissão.
 *
 * A LISTA É POR ORDEM DE ENVIO, não por prazo. Prazo é a régua do Quadro, onde
 * o trabalho ainda está acontecendo; aqui o trabalho acabou e o que importa é
 * quem está esperando há mais tempo. Quem chegou primeiro é atendido primeiro.
 */
export function EntregasPainel({
  entregas,
  fotolivros,
  videos,
  etapasPorCaso,
  hoje,
}: PropsEntregasPainel) {
  const { pessoa } = useAuth()
  const papel = pessoa?.papelSistema ?? 'operador'

  const confirmar = useConfirmarEntrega()
  const [confirmando, setConfirmando] = useState<CasoQuadro | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const confirma = podeEncerrarCaso(papel)

  if (entregas.length === 0 && fotolivros.length === 0 && videos.length === 0) {
    return (
      <div className="mx-auto max-w-lg p-8 text-center">
        <h2 className="font-semibold">Nenhum caso esperando entrega</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Assim que alguém terminar o trabalho e enviar o caso, ele sai do
          Quadro e aparece aqui com os links para conferir.
        </p>
      </div>
    )
  }

  return (
    <div className="p-3 md:p-4">
      {erro && (
        <div className="mb-3">
          <Alerta>{erro}</Alerta>
        </div>
      )}

      {entregas.length > 0 && (
        <p className="mb-3 text-sm text-muted-foreground">
          {confirma
            ? 'Casos com o trabalho concluído, enviados por quem editou. Confira os links e confirme a entrega — o caso encerra e não há como desfazer.'
            : 'Casos com o trabalho concluído, esperando a entrega à família. Quem confirma é o ADM ou a gestão.'}
        </p>
      )}

      <ul className="space-y-2">
        {entregas.map((caso) => (
          <LinhaDeEntrega
            key={caso.id}
            caso={caso}
            etapas={etapasPorCaso.get(caso.id) ?? []}
            hoje={hoje}
            papel={papel}
            confirma={confirma}
            onErro={setErro}
            onConfirmar={() => {
              setErro(null)
              setConfirmando(caso)
            }}
          />
        ))}
      </ul>

      {/* O VÍDEO DO MASTER, com título próprio, logo depois dos casos: é a
          segunda entrega de um atendimento cujas fotos já foram. */}
      {videos.length > 0 && (
        <section className={entregas.length > 0 ? 'mt-6' : undefined}>
          <h2 className="mb-2 text-sm font-bold">Vídeo do MASTER</h2>
          <ul className="space-y-2">
            {videos.map((item) => (
              <LinhaDoVideo key={item.etapa.id} item={item} confirma={confirma} onErro={setErro} />
            ))}
          </ul>
        </section>
      )}

      {/* O FOTO/LIVRO DEPOIS DOS CASOS, com título próprio: a pergunta de quem
          abre a aba é "o que eu entrego", e os dois respondem — mas o caso fecha
          um atendimento, e o livro é um objeto que anda sozinho pela esteira. */}
      {fotolivros.length > 0 && (
        <section className={entregas.length > 0 || videos.length > 0 ? 'mt-6' : undefined}>
          <h2 className="mb-2 text-sm font-bold">Foto/Livro</h2>
          <ul className="space-y-2">
            {fotolivros.map((item) => (
              <LinhaDoFotolivro
                key={`${item.etapa.id}-${item.momento}`}
                item={item}
                confirma={confirma}
                onErro={setErro}
              />
            ))}
          </ul>
        </section>
      )}

      {confirmando && (
        <DialogoConfirmarEntrega
          caso={confirmando}
          modo="confirmacao"
          etapas={etapasPorCaso.get(confirmando.id) ?? []}
          ocupado={confirmar.isPending}
          erro={erro}
          onCancelar={() => setConfirmando(null)}
          onConfirmar={() => {
            setErro(null)
            confirmar
              .mutateAsync({ casoId: confirmando.id })
              .then(() => setConfirmando(null))
              .catch((e) => setErro(mensagemDeErro(e)))
          }}
        />
      )}
    </div>
  )
}
