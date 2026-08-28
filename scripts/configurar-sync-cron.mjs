/**
 * Liga o sync automático do Google Calendar num ambiente.
 *
 * O QUE ELE FAZ
 * Grava no Vault os dois segredos que a migration 20260828015512 ensinou o job
 * do pg_cron a procurar: a URL da Edge Function e a credencial que
 * `autorizarChamada` aceita. Sem isso o job acorda a cada dois minutos, não
 * encontra segredo e volta a dormir — de propósito.
 *
 * POR QUE É UM SCRIPT E NÃO UMA MIGRATION
 * Migration é arquivo versionado. Um segredo escrito lá estaria no git para
 * sempre, e rotacionar a chave depois não apagaria o histórico. Aqui o valor
 * vem de variável de ambiente, existe só na memória do processo, e nunca é
 * impresso.
 *
 * COMO RODAR (a chave nunca entra em arquivo nem no histórico do shell com o
 * valor colado — use o gerenciador de segredos ou digite num shell com
 * HISTCONTROL=ignorespace):
 *
 *   SUPABASE_URL=https://<ref>.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<chave> \
 *   node scripts/configurar-sync-cron.mjs
 *
 * É idempotente: rodar de novo atualiza o segredo em vez de duplicar.
 */

const url = process.env.SUPABASE_URL
const chave = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !chave) {
  console.error('Faltam SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY no ambiente.')
  console.error('')
  console.error('  SUPABASE_URL=https://<ref>.supabase.co \\')
  console.error('  SUPABASE_SERVICE_ROLE_KEY=<chave> \\')
  console.error('  node scripts/configurar-sync-cron.mjs')
  process.exit(1)
}

/*
 * GUARDA AO CONTRÁRIO da do seed: aqui o local é PERMITIDO.
 *
 * Este script não escreve dado de operação — grava configuração de infra no
 * ambiente que você apontar. Ligar o sync no local é legítimo (é como se testa
 * o job antes de produção), então não há o que recusar. O que ele NÃO pode
 * fazer é ligar o sync de um ambiente apontando para a Edge Function de outro:
 * a URL é derivada da própria SUPABASE_URL, nunca informada à parte, então
 * segredo e destino são sempre do mesmo projeto.
 */
const ehLocal = /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(url)

/*
 * NO LOCAL, A URL PRECISA SER A DE QUEM VAI CHAMAR — e quem chama é o BANCO.
 *
 * O disparo sai de dentro do contêiner do Postgres, via pg_net. Lá, `127.0.0.1`
 * é o próprio contêiner do banco, não a máquina: a chamada morre com
 * "Couldn't connect to server" e o sync nunca roda, mesmo com tudo no ar.
 * `host.docker.internal` é como o contêiner enxerga a máquina hospedeira.
 *
 * Em produção o problema não existe — a URL é pública e o banco a alcança
 * como qualquer um. Por isso a troca vale SÓ no local, e o remoto usa a URL
 * exatamente como veio.
 */
const base = url.replace(/\/+$/, '')
const baseParaOBanco = ehLocal
  ? base.replace(/127\.0\.0\.1|localhost/, 'host.docker.internal')
  : base
const urlDaFuncao = `${baseParaOBanco}/functions/v1/sync-calendar`

console.log(`Configurando o sync em ${url}`)
console.log(`  ambiente: ${ehLocal ? 'LOCAL' : 'REMOTO'}`)
console.log(`  função:   ${urlDaFuncao}`)
console.log('')

async function gravar(nome, valor) {
  const resposta = await fetch(`${url}/rest/v1/rpc/configurar_segredo_do_sync`, {
    method: 'POST',
    headers: {
      apikey: chave,
      Authorization: `Bearer ${chave}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_nome: nome, p_valor: valor }),
  })

  const corpo = await resposta.text()
  if (!resposta.ok) {
    // O corpo pode ecoar o parâmetro numa mensagem de erro do Postgres. Nunca
    // imprima corpo cru quando o valor for a chave.
    throw new Error(`HTTP ${resposta.status} ao gravar "${nome}"`)
  }
  return corpo.replace(/"/g, '')
}

try {
  console.log(`  sync_calendar_url    ${await gravar('sync_calendar_url', urlDaFuncao)}`)
  // O valor NÃO é ecoado — só o resultado da operação.
  console.log(`  sync_calendar_chave  ${await gravar('sync_calendar_chave', chave)}`)
} catch (erro) {
  console.error(`\nFalhou: ${erro.message}`)
  console.error('Confira se a migration 20260828015512 já foi aplicada neste ambiente.')
  process.exit(1)
}

console.log('')
console.log('Pronto. O job "sync-calendar" do pg_cron passa a disparar a cada 2 minutos.')
console.log('Para conferir o que ele fez, no SQL editor do projeto:')
console.log('  select * from cron.job_run_details order by start_time desc limit 10;')
