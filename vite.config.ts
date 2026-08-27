import { fileURLToPath, URL } from 'node:url'
import { mkdirSync, writeFileSync } from 'node:fs'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// O app vive sob /quadro/ para deixar a raiz livre para uma landing futura.
// Tres coisas precisam concordar, e estao comentadas uma na outra:
//   - `base`, para o HTML apontar os assets para /quadro/assets/...
//   - `outDir`, para o build sair ja dentro de dist/quadro/
//   - o `basename` do React Router, em src/app/router.tsx
const BASE = '/quadro/'

/**
 * Escreve dist/_redirects depois do build.
 *
 * Precisa ficar na RAIZ do diretorio publicado, e o outDir e dist/quadro -- ou
 * seja, fora do alcance de public/, que o Vite copia para dentro do outDir.
 * Dai o plugin em vez de um arquivo estatico.
 *
 * A regra existe porque /quadro/fila nao e um arquivo: sem ela o Pages devolve
 * 404 em qualquer rota que nao seja a inicial, inclusive num F5. So /quadro/*
 * e reescrito -- a raiz fica de fora de proposito, para a landing poder ocupa-la
 * depois sem esbarrar nesta regra.
 */
function redirectsDoPages() {
  return {
    name: 'clickbaby:redirects-do-pages',
    apply: 'build' as const,
    closeBundle() {
      mkdirSync('dist', { recursive: true })
      writeFileSync('dist/_redirects', '/quadro/* /quadro/index.html 200\n')
    },
  }
}

/**
 * Recusa buildar producao apontando para o Supabase local.
 *
 * O modo de falha ja aconteceu: `npm run dev:local` escrevia `.env.local`, o
 * Vite carrega esse arquivo em TODO modo (build de producao incluido) e ele
 * vence o `.env`. Resultado: bundle de producao falando com
 * http://127.0.0.1:54321, endereco que nao existe no navegador de quem acessa
 * o site. Build verde, lint verde, app quebrado -- e so se descobre publicando.
 *
 * A causa foi corrigida em scripts/dev-local.mjs, que hoje escreve
 * `.env.development.local` (restrito ao modo de desenvolvimento). Isto e a
 * rede: pega um `.env.local` esquecido na maquina de alguem, ou a proxima
 * variante do mesmo erro.
 *
 * Checa o VALOR da variavel, nao o texto do bundle: o bundle contem
 * "127.0.0.1" legitimamente, tanto de dependencia quanto do nosso proprio
 * src/lib/supabase.ts, que compara a URL para desenhar o selo LOCAL/REMOTO.
 */
function exigirSupabaseRemoto(url: string | undefined) {
  if (!url) {
    throw new Error(
      'VITE_SUPABASE_URL nao definida. O build de producao precisa dela no .env.',
    )
  }
  if (url.includes('127.0.0.1') || url.includes('localhost')) {
    throw new Error(`Build de producao apontando para o Supabase LOCAL (${url}).

Algum .env.local ou .env.production.local esta vencendo o .env.
Apague-o e rode de novo. Ver scripts/dev-local.mjs.`)
  }
}

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  if (command === 'build') exigirSupabaseRemoto(env.VITE_SUPABASE_URL)

  return {
    base: BASE,
    build: {
      outDir: 'dist/quadro',
      emptyOutDir: true,
    },
    plugins: [react(), tailwindcss(), redirectsDoPages()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
  }
})
