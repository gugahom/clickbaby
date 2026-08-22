import { Outlet } from 'react-router'
import { ehAmbienteLocal } from '@/lib/supabase'
import { useAuth } from '@/features/auth/contexto'

export function AppShell() {
  const { pessoa, sair } = useAuth()

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-background px-3 py-1.5 text-xs md:px-4">
        <div className="flex items-center gap-2">
          <span className="font-semibold tracking-wide">CLICKBABY</span>
          {/* Indicador de ambiente: evita demonstrar contra o remoto por engano. */}
          <span
            className={
              ehAmbienteLocal
                ? 'rounded bg-andamento/20 px-1.5 py-0.5 font-mono text-andamento'
                : 'rounded bg-atrasado/20 px-1.5 py-0.5 font-mono text-atrasado'
            }
          >
            {ehAmbienteLocal ? 'LOCAL' : 'REMOTO'}
          </span>
        </div>

        <div className="flex items-center gap-3 text-muted-foreground">
          {pessoa && (
            <span className="truncate">
              {pessoa.nome} · {pessoa.papelSistema}
            </span>
          )}
          <button
            type="button"
            onClick={() => void sair()}
            className="underline underline-offset-2 hover:text-foreground"
          >
            sair
          </button>
        </div>
      </div>

      <main className="min-h-0 flex-1">
        <Outlet />
      </main>
    </div>
  )
}
