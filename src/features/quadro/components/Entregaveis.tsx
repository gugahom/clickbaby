import { useState } from 'react'
import { Dropdown } from '@/components/ui/Dropdown'
import { Botao } from '@/components/ui/Botao'
import { Dialogo } from '@/components/ui/Dialogo'
import { formatarDataHora } from '@/lib/formato'
import {
  useEntregaveis,
  useRegistrarEntregavel,
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
  album: 'Álbum',
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
      {isPending ? (
        <p className="text-xs text-muted-foreground">Carregando links…</p>
      ) : (links ?? []).length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Nenhum link ainda. O caso não encerra sem ao menos um.
        </p>
      ) : (
        <ul className="space-y-1">
          {(links ?? []).map((link) => (
            <LinhaEntregavel key={link.id} link={link} />
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

function LinhaEntregavel({ link }: { link: EntregavelResumo }) {
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
    </li>
  )
}
