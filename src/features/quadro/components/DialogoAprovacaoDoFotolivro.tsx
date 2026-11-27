import { useEffect, useState, type ClipboardEvent } from 'react'
import { Dialogo } from '@/components/ui/Dialogo'
import {
  TIPOS_DA_CAPA,
  useEnviarFotolivroParaAprovacao,
  useUrlDaCapa,
} from '../api/useAcoes'
import { mensagemDeErro } from '../lib/erros'
import type { EtapaQuadro, FaseDaProva } from '../types'

/**
 * MANDAR O FOTOLIVRO PARA APROVAÇÃO DO CLIENTE (21/09/2026, pedido do gestor).
 *
 * É a porta das duas colunas da PROVA (27/11/2026) — "Enviar para aprovação",
 * depois da diagramação, e "Alterações realizadas", depois de um pedido de
 * alterações —, e a mesma pelos três caminhos: o seletor de fase, o arrastar no
 * quadro por fase e o ✓ do cartão. Pede as duas coisas que quem manda a prova
 * precisa — e o gestor quis as duas obrigatórias:
 *
 *   - a IMAGEM DA CAPA, "png simples, podendo até ser um print da tela". Por
 *     isso, além de escolher o arquivo, dá para COLAR (Ctrl+V) o print direto
 *     aqui: quem acabou de diagramar tira o print e cola, sem salvar arquivo;
 *   - o LINK da prova, que vai ao cliente.
 *
 * Na coluna das alterações o diálogo abre com a capa e o link da rodada
 * anterior: dá para manter os dois (o link da prova costuma ser o mesmo,
 * atualizado) ou trocar (decisão do gestor, 27/11/2026).
 *
 * Até 27/11 o diálogo levava direto a "Aguardando aprovação do cliente" e a
 * prova caía na fila do ADM em Entregáveis. Agora o sino chama quem a manda, e
 * é essa pessoa que move o livro para "Aguardando aprovação".
 */
export function DialogoAprovacaoDoFotolivro({
  etapa,
  nomeDoCaso,
  fase,
  onFechar,
}: {
  etapa: EtapaQuadro
  nomeDoCaso: string
  fase: FaseDaProva
  onFechar: () => void
}) {
  const alteracoes = fase === 'alteracoes_realizadas'
  const enviar = useEnviarFotolivroParaAprovacao()
  const [link, setLink] = useState(etapa.fotolivroLink ?? '')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [previa, setPrevia] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const { data: capaGravada } = useUrlDaCapa(arquivo ? null : etapa.fotolivroCapa)

  // A prévia é um endereço local do navegador (blob:), e ele só é solto quando
  // se pede. Sem isto, cada imagem escolhida ficaria presa na memória da aba.
  useEffect(() => {
    return () => {
      if (previa) URL.revokeObjectURL(previa)
    }
  }, [previa])

  function escolher(novo: File | null) {
    setErro(null)
    if (!novo) return
    if (!TIPOS_DA_CAPA.includes(novo.type)) {
      setErro('A capa precisa ser uma imagem PNG, JPG ou WEBP.')
      return
    }
    setArquivo(novo)
    setPrevia(URL.createObjectURL(novo))
  }

  function colar(evento: ClipboardEvent<HTMLDivElement>) {
    const imagem = Array.from(evento.clipboardData.files).find((f) =>
      f.type.startsWith('image/'),
    )
    if (imagem) {
      evento.preventDefault()
      escolher(imagem)
    }
  }

  const temCapa = arquivo !== null || etapa.fotolivroCapa !== null
  const imagem = previa ?? capaGravada ?? null

  return (
    <Dialogo
      titulo={alteracoes ? 'Alterações realizadas no Foto/Livro' : 'Mandar Foto/Livro para aprovação'}
      rotuloConfirmar={
        enviar.isPending ? 'Salvando…' : alteracoes ? 'Prova corrigida pronta' : 'Prova pronta'
      }
      confirmarDesabilitado={!temCapa || link.trim() === ''}
      ocupado={enviar.isPending}
      erro={erro}
      onCancelar={onFechar}
      onConfirmar={() => {
        setErro(null)
        enviar
          .mutateAsync({
            casoEtapaId: etapa.id,
            link,
            arquivo,
            capaAtual: etapa.fotolivroCapa,
            fase,
          })
          .then(onFechar, (e) => setErro(mensagemDeErro(e)))
      }}
    >
      <p className="text-sm text-muted-foreground">
        {nomeDoCaso}. O Foto/Livro vai para “
        {alteracoes ? 'Alterações realizadas — enviar ao cliente' : 'Enviar para aprovação'}” e o
        sino chama quem manda a prova ao cliente.
        {alteracoes && ' A capa e o link da rodada anterior continuam — troque só o que mudou.'}
      </p>

      {/* A área inteira recebe o Ctrl+V — tabIndex para ela poder ter foco no
          teclado, que é de onde o colar vem. */}
      <div
        tabIndex={0}
        onPaste={colar}
        className="space-y-2 rounded-md border border-dashed border-border p-3 outline-none focus-visible:ring-2 focus-visible:ring-marca"
      >
        <p className="text-sm font-semibold">Imagem da capa</p>
        {imagem ? (
          <img
            src={imagem}
            alt="Capa do Foto/Livro"
            className="max-h-48 w-auto rounded-md border border-border object-contain"
          />
        ) : (
          <p className="text-xs text-muted-foreground">
            {etapa.fotolivroCapa ? 'Carregando a capa…' : 'Nenhuma capa ainda.'}
          </p>
        )}
        <label className="inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold text-marca underline underline-offset-2">
          {temCapa ? 'Trocar imagem' : 'Escolher imagem'}
          <input
            type="file"
            accept={TIPOS_DA_CAPA.join(',')}
            className="sr-only"
            onChange={(e) => escolher(e.target.files?.[0] ?? null)}
          />
        </label>
        <p className="text-xs text-muted-foreground">
          Pode ser um print da tela: clique aqui e cole com Ctrl+V.
        </p>
      </div>

      <label className="block space-y-1">
        <span className="text-sm font-semibold">Link para o cliente</span>
        <input
          type="url"
          inputMode="url"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="https://"
          className="min-h-11 w-full rounded-md border border-border bg-background px-3 text-base"
        />
      </label>
    </Dialogo>
  )
}
