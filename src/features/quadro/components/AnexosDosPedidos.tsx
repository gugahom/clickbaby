import { useRef, useState, type DragEvent } from 'react'
import clsx from 'clsx'
import { Botao } from '@/components/ui/Botao'
import {
  IconeClipe,
  IconeDocumento,
  IconeFilme,
  IconeLixeira,
  IconeMusica,
} from '@/components/ui/icones'
import { useAuth } from '@/features/auth/contexto'
import { formatarDataHora } from '@/lib/formato'
import { useAnexosDaEtapa, useRemoverAnexo, type AnexoDaEtapa } from '../api/useAcoes'
import type { EnvioDeAnexos } from '../api/useEnvioDeAnexos'
import { podeEncerrarCaso } from '../lib/acoes'
import { ACEITA_NO_SELETOR, formatarTamanho, generoDoAnexo } from '../lib/anexos'
import { mensagemDeErro } from '../lib/erros'
import type { EtapaQuadro } from '../types'

/**
 * OS ANEXOS DOS PEDIDOS DO CLIENTE (13/10/2026, pedido do gestor: "normalmente
 * o cliente manda alguma referência, algum vídeo, alguma foto, e aí seria
 * interessante um lugar de anexo"). É o "Anexos" do cartão do Trello deles.
 *
 * Foto mostra a miniatura; música toca ali mesmo (é o caso mais comum — "a
 * música que a família quer no vídeo"); vídeo e PDF abrem numa aba. Os anexos
 * entram NA HORA, sem esperar o "Salvar" do texto — por isso a frase diz isso.
 */
export function AnexosDosPedidos({
  etapa,
  envio,
}: {
  etapa: EtapaQuadro
  envio: EnvioDeAnexos
}) {
  const { pessoa } = useAuth()
  const consulta = useAnexosDaEtapa(etapa.id)
  const remover = useRemoverAnexo()
  const seletor = useRef<HTMLInputElement>(null)
  const [arrastando, setArrastando] = useState(false)
  const [apagando, setApagando] = useState<string | null>(null)
  const [erroAoApagar, setErroAoApagar] = useState<string | null>(null)

  const anexos = consulta.data ?? []
  const quantos = consulta.data ? anexos.length : etapa.anexos
  const gestao = podeEncerrarCaso(pessoa?.papelSistema ?? 'operador')
  const podeApagar = (a: AnexoDaEtapa) => gestao || a.enviadoPorId === pessoa?.id

  function aoSoltar(e: DragEvent) {
    e.preventDefault()
    setArrastando(false)
    void envio.enviar(Array.from(e.dataTransfer.files))
  }

  return (
    <section
      aria-label="Anexos do pedido"
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return
        e.preventDefault()
        setArrastando(true)
      }}
      onDragLeave={() => setArrastando(false)}
      onDrop={aoSoltar}
      className={clsx(
        'rounded-md border border-dashed p-3 transition-colors',
        arrastando ? 'border-marca bg-marca-suave' : 'border-border',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">
          Anexos{quantos > 0 ? ` · ${quantos}` : ''}
        </p>
        <Botao
          variante="contorno"
          onClick={() => {
            envio.limparErros()
            seletor.current?.click()
          }}
          disabled={envio.progresso !== null}
        >
          <IconeClipe className="size-4" />
          {envio.progresso
            ? `Enviando ${envio.progresso.atual} de ${envio.progresso.total}…`
            : 'Anexar arquivo'}
        </Botao>
        <input
          ref={seletor}
          type="file"
          multiple
          accept={ACEITA_NO_SELETOR}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            const arquivos = Array.from(e.target.files ?? [])
            e.target.value = ''
            void envio.enviar(arquivos)
          }}
        />
      </div>

      <p className="mt-1 text-xs text-muted-foreground">
        Foto, vídeo, música ou PDF, até 50 MB cada — escolha, arraste ou cole um print
        (Ctrl+V). Os anexos entram na hora.
      </p>

      {envio.erros.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs font-semibold text-atrasado">
          {envio.erros.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      {erroAoApagar && <p className="mt-2 text-xs font-semibold text-atrasado">{erroAoApagar}</p>}

      {consulta.isPending && etapa.anexos > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">Carregando os anexos…</p>
      )}
      {consulta.isError && (
        <p className="mt-3 text-xs font-semibold text-atrasado">
          Não foi possível carregar os anexos. {mensagemDeErro(consulta.error)}
        </p>
      )}

      {anexos.length > 0 && (
        <ul className="mt-3 space-y-2">
          {anexos.map((a) => {
            const genero = generoDoAnexo(a.tipoMime)
            return (
              <li key={a.id} className="rounded-md bg-muted/60 p-2">
                <div className="flex items-center gap-3">
                  <a
                    href={a.url ?? undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Abrir ${a.nome}`}
                    className="flex size-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-md bg-card text-muted-foreground"
                  >
                    {genero === 'imagem' && a.url ? (
                      <img src={a.url} alt="" className="size-full object-cover" loading="lazy" />
                    ) : genero === 'audio' ? (
                      <IconeMusica className="size-5" />
                    ) : genero === 'video' ? (
                      <IconeFilme className="size-5" />
                    ) : (
                      <IconeDocumento className="size-5" />
                    )}
                  </a>
                  <div className="min-w-0 flex-1">
                    <a
                      href={a.url ?? undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block truncate text-sm font-semibold hover:underline"
                    >
                      {a.nome}
                    </a>
                    <p className="truncate text-xs text-muted-foreground">
                      {formatarTamanho(a.tamanho)}
                      {a.enviadoPorNome ? ` · ${a.enviadoPorNome}` : ''} · {formatarDataHora(a.enviadoEm)}
                    </p>
                  </div>
                  {podeApagar(a) &&
                    (apagando === a.id ? (
                      <div className="flex flex-shrink-0 items-center gap-1">
                        <Botao
                          variante="destrutivo"
                          disabled={remover.isPending}
                          onClick={() => {
                            setErroAoApagar(null)
                            remover
                              .mutateAsync({ casoEtapaId: etapa.id, anexoId: a.id })
                              .then(
                                () => setApagando(null),
                                (e) => setErroAoApagar(mensagemDeErro(e)),
                              )
                          }}
                        >
                          Apagar
                        </Botao>
                        <Botao variante="fantasma" onClick={() => setApagando(null)}>
                          Não
                        </Botao>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setApagando(a.id)}
                        aria-label={`Apagar o anexo ${a.nome}`}
                        className="flex size-11 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-card hover:text-atrasado"
                      >
                        <IconeLixeira className="size-4" />
                      </button>
                    ))}
                </div>
                {genero === 'audio' && a.url && (
                  <audio controls preload="none" src={a.url} className="mt-2 h-9 w-full">
                    <track kind="captions" />
                  </audio>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
