import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // supabase/functions é Deno, não navegador: tem o próprio deno.json e é
  // checado por `deno lint`/`deno test`. Rodar as regras do front ali só
  // produzia ruído (globals errados, `any` que vem da API do Calendar).
  // .claude/worktrees: checkouts completos de agente, cada um com seu
  // próprio node_modules/dist — nunca é código deste projeto para lint.
  // referencia_v0 e supabase/.temp: material de referência e runtime local
  // do Docker (bundle minificado) — mesma razão, nunca código nosso. Todos
  // já estão no .gitignore; o ESLint (flat config) não lê .gitignore
  // sozinho, por isso repetidos aqui.
  globalIgnores([
    'dist',
    'supabase/functions',
    'supabase/.temp',
    '.claude/worktrees',
    'referencia_v0',
  ]),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
])
