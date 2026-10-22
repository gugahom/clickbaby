import { useState } from 'react'
import clsx from 'clsx'
import { Dialogo } from '@/components/ui/Dialogo'
import { IconeCopiar, IconeNota } from '@/components/ui/icones'
import { useDefinirMensagemDoClickHome } from '../api/useAcoes'
import { mensagemDeErro } from '../lib/erros'
import type { EtapaQuadro } from '../types'

/**
 * A MENSAGEM PARA A FAMÍLIA ESCOLHER AS FOTOS (22/10/2026, pedido do gestor).
 *
 * A galeria (Celpics) gera um texto pronto para mandar à família, com o link, o
 * login e a senha da escolha. A equipe o colava nos "Pedidos do cliente" — "que
 * na verdade não chega nem a ser pedido dele" — e, para mandar, tinha de abrir
 * o pedido e selecionar o texto. Agora ele tem lugar próprio e, gravado, a
 * pastilha COPIA num toque: "se tivesse um negocinho de copiar aqui, seria mais
 * fácil". O lápis ao lado troca o texto.
 *
 * O texto tem LOGIN E SENHA: nada de log, e o histórico só diz que mudou.
 */
export function MensagemDoClickHome({ etapa, onErro }: { etapa: EtapaQuadro; onErro: (m: string | null) => void }) {
  const [aberto, setAberto] = useState(false)
  const [copiou, setCopiou] = useState(false)
  const mensagem = etapa.mensagemClickHome

  async function copiar() {
    if (!mensagem) return
    try {
      await navigator.clipboard.writeText(mensagem)
      setCopiou(true)
      window.setTimeout(() => setCopiou(false), 2000)
    } catch {
      onErro('Não deu para copiar. Abra a mensagem pelo lápis e copie à mão.')
    }
  }

  return (
    <>
      {mensagem ? (
        <span className="inline-flex items-center gap-1">
          <button
            type="button"
            onClick={() => void copiar()}
            aria-label="Copiar a mensagem para a família"
            className={clsx(PASTILHA, 'bg-marca-suave text-marca hover:bg-marca/15')}
          >
            <IconeCopiar className="size-3.5" />
            {copiou ? 'Copiada!' : 'Copiar mensagem'}
          </button>
          <button
            type="button"
            onClick={() => setAberto(true)}
            aria-label="Ver e trocar a mensagem para a família"
            title="Ver e trocar a mensagem"
            className={clsx(PASTILHA, 'border border-border text-muted-foreground hover:border-marca hover:text-marca')}
          >
            <IconeNota className="size-3.5" />
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setAberto(true)}
          aria-label="Colar a mensagem da galeria para a família"
          className={clsx(PASTILHA, 'border border-dashed border-border text-muted-foreground hover:border-marca hover:text-marca')}
        >
          <IconeNota className="size-3.5" />
          Mensagem
        </button>
      )}
      {aberto && <DialogoDaMensagem etapa={etapa} onFechar={() => setAberto(false)} />}
    </>
  )
}

// O alvo de 44px sem a pastilha crescer — o mesmo recurso de Pedidos.
const PASTILHA = clsx(
  'relative inline-flex h-6 flex-shrink-0 cursor-pointer items-center gap-1 rounded-full px-2 text-xs font-semibold transition-colors',
  "before:absolute before:top-1/2 before:left-1/2 before:size-11 before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']",
)

function DialogoDaMensagem({ etapa, onFechar }: { etapa: EtapaQuadro; onFechar: () => void }) {
  const definir = useDefinirMensagemDoClickHome()
  const [texto, setTexto] = useState(etapa.mensagemClickHome ?? '')
  const [erro, setErro] = useState<string | null>(null)
  const igual = texto.trim() === (etapa.mensagemClickHome ?? '').trim()

  return (
    <Dialogo
      titulo="Mensagem para a família"
      rotuloConfirmar={definir.isPending ? 'Salvando…' : 'Salvar'}
      confirmarDesabilitado={igual}
      ocupado={definir.isPending}
      erro={erro}
      onCancelar={onFechar}
      onConfirmar={() => {
        setErro(null)
        definir
          .mutateAsync({ casoEtapaId: etapa.id, mensagem: texto })
          .then(onFechar)
          .catch((e: unknown) => setErro(mensagemDeErro(e)))
      }}
    >
      <p className="text-sm text-muted-foreground">
        Cole aqui a mensagem que a galeria gera para a família escolher as fotos — com o link, o login e a
        senha. Depois é só tocar em “Copiar mensagem” no cartão. Em branco, tira.
      </p>
      <textarea
        autoFocus
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={8}
        aria-label="Mensagem para a família"
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-base"
      />
    </Dialogo>
  )
}
