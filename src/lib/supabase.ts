import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error(
    'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY ausentes. ' +
      'Para rodar contra o banco local use `npm run dev:local` — ele lê as ' +
      'chaves do `supabase status` e escreve um .env.local (ignorado pelo git).',
  )
}

export const supabase = createClient<Database>(url, anonKey)

/** Só para o indicador de ambiente no cabeçalho — evita demo contra o remoto por engano. */
export const ehAmbienteLocal =
  url.includes('127.0.0.1') || url.includes('localhost')
