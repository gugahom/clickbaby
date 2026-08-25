/**
 * Audita os buckets do Storage do banco REMOTO.
 *
 * POR QUE NÃO BASTA O pgTAP
 * Mesma assimetria da auditoria de privilégios: o teste local prova que a
 * migration deixa os buckets privados, mas é cego para o que alguém fez pelo
 * painel web depois. E tornar um bucket público é exatamente isso — um clique,
 * sem diff, sem migration, sem rastro. O efeito é a galeria de parto de uma
 * família ficar acessível por URL adivinhável (seção 10 do CLAUDE.md: dado
 * sensível de saúde e de menor).
 *
 * O QUE ELE VERIFICA
 *   1. Nenhum bucket é público — no remoto, agora.
 *   2. Os buckets que a migration versiona existem lá.
 *   3. A rota de URL pública realmente recusa, com a anon key.
 *
 * Só lê. Nenhuma sonda envia arquivo: a instrução da auditoria foi não alterar
 * nada, e um upload de teste que passasse deixaria lixo em produção que este
 * script não teria permissão para remover.
 *
 * Uso: node scripts/auditar-storage.mjs
 */

import { execFileSync } from 'node:child_process'
import { readFileSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Precisam existir e ser privados. Espelha a migration 20260825062852. */
const BUCKETS_ESPERADOS = ['midias', 'comprovantes']

function dumparBuckets() {
  const destino = join(tmpdir(), `clickbaby-storage-${Date.now()}.sql`)
  try {
    execFileSync(
      'npx',
      ['supabase', 'db', 'dump', '--linked', '--data-only', '--schema', 'storage', '-f', destino],
      { encoding: 'utf8', cwd: raiz, shell: true, stdio: ['ignore', 'pipe', 'pipe'] },
    )
  } catch (erro) {
    console.error(`Falha ao dumpar o schema storage do remoto: ${erro.message}`)
    process.exit(1)
  }
  const conteudo = readFileSync(destino, 'utf8')
  rmSync(destino, { force: true })
  return conteudo
}

/**
 * O dump vem como INSERT multi-linha. Em vez de tentar um parser de SQL, lê
 * cada tupla pela posição das colunas declaradas no próprio INSERT — assim uma
 * coluna nova do Supabase no meio não desalinha a leitura em silêncio.
 */
function lerBuckets(dump) {
  const cabecalho = dump.match(
    /INSERT INTO "storage"\."buckets" \(([^)]+)\) VALUES\s*([\s\S]*?);/,
  )
  if (!cabecalho) return []

  const colunas = cabecalho[1].split(',').map((c) => c.trim().replaceAll('"', ''))
  const iId = colunas.indexOf('id')
  const iPublico = colunas.indexOf('public')

  if (iId === -1 || iPublico === -1) {
    console.error('O dump não trouxe as colunas id/public de storage.buckets.')
    console.error('O formato do Supabase mudou — revise este script antes de confiar nele.')
    process.exit(1)
  }

  return cabecalho[2]
    .split('\n')
    .map((l) => l.trim().replace(/^\(|\),?$|\);$/g, ''))
    .filter((l) => l !== '')
    .map((linha) => {
      const campos = linha.split(',').map((c) => c.trim().replace(/^'|'$/g, ''))
      return { id: campos[iId], publico: campos[iPublico] === 'true' }
    })
}

function alvoRemoto() {
  const env = readFileSync(join(raiz, '.env'), 'utf8')
  const pega = (chave) =>
    env.match(new RegExp(`^${chave}=(.*)$`, 'm'))?.[1]?.trim().replace(/\r$/, '')
  return { url: pega('VITE_SUPABASE_URL'), key: pega('VITE_SUPABASE_ANON_KEY') }
}

const buckets = lerBuckets(dumparBuckets())
const falhas = []

console.log(`Buckets no remoto: ${buckets.length}\n`)
for (const b of buckets) {
  console.log(`  ${b.id.padEnd(16)} ${b.publico ? 'PÚBLICO' : 'privado'}`)
  if (b.publico) {
    falhas.push(
      `bucket "${b.id}" está PÚBLICO — qualquer pessoa com a URL baixa os arquivos`,
    )
  }
}

for (const esperado of BUCKETS_ESPERADOS) {
  if (!buckets.some((b) => b.id === esperado)) {
    falhas.push(
      `bucket "${esperado}" não existe no remoto, mas a migration 20260825062852 o versiona`,
    )
  }
}

// Confirmação de fora: a rota pública tem que recusar mesmo.
const alvo = alvoRemoto()
if (alvo.url && alvo.key) {
  console.log('\nRota de URL pública, com a anon key:')
  for (const b of buckets) {
    const r = await fetch(`${alvo.url}/storage/v1/object/public/${b.id}/sonda.jpg`, {
      headers: { apikey: alvo.key },
    })
    // 400/404 = bucket privado ou arquivo inexistente; 200 seria conteúdo servido
    // sem assinatura, que é o que não pode acontecer.
    const ok = r.status !== 200
    console.log(`  ${b.id.padEnd(16)} HTTP ${r.status} ${ok ? '' : '  <-- SERVIU SEM ASSINATURA'}`)
    if (!ok) falhas.push(`bucket "${b.id}" serve arquivo por URL pública, sem signed URL`)
  }
}

if (falhas.length === 0) {
  console.log('\nOK — nenhum bucket público, nenhuma rota pública servindo conteúdo.')
  process.exit(0)
}

console.error('\nPROBLEMAS DE STORAGE:\n')
for (const f of falhas) console.error(`  ! ${f}`)
console.error(
  '\nA seção 10 do CLAUDE.md exige buckets privados, com acesso só por signed URL de curta duração.',
)
process.exit(1)
