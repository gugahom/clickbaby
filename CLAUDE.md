# CLAUDE.md

Contexto permanente do projeto. Leia este arquivo por completo antes de qualquer tarefa.

---

## 1. O que é este projeto

Sistema de gestão operacional para uma empresa de fotografia de parto de Curitiba, que
atende em várias maternidades com equipe em escala 24/7.

Hoje a operação roda em dois artefatos desconectados: um **quadro branco físico** com o
estado ao vivo dos casos, e uma **planilha Excel mensal** com o registro pós-fato. O sistema
substitui os dois por um objeto único — o **Caso** — em que o estado ao vivo e o histórico
são a mesma coisa.

Volume real: ~135 atendimentos/mês, 1.084 registrados entre jan e ago de 2026.

O plano completo de escopo, dados e roadmap está em `docs/plano.md`. Este arquivo contém as
regras que valem para **toda** tarefa de implementação.

---

## 2. Vocabulário do domínio

O domínio é em português e permanece em português no banco, nos tipos e nos nomes de
função. Não traduza. Código técnico de scaffolding (hooks, utils, helpers genéricos) pode
usar inglês.

| Termo                      | Significado                                                                                                                                         |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Caso**                   | Um atendimento completo a uma família, do contrato à entrega dos links                                                                              |
| **Etapa**                  | Unidade de trabalho dentro de um caso (entrada, nascimento, banho, fechamento, edições)                                                             |
| **Pacote**                 | Produto vendido. Define **quais etapas existem** naquele caso                                                                                       |
| **Maternidade**            | Hospital onde o caso acontece                                                                                                                       |
| **Handoff**                | Passagem de uma etapa de uma pessoa para outra, tipicamente na troca de turno                                                                       |
| **Rendição planejada**     | Quem já sabe que vai ASSUMIR a etapa na virada de turno. Não é um segundo responsável: só uma pessoa trabalha por vez                               |
| **Trilha**                 | CAMPO (o que acontece na maternidade) ou EDIÇÃO (o que acontece na ilha). Derivada do tipo da etapa; define precedência e a divisão do card         |
| **Situação clínica**       | Estado da mãe/bebê: aguardando, internada, indução, trabalho de parto, nasceu, UTI, alta                                                            |
| **Entregável**             | Link final para a família: Google Photos, WeTransfer, cadeado, reels, álbum                                                                         |
| **Fila de edição**         | Etapas de edição pendentes, distribuídas pela coordenação                                                                                           |
| **SLA / prazo de entrega** | Prazo que a empresa promete ao cliente (48h na maioria; 10 dias úteis no MASTER); conta a partir do nascimento concluído                       |
| **CEL CLICK**              | Celulares corporativos usados para capturar vídeo — 6 aparelhos, compartilhados                                                                     |
| **Estação**                | PC de edição. 4 de foto, 2 de vídeo                                                                                                                 |
| **Sync**                   | Edge Function que lê a agenda do Google Calendar e cria/atualiza/cancela casos automaticamente                                                      |
| **Rascunho pendente**      | Caso criado pelo sync quando o parser não consegue mapear pacote ou maternidade com certeza — fica fora do fluxo operacional até confirmação manual |
| **Card cinza**             | Convenção do cliente no Calendar para sinalizar cancelamento — o sync detecta e cancela o caso automaticamente                                      |

**Pessoas reais do cliente que aparecem no domínio:** Sarah distribui a fila de edição.
Não hardcode esses nomes — são papéis atribuídos a registros em `pessoas`.

**Entrega — revisado com o gestor.** Quem gera os links de entrega são as próprias
fotógrafas, fora do sistema (Google Photos, WeTransfer). Elas colam o link no caso e
confirmam a entrega, o que encerra o caso. A Morgana **não** é mais a única que confirma:
prender o encerramento ao atendimento fazia dela gargalo de um passo que ela não executa.
O sistema guarda e exibe o link; **não gera nem confere** se ele existe de verdade —
uma integração de verificação fica para depois, se fizer sentido.

### Pacotes × etapas — referência canônica

O pacote define quais etapas o caso tem. Estrutura cumulativa, confirmada com o cliente
(vira dado em `pacote_etapas`, no seed — não é schema):

As etapas vivem em **duas trilhas**, e a divisão é a que a operação já usa —
atendimento de um lado, operação interna do outro. Ela não é só rótulo de tela:
é a regra de precedência (ver abaixo) e a divisão do card.

|                          | CAMPO   |            |       |            | EDIÇÃO      |       |            |       |               |
| ------------------------ | ------- | ---------- | ----- | ---------- | ----------- | ----- | ---------- | ----- | ------------- |
| Pacote                   | Entrada | Nascimento | Banho | Fechamento | Edição Fotos | Reels | Ed. Vídeo | Álbum | SLA           |
| BASIC                    | ✓       | ✓          |       |            | ✓           | ✓     |            |       | 48h           |
| BASIC + REELS            | ✓       | ✓          |       |            | ✓           | ✓     |            |       | 48h           |
| BASIC REELS              | ✓       | ✓          |       |            | ✓           | ✓     |            |       | 48h           |
| STANDARD                 | ✓       | ✓          | ✓     | ✓          | ✓           | ✓     |            |       | 48h           |
| BABY REELS (carro-chefe) | ✓       | ✓          | ✓     | ✓          | ✓           | ✓     |            |       | 48h           |
| MASTER                   | ✓       | ✓          | ✓     | ✓          | ✓           | ✓     | ✓          |       | 10 dias úteis |
| MASTER + ÁLBUM           | ✓       | ✓          | ✓     | ✓          | ✓           | ✓     | ✓          | ✓     | 10 dias úteis |
| BIRTH                    |         | ✓          |       |            | ✓           | ✓     |            |       | 24h           |
| BIRTH + REELS            |         | ✓          |       |            | ✓           | ✓     |            |       | 24h           |

**REELS e VÍDEO são etapas diferentes** (confirmado 27/08/2026, migration
`20260827140400`). `reels` é o vertical curto e existe em TODOS os pacotes —
mesmo os que não o vendem, a equipe faz. `edicao_video` é o HORIZONTAL, só no
MASTER. Até essa data todo pacote usava `edicao_video` para o que na verdade
era o reels, e `reels` estava órfão no enum.

**Edição de fotos existe em todos**, e é UMA etapa por caso, não uma por bloco
de captura: as fotos do banho entram na mesma edição já em andamento.

**Precedência não é linear.** CAMPO é sequencial entre si; EDIÇÃO libera quando
o nascimento conclui — banho e fechamento não seguram a edição, e a edição não
segura eles:

```
entrada → nascimento ─┬→ banho → fechamento     (CAMPO)
                      └→ foto · reels · vídeo   (EDIÇÃO)
```

- **Entrada existe em todos menos BIRTH e BIRTH + REELS.**
- **BIRTH** é feito sem contrato fechado, para apresentar aos pais pós-parto e tentar a
  venda. SLA de 24h (janela curta) faz sua edição subir na fila — ver seção 9.
- **BIRTH + REELS** é comercialmente distinto do BIRTH (a tentativa de venda já sai com o
  reels incluído), mesmo tendo exatamente as mesmas etapas e o mesmo SLA — por isso é um
  pacote próprio no cadastro, não uma variação do BIRTH.
- "Vídeo de venda" vs "vídeo de contrato" é a mesma etapa no fluxo de trabalho; a diferença
  está no pacote, não vira campo separado.
- **Três etapas existem FORA de qualquer pacote** (01/09/2026): `encontro_irmaos`,
  `saida_uti` e `alta`. Nenhum pacote as traz; elas só entram por `adicionar_etapa`,
  quando a família vive o momento e a equipe quer registrar o trabalho. São da trilha
  ACOMPANHAMENTO (acontecem na maternidade) e vêm depois do álbum na ordem de leitura.
- **EVENTO, NEWBORN e combinações ("OUTROS")** ainda não estão no seed. Estratégia definida:
  quando um produto novo (ex: NEWBORN) ou combinação virar recorrente, cadastra-se como um
  **pacote próprio** com suas etapas — a trigger de geração lida com ele igual aos demais,
  sem mudança de modelo. Não há composição de múltiplos pacotes num caso.
- **SLA:** 48h na maioria; BIRTH e BIRTH + REELS em 24h; MASTER e MASTER + ÁLBUM em
  **10 dias úteis** (conferido com o gestor em 27/08/2026, no lugar dos 7 dias corridos
  provisórios). Dia útil não cabe num `interval`, então esses dois usam
  `pacotes.prazo_dias_uteis` e a função `somar_dias_uteis`, que pula fim de semana e as
  datas em `feriados` — tabela que nasceu VAZIA porque a lista que a operação respeita
  ainda não foi confirmada. Um pacote tem um prazo OU o outro, nunca os dois (constraint
  `pacotes_prazo_exclusivo`). O relógio começa quando a etapa de nascimento é concluída.
  Ver seção 9.

---

## 3. Invariantes — nunca viole

Estas cinco regras parecem simplificações razoáveis vistas de perto e são exatamente as que
se perde ao implementar rápido. Se uma tarefa parecer exigir quebrar alguma, **pare e
pergunte**.

### 3.1 Papel é por etapa, nunca por pessoa

Não existe usuário do tipo "fotógrafa" ou "editora". As mesmas pessoas circulam entre
funções — nos dados históricos, a mesma pessoa aparece em campo, em edição de foto e em
edição de vídeo no mesmo mês. Toda pessoa é um **operador**; a função se define pela etapa
que ela executa. Papéis de sistema (`papel_sistema`) existem apenas para permissões
administrativas (comercial, atendimento, financeiro, gestão, coordenacao).

### 3.2 Handoff nunca sobrescreve o responsável

Quando uma etapa muda de mão, grave uma linha em `handoffs` e atualize
`caso_etapas.responsavel_id`. **Nunca** faça um update silencioso do responsável sem o
registro do handoff. O histórico de quem fez o quê é o produto.

### 3.3 `eventos` é append-only

A tabela `eventos` nunca sofre UPDATE nem DELETE. Todo indicador do painel é derivado dela.
Isso garante auditabilidade e permite recalcular métricas com definições novas sem perder
histórico. Enforce por RLS e por permissão de tabela.

### 3.4 Timestamp é sempre do servidor

Nenhum timestamp operacional vem do cliente. `iniciado_em`, `concluido_em`, `ocorrido_em`,
`confirmado_em` são preenchidos por `now()` do Postgres, dentro de funções RPC ou triggers.

O cliente pode enviar uma data **planejada** (`previsao_em`, informada pelo comercial). Nunca
uma data de **ocorrência**.

Razão: a medição de produtividade só tem valor se o carimbo não puder ser manipulado do
aparelho.

### 3.5 Só existem dois caminhos terminais: encerrado e cancelado

`status_operacional = encerrado` exige `status_entrega = confirmado` **e ao menos um
entregável registrado**. Não existe encerramento por prazo nem por omissão: alguém tem que
fazer o gesto, e o gesto fica gravado em `eventos` e em `entregaveis.confirmado_por`.

**Qualquer pessoa ativa confirma a entrega** (migration `20260825014102`). A restrição a
atendimento/adm caiu quando se descobriu que quem gera os links são as fotógrafas — o
portão continua existindo, mudou quem tem a chave. `cancelar_caso` **continua** restrita a
atendimento/adm: cancelar é decisão comercial sobre o contrato, não o fim natural de um
trabalho.

`status_operacional = cancelado` exige `motivo_cancelamento` preenchido e não vazio — seja
porque o sync detectou o card cinza no Calendar (preenche um texto padrão automaticamente),
seja porque um humano cancelou manualmente (motivo digitado). Um caso cancelado nunca precisa
ter passado por entrega.

Constraint de banco (`casos_status_terminal_valido`) já aplica essa regra — não a duplique
como validação de aplicação que pode divergir da constraint.

**Regra de visibilidade do Quadro:** um dia só sai da tela quando **todos** os casos daquele
dia estão em `encerrado` OU `cancelado`. Nunca por passagem de data. Um caso atrasado mantém
o bloco do dia visível, mesmo que trave semanas.

O módulo financeiro (`despesas`, `status_financeiro`) foi removido do escopo. Não recrie essas
tabelas/colunas sem instrução explícita.

---

## 4. Transições de estado passam por RPC

Isto operacionaliza as invariantes 3.2, 3.3 e 3.4.

**O frontend nunca faz UPDATE direto em colunas de status, responsável ou timestamp.** Toda
transição chama uma função Postgres (`SECURITY DEFINER`) que, numa única transação:

1. valida a transição (estado de origem permitido, permissão do chamador);
2. aplica a mudança;
3. carimba o timestamp com `now()`;
4. insere a linha correspondente em `eventos`.

Funções RPC que EXISTEM (01/09/2026). Toda escrita de estado passa por uma delas:

```
-- ciclo de vida da etapa
iniciar_etapa(p_caso_etapa_id)                          -- inicia ou retoma
pausar_etapa(p_caso_etapa_id)
concluir_etapa(p_caso_etapa_id, p_observacao)
reabrir_etapa(p_caso_etapa_id, p_motivo)                -- desfaz conclusão ou dispensa
dispensar_etapa(p_caso_etapa_id, p_motivo)              -- "não vai acontecer"
adicionar_etapa(p_caso_id, p_tipo)                      -- etapa fora do pacote
agendar_etapa(p_caso_etapa_id, p_previsao_em)           -- hora do banho/fechamento
anotar_etapa(p_caso_etapa_id, p_observacao)             -- aviso, em qualquer status
registrar_estacao(p_caso_etapa_id, p_estacao)           -- "pc-1"

-- pessoas
atribuir_etapa(p_caso_etapa_id, p_para_pessoa_id)
transferir_etapa(p_caso_etapa_id, p_para_pessoa_id, p_motivo)   -- handoff
planejar_rendicao(p_caso_etapa_id, p_proxima_pessoa_id)

-- fluxo do vídeo horizontal do MASTER (4 fases na tela; ver seção 13)
mover_video_master(p_caso_etapa_id, p_fase)

-- caso
mover_para_uti(p_caso_id) / retornar_da_uti(p_caso_id)  -- congela o SLA
registrar_entregavel(p_caso_id, p_tipo, p_url)
confirmar_entrega(p_caso_id)                            -- encerra
cancelar_caso(p_caso_id, p_motivo)                      -- atendimento/adm
reabrir_caso(p_caso_id, p_motivo, p_etapas)             -- traz de volta um encerrado

-- só service_role (Edge Function do sync)
sync_upsert_caso(...) / sync_cancelar_caso(p_google_event_id, p_motivo)
```

**Ainda NÃO existe:** `atualizar_situacao_clinica`. `situacao_clinica` e `termo_status`
continuam por UPDATE direto de adm — ver a dívida no fim da seção 13.

RLS deve **negar** UPDATE direto do cliente nas colunas que essas funções controlam. Se a
policy permite o update direto, a invariante não existe.

**São DUAS as exceções de privilégio elevado, e as duas são Edge Functions.**

1. **`sync-calendar`** (seção 7) roda com `service_role` para criar/atualizar casos a
   partir de eventos, e para o cancelamento automático via card cinza
   (`sync_cancelar_caso`, equivalente a `cancelar_caso` mas chamado pelo próprio sync, não
   por um usuário logado). Fora dessas duas ações de origem, todo o resto do ciclo de vida
   do caso passa pelas RPCs normais, sujeitas à RLS de quem está logado — o sync nunca
   edita uma etapa, nunca faz handoff, nunca confirma entrega.

2. **`admin-pessoas`** (02/09/2026) cadastra pessoa: cria a conta no GoTrue e a linha em
   `pessoas`, vinculadas. Criar usuário exige `service_role`, e ela não pode ir ao front
   (seção 8). A função **verifica o chamador antes de tocar na chave**: com o JWT dele e
   sob RLS, confere que é pessoa ativa com `papel_sistema = 'gestao'`. Só depois instancia
   o cliente privilegiado. `verify_jwt = true` no `config.toml` é a primeira camada e
   **não basta sozinha** — a anon key é válida e é pública.

   O `service_role` recebeu `select, insert` em `pessoas` (migration `20260902210453`) e
   nada além: sem `update`, sem `delete`. Se o insert falhar, a função apaga a conta de
   auth que acabou de criar — sem isso sobraria um usuário órfão que loga e cai na tela de
   "usuário sem pessoa vinculada", e o e-mail ficaria queimado para sempre.

Nenhuma outra coisa no sistema usa `service_role`. Se uma terceira aparecer, ela precisa da
mesma estrutura: checagem do chamador ANTES da chave, e GRANT do tamanho exato do trabalho.

---

## 5. Stack e convenções

### Stack

| Camada                         | Escolha                                                               |
| ------------------------------ | --------------------------------------------------------------------- |
| Banco, auth, realtime, storage | Supabase (PostgreSQL 15+)                                             |
| Frontend                       | React 19 + TypeScript + Vite                                          |
| Dados                          | TanStack Query + `@supabase/supabase-js`                              |
| Rotas                          | React Router                                                          |
| Estilo                         | Tailwind CSS                                                          |
| PWA                            | `vite-plugin-pwa`                                                     |
| Fila offline                   | IndexedDB via `idb` — fila simples de mutações, não sync bidirecional |
| Lógica privilegiada            | Supabase Edge Functions (Deno)                                        |
| Deploy                         | Cloudflare Pages — app em `/quadro`, raiz livre para a landing        |

**Não crie um backend Node/Express neste projeto.** Supabase cobre tudo que o MVP precisa. Se
uma tarefa parecer exigir servidor próprio, pare e pergunte.

### Estrutura de diretórios

```
/supabase
  /migrations          SQL versionado, ordem cronológica
  /functions           Edge Functions
  seed.sql             dados de cadastro para dev
/src
  /app                 rotas e layout
  /features
    /quadro          hoje é praticamente o app inteiro
    /auth
    -- previstas, ainda não existem: /casos /entregaveis /painel
    -- /fila-edicao foi REMOVIDA a pedido do gestor (a view e os testes ficaram)
  /components/ui       componentes base compartilhados
  /lib                 supabase client, query client, helpers
  /types               tipos gerados do banco (supabase gen types)
/docs
  plano.md             escopo completo do projeto
/scripts
  import-planilha.ts   importação do histórico
```

Organize por **feature**, não por tipo de arquivo. Nada de pastas globais `components/`,
`hooks/`, `services/` com tudo dentro.

### Convenções de banco

- `snake_case` em tabelas e colunas, nomes em português.
- PK `id uuid default gen_random_uuid()`.
- `created_at timestamptz not null default now()` e `updated_at` com trigger em toda tabela.
- Enums como tipos Postgres nativos (`create type ... as enum`), não `text` com check.
- Toda FK com índice explícito.
- Toda tabela com RLS habilitado. Sem exceção, nem em tabelas de cadastro.
- Migrations são imutáveis depois de commitadas. Correção é uma migration nova.
- **Nunca** altere schema pelo painel web do Supabase. Sempre via migration versionada.
- **Todo objeto novo precisa de `GRANT` explícito** na migration que o cria — ver
  a seção de privilégios logo abaixo.

### Privilégios — RLS não basta, o GRANT é a segunda camada

A migration `20260822072158` zerou `anon` no schema `public` e apertou
`authenticated` para o mínimo que cada tabela precisa. As regras que ficam:

- **`anon` não tem nada.** Só `USAGE` no schema. O app não precisa dele: o login é
  GoTrue (não passa pelo PostgREST) e nenhuma query roda antes da sessão existir.
- **`authenticated` recebe só o verbo que a policy pressupõe.** Leitura pura
  (`caso_etapas`, `handoffs`, `entregaveis`, `eventos`, `quadro_casos`) leva só
  `SELECT`; cadastros levam os quatro verbos porque a policy `*_escrita_adm` é
  `FOR ALL`; `casos` leva `SELECT` mais `UPDATE` das 9 colunas de dado.
- **`TRUNCATE` não vai para ninguém.** É o único verbo de escrita que policy
  nenhuma filtra — RLS não protege contra ele.
- **`service_role` é o papel confiável** (Edge Function do sync) e não é tocado.

**Ao criar tabela, view ou RPC nova, conceda explicitamente.** Os default
privileges foram fechados justamente para o objeto não nascer aberto; o preço é
que esquecer o `GRANT` faz o app não enxergar o objeto. O erro aparece primeiro
no local, que é o comportamento desejado.

Três armadilhas, todas já verificadas na prática:

1. **Funções nascem com `EXECUTE` para `PUBLIC`.** Revogar de `anon` e
   `authenticated` não fecha nada — os dois herdam. O revoke tem que incluir
   `PUBLIC`.
2. **As policies chamam `eh_pessoa_ativa()`/`eh_adm()`/`eh_atendimento()` e rodam
   com o privilégio de quem consulta.** Sem `EXECUTE` nesses três helpers, toda
   leitura do app morre. Nunca os revogue de `authenticated`.
3. **Funções de trigger não exigem `EXECUTE`** de quem dispara o trigger.
   `set_updated_at` e `gerar_caso_etapas` ficam fechadas e os triggers funcionam.

**RPC `SECURITY DEFINER` que não valida o chamador precisa do `EXECUTE` fechado.**
É o caso de `sync_upsert_caso`, que roda sem usuário logado e por isso não pode
checar `auth.uid()` — só `service_role`. E atenção: `drop function` + `create
function` numa migration posterior **reaplica os default privileges** e pode
reabrir o acesso. Foi exatamente o que aconteceu entre as migrations
`20260821100857` e `20260821102004`, e ficou explorável em produção.

### Como testar privilégio: as duas direções precisam de guarda diferente

- **"revoguei demais"** → o pgTAP local pega. Se um `SELECT` necessário sumir, o
  teste e o app quebram na hora.
- **"o remoto tem mais do que eu pedi"** → o pgTAP local é **cego**. Rode
  `npm run seguranca`, que faz as duas coisas:
  - `npm run auditar:privilegios` — diff do dump do remoto contra
    `supabase/seguranca/privilegios-esperados.txt`. Esse arquivo **é** a política:
    linha nova num diff de PR significa acesso novo, revise como revisaria código.
  - `npm run sondar:anon` — caixa-preta com a anon key, confirma que `anon` é
    negado em toda tabela e toda RPC. Nenhuma sonda escreve.
  - `npm run auditar:storage` — nenhum bucket público no remoto, e a rota de URL
    pública não serve conteúdo sem assinatura.

Rode as duas **depois de todo `db push` que toque schema**.

### Convenções de frontend

- TypeScript estrito. Sem `any`. Tipos do banco gerados via `supabase gen types typescript`.
- TanStack Query para todo acesso a dados. Sem `useEffect` + `fetch` manual.
- Mutações que representam transição de estado chamam RPC, nunca `.update()` direto.
- Realtime via canais do Supabase no Quadro e na Fila.
- Mobile-first. O layout desktop é a adaptação, não o contrário.
- Tema escuro obrigatório — metade da operação é noturna.

---

## 6. Contexto de uso — restrições reais de campo

Quem usa este sistema está num corredor de maternidade às 3h da manhã, possivelmente de
pé, com uma mão só, em um aparelho compartilhado.

- **Concluir uma etapa em até 3 toques.** Se ficar mais lento que escrever no quadro branco,
  a equipe volta ao quadro branco e o projeto falha.
- **Seleção, não digitação.** Todo campo que puder ser botão, chip ou lista deve ser.
  Texto livre só em observação.
- **Alvos de toque grandes**, mínimo 44px, alto contraste, fonte generosa.
- **Sinal cai.** 5G existe mas centro cirúrgico e subsolo derrubam. Toda mutação de campo
  vai para a fila offline e reenvia. O usuário nunca vê erro de rede numa ação de registro.
- **Aparelho compartilhado.** Os 6 CEL CLICK trocam de mão a cada turno. Sessão precisa ser
  trocável rápido e expirar sozinha.

---

## 7. Sync do Google Calendar — intake principal (decisão revisada)

O intake original (formulário manual do comercial) virou **fallback**. A origem principal
de um caso agora é um evento na agenda única e centralizada do Google Calendar.

### Convenção observada nos dados reais do cliente

```
MÃE/BEBÊ [-] PACOTE [MATERNIDADE]
ex.: THAYANE/ALICE BIRTH+REELS GNDI
     KEVELYN/JOAQUIM - BABY REELS
     *JENNIE/MARIA LUIZA - BASIC - HSC
```

- Mãe e bebê sempre no início, separados por `/`. Alta confiança de parsing.
- Pacote em vocabulário finito, mapeável contra `pacotes`.
- Maternidade por sigla ao fim, ou embutida no nome do pacote.
- Eventos **sem `/`** no título (folgas, aniversários, sorteios, reuniões internas) não são
  casos — o parser descarta.
- Significado do `*` que antecede alguns nomes: **ainda não confirmado com o cliente**. Não
  trate esse sinal até confirmação.

### Regra de segurança do parser

**Nunca assuma pacote ou maternidade quando o parsing for ambíguo.** Um caso com pacote
errado gera checklist de etapas errado — e isso só aparece na maternidade, tarde demais. Se
o parser não conseguir mapear com certeza, crie o caso como **rascunho pendente**, visível
mas fora do fluxo operacional, até confirmação manual.

### Cancelamento via card cinza

O cliente sinaliza cancelamento colorindo o evento de cinza no Calendar. O sync detecta essa
cor e chama `sync_cancelar_caso`, preenchendo `motivo_cancelamento` com um texto padrão (ex.:
`"Cancelado via Google Calendar (card cinza)"`). Elimina o retrabalho de cancelar duas vezes.

### Cor herdada, não interpretada

`casos.cor_calendar` guarda a cor do evento como veio, sem tentar decodificar o que significa
(é organização interna do cliente — provavelmente por maternidade ou responsável). O Quadro
só herda e exibe.

### Implementação

Edge Function em cron (polling a cada poucos minutos), não webhook — webhook exigiria domínio
verificado e endpoint público, complexidade desnecessária no MVP. Roda com `service_role`
apenas para criar/atualizar/cancelar via sync; todo o resto do ciclo de vida continua nas
RPCs normais sob RLS (ver seção 4).

---

## 8. Autenticação

**Fase 0:** email + senha padrão do Supabase Auth, uma conta por pessoa.

**Fase 1:** login por PIN por pessoa, para troca rápida no aparelho compartilhado. Como o
cadastro de equipamentos foi removido do escopo, **não há vínculo aparelho↔sessão** — o PIN
valida só contra `pessoas.pin_hash`, sem `device_token`. Implementação: uma Edge Function
recebe `(pessoa_id, pin)`, valida contra `pessoas.pin_hash`, e emite sessão via Admin API.
O `service_role` key vive **apenas** dentro da Edge Function, nunca no frontend.

A sessão deve expirar sozinha (fim de turno), já que os 6 aparelhos trocam de mão — mas isso
é política de expiração de sessão, não registro de dispositivo.

---

## 9. Medição de produtividade

O cliente quer evidência objetiva para cobrar tempo de edição de vídeo. O acordo definido é
**registro aberto pelas próprias operadoras, com padrões de tempo conhecidos por todas**.
Não é vigilância silenciosa.

Implicações para a implementação:

- O tempo de ciclo sai de `concluido_em − iniciado_em`, ambos carimbados pelo servidor
  (invariante 3.4).
- **Pendência de design — fila de edição:** `concluir_etapa` (RPC genérica, item 3 da
  seção 13) permite concluir uma etapa que nunca foi iniciada — carimba `iniciado_em` no
  mesmo instante de `concluido_em`, ciclo zero. Isso é correto para o caso geral (campo
  admite registro retroativo). Mas **na fila de edição especificamente**, "iniciar" antes de
  "concluir" precisa ser obrigatório — sem essa trava, o tempo de ciclo de edição vem
  sempre zero e a métrica de produtividade da seção 9 fura por completo. Ainda não
  implementado; entra quando a fila de edição for construída (é validação de tela/fluxo,
  não da RPC genérica de conclusão).
- **SLA de entrega é a régua principal.** Cada pacote tem `prazo_entrega` (intervalo) OU
  `prazo_dias_uteis` (inteiro), nunca os dois. O
  vencimento de um caso é derivado: `concluido_em` da etapa de nascimento + `prazo_entrega`.
  Métrica de cobrança: quantas entregas estouraram o prazo (48h na maioria dos pacotes).
  Isso é mais concreto e defensável que "fulana demorou" — é o SLA que a própria empresa
  vende ao cliente.
- A fila de edição ordena por **urgência de prazo** (quanto falta pro vencimento), não por
  ordem de chegada. BIRTH sobe naturalmente por ter a janela mais curta; um caso parado há
  40h de um pacote de 48h sobe na frente de um recém-chegado. É o SLA virando ordenação
  automática — sem hardcode de "BIRTH primeiro".
- A fila de edição é visível para **toda a equipe**, não só para a gestão. O cliente observou
  que a produtividade subiu com a simples presença dos sócios — visibilidade compartilhada
  reproduz esse efeito sem clima de fiscalização.

**Ocupação de estação foi removida como métrica.** Dependia do cadastro de equipamentos
(fora do escopo) e o cliente já confirmou que não falta máquina — o gargalo é tempo de
trabalho, não fila por hardware. O tempo de ciclo e o cumprimento de SLA cobrem a cobrança.

**O sistema não calcula jornada, hora extra nem espelho de ponto.** A empresa já tem controle
de ponto digital e ele continua sendo a fonte de verdade. Atividade fora da janela de escala
gera alerta operacional (um parto estourou o turno), nunca apontamento disciplinar automático.

---

## 10. Privacidade e LGPD

Este sistema armazena **dado pessoal sensível de saúde e de menor de idade**: nome de mãe e
recém-nascido, hospital, situação clínica (UTI, indução, cesárea de emergência) e imagens de
parto.

Regras não negociáveis:

- RLS em toda tabela, sempre. Operador só enxerga casos dos quais participa ou que estão
  ativos no seu turno.
- Acesso a dados de caso gera linha em `eventos`.
- `eventos` tem FKs `on delete restrict` — um caso com eventos não pode ser deletado, só
  cancelado. Exclusão por pedido de titular (LGPD) é operação administrativa deliberada de
  anonimização, não um `delete` direto. Esse fluxo **ainda não existe** — é dívida registrada,
  não implementação pendente de tarefa imediata.
- Buckets do Storage são **privados**. Comprovantes e mídias só via signed URL de curta duração.
  Os buckets são **versionados** na migration `20260825062852` — criar bucket pelo painel web
  deixa o local sem ele e transforma "privado" numa configuração que um clique inverte sem
  rastro. `npm run auditar:storage` confere o remoto; o pgTAP falha se algum virar público.
  **Ainda não existe policy em `storage.objects`**: com RLS ligada isso nega tudo, que é o
  estado certo enquanto nada sobe arquivo. A primeira policy de upload vai fazer
  `buckets_privados.test.sql` falhar de propósito — é o gatilho para alguém ler a regra antes
  de ela entrar.
- Links de entrega (`entregaveis.url`) são credenciais de acesso à galeria da família —
  trate como segredo, não exponha em log nem em resposta de listagem pública.
- Nunca logue nome de paciente, situação clínica ou URL de entregável em console, Sentry ou
  qualquer telemetria.
- `termo_status` rastreia consentimento. Não é decorativo.

---

## 11. Fluxo de trabalho

### Git

- `main` protegida. Trabalho em branches `feat/`, `fix/`, `chore/`.
- Commits em português, imperativo: `adiciona RPC de conclusão de etapa`.
- Um PR por tarefa do roadmap. PR sem migration correspondente quando toca schema é erro.

### Ambiente local com Docker — valide antes de tocar o remoto

Este projeto tem Supabase local via Docker. O fluxo de toda migration é:

1. `supabase migration new <nome>` e escreve o SQL
2. `supabase db reset` — recria o banco local do zero e aplica todas as migrations em
   ordem (é o teste de que o schema reconstrói limpo)
3. `supabase test db` — roda os testes pgTAP contra o local
4. **só depois de tudo verde localmente**, `supabase db push` aplica no remoto (projeto
   `clickbaby`)

O remoto recebe apenas o que já passou no local. Mesmo assim, mostre o SQL/diff antes do
`db push` — a aprovação continua manual, turno a turno.

As chaves do Supabase local são fixas e públicas (iguais em qualquer máquina) — nunca vão
para `.env`, git ou qualquer lugar. O `.env` aponta para o remoto.

### Definição de pronto

Uma tarefa só está pronta quando:

1. `supabase db reset` aplica todas as migrations sem erro no local.
2. `supabase test db` passa (testes pgTAP).
3. Tipos regenerados e commitados.
4. RLS testada com pelo menos dois papéis diferentes — inclusive o caso negativo.
5. Nenhuma transição de estado feita por `.update()` direto.
6. `tsc --noEmit` e lint passam.
7. Testado no viewport mobile, não só no desktop.

### Testes

Priorize onde o custo do erro é alto, não cobertura ampla:

- Funções RPC de transição de estado (pgTAP ou testes de integração).
- Políticas RLS, com casos negativos explícitos.
- Geração automática de etapas a partir do pacote.
- Script de importação da planilha.

---

## 12. Comportamento esperado do agente

**Faça:**

- Leia `docs/plano.md` antes de tarefas de modelagem ou de tela.
- Pergunte quando uma tarefa colidir com uma invariante da seção 3.
- Proponha a migration/diff antes de aplicar com `db push` — sempre mostre antes de agir.
- Mantenha PRs pequenos e revisáveis.

**Não faça:**

- Não invente pacotes, maternidades ou nomes de pessoas. Esses dados vêm do cliente
  (`supabase/seed.sql`).
- Não crie backend Node/Express.
- Não use `localStorage` para dado de domínio — só preferência de UI.
- Não instale biblioteca nova sem justificar. A stack da seção 5 é deliberada.
- Não altere schema pelo painel web do Supabase.
- Não recrie `despesas`, `tipo_despesa` ou `status_financeiro` sem instrução explícita —
  módulo financeiro está fora do escopo do MVP.
- Não hardcode os valores de `prazo_entrega` (SLA) nem a regra "BIRTH primeiro" — a
  ordenação da fila é por urgência de prazo derivada do pacote, o valor vem do seed.
- Não crie tela de registro de ponto ou cálculo de jornada — está explicitamente fora de escopo.
- Não deixe o sync do Calendar assumir pacote/maternidade ambíguos — vira rascunho pendente.

---

## 13. Estado atual

**Fase 1 EM PRODUÇÃO.** `clickbaby.com.br/quadro` está no ar e a operação usa. Números
reais do remoto em 01/09/2026: 180 casos, 1.139 eventos, 4 rascunhos pendentes, 3 pessoas
cadastradas. 50 migrations aplicadas, 467 testes pgTAP, 107 testes Deno.

O schema está completo e fechado: RLS com policies por papel em toda tabela, GRANTs
mínimos auditados (`npm run seguranca`), e toda transição de estado por RPC — o
`authenticated` não tem UPDATE em `caso_etapas` para coluna nenhuma.

### O que já funciona

- **Sync do Calendar automático**, pg_cron a cada 1 minuto (o intake principal da seção 7).
  Cria, atualiza, e cancela por card cinza OU por deleção do evento. Evento de dia inteiro
  (sem hora) não vira caso; um caso JÁ conhecido acompanha o dia mesmo sem hora.
- **Quadro** em blocos por dia, de hoje até AMANHÃ (não mais que isso). Busca, alerta de
  horário chegando, realtime, auto-refresh alinhado ao cron.
- **Etapas**: iniciar/pausar/concluir, handoff, rendição, aviso, estação (`pc-1`),
  **dispensar** (não vai acontecer) e **acrescentar** fora do pacote — inclusive
  `encontro_irmaos`, `saida_uti` e `alta`, que nenhum pacote traz de fábrica.
- **Seções laterais**: REELS, MASTER e UTI. O **vídeo horizontal do MASTER** tem fluxo
  próprio de 4 fases (Editando · Alterações · Pronto para entrega · Enviado/finalizado),
  trazido do Trello da equipe. O vídeo NÃO se opera pelo card — só pela seção; foto e o
  resto continuam no card.
- **Encerramento** com checklist de conferência (fotos, reels, e os dois links de cadeado
  que só o BIRTH tem) e ao menos um entregável registrado.
- **Rascunho descartado** some do Quadro inteiro, sem poluir Concluídos.
- **Modo TV** (02/09/2026): botão na barra da gestão que reparte o Quadro em duas
  colunas — atraso à esquerda, turno à direita, nenhum dia atravessando — com cartão
  compacto (uma etapa por trilha). Só a partir de 1536px; a escolha fica no
  `localStorage` do aparelho.
- **Equipe** (`/quadro/equipe`), só para `gestao`. Mostra o cadastro, quem tem acesso,
  trabalho em mãos e concluído em 30 dias — e **cadastra pessoa**, pela Edge Function
  `admin-pessoas` (ver seção 4). Não mostra o e-mail de login: ele vive em `auth.users`,
  fora do alcance do cliente.
- **Conta** (`/quadro/conta`), de qualquer pessoa logada, no menu do nome. Hoje faz uma
  coisa só e ela é a que importa: **trocar a senha**. Exige a senha atual, o que o Supabase
  não exige — a exigência é nossa, porque os seis CEL CLICK trocam de mão com a sessão
  aberta e sem ela qualquer um trancaria o colega para fora no meio do plantão.
- **14 pessoas cadastradas** (02/09/2026): 3 gestão (André, Sarah, Jeferson) e 11
  `operador` — as fotógrafas e o ADM. O ADM entra como operador **por ora**, a pedido do
  gestor; quando ganhar poderes próprios, muda `papel_sistema`, não o modelo.

### Dívidas abertas, em ordem de dor

1. **Editar o próprio perfil, e a senha inicial que ninguém é obrigado a trocar.**
   A tela de Conta troca a senha, e só. Faltam três coisas, cada uma com um motivo
   diferente:
   - **Nome e apelido** precisam de uma RPC `atualizar_meu_perfil`. NÃO dá para resolver
     com uma policy de "edita a própria linha": RLS não filtra coluna — quem filtra é o
     GRANT, que é por papel e não por policy —, então a mesma porta que deixaria alguém
     corrigir o próprio nome a deixaria mudar o próprio `papel_sistema` para `gestao`.
   - **Foto** precisa de coluna em `pessoas` e de policy em `storage.objects`, que hoje
     nega tudo (dívida #5). A primeira policy de upload derruba de propósito o
     `buckets_privados.test.sql`.
   - **Forçar a troca no primeiro acesso** não existe no GoTrue; forjar pede uma coluna e
     uma guarda de rota. Hoje a troca é acordo, não trava — e as onze contas nasceram com
     a mesma senha, que circulou no grupo.
2. **E-mail de login não aparece na Equipe.** Ele vive em `auth.users`, fora do alcance do
   cliente. Exibi-lo pede uma view `security definer` restrita a `eh_adm()`, com GRANT e
   teste próprios. Derivar do nome funcionaria para as catorze contas de hoje e mentiria
   sem avisar no dia em que um endereço fugisse do padrão.
3. **Produtividade ainda não tem tela.** O dado está em `eventos` desde o primeiro dia; a
   Equipe só mostra a agregação simples de `caso_etapas` (em mãos agora, concluídas em 30
   dias), feita no cliente.
4. **`atualizar_situacao_clinica` e `termo_status` sem RPC.** Continuam por UPDATE direto
   de adm. Quando ganharem RPC, revogar o privilégio de coluna — não basta parar de usar.
5. **`npm run auditar:privilegios` não cobre `service_role`.** Existe divergência conhecida
   (SELECT em `casos` no remoto e não no local). Não é exploração, mas é a mesma classe de
   divergência que **já mordeu três vezes** — a terceira em 02/09/2026, quando
   `admin-pessoas` funcionou no remoto de primeira e falhou no local com
   `permission denied for table pessoas`. A migration `20260902210453` declarou o grant que
   faltava e o `grant_service_role_pessoas.test.sql` trava o piso e o teto, mas isso resolve
   UMA linha: enquanto o auditor não olhar `service_role`, a próxima divergência aparece do
   mesmo jeito — por acaso, no meio de outra tarefa.
6. **Sem workflow de CI para `db push`.** O `db push` é manual e já ficou para trás de um
   merge três vezes, chegando ao gestor como "está bugado". O gestor já aprovou construir
   o workflow; falta fazer.
7. **`storage.objects` sem policy** — com RLS ligada isso nega tudo, que é o estado certo
   enquanto nada sobe arquivo. A primeira policy de upload vai fazer
   `buckets_privados.test.sql` falhar de propósito. Ver issues #20 e #21.
8. **Fila de edição: a trava "iniciar antes de concluir" não existe** (seção 9). Sem ela o
   tempo de ciclo de edição vem zero. A tela da Fila foi removida a pedido do gestor; a
   view e os testes ficaram. Entra quando a fila voltar.
9. **`feriados` está vazia** — a lista que a operação respeita nunca foi confirmada. Afeta
   `somar_dias_uteis`, e portanto o prazo dos dois MASTER.
10. **Raiz do domínio dá 404.** `clickbaby.com.br/` está reservada para a landing da
   empresa, que não existe. O app vive em `/quadro`.
11. **Observação do Calendar não é importada.** O `description` do evento do Google não vem
   para o caso. Se vier, tem que ser campo PRÓPRIO (`observacao_calendar`), separado da
   observação interna — senão o sync sobrescreve o que a equipe escreveu.
12. **Parser: NEWBORN e combinações "OUTROS" não são pacotes.** Os 4 rascunhos pendentes
    que sobraram esperam decisão do dono sobre cadastro e padronização de título, não
    código. Não melhore o parser por heurística — é o "assumir quando ambíguo" que a
    seção 7 proíbe.

### Fora do escopo, mapeado

Importação da planilha histórica (pós-MVP), login por PIN (seção 8, fase 1), cláusula LGPD
no contrato (controlador × operador), conta de teste no remoto para a sonda cobrir
`authenticated`.

**Dívida fechada — UPDATE direto de `casos`:** a policy `casos_update_atendimento_confirma_entrega`
foi derrubada (atendimento age só via RPC agora). `casos_update_adm` continua existindo, mas
`status_operacional`, `status_entrega` e `motivo_cancelamento` perderam o privilégio de
UPDATE por coluna para `authenticated` — nem adm consegue mudar esses três por UPDATE direto
mais, só pelas RPCs de transição. Ver migration `20260821065740`.
