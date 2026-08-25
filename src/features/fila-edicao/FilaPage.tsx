import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Alerta } from '@/components/ui/Alerta'
import { Dialogo } from '@/components/ui/Dialogo'
import { hojeNoFuso } from '@/lib/formato'
import { useAuth } from '@/features/auth/contexto'
import {
  useAtribuirEtapa,
  useConcluirEtapa,
  useIniciarEtapa,
  usePausarEtapa,
  usePessoasAtivas,
} from '@/features/quadro/api/useAcoes'
import { podeEncerrarCaso } from '@/features/quadro/lib/acoes'
import { mensagemDeErro } from '@/features/quadro/lib/erros'
import { useRelogioDeMinuto } from '@/features/quadro/lib/useRelogio'
import { useFilaEdicao } from './api/useFila'
import { ItemDaFila } from './components/ItemDaFila'
import type { ItemFila } from './types'

/**
 * Fila de Edição — tela C de docs/plano.md.
 *
 * ORDENAÇÃO POR URGÊNCIA DE PRAZO, não por ordem de chegada. Vem do
 * `.order('vence_em')` da query, e o `vence_em` vem da view `quadro_casos` —
 * uma definição de SLA no projeto inteiro. Um BIRTH de 24h sobe sozinho na
 * frente de um MASTER de 7 dias sem ninguém escrever "BIRTH primeiro" em lugar
 * nenhum, que é o que a seção 12 do CLAUDE.md proíbe.
 *
 * VISÍVEL PARA TODA A EQUIPE, não só para a coordenação. A seção 9 é explícita:
 * "o cliente observou que a produtividade subiu com a simples presença dos
 * sócios — visibilidade compartilhada reproduz esse efeito sem clima de
 * fiscalização".
 *
 * O QUE É RESTRITO É DISTRIBUIR PARA OUTRA PESSOA.
 * `atribuir_etapa` aceita qualquer pessoa ativa de propósito (ver migration
 * 20260825034214), e ao decidir aquilo eu disse que o gate da distribuição
 * moraria aqui, na tela, e não na RPC — porque é regra de fluxo, e mudar de
 * ideia sobre fluxo não pode custar migration.
 *
 * Então: "Assumir" é de todo mundo (puxar trabalho para si), "Atribuir a outra
 * pessoa" é da coordenação. As duas chamam a mesma RPC.
 */
export function FilaPage() {
  const { pessoa } = useAuth()
  const queryClient = useQueryClient()
  const { data: itens, isPending, error } = useFilaEdicao()

  const hoje = hojeNoFuso()
  const agora = useRelogioDeMinuto()

  const [erro, setErro] = useState<string | null>(null)
  const [atribuindo, setAtribuindo] = useState<ItemFila | null>(null)

  const iniciar = useIniciarEtapa()
  const pausar = usePausarEtapa()
  const concluir = useConcluirEtapa()
  const atribuir = useAtribuirEtapa()

  const ocupado =
    iniciar.isPending || pausar.isPending || concluir.isPending || atribuir.isPending

  const podeDistribuir = podeEncerrarCaso(pessoa?.papelSistema ?? 'operador')

  function executar(promessa: Promise<unknown>, aoTerminar?: () => void) {
    setErro(null)
    promessa.then(
      () => {
        // As mutations do Quadro invalidam ['quadro']; a fila é outra query e
        // precisa da própria invalidação, senão a lista fica parada depois da
        // ação.
        void queryClient.invalidateQueries({ queryKey: ['fila-edicao'] })
        aoTerminar?.()
      },
      (e) => setErro(mensagemDeErro(e)),
    )
  }

  const { emAndamento, aguardando } = useMemo(() => {
    const lista = itens ?? []
    return {
      emAndamento: lista.filter((i) => i.etapaStatus === 'em_andamento'),
      aguardando: lista.filter((i) => i.etapaStatus !== 'em_andamento'),
    }
  }, [itens])

  if (error) {
    return (
      <Aviso titulo="Não foi possível carregar a fila">
        {error instanceof Error ? error.message : 'Erro desconhecido.'}
      </Aviso>
    )
  }

  const acoes = {
    onAtribuir: (item: ItemFila) => {
      setErro(null)
      setAtribuindo(item)
    },
    onAssumir: (item: ItemFila) => {
      if (!pessoa) return
      executar(
        atribuir.mutateAsync({
          casoEtapaId: item.casoEtapaId,
          paraPessoaId: pessoa.id,
        }),
      )
    },
    onIniciar: (item: ItemFila) =>
      executar(iniciar.mutateAsync({ casoEtapaId: item.casoEtapaId })),
    onPausar: (item: ItemFila) =>
      executar(pausar.mutateAsync({ casoEtapaId: item.casoEtapaId })),
    onConcluir: (item: ItemFila) =>
      executar(concluir.mutateAsync({ casoEtapaId: item.casoEtapaId })),
  }

  return (
    <div className="flex h-full flex-col">
      <header className="sticky top-0 z-10 flex-shrink-0 border-b border-border bg-card px-3 py-3 shadow-cartao md:px-4">
        <h1 className="text-lg font-bold tracking-tight md:text-2xl">Fila de edição</h1>
        <p className="mt-0.5 text-xs text-muted-foreground md:text-sm">
          {isPending
            ? 'Carregando…'
            : `${emAndamento.length} em andamento · ${aguardando.length} aguardando · por urgência de prazo`}
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-3 md:p-4">
        {erro && (
          <div className="mb-3">
            <Alerta onFechar={() => setErro(null)}>{erro}</Alerta>
          </div>
        )}

        {isPending ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            Carregando fila…
          </p>
        ) : (itens ?? []).length === 0 ? (
          <Aviso titulo="Fila vazia">
            Nenhuma edição de vídeo pendente. Casos ganham etapa de vídeo pelo pacote,
            ou pelo botão "Adicionar reels" no Quadro.
          </Aviso>
        ) : (
          <div className="space-y-4">
            {/* Em andamento no topo, e não misturado: é o trabalho acontecendo
                agora, a pergunta que a TV da sala de edição responde. A fila de
                espera vem embaixo, na ordem em que deve ser puxada. */}
            {emAndamento.length > 0 && (
              <Secao titulo="Em andamento" quantidade={emAndamento.length}>
                {emAndamento.map((item) => (
                  <ItemDaFila
                    key={item.casoEtapaId}
                    item={item}
                    hoje={hoje}
                    agora={agora}
                    pessoaId={pessoa?.id ?? null}
                    podeDistribuir={podeDistribuir}
                    ocupado={ocupado}
                    acoes={acoes}
                  />
                ))}
              </Secao>
            )}

            <Secao titulo="Aguardando" quantidade={aguardando.length}>
              {aguardando.map((item) => (
                <ItemDaFila
                  key={item.casoEtapaId}
                  item={item}
                  hoje={hoje}
                  agora={agora}
                  pessoaId={pessoa?.id ?? null}
                  podeDistribuir={podeDistribuir}
                  ocupado={ocupado}
                  acoes={acoes}
                />
              ))}
            </Secao>
          </div>
        )}
      </div>

      {atribuindo && (
        <DialogoAtribuir
          item={atribuindo}
          ocupado={atribuir.isPending}
          erro={erro}
          onCancelar={() => setAtribuindo(null)}
          onConfirmar={(paraPessoaId) =>
            executar(
              atribuir.mutateAsync({
                casoEtapaId: atribuindo.casoEtapaId,
                paraPessoaId,
              }),
              () => setAtribuindo(null),
            )
          }
        />
      )}
    </div>
  )
}

function Secao({
  titulo,
  quantidade,
  children,
}: {
  titulo: string
  quantidade: number
  children: React.ReactNode
}) {
  if (quantidade === 0) return null
  return (
    <section className="overflow-hidden rounded-md border border-border bg-card shadow-painel">
      <header className="flex items-baseline justify-between border-b border-border bg-acento-suave px-3 py-2.5">
        <h2 className="text-sm font-bold tracking-[0.12em] text-acento-forte uppercase">
          {titulo}
        </h2>
        <span className="text-lg font-bold tabular-nums text-acento-forte">
          {quantidade}
        </span>
      </header>
      <ul>{children}</ul>
    </section>
  )
}

function DialogoAtribuir({
  item,
  ocupado,
  erro,
  onCancelar,
  onConfirmar,
}: {
  item: ItemFila
  ocupado: boolean
  erro: string | null
  onCancelar: () => void
  onConfirmar: (paraPessoaId: string) => void
}) {
  const { data: pessoas, isPending } = usePessoasAtivas()
  const [paraPessoaId, setParaPessoaId] = useState('')

  // A RPC recusa designar para quem já é responsável; tirar da lista evita o
  // erro em vez de explicá-lo depois.
  const opcoes = (pessoas ?? []).filter((p) => p.id !== item.responsavelId)

  return (
    <Dialogo
      titulo={`Atribuir a edição de ${item.maeNome}`}
      rotuloConfirmar="Atribuir"
      confirmarDesabilitado={paraPessoaId === ''}
      ocupado={ocupado}
      erro={erro}
      onCancelar={onCancelar}
      onConfirmar={() => onConfirmar(paraPessoaId)}
    >
      <p className="text-sm text-muted-foreground">
        {item.responsavelNome
          ? `Agora com ${item.responsavelNome}. A edição não começou, então isto é redistribuição.`
          : 'Ninguém designado ainda.'}
      </p>

      <label className="block">
        <span className="text-sm font-medium">Pessoa</span>
        <select
          value={paraPessoaId}
          onChange={(e) => setParaPessoaId(e.target.value)}
          className="mt-1 min-h-11 w-full rounded-md border border-border bg-background px-3 text-base"
        >
          <option value="">{isPending ? 'Carregando…' : 'Selecione uma pessoa'}</option>
          {opcoes.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>
      </label>
    </Dialogo>
  )
}

function Aviso({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-lg p-8 text-center">
      <h2 className="font-semibold">{titulo}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{children}</p>
    </div>
  )
}
