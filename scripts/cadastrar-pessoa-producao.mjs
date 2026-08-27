/**
 * Cadastra pessoas REAIS no banco de PRODUÇÃO: conta de auth + linha em
 * `pessoas`, vinculadas.
 *
 * ESPELHO INVERTIDO DE seed-dev-auth.mjs
 * Aquele só roda contra 127.0.0.1 e existe para destravar a RLS em dev. Este só
 * roda contra o remoto e escreve gente de verdade — por isso as duas guardas
 * abaixo são o oposto uma da outra.
 *
 * USO
 *   SUPABASE_URL=https://xxx.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
 *   node scripts/cadastrar-pessoa-producao.mjs
 *
 * As duas vêm de variável de ambiente, nunca de argumento de linha de comando
 * (argumento fica gravado no histórico do shell; env var da sessão não).
 * Nenhuma das duas é lida de arquivo, nenhuma é escrita em arquivo.
 *
 * A lista de pessoas a criar fica no array PESSOAS abaixo — é o "o quê" desta
 * execução, deliberadamente hardcoded aqui e não num CSV: cadastrar gente em
 * produção não deveria ser tão fácil quanto apontar para um arquivo diferente.
 */

import { readFileSync } from 'node:fs'
import { createInterface } from 'node:readline/promises'
import { randomBytes } from 'node:crypto'

const PESSOAS = [
  { nome: 'Jeferson', email: 'jeferson@clickbaby.com.br', apelidos: ['Jeff'] },
  { nome: 'Sarah', email: 'sarah@clickbaby.com.br', apelidos: [] },
  { nome: 'André', email: 'andre@clickbaby.com.br', apelidos: [] },
]
const PAPEL = 'gestao'

// -----------------------------------------------------------------------
// Guarda 1: só roda fora de localhost. Inverso exato do guard de
// seed-dev-auth.mjs, que só roda dentro.
// -----------------------------------------------------------------------

const url = process.env.SUPABASE_URL
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceRole) {
  console.error('Faltam SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY no ambiente.')
  console.error('As duas são lidas de env var, nunca de argumento ou arquivo.')
  process.exit(1)
}

if (/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(url)) {
  console.error(`RECUSADO: ${url} é um endereço local.`)
  console.error('Este script escreve gente REAL e só roda contra produção.')
  console.error('Para o ambiente local, use scripts/seed-dev-auth.mjs.')
  process.exit(1)
}

// -----------------------------------------------------------------------
// Guarda 2: a URL precisa bater com a referência do projeto linkado — trava
// contra apontar sem querer para outro projeto Supabase.
//
// NÃO é supabase/config.toml `project_id`: aquele é só o rótulo dos
// containers Docker locais ("ClickBaby"), nada a ver com a referência do
// projeto remoto. A referência real fica em supabase/.temp/project-ref,
// escrita pelo próprio CLI quando o projeto é linkado (`supabase link`).
// -----------------------------------------------------------------------

let projectRef
try {
  projectRef = readFileSync('supabase/.temp/project-ref', 'utf8').trim()
} catch {
  console.error('Não encontrei supabase/.temp/project-ref — rode `supabase link` primeiro.')
  process.exit(1)
}

if (!projectRef || !url.includes(projectRef)) {
  console.error(`RECUSADO: a URL (${url}) não contém a referência do projeto linkado ("${projectRef}").`)
  console.error('Confirme que SUPABASE_URL aponta para o projeto certo antes de rodar de novo.')
  process.exit(1)
}

const cabecalhos = {
  apikey: serviceRole,
  Authorization: `Bearer ${serviceRole}`,
  'Content-Type': 'application/json',
}

function gerarSenha() {
  // 16 bytes -> ~22 caracteres base64url, sem caracteres ambíguos para digitar.
  return randomBytes(16).toString('base64url')
}

async function buscarUsuarioPorEmail(email) {
  const r = await fetch(`${url}/auth/v1/admin/users?filter=${encodeURIComponent(email)}`, {
    headers: cabecalhos,
  })
  if (!r.ok) throw new Error(`listar usuários: ${r.status} ${await r.text()}`)
  const corpo = await r.json()
  return (corpo.users ?? []).find((u) => u.email === email) ?? null
}

async function criarUsuario(email, senha) {
  const r = await fetch(`${url}/auth/v1/admin/users`, {
    method: 'POST',
    headers: cabecalhos,
    body: JSON.stringify({ email, password: senha, email_confirm: true }),
  })
  if (!r.ok) throw new Error(`criar usuário ${email}: ${r.status} ${await r.text()}`)
  return r.json()
}

async function deletarUsuario(authUserId) {
  await fetch(`${url}/auth/v1/admin/users/${authUserId}`, {
    method: 'DELETE',
    headers: cabecalhos,
  })
}

async function buscarPessoaPorAuthUserId(authUserId) {
  const r = await fetch(`${url}/rest/v1/pessoas?auth_user_id=eq.${authUserId}&select=id,nome`, {
    headers: cabecalhos,
  })
  if (!r.ok) throw new Error(`buscar pessoa: ${r.status} ${await r.text()}`)
  const linhas = await r.json()
  return linhas[0] ?? null
}

async function criarPessoa({ nome, apelidos, authUserId }) {
  const r = await fetch(`${url}/rest/v1/pessoas`, {
    method: 'POST',
    headers: { ...cabecalhos, Prefer: 'return=representation' },
    body: JSON.stringify({
      nome,
      apelidos,
      auth_user_id: authUserId,
      papel_sistema: PAPEL,
      ativo: true,
    }),
  })
  if (!r.ok) throw new Error(`criar pessoa ${nome}: ${r.status} ${await r.text()}`)
  const [linha] = await r.json()
  return linha
}

// -----------------------------------------------------------------------
// Confirmação manual antes de tocar em produção.
// -----------------------------------------------------------------------

console.log(`Alvo: ${url}\n`)
console.log('Pessoas a cadastrar (papel_sistema = gestao):')
for (const p of PESSOAS) {
  console.log(`  ${p.nome.padEnd(10)} ${p.email}${p.apelidos.length ? `  (apelido: ${p.apelidos.join(', ')})` : ''}`)
}

const rl = createInterface({ input: process.stdin, output: process.stdout })
const resposta = await rl.question('\nConfirma a escrita em PRODUÇÃO? (y/N) ')
rl.close()

if (resposta.trim().toLowerCase() !== 'y') {
  console.log('Cancelado — nada foi escrito.')
  process.exit(0)
}

// -----------------------------------------------------------------------
// Execução. Auth primeiro, pessoas depois; se pessoas falhar, desfaz o auth
// que acabou de criar — não fica conta órfã sem vínculo.
// -----------------------------------------------------------------------

console.log()
const credenciais = []

for (const pessoa of PESSOAS) {
  let usuario = await buscarUsuarioPorEmail(pessoa.email)
  let jaExistiaAuth = usuario !== null
  let senhaGerada = null

  if (!usuario) {
    senhaGerada = gerarSenha()
    try {
      usuario = await criarUsuario(pessoa.email, senhaGerada)
    } catch (erro) {
      console.log(`  ${pessoa.nome.padEnd(10)} FALHOU ao criar conta de auth: ${erro.message}`)
      continue
    }
  }

  const pessoaExistente = await buscarPessoaPorAuthUserId(usuario.id)

  if (pessoaExistente) {
    console.log(
      `  ${pessoa.nome.padEnd(10)} já existia (auth ${jaExistiaAuth ? 'existia' : 'criado agora'}, pessoa já vinculada) — nada a fazer`,
    )
    continue
  }

  try {
    await criarPessoa({ nome: pessoa.nome, apelidos: pessoa.apelidos, authUserId: usuario.id })
  } catch (erro) {
    // Compensação manual: sem transação entre auth e a tabela pessoas, quem
    // garante consistência é este catch. Só desfaz o que ESTE script criou —
    // se o auth já existia de uma execução anterior, não mexe nele.
    if (!jaExistiaAuth) {
      console.log(
        `  ${pessoa.nome.padEnd(10)} pessoa falhou (${erro.message}) — desfazendo a conta de auth criada agora`,
      )
      await deletarUsuario(usuario.id)
    } else {
      console.log(
        `  ${pessoa.nome.padEnd(10)} pessoa falhou (${erro.message}) — conta de auth é de execução anterior, NÃO removida`,
      )
    }
    continue
  }

  console.log(`  ${pessoa.nome.padEnd(10)} criado (auth + pessoa vinculada)`)
  if (senhaGerada) {
    credenciais.push({ nome: pessoa.nome, email: pessoa.email, senha: senhaGerada })
  }
}

if (credenciais.length > 0) {
  console.log('\nSenhas temporárias (só aparecem aqui, em nenhum arquivo):\n')
  for (const c of credenciais) {
    console.log(`  ${c.nome.padEnd(10)} ${c.email}   ${c.senha}`)
  }
  console.log(
    '\nNão existe troca de senha no app ainda — esta é a senha de uso contínuo até essa tela existir.',
  )
}

console.log('\nConcluído.')
