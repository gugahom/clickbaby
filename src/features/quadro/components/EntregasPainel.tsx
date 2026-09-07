import { useState } from 'react'
import { Botao } from '@/components/ui/Botao'
import { Alerta } from '@/components/ui/Alerta'
import { IconeCheck } from '@/components/ui/icones'
import { formatarDataHora, rotularDia } from '@/lib/formato'
import { useAuth } from '@/features/auth/contexto'
import { Dialogo } from '@/components/ui/Dialogo'
import { IconeDesfazer } from '@/components/ui/icones'
import { useConfirmarEntrega, useDevolverParaOQuadro, useEntregaveis } from '../api/useAcoes'
import { podeConfirmarEntrega, podeEncerrarCaso } from '../lib/acoes'
import { mensagemDeErro } from '../lib/erros'
import { DialogoConfirmarEntrega } from './DialogoConfirmarEntrega'
import { Entregaveis } from './Entregaveis'
import type { CasoQuadro, EtapaQuadro } from '../types'

interface PropsEntregasPainel {
  /** Casos ENVIADOS e ainda abertos, na ordem em que foram enviados. */
  entregas: CasoQuadro[]
  etapasPorCaso: Map<string, EtapaQuadro[]>
  hoje: string
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
export function EntregasPainel({ entregas, etapasPorCaso, hoje }: PropsEntregasPainel) {
  const { pessoa } = useAuth()
  const papel = pessoa?.papelSistema ?? 'operador'

  const confirmar = useConfirmarEntrega()
  const [confirmando, setConfirmando] = useState<CasoQuadro | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const confirma = podeEncerrarCaso(papel)

  if (entregas.length === 0) {
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
      <p className="mb-3 text-sm text-muted-foreground">
        {confirma
          ? 'Casos com o trabalho concluído, enviados por quem editou. Confira os links e confirme a entrega — o caso encerra e não há como desfazer.'
          : 'Casos com o trabalho concluído, esperando a entrega à família. Quem confirma é o ADM ou a gestão.'}
      </p>

      {erro && (
        <div className="mb-3">
          <Alerta>{erro}</Alerta>
        </div>
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
