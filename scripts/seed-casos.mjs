/**
 * Repopula os casos do banco LOCAL rodando o sync do Google Calendar.
 *
 * POR QUE ISTO EXISTE
 * `supabase/seed.sql` tem só cadastro (pacotes, pacote_etapas, maternidades).
 * Os casos vêm do sync (seção 7 do CLAUDE.md), então todo `db reset` deixa o
 * banco com zero caso e o Quadro vazio.
 *
 * POR QUE OS CASOS NÃO VIRAM FIXTURE NO REPOSITÓRIO
 * São nomes reais de mãe e de recém-nascido — dado pessoal sensível de saúde e
 * de menor (seção 10 do CLAUDE.md). Um dump commitado colocaria isso no git
 * para sempre. Repopular buscando da fonte é a única opção correta.
 *
 * O QUE ELE FAZ
 * Chama a Edge Function sync-calendar já servida pelo runtime local. Nenhuma
 * lógica de sync mora aqui: a função lê a agenda, o parser decide o que cada
 * título significa e a RPC sync_upsert_caso decide o que persistir. Este
 * script só dispara e mostra o resumo.
 *
 * É idempotente pela natureza do sync: a RPC faz upsert por
 * google_calendar_event_id, então rodar de novo não duplica caso nenhum
 * (aparece como "sem efeito" no resumo).
 */

import { execFileSync } from 'node:child_process'

function statusLocal() {
  let saida
  try {
    // shell: true por causa do Windows — desde o Node 20, execFile recusa
    // rodar .cmd/.bat diretamente (EINVAL). Não há entrada de usuário aqui.
    saida = execFileSync('npx', ['supabase', 'status', '-o', 'env'], {
      encoding: 'utf8',
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
  return env
}

const env = statusLocal()
const url = env.API_URL
const anonKey = env.ANON_KEY

if (!url || !anonKey) {
  console.error('`supabase status` não devolveu API_URL/ANON_KEY.')
  process.exit(1)
}

// GUARDA: este script ESCREVE casos. Só pode tocar um banco local — disparar
// o sync contra o remoto por engano criaria/alteraria casos de produção.
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(url)) {
  console.error(`RECUSADO: ${url} não é um endereço local.`)
  console.error('Este script escreve casos e só roda contra 127.0.0.1.')
  process.exit(1)
}

console.log(`Rodando o sync do Calendar contra ${url} …\n`)

let resposta
try {
  resposta = await fetch(`${url}/functions/v1/sync-calendar`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${anonKey}`,
      'Content-Type': 'application/json',
    },
  })
} catch (erro) {
  console.error(`Falha ao chamar a Edge Function: ${erro.message}`)
  process.exit(1)
}

const corpo = await resposta.text()

if (resposta.status === 404) {
  console.error('A Edge Function sync-calendar não está sendo servida.')
  console.error('Rode `npx supabase start` (ou `npx supabase functions serve sync-calendar`).')
  process.exit(1)
}

let resumo
try {
  resumo = JSON.parse(corpo)
} catch {
  console.error(`Resposta inesperada (HTTP ${resposta.status}):\n${corpo}`)
  process.exit(1)
}

// O caso de erro mais provável em máquina nova: o runtime subiu sem os
// secrets do Google. A mensagem precisa dizer ONDE eles moram, porque o
// arquivo é gitignorado e não existe num clone limpo nem num worktree.
if (!resposta.ok || resumo.error) {
  const mensagem = resumo.error ?? corpo
  console.error(`O sync falhou (HTTP ${resposta.status}): ${mensagem}\n`)
  if (String(mensagem).includes('GOOGLE_')) {
    console.error('Faltam os secrets do Google no runtime das Edge Functions.')
    console.error('Eles ficam em `.env.functions` na RAIZ do repositório principal')
    console.error('(gitignorado — não existe em clone novo nem em worktree; veja o')
    console.error('modelo em supabase/functions/.env.local.example).')
    console.error('')
    console.error('Com o arquivo no lugar:')
    console.error('  npx supabase functions serve sync-calendar --env-file .env.functions')
  }
  process.exit(1)
}

const rotulos = {
  total_eventos_lidos: 'eventos lidos na agenda',
  criados: 'casos criados',
  atualizados: 'casos atualizados',
  rascunhos: 'rascunhos pendentes criados',
  cancelados: 'casos cancelados (card cinza)',
  ignorados: 'eventos ignorados (sem "/" no título)',
  sem_efeito: 'sem mudança (idempotente)',
}

for (const [chave, rotulo] of Object.entries(rotulos)) {
  if (resumo[chave] !== undefined) {
    console.log(`  ${String(resumo[chave]).padStart(4)}  ${rotulo}`)
  }
}

if (Array.isArray(resumo.erros) && resumo.erros.length > 0) {
  console.log(`\n  ${resumo.erros.length} evento(s) com erro:`)
  for (const e of resumo.erros) console.log(`    - ${JSON.stringify(e)}`)
}

console.log('\nPronto. O Quadro já reflete os casos da agenda.')
