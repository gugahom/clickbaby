/**
 * Sobe o Vite apontando para o Supabase LOCAL.
 *
 * A seção 11 do CLAUDE.md diz que as chaves do Supabase local nunca vão para
 * `.env` (que aponta para o remoto) nem para o git. Então elas não são
 * digitadas em lugar nenhum: este script lê do próprio CLI (`supabase status`)
 * e escreve um arquivo de ambiente que o .gitignore já cobre.
 *
 * Consequência prática: trocar entre local e remoto é trocar de comando
 * (`npm run dev:local` vs `npm run dev`), não editar arquivo.
 *
 * POR QUE `.env.development.local` E NÃO `.env.local`
 * O Vite carrega `.env.local` em TODO modo, build de produção incluído, e ele
 * vence o `.env`. Com o nome antigo, rodar este script uma vez e depois
 * `npm run build` gerava um bundle de produção apontando para
 * http://127.0.0.1:54321 — endereço que não existe no navegador de quem
 * acessa o site publicado. Sem erro de build, sem aviso: o app subia quebrado.
 *
 * O sufixo `.development` prende o arquivo ao modo de desenvolvimento, então o
 * build de produção volta a enxergar o `.env`. A rede de segurança está em
 * vite.config.ts, que falha o build se o bundle mencionar endereço local.
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
  join(raiz, '.env.development.local'),
  [
    '# GERADO por scripts/dev-local.mjs a partir de `supabase status`.',
    '# Ignorado pelo git. Não edite à mão, não commite, não copie para .env.',
    `VITE_SUPABASE_URL=${env.API_URL}`,
    `VITE_SUPABASE_ANON_KEY=${env.ANON_KEY}`,
    '',
  ].join('\n'),
)

console.log(`.env.development.local apontando para ${env.API_URL}\n`)

spawn('npm', ['run', 'dev'], {
  cwd: raiz,
  stdio: 'inherit',
  shell: true,
}).on('exit', (codigo) => process.exit(codigo ?? 0))
