import { Link, Navigate, useParams } from 'react-router'
import { IconeCheck, IconeSetaDireita } from '@/components/ui/icones'
import { useTelas } from '@/features/auth/telas'
import { PAGINAS_DO_CRM } from '../crm/navegacao'

/**
 * UMA PÁGINA QUE AINDA NÃO CHEGOU. Não é tela vazia: diz o que ela vai ser, em
 * que fase entra, e — quando esse trabalho já tem outro lugar no sistema — leva
 * até lá, para ninguém perder o caminho no meio da mudança.
 *
 * O desenho embaixo é uma PRÉVIA apagada do formato (linhas de lista), não um
 * protótipo: promete a forma, não os detalhes.
 */
export function EmBreveDoCrm() {
  const { pagina: id } = useParams()
  const telas = useTelas()
  const pagina = PAGINAS_DO_CRM.find((p) => p.id === id && p.emBreve)
  if (!pagina?.emBreve) return <Navigate to="/comercial" replace />

  const { Icone, emBreve } = pagina
  const hoje = emBreve.hoje && telas.has(emBreve.hoje.tela) ? emBreve.hoje : null

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 md:px-8 md:py-14">
      <article className="relative overflow-hidden rounded-painel border border-border bg-card shadow-cartao">
        <div className="p-6 md:p-10">
          <div className="flex items-center gap-3">
            <span className="grid size-12 place-items-center rounded-2xl bg-marca-suave text-marca">
              <Icone className="size-6" />
            </span>
            <span className="rounded-full bg-acento-suave px-2.5 py-1 text-xs font-bold text-acento-forte">
              Em breve · {emBreve.fase}
            </span>
          </div>

          <h1 className="mt-6 text-2xl font-extrabold tracking-tight md:text-3xl">{pagina.rotulo}</h1>
          <p className="mt-2 max-w-xl text-[15px] text-muted-foreground">{emBreve.resumo}</p>

          <ul className="mt-7 space-y-3">
            {emBreve.itens.map((item) => (
              <li key={item} className="flex items-start gap-3 text-sm">
                <span className="mt-px grid size-5 flex-shrink-0 place-items-center rounded-full bg-concluido/12 text-concluido-tinta">
                  <IconeCheck className="size-3" />
                </span>
                {item}
              </li>
            ))}
          </ul>

          {hoje && (
            <div className="mt-8 flex flex-wrap items-center gap-3 rounded-cartao bg-muted/60 px-4 py-3">
              <p className="min-w-0 flex-1 text-sm text-muted-foreground">Enquanto isso, esse trabalho continua no lugar de sempre.</p>
              <Link
                to={hoje.para}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-marca px-4 text-sm font-bold text-white hover:bg-marca-forte"
              >
                {hoje.rotulo} <IconeSetaDireita className="size-4" />
              </Link>
            </div>
          )}
        </div>

        {/* A prévia: o formato de lista que a página vai ter, apagado. */}
        <div aria-hidden="true" className="border-t border-border bg-muted/30 px-6 py-5 md:px-10">
          <div className="space-y-3 opacity-60 [mask-image:linear-gradient(to_bottom,black,transparent)]">
            {[70, 52, 61].map((largura) => (
              <div key={largura} className="flex items-center gap-3">
                <span className="size-9 flex-shrink-0 rounded-full bg-muted" />
                <span className="flex-1 space-y-1.5">
                  <span className="block h-3 rounded bg-muted" style={{ width: `${largura}%` }} />
                  <span className="block h-2.5 w-1/3 rounded bg-muted" />
                </span>
                <span className="h-6 w-16 rounded-full bg-muted" />
              </div>
            ))}
          </div>
        </div>
      </article>
    </div>
  )
}
