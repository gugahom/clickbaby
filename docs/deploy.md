# Deploy — Cloudflare Pages

O app é publicado em **`/quadro`**, com a raiz (`/`) reservada para uma landing
futura. Não há nada na raiz hoje: quem acessar `/` recebe 404 até a landing
existir, e isso é intencional.

## Como o caminho `/quadro` se sustenta

Três lugares precisam concordar. Se um mudar sozinho, o app quebra de um jeito
que só aparece depois de publicar:

| onde | o quê | para quê |
| --- | --- | --- |
| `vite.config.ts` → `base` | `/quadro/` | o HTML aponta os assets para `/quadro/assets/...` |
| `vite.config.ts` → `build.outDir` | `dist/quadro` | o build sai já no subdiretório certo |
| `src/app/router.tsx` → `basename` | `/quadro` | as rotas do React Router absorvem o prefixo |

Por causa do `basename`, os caminhos declarados no router são **relativos** a
ele: a rota índice é o Quadro (`/quadro`) e `/fila` é a Fila (`/quadro/fila`).
Não existe uma rota `'/quadro'` no arquivo — ela viraria `/quadro/quadro`.

O `dist/_redirects` (escrito por um plugin no `vite.config.ts`, porque precisa
ficar na raiz do publicado e o `outDir` é `dist/quadro`) contém:

```
/quadro/* /quadro/index.html 200
```

Sem essa linha, o Pages devolve 404 em qualquer rota que não seja a inicial —
inclusive num F5 em `/quadro/fila`. A raiz fica de fora da regra de propósito,
para a landing poder ocupá-la depois.

## Configuração no Cloudflare

O `wrangler.toml` já declara o diretório de saída. No painel, ou na criação do
projeto:

| campo | valor |
| --- | --- |
| Build command | `npm run build` |
| Build output directory | `dist` |

Atenção ao output: é `dist`, **não** `dist/quadro`. O app fica no subdiretório,
mas o que se publica é a raiz — senão o `_redirects` não é lido e o caminho
`/quadro` some.

### Variáveis de ambiente

Precisam existir no ambiente de build do Cloudflare, porque o Vite as embute no
bundle em tempo de build (não são lidas em runtime):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Os valores são os mesmos do `.env` local (que aponta para o remoto). A anon key
ir para o bundle é esperado e seguro: ela é pública por definição, e o que
protege os dados é a RLS mais os GRANTs — auditados por `npm run seguranca`.

**Nunca** configure a `service_role key` aqui. Ela não é usada pelo frontend e
vazaria para qualquer visitante.

Se `VITE_SUPABASE_URL` faltar, o build **falha** com mensagem explícita, em vez
de publicar um app que não fala com banco nenhum.

## A armadilha que já mordeu

`npm run dev:local` escreve um arquivo de ambiente apontando para o Supabase do
Docker. Ele se chamava `.env.local` — e o Vite carrega `.env.local` em **todo**
modo, build de produção incluído, com precedência sobre o `.env`.

Resultado: numa máquina que já tinha rodado `dev:local`, o `npm run build`
gerava um bundle de produção falando com `http://127.0.0.1:54321`. Build verde,
lint verde, app quebrado para todo mundo que não fosse a máquina que buildou.

Duas correções, e as duas importam:

1. O arquivo passou a ser `.env.development.local`, restrito ao modo de
   desenvolvimento (`scripts/dev-local.mjs`).
2. O `vite.config.ts` recusa buildar produção se `VITE_SUPABASE_URL` apontar
   para `127.0.0.1` ou `localhost` — rede para um `.env.local` esquecido, ou
   para a próxima variante do mesmo erro.

A checagem olha o **valor da variável**, não o texto do bundle: o bundle contém
`127.0.0.1` legitimamente, tanto de dependência quanto do nosso
`src/lib/supabase.ts`, que compara a URL para desenhar o selo LOCAL/REMOTO.

## Testar o build antes de publicar

```
npm run build
npx vite preview
```

O preview sobe em `http://localhost:4173/quadro/` e serve o build real, contra o
Supabase remoto. Vale conferir três coisas: a tela carrega, navegar para a Fila
muda a URL para `/quadro/fila`, e recarregar nessa URL continua funcionando.

---

## Quando produção não muda depois de um merge

O sintoma é sempre o mesmo — "mergeei e o site continua igual" — e as causas
são poucas. Verifique nesta ordem, que vai da mais provável para a menos.

### 1. O deploy realmente aconteceu?

Compare o que está no ar com o que o `main` produz. O nome do arquivo carrega
um hash do conteúdo, então **hash igual significa bundle idêntico**:

```bash
curl -s https://clickbaby.com.br/quadro/ | grep -oE '/quadro/assets/index-[^"]+\.js'
npm run build   # o nome aparece na saída
```

Se batem, produção **é** o `main` e o problema está em outro lugar (dado, sessão,
aba antiga). Se não batem, siga.

### 2. O build falhou por causa da variável de ambiente

É o caso mais comum, e o log diz:

```
VITE_SUPABASE_URL nao definida.
```

O Vite **embute** o valor no bundle em tempo de build. Uma variável de *runtime*
nunca chega lá: quando o site roda, o build já aconteceu. As duas listas moram na
mesma tela do painel e têm nomes parecidos — é daí que vem a confusão.

- A variável tem que estar nas variáveis de **build**.
- **Production** e **Preview** são listas separadas. Preencher só uma faz o
  deploy de branch quebrar e o de `main` passar, ou o contrário.
- **Adicionar variável não dispara build.** O último deploy verde continua
  servindo o bundle antigo, e a tela fica atrasada sem erro nenhum visível.
  Depois de mexer nas variáveis, use *Retry deployment* ou publique de novo.

Desde `fix/build-diz-onde-esta-a-variavel`, todo build verde imprime para onde
ele vai falar:

```
[clickbaby] build apontando para opfplextlmakxsxcufey.supabase.co
```

Se essa linha não aparece no log, o build não chegou até ali.

### 3. Publicar à mão

Não depende do painel nem da integração com o git. Serve para destravar na hora
e para provar que o problema é do gatilho, não do código:

```bash
npm run build
npx wrangler pages deploy dist --project-name=clickbaby --branch=main
```

`dist`, não `dist/quadro` — mesma razão do *Build output directory*: o
`_redirects` mora na raiz do publicado. O `--branch=main` é o que faz o deploy
virar produção; sem ele vira preview, com URL própria e sem tocar o domínio.

O `wrangler` pede login na primeira vez (`npx wrangler login`), e as variáveis
de build **não** se aplicam aqui: quem constrói é a sua máquina, com o seu
`.env`. É por isso que este caminho funciona mesmo com o painel mal configurado —
e por isso ele não corrige a causa.

### 4. A integração com o git parou

Se o `main` não constrói sozinho mas o deploy manual funciona, o gatilho é que
está desligado. No painel, em *Builds & deployments*: confirme que o repositório
segue conectado, que a branch de produção é `main`, e que não há filtro de
caminho excluindo o que mudou.
