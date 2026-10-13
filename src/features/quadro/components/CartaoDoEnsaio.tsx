import { useState } from 'react'
import clsx from 'clsx'
import { Link } from 'react-router'
import { Botao } from '@/components/ui/Botao'
import { IconeCheck } from '@/components/ui/icones'
import { formatarHora } from '@/lib/formato'
import { useMoverClickHome } from '../api/useAcoes'
import { mensagemDeErro } from '../lib/erros'
import type { EnsaioNoDia } from '../types'
import { DialogoAgendarEnsaio } from './AgendamentoDoClickHome'
import { AtribuicaoDaSecao } from './AtribuicaoDaSecao'
import { PagamentoDoClickHome } from './PagamentoDoClickHome'

/**
 * O ENSAIO NEW BORN NO BLOCO DO DIA (13/10/2026, pedido do gestor: "no dia do
 * agendamento ela apareceria no painel para mim novamente").
 *
 * Não é o cartão do caso — o caso mora no dia do parto, quase sempre encerrado.
 * É o TRABALHO DE CAMPO daquele dia: a hora, a família, quem vai, se está pago,
 * e as duas saídas.
 *
 * "ENSAIO FEITO" leva o New Born a "Aguardando edição", e o cartão sai do dia
 * (decisão do gestor, perguntado: alguém move, nada passa de fase sozinho pela
 * data). "REAGENDAR" muda a data, e o cartão vai para o novo dia.
 */
export function CartaoDoEnsaio({
  ensaio,
  atrasado,
}: {
  ensaio: EnsaioNoDia
  /** O dia do ensaio já passou e ninguém disse que ele aconteceu. */
  atrasado: boolean
}) {
  const { caso, etapa } = ensaio
  const mover = useMoverClickHome()
  const [reagendando, setReagendando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const nome = caso.bebeNome ? `${caso.maeNome} · ${caso.bebeNome}` : caso.maeNome

  return (
    <article
      className={clsx(
        'rounded-cartao border bg-card px-3 py-3 shadow-cartao md:px-4',
        atrasado ? 'border-atrasado/50' : 'border-marca/40',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-marca px-2.5 py-0.5 text-[11px] font-extrabold tracking-wide text-white">
              ENSAIO NEW BORN
            </span>
            <span className="text-base font-extrabold tabular-nums">{formatarHora(etapa.previsaoEm)}</span>
            {atrasado && (
              <span className="rounded-full bg-atrasado px-2 py-0.5 text-[11px] font-semibold text-white">
                passou da data
              </span>
            )}
          </div>
          <Link
            to={`/?caso=${caso.id}`}
            className="mt-1 block truncate font-semibold text-foreground hover:underline"
          >
            {nome}
          </Link>
          <p className="text-xs text-muted-foreground">
            Na casa da família{caso.pacoteNome ? ` · ${caso.pacoteNome}` : ''}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <AtribuicaoDaSecao etapa={etapa} onErro={setErro} />
          <PagamentoDoClickHome etapa={etapa} onErro={setErro} />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Botao
          onClick={() => {
            setErro(null)
            mover
              .mutateAsync({ casoEtapaId: etapa.id, fase: 'aguardando_edicao' })
              .catch((e) => setErro(mensagemDeErro(e)))
          }}
          disabled={mover.isPending}
          className="superficie-acento border-0 font-bold text-white shadow-cartao-alto hover:brightness-110"
        >
          <IconeCheck className="size-4" />
          Ensaio feito
        </Botao>
        <Botao variante="fantasma" onClick={() => setReagendando(true)} disabled={mover.isPending}>
          Reagendar
        </Botao>
      </div>

      {erro && <p className="mt-2 text-xs font-semibold text-atrasado">{erro}</p>}

      {reagendando && (
        <DialogoAgendarEnsaio etapa={etapa} nomeDoCaso={nome} onFechar={() => setReagendando(false)} />
      )}
    </article>
  )
}
