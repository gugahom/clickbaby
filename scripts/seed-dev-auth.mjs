/**
 * Cria os usuários de DESENVOLVIMENTO e seus vínculos em `pessoas`.
 *
 * POR QUE NÃO ESTÁ EM supabase/seed.sql
 * O seed é cadastro do cliente. A lista real de pessoas ainda está bloqueada
 * (item 4 da seção 13 do CLAUDE.md) e misturar credencial de dev com cadastro
 * de produção confunde as duas coisas. Estes usuários existem só para destravar
 * a RLS no local — `eh_pessoa_ativa()` exige auth.users + pessoas.auth_user_id
 * + ativo, e sem isso toda consulta devolve zero linha em silêncio.
 *
 * POR QUE ADMIN API E NÃO INSERT EM auth.users
 * O INSERT cru não cria a linha em `auth.identities` nem gera o hash de senha
 * no formato que o GoTrue espera: o usuário existe e o login falha, sem pista
 * do motivo. A Admin API faz as duas coisas.
 *
 * DOIS PAPÉIS, NÃO UM: operador e gestao (adm). É o que permite exercitar a
 * RLS com o caso positivo e o negativo — `eventos`, por exemplo, só é legível
 * por adm (policy eventos_select_adm).
 *
 * POR QUE A PESSOA ENTRA POR SQL, E NÃO PELO PostgREST
 * `service_role` não tem GRANT em `public.pessoas`: as migrations de RLS só
 * concederam para `authenticated` (auto_expose_new_tables está desligado).
 * Dar esse GRANT para conveniência de um script de dev seria alterar o schema
 * de produção por causa do ambiente local — então o vínculo vai por psql no
 * container, que é local por definição.
 *
 * Idempotente: rodar de novo não duplica. Roda depois de todo `db reset`
 * (o reset limpa auth.users junto) — ver o script `db:reset` do package.json.
 */

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const USUARIOS = [
  {
    email: 'operador@clickbaby.local',
    senha: 'clickbaby123',
    nome: 'Operadora Dev',
    papel: 'operador',
  },
  {
    email: 'gestao@clickbaby.local',
    senha: 'clickbaby123',
    nome: 'Gestão Dev',
    papel: 'gestao',
  },
]

function statusLocal() {
  // shell: true é necessário no Windows — desde o Node 20, execFile recusa
  // rodar .cmd/.bat diretamente (EINVAL). Não há entrada de usuário aqui.
  const saida = execFileSync('npx', ['supabase', 'status', '-o', 'env'], {
    encoding: 'utf8',
    shell: true,
  })

  const env = {}
  for (const linha of saida.split('\n')) {
    const m = linha.match(/^([A-Z_]+)="?(.*?)"?$/)
    if (m) env[m[1]] = m[2]
  }
  return env
}

const env = statusLocal()
const url = env.API_URL
const serviceRole = env.SERVICE_ROLE_KEY

if (!url || !serviceRole) {
  console.error('Não consegui ler API_URL/SERVICE_ROLE_KEY de `supabase status`.')
  console.error('O Supabase local está rodando? Tente `npx supabase start`.')
  process.exit(1)
}

// GUARDA: este script usa a service_role key, que ignora RLS por completo.
// Ela só pode tocar um banco local. Se a URL não for loopback, aborta.
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(url)) {
  console.error(`RECUSADO: ${url} não é um endereço local.`)
  console.error('Este script cria usuários com service_role e só roda contra 127.0.0.1.')
  process.exit(1)
}

const cabecalhos = {
  apikey: serviceRole,
  Authorization: `Bearer ${serviceRole}`,
  'Content-Type': 'application/json',
}

async function acharUsuario(email) {
  const r = await fetch(
    `${url}/auth/v1/admin/users?filter=${encodeURIComponent(email)}`,
    { headers: cabecalhos },
  )
  if (!r.ok) throw new Error(`listar usuários: ${r.status} ${await r.text()}`)
  const corpo = await r.json()
  return (corpo.users ?? []).find((u) => u.email === email) ?? null
}

async function criarUsuario({ email, senha }) {
  const r = await fetch(`${url}/auth/v1/admin/users`, {
    method: 'POST',
    headers: cabecalhos,
    body: JSON.stringify({ email, password: senha, email_confirm: true }),
  })
  if (!r.ok) throw new Error(`criar usuário ${email}: ${r.status} ${await r.text()}`)
  return r.json()
}

function containerDoBanco() {
  const config = readFileSync('supabase/config.toml', 'utf8')
  const m = config.match(/^project_id\s*=\s*"(.+?)"/m)
  if (!m) throw new Error('project_id não encontrado em supabase/config.toml')
  return `supabase_db_${m[1]}`
}

const CONTAINER = containerDoBanco()

function sql(comando) {
  return execFileSync(
    'docker',
    ['exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-tAc', comando],
    { encoding: 'utf8' },
  ).trim()
}

function vincularPessoa({ authUserId, nome, papel }) {
  // Checagem separada do insert: com -tAc, psql ainda imprime a tag de comando
  // ("INSERT 0 0"), então usar o retorno do insert para decidir se algo foi
  // criado reporta "vinculada" mesmo quando nada mudou.
  const jaExiste = sql(
    `select 1 from public.pessoas where auth_user_id = '${authUserId}'::uuid limit 1`,
  )
  if (jaExiste.includes('1')) return 'já vinculada'

  const escapado = nome.replace(/'/g, "''")
  sql(
    `insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
     values ('${escapado}', '${authUserId}'::uuid, '${papel}'::public.papel_sistema, true)`,
  )
  return 'vinculada'
}

console.log(`Ambiente local: ${url}\n`)

for (const u of USUARIOS) {
  let usuario = await acharUsuario(u.email)
  const jaExistia = usuario !== null
  if (!usuario) usuario = await criarUsuario(u)

  const situacao = vincularPessoa({
    authUserId: usuario.id,
    nome: u.nome,
    papel: u.papel,
  })

  console.log(
    `  ${u.email.padEnd(28)} ${jaExistia ? 'usuário já existia' : 'usuário criado'}, pessoa ${situacao} (${u.papel})`,
  )
}

console.log('\nSenha dos dois: clickbaby123')
console.log('Credenciais de desenvolvimento local. Não existem no remoto.')
