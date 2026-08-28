/**
 * Sonda de caixa-preta: confirma que `anon` não alcança NADA pela API pública.
 *
 * COMPLEMENTA, NÃO SUBSTITUI, o auditar-privilegios.mjs. Aquele lê o catálogo
 * ("o que o banco concede"); este exercita a superfície realmente alcançável
 * ("o que dá pra fazer com a chave que vai no bundle do navegador"). Um erro de
 * configuração no PostgREST, por exemplo, apareceria aqui e não lá.
 *
 * A anon key é pública por design — vai no JavaScript do cliente. Usá-la aqui
 * não expõe nada que já não esteja exposto.
 *
 * POR QUE NENHUMA SONDA ESCREVE
 *   - SELECT: inofensivo por natureza.
 *   - UPDATE/DELETE: sempre com filtro `id=eq.<uuid zero>`, que não casa
 *     nenhuma linha. Mesmo que a permissão estivesse aberta, nada mudaria.
 *   - RPC: só sync_upsert_caso é chamada, e com p_cancelado=true e um
 *     google_calendar_event_id inexistente — caminho que a função encerra em
 *     'sem_efeito' ANTES de qualquer escrita. As RPCs de transição recebem um
 *     uuid inexistente e falham na validação.
 *   - INSERT: NÃO é sondado, de propósito. É o único verbo que não dá para
 *     tornar no-op, e um falso negativo escreveria lixo em produção. Os grants
 *     de INSERT são cobertos pelo snapshot do auditar-privilegios.mjs.
 *
 * LIMITAÇÃO CONHECIDA
 * Só cobre `anon`. Sondar `authenticated` exigiria uma sessão real no alvo.
 * O remoto já tem contas desde 26/08/2026 (Jeferson, Sarah, André), mas são
 * de gente de verdade: logar como elas para sondar deixaria eventos de acesso
 * no nome de alguém que não fez nada. Falta uma conta de teste dedicada e
 * inativa; até lá, esse lado fica com o snapshot do auditar-privilegios.mjs.
 *
 * USO
 *   node scripts/sondar-anon.mjs           # alvo do .env (remoto)
 *   node scripts/sondar-anon.mjs --local
 */

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const local = process.argv.includes('--local')

// `view: true` afrouxa APENAS as sondas de escrita, e só porque o Postgres
// rejeita DML numa view com join/agregação (55000) ANTES de chegar na checagem
// de permissão. É uma negação estrutural, independente do GRANT — mas exigir
// 42501 ali produziria alarme falso eterno. O SELECT na view continua exigindo
// 42501, que é onde o privilégio de fato aparece.
const TABELAS = [
  { nome: 'casos' },
  { nome: 'caso_etapas' },
  { nome: 'pessoas' },
  { nome: 'maternidades' },
  { nome: 'pacotes' },
  { nome: 'pacote_etapas' },
  { nome: 'handoffs' },
  { nome: 'entregaveis' },
  { nome: 'escalas' },
  { nome: 'padroes_tempo' },
  { nome: 'eventos' },
  { nome: 'quadro_casos', view: true },
]

const RPCS_TRANSICAO = {
  iniciar_etapa: { p_caso_etapa_id: '00000000-0000-0000-0000-000000000000' },
  concluir_etapa: { p_caso_etapa_id: '00000000-0000-0000-0000-000000000000' },
  confirmar_entrega: { p_caso_id: '00000000-0000-0000-0000-000000000000' },
  cancelar_caso: { p_caso_id: '00000000-0000-0000-0000-000000000000', p_motivo: 'sonda' },
  transferir_etapa: {
    p_caso_etapa_id: '00000000-0000-0000-0000-000000000000',
    p_para_pessoa_id: '00000000-0000-0000-0000-000000000000',
    p_motivo: 'sonda',
  },
  // Desfaz um encerramento e cria trabalho novo num caso entregue. Entra na
  // lista pelo mesmo motivo de cancelar_caso: é restrita por papel, e papel
  // só vale se o GRANT não deixar anon chegar antes.
  reabrir_caso: {
    p_caso_id: '00000000-0000-0000-0000-000000000000',
    p_motivo: 'sonda',
    p_etapas: ['edicao_foto'],
  },
  agendar_etapa: {
    p_caso_etapa_id: '00000000-0000-0000-0000-000000000000',
    p_previsao_em: null,
  },
}

/** Caminho que a função encerra em 'sem_efeito' antes de tocar qualquer linha. */
const RPC_SYNC = {
  p_google_event_id: 'sonda-seguranca-evento-inexistente',
  p_mae_nome: 'SONDA',
  p_bebe_nome: null,
  p_pacote_id: null,
  p_maternidade_id: null,
  p_previsao_em: null,
  p_cor_calendar: null,
  p_cancelado: true,
}

const NADA = '00000000-0000-0000-0000-000000000000'

function alvoLocal() {
  const saida = execFileSync('npx', ['supabase', 'status', '-o', 'env'], {
    encoding: 'utf8',
    cwd: raiz,
    shell: true,
  })
  const env = {}
  for (const linha of saida.split('\n')) {
    const m = linha.match(/^([A-Z_]+)="?(.*?)"?$/)
    if (m) env[m[1]] = m[2]
  }
  return { url: env.API_URL, key: env.ANON_KEY }
}

function alvoRemoto() {
  // `.env` fica na raiz do repositório, ao lado de package.json. O caminho
  // subia três níveis porque este script nasceu dentro de um git worktree
  // (.claude/worktrees/<nome>/scripts); fora dele, aquilo apontava para o
  // diretório do usuário.
  const env = readFileSync(join(raiz, '.env'), 'utf8')
  const pega = (chave) =>
    env.match(new RegExp(`^${chave}=(.*)$`, 'm'))?.[1]?.trim().replace(/\r$/, '')
  return { url: pega('VITE_SUPABASE_URL'), key: pega('VITE_SUPABASE_ANON_KEY') }
}

let alvo
try {
  alvo = local ? alvoLocal() : alvoRemoto()
} catch (erro) {
  console.error(`Não consegui resolver o alvo: ${erro.message}`)
  process.exit(1)
}

if (!alvo.url || !alvo.key) {
  console.error('URL ou anon key ausentes.')
  process.exit(1)
}

const cabecalhos = {
  apikey: alvo.key,
  Authorization: `Bearer ${alvo.key}`,
  'Content-Type': 'application/json',
}

const falhas = []
let passaram = 0

/**
 * Espera que a resposta seja negada por PERMISSÃO (42501).
 * `aceitaNaoAtualizavel` admite também 55000 — ver a nota em TABELAS.
 */
async function esperaNegado(descricao, url, opcoes, aceitaNaoAtualizavel = false) {
  const r = await fetch(url, { ...opcoes, headers: cabecalhos })
  const texto = await r.text()
  const negado =
    texto.includes('42501') ||
    texto.includes('permission denied') ||
    (aceitaNaoAtualizavel && texto.includes('55000'))

  if (negado) {
    passaram++
    return
  }
  falhas.push(`${descricao}\n      HTTP ${r.status}: ${texto.slice(0, 160)}`)
}

console.log(`Sondando ${alvo.url} como anon…\n`)

for (const { nome, view } of TABELAS) {
  await esperaNegado(
    `SELECT em ${nome}`,
    `${alvo.url}/rest/v1/${nome}?select=*&limit=1`,
    { method: 'GET' },
  )
  await esperaNegado(
    `UPDATE em ${nome}`,
    `${alvo.url}/rest/v1/${nome}?id=eq.${NADA}`,
    { method: 'PATCH', body: JSON.stringify({ created_at: '2026-01-01T00:00:00Z' }) },
    view,
  )
  await esperaNegado(
    `DELETE em ${nome}`,
    `${alvo.url}/rest/v1/${nome}?id=eq.${NADA}`,
    { method: 'DELETE' },
    view,
  )
}

for (const [nome, corpo] of Object.entries(RPCS_TRANSICAO)) {
  await esperaNegado(`RPC ${nome}`, `${alvo.url}/rest/v1/rpc/${nome}`, {
    method: 'POST',
    body: JSON.stringify(corpo),
  })
}

await esperaNegado(
  'RPC sync_upsert_caso (a que já esteve aberta em produção)',
  `${alvo.url}/rest/v1/rpc/sync_upsert_caso`,
  { method: 'POST', body: JSON.stringify(RPC_SYNC) },
)

/*
 * As duas do agendamento do sync (migration 20260828015512).
 *
 * São da MESMA família perigosa que sync_upsert_caso: SECURITY DEFINER que não
 * valida o chamador — não pode, roda sem usuário logado —, com o GRANT como
 * única barreira. `disparar_sync_calendar` monta um Authorization com a
 * service_role key; `configurar_segredo_do_sync` escreve no Vault.
 *
 * Entram aqui porque o pgTAP local é ESTRUTURALMENTE CEGO para esta classe de
 * regressão: os default privileges do remoto reconcedem EXECUTE a anon num
 * `drop function` + `create function`, e no local isso não acontece. Foi
 * exatamente assim que sync_upsert_caso ficou explorável em produção entre as
 * migrations 20260821100857 e 20260821102004.
 *
 * Nenhuma das duas escreve nada se o acesso for negado — e negado é o que se
 * espera. Se um dia uma delas passar, a sonda falha ANTES de a chamada ter
 * efeito, porque o 403 vem do privilégio, não do corpo.
 */
await esperaNegado(
  'RPC disparar_sync_calendar',
  `${alvo.url}/rest/v1/rpc/disparar_sync_calendar`,
  { method: 'POST', body: '{}' },
)

await esperaNegado(
  'RPC configurar_segredo_do_sync (escreve no Vault)',
  `${alvo.url}/rest/v1/rpc/configurar_segredo_do_sync`,
  {
    method: 'POST',
    body: JSON.stringify({ p_nome: 'sync_calendar_chave', p_valor: 'sonda' }),
  },
)

if (falhas.length === 0) {
  console.log(`OK — ${passaram} sondas, anon negado em todas.`)
  process.exit(0)
}

console.error(`FALHOU — ${falhas.length} de ${falhas.length + passaram} sondas NÃO foram negadas:\n`)
for (const f of falhas) console.error(`  ! ${f}\n`)
console.error('anon alcança algo que não deveria. Rode `npm run auditar:privilegios`.')
process.exit(1)
