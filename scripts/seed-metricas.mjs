/**
 * Põe trabalho FICTÍCIO no banco LOCAL, de outubro de 2026 a dezembro de 2027,
 * para ver o relatório de pessoas com dado dentro (28/09/2026, pedido do
 * gestor: "no local coloque dados fictícios pra ver layout"; estendido em 29/09
 * para as comparações entre meses e anos terem o que comparar).
 *
 * SÓ LOCAL, por construção: o SQL vai direto para o Postgres do container do
 * Docker, e esse container só existe na máquina de quem roda. Não há flag que
 * aponte para o remoto — e não deve haver: o arquivo escreve carimbos à mão,
 * passando por cima de toda RPC.
 *
 * O que ele cria e por quê está no cabeçalho de seed-metricas-ficticias.sql.
 * Precisa da conta de gestão de dev (`npm run seed:auth`).
 */

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const sql = readFileSync(join(raiz, 'scripts', 'seed-metricas-ficticias.sql'), 'utf8')

const r = spawnSync(
  'docker',
  ['exec', '-i', 'supabase_db_ClickBaby', 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
  { input: sql, encoding: 'utf8' },
)

process.stdout.write(r.stdout ?? '')
process.stderr.write(r.stderr ?? '')

if (r.status !== 0) {
  console.error('\nNão deu. O Supabase local está de pé? (`npx supabase start`)')
  process.exit(r.status ?? 1)
}

// Os meses estão no futuro, e o gráfico só desenha o que já passou: a data
// simulada (só em desenvolvimento) é o que faz a tela mostrar tudo.
console.log('\nAbra o relatório com a data simulada, por exemplo:')
console.log('  http://localhost:5173/quadro/relatorios?hoje=2027-12-31')
