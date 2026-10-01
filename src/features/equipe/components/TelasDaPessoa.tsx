import { useState } from 'react'
import clsx from 'clsx'
import { Alerta } from '@/components/ui/Alerta'
import { IconeCheck } from '@/components/ui/icones'
import { TELAS, telasEfetivas, telasPadraoDoPapel, type Tela } from '@/features/auth/telas'
import { useAuth } from '@/features/auth/contexto'
import type { PessoaDaEquipe } from '../api/useEquipe'
import { useDefinirTelas } from '../api/useAcoesDaPessoa'
import { ROTULO_PAPEL } from '../lib/apresentacao'

/**
 * AS TELAS QUE A PESSOA VÊ (30/09/2026, pedido do gestor: "poder conceder e
 * tirar acessos a telas"). É a porta para o que vem — o painel comercial e o
 * financeiro, em que a pessoa entra direto numa tela só dela.
 *
 * Nasce no PADRÃO DO PAPEL e fica assim até alguém mexer; mexer grava a lista
 * da pessoa, e "Voltar ao padrão" a apaga. Cada toque salva na hora, como o
 * papel logo abaixo — não há "salvar" para esquecer de apertar.
 *
 * Nas telas Equipe e Relatórios a tela dá o PODER junto (decisão do gestor), e
 * a linha diz qual. Tirar a tela Equipe da última pessoa que a tem o banco
 * recusa, e o erro aparece aqui.
 */
export function TelasDaPessoa({ pessoa }: { pessoa: PessoaDaEquipe }) {
  const definir = useDefinirTelas()
  const { pessoa: eu } = useAuth()
  const [erro, setErro] = useState<string | null>(null)
  const efetivas = telasEfetivas(pessoa.telas, pessoa.papelSistema)
  const noPadrao = pessoa.telas === null
  const souEu = eu?.id === pessoa.id

  function salvar(telas: Tela[] | null) {
    setErro(null)
    definir.mutate(
      { pessoaId: pessoa.id, telas },
      { onError: (e) => setErro(e instanceof Error ? e.message : String(e)) },
    )
  }

  function alternar(t: Tela) {
    const proximas = efetivas.includes(t) ? efetivas.filter((x) => x !== t) : [...efetivas, t]
    // Na ordem da lista, para a coluna guardada não depender da ordem dos toques.
    salvar(TELAS.map((x) => x.id).filter((x) => proximas.includes(x)))
  }

  return (
    <section className="rounded-cartao border border-border bg-card p-4 shadow-cartao">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="rotulo-sobrescrito text-acento">Telas</h3>
        <span className="text-xs text-muted-foreground">
          {noPadrao ? `Padrão de ${ROTULO_PAPEL[pessoa.papelSistema] ?? pessoa.papelSistema}` : 'Escolhidas pela gestão'}
        </span>
      </div>

      {erro && (
        <div className="mt-3">
          <Alerta onFechar={() => setErro(null)}>{erro}</Alerta>
        </div>
      )}

      <ul className="mt-3 space-y-1.5">
        {TELAS.map((t) => {
          const tem = efetivas.includes(t.id)
          return (
            <li key={t.id}>
              <button
                type="button"
                role="checkbox"
                aria-checked={tem}
                disabled={definir.isPending}
                onClick={() => alternar(t.id)}
                className={clsx(
                  'flex min-h-11 w-full items-start gap-3 rounded-md border px-3 py-2 text-left transition-colors disabled:opacity-60',
                  tem ? 'border-marca/40 bg-marca-suave' : 'border-border hover:border-marca/30',
                )}
              >
                <span
                  className={clsx(
                    'mt-0.5 grid size-5 flex-shrink-0 place-items-center rounded border',
                    tem ? 'border-marca bg-marca text-white' : 'border-border bg-background',
                  )}
                  aria-hidden="true"
                >
                  {tem && <IconeCheck className="size-3.5" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-foreground">{t.rotulo}</span>
                  <span className="block text-xs text-muted-foreground">{t.descricao}</span>
                  {tem && t.poder && <span className="mt-0.5 block text-xs font-medium text-atencao-tinta">{t.poder}</span>}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-3 text-xs text-muted-foreground">
        <span>
          {souEu
            ? 'São as suas telas: a mudança vale na hora para você.'
            : 'Vale na próxima vez que a pessoa abrir ou recarregar o sistema.'}
        </span>
        {!noPadrao && (
          <button
            type="button"
            onClick={() => salvar(null)}
            disabled={definir.isPending}
            className="min-h-9 font-semibold text-marca hover:underline"
            title={`Padrão do papel: ${telasPadraoDoPapel(pessoa.papelSistema)
              .map((x) => TELAS.find((y) => y.id === x)?.rotulo)
              .join(', ')}`}
          >
            Voltar ao padrão do papel
          </button>
        )}
      </div>
    </section>
  )
}
