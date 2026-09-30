/**
 * CONFERE A CÓPIA DO BANCO antes de ela ser guardada (backup noturno, ver
 * docs/backup.md e .github/workflows/backup-noturno.yml).
 *
 * Um backup que ninguém confere é só esperança: o `db dump` pode terminar
 * "com sucesso" e escrever um arquivo vazio (senha trocada, pooler fora do ar,
 * permissão que mudou). Aqui a cópia só passa se:
 *   * os três arquivos existem e não estão vazios (papéis, estrutura, dados);
 *   * os dados trazem as tabelas que não podem faltar — o caso, as etapas, o
 *     histórico, as pessoas e as CONTAS DE LOGIN (sem `auth.users` uma
 *     restauração voltaria sem ninguém conseguir entrar);
 *   * casos, etapas, eventos, pessoas e contas têm ao menos uma linha.
 *
 * SÓ IMPRIME CONTAGENS. O arquivo tem nome de mãe e bebê, situação clínica e
 * links de entrega (seção 10 do CLAUDE.md), e o log do GitHub não é lugar para
 * nada disso — nem uma linha de amostra.
 *
 * Uso: node scripts/conferir-backup.mjs <pasta-da-copia>
 */
import { createReadStream, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'

const pasta = process.argv[2]
if (!pasta) {
  console.error('Uso: node scripts/conferir-backup.mjs <pasta-da-copia>')
  process.exit(2)
}

const ARQUIVOS = ['roles.sql', 'schema.sql', 'data.sql']
const OBRIGATORIAS = [
  'public.casos',
  'public.caso_etapas',
  'public.eventos',
  'public.pessoas',
  'auth.users',
  'auth.identities',
  'public.entregaveis',
  'public.despesas',
  'public.handoffs',
]
const NAO_PODEM_ESTAR_VAZIAS = ['public.casos', 'public.caso_etapas', 'public.eventos', 'public.pessoas', 'auth.users']

const falhas = []

for (const nome of ARQUIVOS) {
  const caminho = join(pasta, nome)
  if (!existsSync(caminho)) falhas.push(`${nome} não existe`)
  else if (statSync(caminho).size === 0 && nome !== 'roles.sql') falhas.push(`${nome} está vazio`)
}

const linhas = new Map()
if (existsSync(join(pasta, 'data.sql'))) {
  let atual = null
  const leitor = createInterface({ input: createReadStream(join(pasta, 'data.sql'), 'utf8'), crlfDelay: Infinity })
  for await (const linha of leitor) {
    if (atual === null) {
      const m = linha.match(/^COPY "([a-z_]+)"\."([a-z_]+)"/)
      if (m) {
        atual = `${m[1]}.${m[2]}`
        linhas.set(atual, 0)
      }
    } else if (linha === '\\.') {
      atual = null
    } else {
      linhas.set(atual, linhas.get(atual) + 1)
    }
  }
}

for (const t of OBRIGATORIAS) if (!linhas.has(t)) falhas.push(`a tabela ${t} não está na cópia`)
for (const t of NAO_PODEM_ESTAR_VAZIAS) if (linhas.get(t) === 0) falhas.push(`a tabela ${t} veio vazia`)

const tamanho = (nome) => {
  const c = join(pasta, nome)
  return existsSync(c) ? `${(statSync(c).size / 1024 / 1024).toFixed(1)} MB` : '—'
}
console.log(`Cópia: estrutura ${tamanho('schema.sql')}, dados ${tamanho('data.sql')}, ${linhas.size} tabelas.`)
for (const t of OBRIGATORIAS) console.log(`  ${t.padEnd(22)} ${String(linhas.get(t) ?? '—').padStart(8)} linhas`)

if (falhas.length > 0) {
  console.error(`\nCÓPIA RECUSADA:\n  - ${falhas.join('\n  - ')}`)
  process.exit(1)
}
console.log('\nOK — a cópia tem tudo o que precisa ter.')
