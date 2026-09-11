import { useState } from 'react'
import { BotaoIcone } from '@/components/ui/BotaoIcone'
import { IconeLixeira } from '@/components/ui/icones'
import { BotaoCopiar } from '@/components/ui/BotaoCopiar'
import { Dropdown } from '@/components/ui/Dropdown'
import { Botao } from '@/components/ui/Botao'
import { Dialogo } from '@/components/ui/Dialogo'
import { Alerta } from '@/components/ui/Alerta'
import { formatarDataHora } from '@/lib/formato'
import {
  useEntregaveis,
  useRegistrarEntregavel,
  useRemoverEntregavel,
  type EntregavelResumo,
  type TipoEntregavel,
} from '../api/useAcoes'
import { mensagemDeErro } from '../lib/erros'
import type { CasoQuadro } from '../types'

const ROTULO_TIPO: Record<TipoEntregavel, string> = {
  google_photos: 'Google Photos',
  wetransfer: 'WeTransfer',
  cadeado: 'Cadeado',
  reels: 'Reels',
  album: 'Foto/Livro',
}

interface PropsEntregaveis {
  caso: CasoQuadro
  /** O card está aberto? Só então os links são buscados — ver useEntregaveis. */
  aberto: boolean
  onMudou?: () => void
}

/**
 * Links de entrega do caso.
 *
 * A fotógrafa gera os links fora do sistema (Google Photos, WeTransfer) e cola
 * aqui. O sistema não gera nem confere link nenhum — decisão do gestor, e a
 * verificação de que o link existe mesmo fica para uma integração futura, se
 * fizer sentido.
 *
 * A url é credencial de acesso à galeria da família (seção 10 do CLAUDE.md).
 * Consequências que este componente respeita:
 *   - nada de console.log com a url, em nenhum ramo;
 *   - a lista só é buscada com o card aberto, não na carga do Quadro;
 *   - o link abre com rel="noreferrer", para a url não vazar no Referer do
 *     destino.
 */
export function Entregaveis({ caso, aberto, onMudou }: PropsEntregaveis) {
  const { data: links, isPending } = useEntregaveis(caso.id, aberto)
  const registrar = useRegistrarEntregavel()

  const [dialogoAberto, setDialogoAberto] = useState(false)
  const [tipo, setTipo] = useState<TipoEntregavel>('google_photos')
  const [url, setUrl] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  function salvar() {
    setErro(null)
    registrar
      .mutateAsync({ casoId: caso.id, tipo, url })
      .then(() => {
        setDialogoAberto(false)
        setUrl('')
        onMudou?.()
      })
      .catch((e) => setErro(mensagemDeErro(e)))
  }

  return (
    <div className="space-y-2">
      {/* O ERRO PRECISA DE LUGAR FORA DO DIÁLOGO.

          Ele só aparecia dentro do "Adicionar link" — e as duas ações novas
          falham com o diálogo JÁ FECHADO: copiar (quando o navegador nega a
          área de transferência) e apagar (quando o banco recusa). Sem esta
          linha, as duas falhavam em silêncio, que é a pior forma de falhar:
          a pessoa acha que copiou e manda nada para a família. */}
      {erro && <Alerta onFechar={() => setErro(null)}>{erro}</Alerta>}

      {isPending ? (
        <p className="text-xs text-muted-foreground">Carregando links…</p>
      ) : (links ?? []).length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Nenhum link ainda. O caso não encerra sem ao menos um.
        </p>
      ) : (
        <ul className="space-y-1">
          {(links ?? []).map((link) => (
            <LinhaEntregavel
              key={link.id}
              link={link}
              onErro={setErro}
              onMudou={onMudou}
            />
          ))}
        </ul>
      )}

      {!caso.ehTerminal && (
        <Botao
          onClick={() => {
            setErro(null)
            setDialogoAberto(true)
          }}
        >
          Adicionar link
        </Botao>
      )}

      {dialogoAberto && (
        <Dialogo
          titulo="Adicionar link de entrega"
          rotuloConfirmar="Salvar link"
          confirmarDesabilitado={url.trim() === ''}
          ocupado={registrar.isPending}
          erro={erro}
          onCancelar={() => setDialogoAberto(false)}
          onConfirmar={salvar}
        >
          <p className="text-sm text-muted-foreground">
            Cole o link que você gerou. O sistema guarda e mostra para a equipe —
            não gera nem confere o link.
          </p>

          <div>
            <span className="text-sm font-medium">Tipo</span>
            <div className="mt-1">
              <Dropdown
                rotulo="Selecione o tipo"
                selecionado={tipo}
                onEscolher={(item) => setTipo(item.id as TipoEntregavel)}
                itens={Object.entries(ROTULO_TIPO).map(([valor, rot]) => ({
                  id: valor,
                  rotulo: rot,
                }))}
              />
            </div>
          </div>

          <label className="block">
            <span className="text-sm font-medium">Link</span>
            <input
              type="url"
              autoFocus
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://photos.app.goo.gl/…"
              className="mt-1 min-h-11 w-full rounded-md border border-border bg-background px-3 text-base"
            />
          </label>
        </Dialogo>
      )}
    </div>
  )
}

/**
 * COPIAR E APAGAR, na própria linha (07/09/2026, pedido do gestor).
 *
 * O caso que motivou: a Morgana abre o álbum e é a família errada. Antes, o
 * link entrava e não saía — a lista só crescia, e o errado ficava ali ao lado
 * do certo esperando alguém clicar no errado.
 *
 * COPIAR existe porque o link é para ser MANDADO. Ele vai por WhatsApp para a
 * família, e selecionar uma URL truncada com o dedo, num link que é clicável,
 * é o tipo de gesto que abre a galeria sem querer em vez de copiar.
 *
 * APAGAR SÓ O QUE NÃO FOI CONFIRMADO. Depois da confirmação o link faz parte de
 * uma entrega fechada, e o banco recusa (`remover_entregavel`); esconder o botão
 * ali é a tela concordando com a regra em vez de oferecer o que seria negado.
 */
function LinhaEntregavel({
  link,
  onErro,
  onMudou,
}: {
  link: EntregavelResumo
  onErro: (mensagem: string | null) => void
  onMudou?: (() => void) | undefined
}) {
  const remover = useRemoverEntregavel()
  const [confirmando, setConfirmando] = useState(false)

  return (
    <li className="flex flex-wrap items-center gap-2 rounded bg-background/60 px-2 py-2 text-sm">
      <span className="font-medium">{ROTULO_TIPO[link.tipo]}</span>
      <a
        href={link.url}
        target="_blank"
        // noreferrer, não só noopener: sem ele a url da galeria vai no cabeçalho
        // Referer para o destino.
        rel="noreferrer"
        className="min-w-0 flex-1 truncate text-xs text-marca underline underline-offset-2"
      >
        {link.url}
      </a>
      {link.confirmado_em ? (
        <span className="text-xs font-medium text-concluido">
          confirmado {formatarDataHora(link.confirmado_em)}
        </span>
      ) : (
        <span className="text-xs text-muted-foreground">aguardando confirmação</span>
      )}

      <div className="flex flex-shrink-0 items-center">
        <BotaoCopiar
          texto={link.url}
          onFalha={() => onErro('Não deu para copiar. Selecione o link e copie à mão.')}
        />

        {/* Sem botão quando já confirmado: o banco recusa, e oferecer o que
            seria negado ensina a desconfiar dos botões. */}
        {!link.confirmado_em && (
          <BotaoIcone
            rotulo="Apagar link"
            tom="pendencia"
            disabled={remover.isPending}
            onClick={() => setConfirmando(true)}
          >
            <IconeLixeira className="size-4" />
          </BotaoIcone>
        )}
      </div>

      {confirmando && (
        <Dialogo
          titulo="Apagar este link?"
          rotuloConfirmar="Apagar link"
          confirmarDestrutivo
          ocupado={remover.isPending}
          erro={null}
          onCancelar={() => setConfirmando(false)}
          onConfirmar={() => {
            onErro(null)
            remover
              .mutateAsync({ entregavelId: link.id })
              .then(() => {
                setConfirmando(false)
                onMudou?.()
              })
              .catch((e) => {
                setConfirmando(false)
                onErro(mensagemDeErro(e))
              })
          }}
        >
          <p className="text-sm text-muted-foreground">
            {ROTULO_TIPO[link.tipo]} — <span className="break-all">{link.url}</span>
          </p>
          <p className="text-sm text-muted-foreground">
            O link sai da lista do caso. A galeria continua onde está: o sistema
            guarda o endereço, não o conteúdo. Quem precisar de um novo, cola no
            lugar.
          </p>
        </Dialogo>
      )}
    </li>
  )
}
