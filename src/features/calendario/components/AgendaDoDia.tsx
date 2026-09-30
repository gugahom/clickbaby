import { useState } from 'react'
import { Link } from 'react-router'
import clsx from 'clsx'
import { Botao } from '@/components/ui/Botao'
import { IconeCheck } from '@/components/ui/icones'
import { useMarcarFeriado, useTirarFeriado, type Feriado, type ItemDoCalendario } from '../api/useCalendario'
import { rotuloDoDia } from '../lib/datas'
import { estiloDoItem } from '../lib/estilos'

/**
 * O DIA ESCOLHIDO, por extenso. É aqui que cada item diz o que é ("Parto
 * previsto", "Banho", "Vence o prazo"), quem, onde e com quem — a grade só tem
 * espaço para hora e nome. Tocar num item abre o caso no Quadro (`/?caso=`), o
 * mesmo caminho do sino e do relatório externo.
 *
 * O FERIADO SE MARCA AQUI, e só o ADM marca (espelho de `eh_adm()`, a policy
 * da tabela). Ele não é enfeite: um dia marcado deixa de contar como dia útil,
 * e o prazo dos dois MASTER anda para frente — a frase embaixo do botão diz
 * isso antes do clique, não depois.
 */
export function AgendaDoDia({
  dia,
  itens,
  feriado,
  podeMarcarFeriado,
}: {
  dia: string
  itens: ItemDoCalendario[]
  feriado: Feriado | undefined
  podeMarcarFeriado: boolean
}) {
  return (
    <section className="rounded-painel border border-border bg-card p-4" aria-label={`Agenda de ${rotuloDoDia(dia)}`}>
      <header className="mb-3">
        <h2 className="text-lg leading-tight font-bold tracking-tight text-foreground first-letter:uppercase">
          {rotuloDoDia(dia)}
        </h2>
        {feriado && (
          <p className="mt-1 inline-flex rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-foreground">
            Feriado · {feriado.descricao}
          </p>
        )}
      </header>

      {itens.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Nada marcado neste dia.</p>
      ) : (
        <ul className="space-y-1.5">
          {itens.map((item) => {
            const estilo = estiloDoItem(item)
            return (
              <li key={item.chave}>
                <Link
                  to={`/?caso=${item.casoId}`}
                  className={clsx(
                    'flex items-start gap-3 rounded-xl px-2.5 py-2 transition-colors hover:bg-muted/60',
                    item.feito && 'opacity-60',
                  )}
                >
                  <span className="w-11 flex-shrink-0 pt-0.5 text-sm font-bold text-foreground tabular-nums">
                    {item.hora ?? '—'}
                  </span>
                  <span className={clsx('mt-1 w-1 self-stretch flex-shrink-0 rounded-full', estilo.marca)} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-px text-[11px] font-bold', estilo.pilula)}>
                      {item.feito && <IconeCheck className="size-3" />}
                      {item.titulo}
                      {item.vencido && ' · vencido'}
                    </span>
                    <span className="mt-0.5 block truncate font-semibold text-foreground">{item.nome}</span>
                    <span className="block truncate text-xs text-muted-foreground">{item.detalhe}</span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}

      {podeMarcarFeriado && (
        <ControleDoFeriado
          // A chave refaz o formulário ao trocar de dia: um texto começado
          // num dia não pode ir parar no feriado de outro.
          key={dia}
          dia={dia}
          feriado={feriado}
        />
      )}
    </section>
  )
}

function ControleDoFeriado({ dia, feriado }: { dia: string; feriado: Feriado | undefined }) {
  const marcar = useMarcarFeriado()
  const tirar = useTirarFeriado()
  const [aberto, setAberto] = useState(false)
  const [descricao, setDescricao] = useState('')
  const erro = marcar.error ?? tirar.error

  return (
    <div className="mt-4 border-t border-border pt-3">
      {feriado ? (
        <Botao variante="fantasma" onClick={() => tirar.mutate(dia)} disabled={tirar.isPending}>
          {tirar.isPending ? 'Tirando…' : 'Este dia não é feriado'}
        </Botao>
      ) : aberto ? (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (descricao.trim() === '') return
            marcar.mutate({ data: dia, descricao }, { onSuccess: () => setAberto(false) })
          }}
        >
          <label htmlFor="feriado-descricao" className="sr-only">
            Nome do feriado
          </label>
          <input
            id="feriado-descricao"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Ex.: Finados"
            autoFocus
            className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-sm"
          />
          <Botao type="submit" variante="primario" disabled={marcar.isPending || descricao.trim() === ''}>
            {marcar.isPending ? 'Marcando…' : 'Marcar'}
          </Botao>
          <Botao type="button" variante="fantasma" onClick={() => setAberto(false)}>
            Cancelar
          </Botao>
        </form>
      ) : (
        <Botao variante="fantasma" onClick={() => setAberto(true)}>
          Marcar como feriado
        </Botao>
      )}
      <p className="mt-1.5 text-xs text-muted-foreground">
        Feriado não conta como dia útil: o prazo dos pacotes MASTER pula este dia.
      </p>
      {erro && <p className="mt-1 text-xs font-semibold text-atrasado">{erro.message}</p>}
    </div>
  )
}
