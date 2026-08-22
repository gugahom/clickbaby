/**
 * Audita os privilégios do schema `public` contra uma política versionada.
 *
 * POR QUE ISTO EXISTE
 * O pgTAP roda contra o LOCAL. Ele cobre bem a direção "revoguei demais" — se
 * um SELECT necessário sumir, o teste quebra. Mas é cego para a direção que
 * realmente machuca: "o REMOTO tem mais privilégio do que eu pedi". Foi assim
 * que `anon` ficou com EXECUTE em sync_upsert_caso em produção enquanto todos
 * os testes locais passavam (ver migration 20260822041132).
 *
 * COMO FUNCIONA
 * Roda `supabase db dump` (leitura pura), extrai as linhas de GRANT / REVOKE /
 * ALTER DEFAULT PRIVILEGES que envolvem os papéis NÃO confiáveis, normaliza, e
 * compara com supabase/seguranca/privilegios-esperados.txt. Qualquer desvio
 * vira diff e exit 1.
 *
 * O arquivo esperado É a política: texto revisável em PR, não uma regra
 * escondida em código.
 *
 * POR QUE service_role E postgres FICAM DE FORA DO SNAPSHOT
 * São os papéis confiáveis. service_role é o backend (Edge Function do sync) e
 * no remoto herda ALL dos default privileges do Supabase, que não mexemos de
 * propósito — incluí-lo produziria divergência local/remoto permanente e ruído
 * a cada auditoria. O que o sync PRECISA de service_role é afirmado pelo pgTAP
 * (supabase/tests/database/privilegios_minimos.test.sql), que é o lugar certo:
 * lá a pergunta é "ainda funciona?", aqui é "alguém ganhou acesso indevido?".
 *
 * USO
 *   node scripts/auditar-privilegios.mjs            # remoto (padrão)
 *   node scripts/auditar-privilegios.mjs --local
 *   node scripts/auditar-privilegios.mjs --atualizar # regrava o esperado
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const ESPERADO = join(raiz, 'supabase', 'seguranca', 'privilegios-esperados.txt')

const args = process.argv.slice(2)
const local = args.includes('--local')
const atualizar = args.includes('--atualizar')
const alvo = local ? 'local' : 'remoto'

/** Papéis não confiáveis: é o acesso deles que esta auditoria governa. */
const PAPEIS_AUDITADOS = ['anon', 'authenticated']

function dumpar() {
  const destino = join(tmpdir(), `clickbaby-dump-${alvo}-${Date.now()}.sql`)
  try {
    execFileSync(
      'npx',
      ['supabase', 'db', 'dump', local ? '--local' : '--linked', '-f', destino],
      { encoding: 'utf8', cwd: raiz, shell: true, stdio: ['ignore', 'pipe', 'pipe'] },
    )
  } catch (erro) {
    console.error(`Falha ao dumpar o schema (${alvo}): ${erro.message}`)
    process.exit(1)
  }
  const conteudo = readFileSync(destino, 'utf8')
  rmSync(destino, { force: true })
  return conteudo
}

/**
 * Uma linha entra no snapshot se afeta anon/authenticated, ou se revoga de
 * PUBLIC. O REVOKE ... FROM PUBLIC importa porque funções nascem com EXECUTE
 * para PUBLIC, e anon/authenticated herdam dele: a ausência dessa linha é
 * exatamente o buraco que passou despercebido antes.
 */
function ehRelevante(linha) {
  if (/^REVOKE .* FROM PUBLIC;$/.test(linha)) return true
  const paraPapel = new RegExp(`TO (${PAPEIS_AUDITADOS.join('|')});$`)
  const revogaPapel = new RegExp(`FROM (${PAPEIS_AUDITADOS.join('|')});$`)
  return paraPapel.test(linha) || revogaPapel.test(linha)
}

function extrair(dump) {
  return [
    ...new Set(
      dump
        .split('\n')
        .map((l) => l.replaceAll('"', '').replace(/\s+/g, ' ').trim())
        .filter((l) => /^(GRANT|REVOKE|ALTER DEFAULT PRIVILEGES)\b/.test(l))
        .filter(ehRelevante),
    ),
  ].sort()
}

const atual = extrair(dumpar())

if (atualizar) {
  mkdirSync(dirname(ESPERADO), { recursive: true })
  writeFileSync(
    ESPERADO,
    [
      '# Política de privilégios do schema public — anon e authenticated.',
      '#',
      '# Gerado por `node scripts/auditar-privilegios.mjs --atualizar`, mas NÃO é',
      '# um artefato descartável: é a política em si. Uma linha nova aqui num diff',
      '# de PR significa que alguém ganhou acesso — revise como revisaria código.',
      '#',
      '# service_role e postgres ficam de fora de propósito (papéis confiáveis).',
      '# Ver o cabeçalho de scripts/auditar-privilegios.mjs.',
      '',
      ...atual,
      '',
    ].join('\n'),
  )
  console.log(`privilegios-esperados.txt regravado a partir do ${alvo} (${atual.length} linhas).`)
  process.exit(0)
}

let esperado
try {
  esperado = readFileSync(ESPERADO, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '' && !l.startsWith('#'))
    .sort()
} catch {
  console.error(`Não achei ${ESPERADO}.`)
  console.error('Gere com: node scripts/auditar-privilegios.mjs --local --atualizar')
  process.exit(1)
}

const sobrando = atual.filter((l) => !esperado.includes(l))
const faltando = esperado.filter((l) => !atual.includes(l))

if (sobrando.length === 0 && faltando.length === 0) {
  console.log(`OK — ${alvo}: ${atual.length} privilégios conferem com a política.`)
  process.exit(0)
}

console.error(`DESVIO de privilégios no ${alvo}:\n`)

if (sobrando.length > 0) {
  // Este é o lado perigoso: acesso que existe no banco e ninguém aprovou.
  console.error('  A MAIS no banco (acesso não aprovado):')
  for (const l of sobrando) console.error(`  + ${l}`)
  console.error('')
}

if (faltando.length > 0) {
  // Este lado costuma ser app quebrado, não brecha.
  console.error('  A MENOS no banco (a política pede, o banco não tem):')
  for (const l of faltando) console.error(`  - ${l}`)
  console.error('')
}

console.error('Se a mudança for intencional, revise e rode com --atualizar.')
process.exit(1)
