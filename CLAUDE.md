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

| Termo                | Significado                                                                              |
| -------------------- | ---------------------------------------------------------------------------------------- |
| **Caso**             | Um atendimento completo a uma família, do contrato à entrega dos links                   |
| **Etapa**            | Unidade de trabalho dentro de um caso (entrada, nascimento, banho, fechamento, edições)  |
| **Pacote**           | Produto vendido. Define **quais etapas existem** naquele caso                            |
| **Maternidade**      | Hospital onde o caso acontece                                                            |
| **Handoff**          | Passagem de uma etapa de uma pessoa para outra, tipicamente na troca de turno            |
| **Situação clínica** | Estado da mãe/bebê: aguardando, internada, indução, trabalho de parto, nasceu, UTI, alta |
| **Entregável**       | Link final para a família: Google Photos, WeTransfer, cadeado, reels, álbum              |
| **Fila de edição**   | Etapas de edição pendentes, distribuídas pela coordenação                                |
| **Padrão de tempo**  | Tempo de referência esperado para concluir um tipo de etapa                              |
| **CEL CLICK**        | Celulares corporativos usados para capturar vídeo — 6 aparelhos, compartilhados          |
| **Estação**          | PC de edição. 4 de foto, 2 de vídeo                                                      |

**Pessoas reais do cliente que aparecem no domínio:** Sarah distribui a fila de edição.
Morgana (atendimento) confirma a entrega dos links e encerra o caso. Não hardcode esses
nomes — são papéis atribuídos a registros em `pessoas`.

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

### 3.5 Os dois encerramentos são independentes

Um caso pode estar entregue à família e pendente no financeiro, ou o inverso. `status_entrega`
e `status_financeiro` são campos separados, com transições separadas. **Nunca** unifique em um
único status. `status_operacional = encerrado` depende apenas de `status_entrega = confirmado`.

---

## 4. Transições de estado passam por RPC

Isto operacionaliza as invariantes 3.2, 3.3 e 3.4.

**O frontend nunca faz UPDATE direto em colunas de status, responsável ou timestamp.** Toda
transição chama uma função Postgres (`SECURITY DEFINER`) que, numa única transação:

1. valida a transição (estado de origem permitido, permissão do chamador);
2. aplica a mudança;
3. carimba o timestamp com `now()`;
4. insere a linha correspondente em `eventos`.

Funções RPC previstas:

```
iniciar_etapa(p_caso_etapa_id, p_estacao_id)
concluir_etapa(p_caso_etapa_id, p_observacao)
atribuir_etapa(p_caso_etapa_id, p_responsavel_id)
transferir_etapa(p_caso_etapa_id, p_para_pessoa_id, p_motivo)   -- handoff
atualizar_situacao_clinica(p_caso_id, p_situacao)
registrar_entregavel(p_caso_id, p_tipo, p_url)
confirmar_entrega(p_caso_id)
lancar_despesa(p_caso_id, p_tipo, p_valor, p_comprovante_path)
conferir_despesas(p_caso_id)
```

RLS deve **negar** UPDATE direto do cliente nas colunas que essas funções controlam. Se a
policy permite o update direto, a invariante não existe.

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
| Deploy                         | Vercel                                                                |

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
    /quadro
    /casos
    /fila-edicao
    /entregaveis
    /despesas
    /painel
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

## 7. Autenticação

**Fase 0:** email + senha padrão do Supabase Auth, uma conta por pessoa.

**Fase 1:** login por PIN em dispositivo registrado. Implementação: uma Edge Function recebe
`(device_token, pessoa_id, pin)`, valida contra `equipamentos.device_token` e `pessoas.pin_hash`,
e emite sessão via Admin API. O `service_role` key vive **apenas** dentro da Edge Function,
nunca no frontend.

O `device_token` do aparelho também auto-preenche `caso_etapas.equipamento_captura_id` —
um campo a menos na tela e um dado a mais confiável.

---

## 8. Medição de produtividade

O cliente quer evidência objetiva para cobrar tempo de edição de vídeo. O acordo definido é
**registro aberto pelas próprias operadoras, com padrões de tempo conhecidos por todas**.
Não é vigilância silenciosa.

Implicações para a implementação:

- O tempo de ciclo sai de `concluido_em − iniciado_em`, ambos carimbados pelo servidor
  (invariante 3.4).
- `padroes_tempo` guarda o tempo esperado por tipo de etapa e pacote. É a régua que torna a
  cobrança possível — sem ela, a conversa termina em "esse vídeo era mais difícil".
- Os números do padrão **não são chutados no código**. Vêm do cliente e são calibrados com
  30–60 dias de dados reais. Deixe a tabela versionada por `vigente_desde`.
- A fila de edição é visível para **toda a equipe**, não só para a gestão. O cliente observou
  que a produtividade subiu com a simples presença dos sócios — visibilidade compartilhada
  reproduz esse efeito sem clima de fiscalização.
- Ocupação de estação é indicador de painel: prova que a máquina estava disponível quando a
  peça ficou parada.

**O sistema não calcula jornada, hora extra nem espelho de ponto.** A empresa já tem controle
de ponto digital e ele continua sendo a fonte de verdade. Atividade fora da janela de escala
gera alerta operacional (um parto estourou o turno), nunca apontamento disciplinar automático.

---

## 9. Privacidade e LGPD

Este sistema armazena **dado pessoal sensível de saúde e de menor de idade**: nome de mãe e
recém-nascido, hospital, situação clínica (UTI, indução, cesárea de emergência) e imagens de
parto.

Regras não negociáveis:

- RLS em toda tabela, sempre. Operador só enxerga casos dos quais participa ou que estão
  ativos no seu turno. Despesa é visível apenas para quem lançou, coordenação e financeiro.
- Acesso a dados de caso gera linha em `eventos`.
- Buckets do Storage são **privados**. Comprovantes e mídias só via signed URL de curta duração.
- Links de entrega (`entregaveis.url`) são credenciais de acesso à galeria da família —
  trate como segredo, não exponha em log nem em resposta de listagem pública.
- Nunca logue nome de paciente, situação clínica ou URL de entregável em console, Sentry ou
  qualquer telemetria.
- `termo_status` rastreia consentimento. Não é decorativo.

---

## 10. Fluxo de trabalho

### Git

- `main` protegida. Trabalho em branches `feat/`, `fix/`, `chore/`.
- Commits em português, imperativo: `adiciona RPC de conclusão de etapa`.
- Um PR por tarefa do roadmap. PR sem migration correspondente quando toca schema é erro.

### Definição de pronto

Uma tarefa só está pronta quando:

1. Migration aplica limpo em banco novo (`supabase db reset` funciona do zero).
2. Tipos regenerados e commitados.
3. RLS testada com pelo menos dois papéis diferentes — inclusive o caso negativo.
4. Nenhuma transição de estado feita por `.update()` direto.
5. `tsc --noEmit` e lint passam.
6. Testado no viewport mobile, não só no desktop.

### Testes

Priorize onde o custo do erro é alto, não cobertura ampla:

- Funções RPC de transição de estado (pgTAP ou testes de integração).
- Políticas RLS, com casos negativos explícitos.
- Geração automática de etapas a partir do pacote.
- Script de importação da planilha.

---

## 11. Comportamento esperado do agente

**Faça:**

- Leia `docs/plano.md` antes de tarefas de modelagem ou de tela.
- Pergunte quando uma tarefa colidir com uma invariante da seção 3.
- Proponha a migration antes de escrever o código que a consome.
- Mantenha PRs pequenos e revisáveis.

**Não faça:**

- Não invente pacotes, maternidades ou nomes de pessoas. Esses dados vêm do cliente
  (`supabase/seed.sql`).
- Não crie backend Node/Express.
- Não use `localStorage` para dado de domínio — só preferência de UI.
- Não instale biblioteca nova sem justificar. A stack da seção 5 é deliberada.
- Não altere schema pelo painel web do Supabase.
- Não simplifique os dois status de encerramento em um só.
- Não hardcode números de padrão de tempo.
- Não crie tela de registro de ponto ou cálculo de jornada — está explicitamente fora de escopo.

---

## 12. Estado atual

**Fase 0 — fundação.** Nada implementado ainda.

Ordem de execução:

1. Schema completo como migrations, com enums e constraints
2. Trigger de geração automática de `caso_etapas` a partir de `pacote_etapas`
3. Políticas RLS por papel
4. Funções RPC de transição (seção 4)
5. Seed de cadastros com dados reais do cliente
6. Script de importação da planilha histórica
7. Frontend — Quadro primeiro

O Quadro é a tela da demo. É a única que precisa ser excelente na fase 1.
