import { useState } from 'react'
import clsx from 'clsx'
import { Botao } from '@/components/ui/Botao'
import { Dialogo } from '@/components/ui/Dialogo'
import { IconeLink } from '@/components/ui/icones'
import { useEntregaveis, useRegistrarEntregavel } from '../api/useAcoes'
import { mensagemDeErro } from '../lib/erros'
import { LinkParaCopiar } from './LinkParaCopiar'

/**
 * O LINK DE ENTREGA DO FOTO/LIVRO DENTRO DO FOTO/LIVRO (20/10/2026, pedido do
 * gestor: "a possibilidade de colocar um link fotolivro dentro do foto livro").
 *
 * O tipo de link já existia (`album`, "Foto/Livro", nos links do caso), mas só
 * se colava pelo card do Quadro, e só com o caso ABERTO — e quase todo
 * fotolivro corre com o caso já encerrado, semanas depois da entrega das fotos.
 * Aqui ele entra em qualquer fase: pela pastilha do cartão da seção, pela ficha
 * e pela linha do livro em Entregáveis. `registrar_entregavel` sempre aceitou
 * caso em qualquer estado; quem limitava era a tela.
 *
 * NÃO É O LINK DA PROVA (`fotolivro_link`), que vai e volta com o cliente na
 * aprovação junto da capa: este é o link FINAL da família, e por isso mora nos
 * links do caso — com o mesmo copiar e o mesmo apagar de todo link de entrega.
 * Apagar um errado continua sendo em "Links do caso", na ficha.
 *
 * A url é credencial (seção 10): nada de log, e a lista só é buscada quando
 * alguém olha — o diálogo aberto, ou a ficha e a linha de Entregáveis, que já
 * buscam os links do caso de qualquer forma.
 */
function useLinksDoFotolivro(casoId: string, habilitado: boolean) {
  const consulta = useEntregaveis(casoId, habilitado)
  return {
    carregando: consulta.data === undefined,
    links: (consulta.data ?? []).filter((l) => l.tipo === 'album'),
  }
}

function ListaDeLinks({ casoId, habilitado }: { casoId: string; habilitado: boolean }) {
  const { carregando, links } = useLinksDoFotolivro(casoId, habilitado)
  if (carregando) return <p className="text-xs text-muted-foreground">Buscando o link…</p>
  if (links.length === 0) return <p className="text-sm text-muted-foreground">Nenhum link do Foto/Livro ainda.</p>
  return (
    <div className="space-y-2">
      {links.map((l) => (
        <LinkParaCopiar key={l.id} rotulo="Link do Foto/Livro" url={l.url} />
      ))}
    </div>
  )
}

/** O diálogo: os links que o livro já tem, e o campo para colar um novo. */
function DialogoLinkDoFotolivro({ casoId, nomeDoCaso, onFechar }: { casoId: string; nomeDoCaso: string; onFechar: () => void }) {
  const registrar = useRegistrarEntregavel()
  const [url, setUrl] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  return (
    <Dialogo
      titulo="Link do Foto/Livro"
      rotuloConfirmar={registrar.isPending ? 'Salvando…' : 'Salvar link'}
      confirmarDesabilitado={url.trim() === ''}
      ocupado={registrar.isPending}
      erro={erro}
      onCancelar={onFechar}
      onConfirmar={() => {
        setErro(null)
        registrar
          .mutateAsync({ casoId, tipo: 'album', url })
          .then(onFechar)
          .catch((e) => setErro(mensagemDeErro(e)))
      }}
    >
      <p className="text-sm text-muted-foreground">
        {nomeDoCaso}. O link que a família recebe do Foto/Livro — fica nos links do caso e aparece na
        entrega do livro, em Entregáveis.
      </p>
      <ListaDeLinks casoId={casoId} habilitado />
      <label className="block">
        <span className="text-sm font-medium">Novo link</span>
        <input
          type="url"
          autoFocus
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://"
          className="mt-1 min-h-11 w-full rounded-md border border-border bg-background px-3 text-base"
        />
      </label>
    </Dialogo>
  )
}

/**
 * A PASTILHA DO CARTÃO, ao lado de "Pedidos". Não sabe se o livro já tem link
 * (os links não vêm na carga do Quadro, de propósito — ver useEntregaveis);
 * quem diz é o diálogo, que os busca ao abrir.
 */
export function PilulaLinkDoFotolivro({ casoId, nomeDoCaso }: { casoId: string; nomeDoCaso: string }) {
  const [aberto, setAberto] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        aria-label="Ver e adicionar o link do Foto/Livro"
        title="Link do Foto/Livro"
        className={clsx(
          // O alvo de 44px sem a pastilha crescer — o mesmo recurso de Pedidos.
          'relative inline-flex h-6 flex-shrink-0 cursor-pointer items-center gap-1 rounded-full px-2 text-xs font-semibold transition-colors',
          "before:absolute before:top-1/2 before:left-1/2 before:size-11 before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']",
          'border border-dashed border-border text-muted-foreground hover:border-marca hover:text-marca',
        )}
      >
        <IconeLink className="size-3.5" />
        Link
      </button>
      {aberto && <DialogoLinkDoFotolivro casoId={casoId} nomeDoCaso={nomeDoCaso} onFechar={() => setAberto(false)} />}
    </>
  )
}

/** O BLOCO da ficha e da linha de Entregáveis: os links à vista, e o botão. */
export function LinksDoFotolivro({ casoId, nomeDoCaso }: { casoId: string; nomeDoCaso: string }) {
  const [aberto, setAberto] = useState(false)
  const { links } = useLinksDoFotolivro(casoId, true)
  return (
    <div className="space-y-2">
      <ListaDeLinks casoId={casoId} habilitado />
      <Botao onClick={() => setAberto(true)}>
        <IconeLink className="size-4" />
        {links.length > 0 ? 'Adicionar outro link' : 'Adicionar link do Foto/Livro'}
      </Botao>
      {aberto && <DialogoLinkDoFotolivro casoId={casoId} nomeDoCaso={nomeDoCaso} onFechar={() => setAberto(false)} />}
    </div>
  )
}
