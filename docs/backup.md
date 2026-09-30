# Backup do banco — onde fica, como acessar, como restaurar

Criado em 30/09/2026. O medo da gestão: "o sistema um dia cair, ou perder todos os
dados, e ficar sem nada". Este documento responde onde está a cópia, quem abre, e o
que fazer no dia ruim.

---

## As duas camadas

| | Onde fica | Com que frequência | Quanto tempo | Serve para |
|---|---|---|---|---|
| **1. Cópia do Supabase** | Dentro do próprio projeto Supabase | 1 por dia (~01h50) | 7 dias | "Alguém apagou algo ontem" — volta pelo painel do Supabase |
| **2. Cópia de fora** (esta) | Bucket `clickbaby-backup` na **Cloudflare R2** da empresa | 1 por dia (04h00) | 60 dias, e uma por mês guardada por 1 ano | "Perdemos o Supabase" — a conta, o projeto, tudo |

A camada 1 já existia e é automática. O ponto fraco dela é morar no mesmo lugar que o
banco: se o projeto se perder, ela vai junto. A camada 2 existe para isso.

## O que a cópia leva — e o que não leva

**Leva:** o banco inteiro — casos, etapas, histórico (`eventos`), pessoas, links de
entrega, despesas, termos, avaliações, pontos, padrões — **e as contas de login** (quem
entra e com qual senha, guardada cifrada como o Supabase guarda).

**Não leva** (e onde está):
- os **arquivos** do Storage — capas do fotolivro e fotos de perfil. São poucos e
  pequenos; copiá-los é o próximo passo, se a gestão quiser;
- o **código** e as **Edge Functions** — estão no GitHub;
- os **segredos** (chave do Google Calendar, etc.) — ficam com quem administra o projeto;
- o **agendamento do sync** (o cron de 25 segundos) — é recriado pelas migrations.

## Por que o arquivo é trancado, e quem tem a chave

O arquivo tem nome de mãe e bebê, maternidade, situação clínica e os links das
galerias. É dado de saúde e de menor (LGPD). Por isso ele sai do GitHub **já trancado**
com uma chave de duas metades (programa `age`):

- a **chave pública** ("age1…") só TRANCA. Ela fica no GitHub. Não é segredo;
- a **chave privada** é a única que ABRE. **Ela nunca vai para o GitHub nem para a
  Cloudflare.** Fica com a gestão.

Consequência que vale dizer com todas as letras: **quem roubar o bucket ou o GitHub leva
um arquivo ilegível — e quem perder a chave privada perde o backup inteiro.** Por isso:

- a chave privada fica em **dois lugares**: um gerenciador de senhas da empresa
  (Bitwarden, 1Password…) como nota segura, e uma **cópia impressa** num lugar físico
  seguro;
- **duas pessoas da gestão** sabem onde ela está;
- ela **nunca** vai por WhatsApp, e-mail ou pasta aberta do Drive.

---

## Configuração (uma vez só) — quem faz: você

São quatro partes. Nenhuma senha passa por mim: você cria e cola direto no GitHub.

### 1. A chave (no seu computador)

No PowerShell:

```powershell
winget install FiloSottile.age
```

Feche e abra o terminal, e então:

```powershell
age-keygen -o clickbaby-backup-chave.txt
```

Ele mostra uma linha `Public key: age1...` — **essa é a pública**, anote. O arquivo
`clickbaby-backup-chave.txt` é a **privada**: guarde nos dois lugares acima e apague do
computador depois.

### 2. O bucket na Cloudflare

No painel da Cloudflare (a mesma conta do site):

1. **R2 Object Storage → Create bucket**. Nome: `clickbaby-backup`. Localização:
   automática.
2. No bucket, **Settings → Object lifecycle rules → Add rule**, duas regras:
   - prefixo `diario/` → apagar objetos depois de **60 dias**;
   - prefixo `mensal/` → apagar objetos depois de **365 dias**.
3. De volta em **R2**, **Manage API tokens → Create API token**:
   - permissão **Object Read & Write**;
   - **só o bucket `clickbaby-backup`** (não "todos os buckets");
   - sem data de expiração.

   Ele mostra **Access Key ID** e **Secret Access Key** uma vez só — copie os dois. O
   **Account ID** aparece na página inicial do R2.

Custo: o plano gratuito do R2 cobre 10 GB. A cópia criptografada tem poucos MB por dia;
com 60 diárias e 12 mensais fica muito abaixo disso.

### 3. A conexão do banco

No painel do Supabase, projeto `clickbaby`: botão **Connect** (no topo) → **Session
pooler** → copie a **URI**. Ela tem `[YOUR-PASSWORD]` no meio: troque pela senha do
banco.

Se ninguém souber a senha, ela pode ser redefinida em **Project Settings → Database →
Reset database password**. Neste projeto nada mais depende dela (o site usa outras
chaves, e os deploys pelo terminal não pedem essa senha).

É o **Session pooler**, não a conexão direta: a direta só fala IPv6, e as máquinas do
GitHub não falam.

### 4. O GitHub

No repositório: **Settings → Secrets and variables → Actions**.

Aba **Secrets** → *New repository secret*, quatro:

| Nome | Valor |
|---|---|
| `SUPABASE_DB_URL` | a URI do passo 3, com a senha |
| `R2_ACCOUNT_ID` | o Account ID da Cloudflare |
| `R2_ACCESS_KEY_ID` | do token do passo 2 |
| `R2_SECRET_ACCESS_KEY` | do token do passo 2 |

Aba **Variables** → *New repository variable*, duas:

| Nome | Valor |
|---|---|
| `R2_BUCKET` | `clickbaby-backup` |
| `BACKUP_CHAVE_PUBLICA` | a linha `age1...` do passo 1 |

### 5. Primeiro teste

**Actions → Backup noturno → Run workflow**. Em uns três minutos ele fica verde, e o
log mostra só contagens ("public.casos … 320 linhas"). No bucket aparece
`diario/clickbaby_AAAA-MM-DD.tar.gz.age`.

Daí em diante roda sozinho todo dia às 04h. **Se falhar, o GitHub manda e-mail** para
quem mexeu por último no agendamento deste fluxo — na prática, a conta de quem fez o merge
desta PR. Vale conferir em **Settings → Notifications** do GitHub que os avisos de Actions
estão ligados para e-mail.

---

## Onde fica e como acessar

Painel da Cloudflare → **R2 Object Storage → `clickbaby-backup`**:

```
clickbaby-backup/
  diario/   clickbaby_2026-10-01.tar.gz.age   ← um por dia, 60 dias
            clickbaby_2026-10-02.tar.gz.age
            …
  mensal/   clickbaby_2026-10-01.tar.gz.age   ← o do dia 1, guardado por 1 ano
            …
```

Clique no arquivo → **Download**. O arquivo baixado continua trancado: sem a chave
privada, não serve para nada.

## Como dar acesso à equipe da gestão

São **duas coisas separadas**, e é de propósito:

1. **Ver e baixar o arquivo** — convite na Cloudflare: **Manage Account → Members →
   Invite**, com o e-mail da pessoa. Escolha o papel **mais restrito que dê acesso ao
   R2** (a lista de papéis aparece no convite); ninguém precisa ser administrador da
   conta para baixar um backup.
2. **Abrir o arquivo** — a chave privada, entregue pelo gerenciador de senhas (a
   maioria permite compartilhar uma nota com outra pessoa) ou em mãos. Nunca por
   mensagem.

Quem tem só o primeiro vê arquivos trancados. Quem tem só o segundo não tem o que
abrir. As duas coisas juntas ficam com quem a gestão decidir — o sugerido são duas
pessoas.

Para **tirar** o acesso de alguém que saiu: remover o membro na Cloudflare e, se a pessoa
tinha a chave privada, gerar uma chave nova (passo 1), trocar a `BACKUP_CHAVE_PUBLICA`
no GitHub, e guardar a antiga — ela ainda abre as cópias antigas.

---

## No dia ruim: restaurar

**Faça isso junto com quem desenvolve o sistema.** O resumo:

1. Baixe a cópia mais recente do bucket.
2. Abra com a chave privada:

   ```bash
   age -d -i clickbaby-backup-chave.txt -o copia.tar.gz clickbaby_2026-10-01.tar.gz.age
   tar -xzf copia.tar.gz
   ```

   Saem três arquivos: `roles.sql` (papéis), `schema.sql` (estrutura) e `data.sql`
   (dados).
3. Crie um projeto novo no Supabase (ou use o que sobrou) e carregue os três, nesta
   ordem, com a URI do Session pooler do projeto novo — é o procedimento que o próprio
   Supabase documenta:

   ```bash
   psql --single-transaction --variable ON_ERROR_STOP=1 \
     --file roles.sql --file schema.sql \
     --command 'SET session_replication_role = replica' \
     --file data.sql --dbname "$URI_DO_PROJETO_NOVO"
   ```

4. Depois dos dados: publicar as Edge Functions, cadastrar os segredos, apontar o site
   para o projeto novo (endereço e chave pública), e conferir o agendamento do sync.
5. Apagar a cópia aberta (`copia.tar.gz` e os três `.sql`) do computador.

## Teste de restauração

Backup que nunca foi restaurado é só esperança. Uma vez por mês, a cópia mais recente
deve ser aberta e carregada num projeto de teste, e as contagens comparadas com as do
log do GitHub. O script `scripts/conferir-backup.mjs` já recusa, toda noite, uma cópia
vazia ou sem as tabelas principais; o teste mensal é o que prova que ela **volta**.
