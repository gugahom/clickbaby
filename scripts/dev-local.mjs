/**
 * Sobe o Vite apontando para o Supabase LOCAL.
 *
 * A seção 11 do CLAUDE.md diz que as chaves do Supabase local nunca vão para
 * `.env` (que aponta para o remoto) nem para o git. Então elas não são
 * digitadas em lugar nenhum: este script lê do próprio CLI (`supabase status`)
 * e escreve `.env.local`, que já está no .gitignore e tem precedência sobre o
 * `.env` no Vite.
 *
 * Consequência prática: trocar entre local e remoto é trocar de comando
 * (`npm run dev:local` vs `npm run dev`), não editar arquivo.
 */

import { execFileSync, spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
let saida
try {
  // shell: true por causa do Windows: desde o Node 20, execFile recusa rodar
  // .cmd/.bat diretamente (EINVAL). Não há entrada de usuário aqui.
  saida = execFileSync('npx', ['supabase', 'status', '-o', 'env'], {
    encoding: 'utf8',
    cwd: raiz,
    shell: true,
  })
} catch {
  console.error('Não consegui falar com o Supabase local. Rode `npx supabase start`.')
  process.exit(1)
}

const env = {}
for (const linha of saida.split('\n')) {
  const m = linha.match(/^([A-Z_]+)="?(.*?)"?$/)
  if (m) env[m[1]] = m[2]
}

if (!env.API_URL || !env.ANON_KEY) {
  console.error('`supabase status` não devolveu API_URL/ANON_KEY.')
  process.exit(1)
}

writeFileSync(
  join(raiz, '.env.local'),
  [
    '# GERADO por scripts/dev-local.mjs a partir de `supabase status`.',
    '# Ignorado pelo git. Não edite à mão, não commite, não copie para .env.',
    `VITE_SUPABASE_URL=${env.API_URL}`,
    `VITE_SUPABASE_ANON_KEY=${env.ANON_KEY}`,
    '',
  ].join('\n'),
)

console.log(`.env.local apontando para ${env.API_URL}\n`)

spawn('npm', ['run', 'dev'], {
  cwd: raiz,
  stdio: 'inherit',
  shell: true,
}).on('exit', (codigo) => process.exit(codigo ?? 0))
