import { BotaoCopiar } from '@/components/ui/BotaoCopiar'
import { useAuth } from '@/features/auth/contexto'
import { podeEncerrarCaso } from '@/features/quadro/lib/acoes'
import { formatarMoeda } from '@/lib/formato'
import { useVendaDoCaso } from '../api/useVendaDoCaso'
import { rotuloDaLinha } from '../lib/vendas'

/**
 * O VALOR VENDIDO E O CONTRATO, PARA LER (14/10/2026, pedido do gestor: "quando
 * o administrativo clica para confirmar a entrega, ele já teria aqui o valor
 * para realizar a cobrança" — e o contrato "para ele consultar").
 *
 * Aparece no detalhe do parto no Calendário e na confirmação da entrega. Para
 * quem não pode ver (a fotógrafa), NÃO APARECE: a RLS já devolveria vazio, e um
 * bloco "nada lançado" mentiria para ela sobre o caso.
 */
export function VendaDoCaso({ casoId, ondeLancar }: { casoId: string; ondeLancar?: string }) {
  const { pessoa } = useAuth()
  const pode = podeEncerrarCaso(pessoa?.papelSistema ?? 'operador')
  const { data, error, isPending } = useVendaDoCaso(casoId, pode)
  if (!pode) return null

  return (
    <section className="rounded-md border border-border px-3 py-2.5" aria-label="Venda do caso">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold">
          Venda <span className="font-normal text-muted-foreground">· interno</span>
        </span>
        {data && data.linhas.length > 0 && (
          <span className="text-sm font-extrabold tabular-nums">{formatarMoeda(data.total)}</span>
        )}
      </div>

      {isPending && <p className="mt-1 text-xs text-muted-foreground">Carregando…</p>}
      {error && <p className="mt-1 text-xs font-semibold text-atrasado">Não deu para carregar a venda: {error.message}</p>}

      {data && (
        <>
          {data.linhas.length > 0 ? (
            <ul className="mt-1.5 space-y-0.5 text-sm">
              {data.linhas.map((l) => (
                <li key={l.id} className="flex justify-between gap-3">
                  <span className="min-w-0 truncate text-muted-foreground">{rotuloDaLinha(l)}</span>
                  <span className="flex-shrink-0 tabular-nums">{formatarMoeda(l.valor)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">
              Nenhum valor lançado{ondeLancar ? ` — ${ondeLancar}` : ''}.
            </p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-border pt-2 text-sm">
            {data.contrato ? (
              <>
                <a
                  href={data.contrato}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-marca hover:underline"
                >
                  Abrir o contrato ↗
                </a>
                <BotaoCopiar texto={data.contrato} />
              </>
            ) : (
              <span className="text-xs text-muted-foreground">Sem link do contrato.</span>
            )}
          </div>
        </>
      )}
    </section>
  )
}
