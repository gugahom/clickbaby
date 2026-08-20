# Sistema de Gestão Operacional — Fotografia de Parto

Documento de escopo, arquitetura e roadmap do MVP.
Versão 1.0 — agosto/2026

---

## 1. Contexto

Empresa de fotografia de parto atuante em maternidades de Curitiba. Operação 24/7,
volume de ~135 atendimentos/mês (1.084 registrados entre janeiro e agosto de 2026).

O controle atual é feito em dois artefatos desconectados:

- **Quadro branco físico** — estado ao vivo dos casos em andamento: família, pacote,
  maternidade, situação clínica e quem está atuando. Atualizado à mão pelas próprias
  fotógrafas.
- **Planilha Excel mensal** — registro pós-fato de tudo que aconteceu: responsáveis por
  etapa, equipamento usado, links de entrega, despesas.

O quadro é operacional e vivo. A planilha é arquivo morto. Alguém transcreve um no outro
manualmente.

### Objetivo do sistema

Unificar os dois artefatos em um único objeto — o **Caso** — em que o estado ao vivo e o
registro histórico são a mesma coisa, e o registro se preenche como consequência do
trabalho, não como tarefa adicional.

---

## 2. Diagnóstico dos dados atuais

Análise da planilha `2026 - Atendimento` (jan–ago/2026, 1.084 registros).

### Volume e custo

| Mês           | Atendimentos | Despesa       | Média/atend. |
| ------------- | ------------ | ------------- | ------------ |
| JAN           | 130          | R$ 3.083      | R$ 23,72     |
| FEV           | 122          | R$ 2.851      | R$ 23,37     |
| MAR           | 147          | R$ 3.412      | R$ 23,21     |
| ABR           | 128          | R$ 2.590      | R$ 20,24     |
| MAI           | 173          | R$ 3.614      | R$ 20,89     |
| JUN           | 150          | R$ 2.281      | R$ 15,21     |
| JUL           | 161          | R$ 2.649      | R$ 16,45     |
| AGO (parcial) | 73           | R$ 1.428      | R$ 19,56     |
| **Total**     | **1.084**    | **R$ 21.909** | **R$ 20,21** |

### Distribuições

**Maternidades:** GNDI (460), HSC (330), HNSG (154), HNSF (66), CWB (58), demais (16).

**Pacotes (17 grafias, ~8 produtos reais):** BABY REELS (237), BIRTH+REELS (227),
STANDARD+REELS (159), BIRTH+REELS HSC (150), BASIC+REELS (95), MASTER (93), EVENTO (72).

**Cobertura de etapas** — evidência de que o pacote define o escopo:

| Etapa        | Casos com registro |
| ------------ | ------------------ |
| Nascimento   | 998                |
| Edição foto  | 879                |
| Edição vídeo | 827                |
| Entrada      | 591                |
| Fechamento   | 480                |
| Banho        | 436                |

### Nota sobre estações de edição

A empresa tem 4 estações de edição de foto e 2 de vídeo. A planilha mostra as duas máquinas
de vídeo usadas de forma quase idêntica (`PC VÍDEO` em 422 casos, `PC - 6` em 419), o que à
primeira vista sugeria gargalo de hardware.

**O cliente confirmou que não é o caso:** as máquinas estão disponíveis, o atraso é tempo de
trabalho, não fila por equipamento. Por isso a métrica de ocupação de estação foi descartada
e o cadastro de equipamentos saiu do escopo. A cobrança de produtividade se apoia em tempo de
ciclo por etapa e cumprimento de SLA (seção 6), não em ocupação de máquina.

### Problemas estruturais da planilha

1. A estrutura de colunas muda de mês para mês — consolidar o ano é inviável.
2. Sem cadastro de pessoas: existem `Laura`, `Laura :)`, `ingrid`, `carol`, `Amanda` e
   `Amandinha` como entradas distintas.
3. Sem cadastro de pacotes: `BASIC REELS` e `BASIC+REELS` são o mesmo produto.
4. **Sem hora, apenas data.** Impossibilita qualquer medição de tempo de ciclo — que é
   justamente a dor principal do cliente.
5. Sem status ao vivo. O estado real mora no quadro branco.
6. Sem receita. Só despesa. Não há margem por caso, pacote ou maternidade.
7. Campos de controle ambíguos: mesma coluna com `True`, `False`, `revisado`, `ok` e texto
   livre.

---

## 3. Fluxo operacional

### Entrada do caso — via Google Calendar (decisão revisada)

```
Comercial fecha contrato (WhatsApp)
   → cria evento na agenda centralizada do Google Calendar
      → sync automático (Edge Function) lê o evento e cria/atualiza o Caso
```

O comercial já registra cada atendimento como evento numa agenda única, compartilhada por
toda a equipe, seguindo uma convenção consistente e observada nos dados reais:

```
MÃE/BEBÊ [-] PACOTE [MATERNIDADE]
ex.: THAYANE/ALICE BIRTH+REELS GNDI
     KEVELYN/JOAQUIM - BABY REELS
     *JENNIE/MARIA LUIZA - BASIC - HSC
```

- **Mãe/bebê**, separados por `/`, sempre no início — alta confiança de parsing.
- **Pacote**, vocabulário finito e já mapeado contra a lista canônica.
- **Maternidade**, sigla ao fim ou embutida no nome do pacote.
- **Cor do evento** é organização interna do cliente (provavelmente por maternidade ou
  responsável). O sistema **não interpreta** a cor — só a herda e exibe no card
  (`casos.cor_calendar`), como decoração.
- **Cancelamento é sinalizado por um card cinza** no Calendar. O sync detecta essa cor e
  marca o caso como `cancelado` automaticamente, sem exigir ação humana no sistema —
  elimina o retrabalho de cancelar duas vezes.
- Eventos sem `/` no título (folgas, aniversários, sorteios, reuniões internas) são
  **descartados pelo parser** — não geram caso.
- O significado do `*` que antecede alguns nomes ainda não está confirmado com o cliente —
  pendência antes de o sync tratar esse sinal.

**Casos que o parser não consegue mapear com certeza** (pacote ou maternidade ambíguos)
entram como **rascunho pendente de revisão**, visíveis no sistema mas fora do fluxo
operacional até alguém confirmar manualmente. Nunca se assume um pacote quando há dúvida —
pacote errado gera checklist de etapas errado, e isso só aparece na maternidade, tarde
demais.

**Sync cria e atualiza; RPCs normais alteram.** O sync roda com privilégio de sistema
apenas para criar/atualizar o caso a partir do evento e para o cancelamento automático via
card cinza. Toda transição operacional depois disso — iniciar etapa, concluir, handoff,
confirmar entrega — passa pelas RPCs normais, sujeitas à RLS de quem está logado. Nenhum
humano edita o caso "como se fosse o calendário".

O formulário manual de criação de caso (tela D, seção 7) permanece como _fallback_ até o
sync provar confiabilidade em produção — os dois caminhos coexistem no início.

### Ciclo de vida

```
Sync cria Caso → Campo → Edição → Entrega confirmada → Encerrado
                                                       ↘
                                          (cancelamento, a qualquer momento) → Cancelado
```

O módulo financeiro (despesas, conferência ADM) **saiu do escopo do MVP** — ver seção 5.
O ciclo de vida do caso tem hoje um único eixo de estado terminal.

### Definição de pronto — dois caminhos terminais

**Caminho feliz (regra confirmada com o cliente):** a missão termina quando a Morgana
(atendimento) disponibiliza todos os links de entrega e confirma — só nesse momento
`status_entrega = confirmado`, e só então o caso pode ir para `status_operacional =
encerrado`. Não existe encerramento por prazo ou por omissão; sempre por confirmação
explícita de que os links existem.

**Cancelamento:** um caso pode ser cancelado a qualquer momento, por qualquer motivo
(indução falha, desistência da família, etc.), sem nunca ter passado por entrega. Nesse
caso, `status_operacional = cancelado` exige `motivo_cancelamento` preenchido — preenchido
automaticamente pelo sync com um texto padrão quando vier do card cinza do Calendar, ou
digitado por um humano se cancelado manualmente no sistema.

**Regra de visibilidade do Quadro:** um caso só sai da tela quando está em **qualquer** dos
dois estados terminais — `encerrado` ou `cancelado`. Nunca por passagem de data. Um caso
atrasado (comum em parto — nascimento depois do previsto) permanece visível até ser
resolvido, mesmo que isso trave dias além do previsto.

### Etapas de campo (por caso, conforme pacote)

Cada etapa registra: responsável, equipamento de captura, cartão, quem baixou, quem subiu.

- **Entrada** — chegada da família à maternidade
- **Nascimento + cuidados** — o parto
- **Banho** — primeiro banho do bebê
- **Fechamento** — sessão final antes da alta

### Etapas de pós-produção

- **Edição de foto** — 4 estações
- **Edição de vídeo** — 2 estações
- **Reels** — peça curta para redes

A fila de edição é distribuída pela **Sarah**, que define o que cada pessoa faz.

### Armazenamento

Arquivos ficam em um **PC servidor local**. As demais estações acessam por rede. Não há
Drive compartilhado para arquivos de trabalho — apenas os links finais de entrega
(Google Photos, WeTransfer) são externos.

---

## 4. Personas e permissões

| Persona             | Quem                    | Responsabilidade                 | Acesso                                   |
| ------------------- | ----------------------- | -------------------------------- | ---------------------------------------- |
| Comercial           | time de vendas          | cria o caso, fecha contrato      | criar caso, ler próprios casos           |
| Operador            | ~14 fotógrafas/editoras | executa etapas de campo e edição | quadro, casos, registrar etapa, despesas |
| Coordenação de fila | Sarah                   | distribui a fila de edição       | tudo de operador + atribuir etapas       |
| Atendimento         | Morgana                 | confirma entrega dos links       | entregáveis, confirmar entrega           |
| Administrativo      | ADM/financeiro          | confere despesas                 | despesas, conferência, exportação        |
| Gestão              | sócios                  | leitura de indicadores           | painéis e relatórios                     |

**Papel não é cargo.** Os dados mostram que as mesmas pessoas circulam entre funções: Carol
aparece 71 vezes na entrada, 60 no nascimento e 116 na edição de vídeo; André é
majoritariamente editor (174 edições) mas também vai a campo. Modelar tipos de usuário
fixos ("fotógrafa", "editora") é erro — o papel se define **por etapa**, não por pessoa.

---

## 5. Modelo de dados

Convenção: PostgreSQL (Supabase), snake_case, `id` UUID, `created_at`/`updated_at` em todas
as tabelas.

### Cadastros

```
pessoas
  id, nome, apelidos text[], ativo bool,
  auth_user_id, pin_hash, papel_sistema enum

maternidades
  id, nome, sigla, ativo bool

pacotes
  id, nome, slug, ativo bool,
  prazo_entrega interval null              -- SLA; vencimento é derivado, não armazenado

pacote_etapas                        -- define o escopo de cada pacote (ver tabela canônica)
  id, pacote_id, etapa_tipo, obrigatoria bool, ordem int
```

**Equipamentos fora do escopo.** A tabela `equipamentos`, o enum `tipo_equipamento` e as
colunas `equipamento_captura_id`/`cartao_id`/`estacao_id` de `caso_etapas` foram removidos —
eram controle da planilha, não do sistema. `eventos.device_id` permanece como identificador
opaco (sem FK), útil como auditoria de qual aparelho emitiu o evento.

### Núcleo operacional

```
casos
  id, mae_nome, bebe_nome,                      -- identificador principal na UI
  pacote_id, maternidade_id,
  previsao_em timestamptz,
  google_calendar_event_id null,
  cor_calendar text null,                        -- herdada do evento, sem interpretação
  situacao_clinica enum(aguardando, internada, inducao,
                        trabalho_parto, nasceu, uti, alta),
  status_operacional enum(agendado, em_atendimento, em_edicao,
                          aguardando_entrega, encerrado, cancelado),
  status_entrega enum(pendente, links_prontos, confirmado),
  motivo_cancelamento text null,                 -- obrigatório quando cancelado
  termo_status enum(assinado, pendente, sem_contrato, nao_aplicavel),
  observacao text,
  criado_por, created_at

-- constraint casos_status_terminal_valido:
--   encerrado  → status_entrega deve ser 'confirmado'
--   cancelado  → motivo_cancelamento deve ser not null (e não vazio)
--   qualquer outro status_operacional → sem exigência

caso_etapas
  id, caso_id,
  tipo enum(entrada, nascimento, banho, fechamento,
            edicao_foto, edicao_video, reels),
  status enum(pendente, atribuida, em_andamento, concluida, dispensada),
  responsavel_id null,
  atribuido_por null, atribuido_em null,       -- Sarah distribuindo a fila
  iniciado_em null, concluido_em null,
  baixou_por null, subiu_por null,
  observacao text

handoffs
  id, caso_etapa_id, de_pessoa_id, para_pessoa_id, motivo, ocorrido_em
```

**Handoff é operação de primeira classe, não edição de campo.** Quando uma fotógrafa passa
o caso para a colega (troca de turno com parto em andamento), o sistema grava duas linhas,
não sobrescreve o responsável. A planilha atual já reflete isso implicitamente: é comum a
mesma linha ter pessoas diferentes na entrada, no nascimento e no fechamento.

### Entrega

```
entregaveis
  id, caso_id,
  tipo enum(google_photos, wetransfer, cadeado, reels, album),
  url, criado_por, criado_em,
  confirmado_por null, confirmado_em null      -- gesto da Morgana
```

**Módulo financeiro fora do escopo do MVP.** A tabela `despesas`, o enum `tipo_despesa` e a
coluna `status_financeiro` de `casos` foram removidos do schema aplicado — o cliente não
precisa desse controle agora. Se voltar ao escopo depois, entra como migration nova, não
como reativação de coluna órfã.

### Escala e medição

```
escalas
  id, pessoa_id, data, turno enum(diurno, noturno, comercial),
  inicio timestamptz, fim timestamptz

eventos                                -- log append-only, base de todas as métricas
  id, caso_id null, caso_etapa_id null, pessoa_id,
  tipo, payload jsonb, ocorrido_em, device_id null
```

A tabela `eventos` é append-only e nunca sofre update. Todo indicador do painel é derivado
dela — o que garante auditabilidade e permite recalcular métricas com definições novas sem
perder histórico.

### Regras de negócio essenciais

1. **Criar um caso gera automaticamente suas `caso_etapas`** a partir de `pacote_etapas`.
   Nenhuma etapa é criada à mão.
2. **Concluir etapa exige responsável.** (O equipamento de captura saiu do escopo.)
3. **Um caso só vai para `encerrado`** quando `status_entrega = confirmado`. Um caso vai
   para `cancelado` a qualquer momento, exigindo `motivo_cancelamento` preenchido. Não há
   caminho terminal além desses dois.
4. **A fila de edição ordena por urgência de SLA.** O vencimento é `concluido_em` da etapa
   de nascimento + `prazo_entrega` do pacote. BIRTH sobe por ter a janela mais curta.
5. **Toda transição de status grava em `eventos`,** sempre com timestamp de servidor,
   nunca do cliente.

---

## 6. Medição de produtividade

O cliente quer evidência objetiva para cobrar tempo de edição de vídeo. Definição acordada:
**registro aberto pelas próprias operadoras, com padrões conhecidos e timestamp confiável** —
não vigilância silenciosa.

### Como funciona

1. **A fila é um objeto real.** Toda etapa de edição pendente entra numa fila. Sarah atribui,
   a operadora assume ("iniciar"), edita, conclui.
2. **Timestamp de servidor.** O tempo de ciclo sai da diferença entre `iniciado_em` e
   `concluido_em`, ambos gravados pelo backend.
3. **SLA como régua.** Cada pacote tem `prazo_entrega` (48h na maioria, maior no MASTER). O
   vencimento é derivado do `concluido_em` da etapa de nascimento. A cobrança se apoia em
   "entregou dentro do prazo que a empresa vende?" — mais concreto e defensável que "demorou".
4. **A fila ordena por urgência de prazo**, não por chegada. BIRTH sobe por ter a janela mais
   curta; um caso parado há 40h de um pacote de 48h passa na frente de um recém-chegado.

### Indicadores

| Indicador                | Definição                                                       |
| ------------------------ | --------------------------------------------------------------- |
| Tempo de ciclo por etapa | `concluido_em − iniciado_em`                                    |
| Cumprimento de SLA       | entregas dentro do `prazo_entrega` ÷ total                      |
| Estouros de prazo        | casos que passaram do vencimento (nascimento + prazo do pacote) |
| Vazão por turno          | etapas concluídas ÷ turno                                       |
| Fila de edição           | itens pendentes e idade do mais antigo                          |
| Tempo de espera na fila  | entrada na fila → início da edição                              |

O cumprimento de SLA é o indicador de cobrança central: é o prazo de 48h que a própria
empresa vende ao cliente, então cobrar por ele é objetivo e defensável.

### Fila visível como mecanismo

O cliente observou que a produtividade subiu muito quando os sócios estavam presentes —
efeito de visibilidade puro, sem nenhuma punição envolvida.

Recomendação: expor a fila para **toda a equipe**, não só para a gestão. Uma tela mostrando
"7 vídeos pendentes, o mais antigo há 14h" reproduz o efeito da presença sem gerar clima de
fiscalização, e é muito mais fácil de implantar politicamente.

### Limites deliberados

- O sistema **não** calcula jornada, hora extra ou espelho de ponto. A empresa já tem
  controle de ponto digital e ele continua sendo a fonte de verdade.
- Divergência entre atividade registrada e janela de escala vira **alerta operacional**
  (um parto estourou o turno), nunca apontamento disciplinar automático.
- A métrica de referência é **caso e peça entregue**, não hora trabalhada.

---

## 7. Telas do MVP

**A. Quadro** — substitui o vidro. **Blocos por data, não kanban por status** (decisão
revisada com o cliente): cada dia é um bloco horizontal/vertical, com os casos daquele dia
listados dentro. A pergunta que a tela responde é "o que temos hoje" e depois "o que temos
nos próximos dias" — não "em que status está cada coisa".

- Casos identificados por **mãe + bebê** como elemento visual principal (`Mariana Costa +
Helena`). O número interno do caso é secundário, nunca a etiqueta do card.
- Card herda a **cor do evento do Calendar** (`cor_calendar`), sem tentar interpretá-la.
- **Um dia só sai do Quadro quando todos os seus casos estão em estado terminal**
  (`encerrado` ou `cancelado`) — nunca por passagem de data. Um caso atrasado mantém o
  bloco do dia visível no topo, como alerta, mesmo que trave dias além do previsto. Os dias
  seguintes sobem conforme os anteriores se resolvem; não é uma tela infinita, sempre
  prioriza os dias mais próximos.
- Filtro por maternidade. Mobile-first, tema escuro para o turno noturno, fonte grande e
  alto contraste. Atualização em tempo real em todos os dispositivos.
- _É a tela que precisa ser excelente; as outras podem ser funcionais._

**B. Caso** — detalhe e ações. Etapas do pacote listadas, botão de concluir etapa, handoff.
Máximo de seleção, mínimo de digitação.

**C. Fila de edição** — visão da Sarah para atribuir, visão da operadora para assumir e
concluir. Contador de fila e idade do item visíveis para todos.

**D. Novo caso (fallback manual)** — formulário mínimo do comercial: mãe, bebê, pacote,
maternidade, previsão. Existe enquanto o sync do Calendar não prova confiabilidade em
produção; depois vira exceção, não caminho principal.

**E. Entrega** — tela da Morgana: links do caso, checklist de completude, botão de
confirmar.

**F. Painel** — indicadores da seção 6, casos parados, casos cancelados por período.

---

## 8. Arquitetura

Stack alinhada ao que já é usado: **Supabase (PostgreSQL + Auth + Realtime + Storage)** com
frontend **React + Vite** como PWA.

| Decisão                     | Justificativa                                                                                             |
| --------------------------- | --------------------------------------------------------------------------------------------------------- |
| PWA, não app nativo         | celulares são corporativos e gerenciados; sem loja de app, deploy instantâneo                             |
| Supabase Realtime           | o Quadro atualiza em todos os aparelhos sem refresh — é o que substitui o vidro de verdade                |
| Login por PIN               | os 6 aparelhos `CEL CLICK` são compartilhados e trocam de mão a cada turno; sessão expira no fim do turno |
| `device_token` por aparelho | auto-preenche o campo de celular de captura, elimina um campo da tela                                     |
| Fila de escrita local       | 5G é bom, mas centro cirúrgico e subsolo derrubam sinal; guarda e reenvia, sem sincronização bidirecional |
| RLS no Postgres             | permissões por persona aplicadas no banco, não só na UI                                                   |
| Timestamps de servidor      | `now()` do Postgres, nunca hora do cliente — condição para a métrica ter valor probatório                 |

### Integrações

- **Google Calendar — pré-requisito do MVP mostrável (decisão revisada).** Deixou de ser
  pós-MVP: é a origem principal de entrada de caso, não só uma conveniência. Uma agenda
  única e centralizada, convenção de título já observada e consistente (seção 3). Edge
  Function em cron (polling a cada poucos minutos) lê eventos novos/alterados; sem webhook
  no MVP — exigiria domínio verificado e endpoint público, complexidade desnecessária agora.
  Trocar por push depois se a latência de minutos incomodar na prática.
- **Watcher do PC servidor (pós-MVP, opcional)** — um serviço Node no servidor de arquivos
  lendo data de criação dos arquivos exportados fornece carimbo objetivo de conclusão da
  edição, independente do que foi declarado. Fica fora do MVP por ser infraestrutura local.

---

## 9. Roadmap

| Fase  | Escopo                                                                                          | Duração | Entregável                          |
| ----- | ----------------------------------------------------------------------------------------------- | ------- | ----------------------------------- |
| **0** | Schema, RLS, funções RPC, cadastros reais do cliente                                            | 1–2 sem | base pronta                         |
| **1** | Sync do Google Calendar (intake) + Quadro por blocos de data + Caso + etapas de campo + handoff | 2–3 sem | **demo mostrável**                  |
| **2** | Fila de edição ordenada por SLA, timestamps de ciclo                                            | 1–2 sem | primeira evidência de produtividade |
| **3** | Entregáveis + confirmação da Morgana + cancelamento                                             | 1–2 sem | ciclo completo                      |
| **4** | Painel de indicadores                                                                           | 1–2 sem | MVP fechado                         |
| **5** | Watcher do PC servidor, import histórico da planilha, refinamentos                              | —       | pós-MVP                             |

**Total até MVP fechado: 6 a 10 semanas.** Demo apresentável ao cliente ao fim da fase 1 —
com o sync do Calendar já funcionando, é possível mostrar casos reais entrando sozinhos.

### Fora do escopo do MVP

Despesas e financeiro · registro de ponto e cálculo de jornada · geração automática de
escala · CRM comercial · portal da família · integração com WhatsApp · reserva de
equipamento · NPS e avaliação · produção de álbum · receita e margem por caso.

---

## 10. Riscos

| Risco                          | Severidade | Mitigação                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **LGPD — dado sensível**       | Alta       | Nome de mãe e recém-nascido, hospital e condição clínica (UTI, indução, cesárea de emergência) são dado pessoal sensível de saúde e de menor. Exigem controle de acesso por RLS, log de acesso, política de retenção e termo de consentimento. Não é item de fase 2 — é requisito de fase 0. A planilha atual tem 70 casos "Não Assinado" e 19 "ASS PENDENTE", o que já é exposição. |
| **Trabalhista**                | Alta       | Log com timestamp é prova documental em reclamatória, independentemente de como se chame. Mitigado pelo desenho da seção 6: não calcular jornada, alinhar com o ponto oficial, comunicar a equipe. Recomenda-se validar com o jurídico ou contador do cliente **antes** de construir.                                                                                                |
| **Rejeição da equipe**         | Média      | Fila visível para todos, SLA acordado abertamente, sem vigilância silenciosa.                                                                                                                                                                                                                                                                                                        |
| **Adoção no campo**            | Média      | O registro precisa ser mais rápido que escrever no vidro, ou o vidro volta. Meta: concluir etapa em até 3 toques.                                                                                                                                                                                                                                                                    |
| **Convivência com a planilha** | Baixa      | A planilha não morre no dia 1. Exportação no formato atual é requisito da fase 4.                                                                                                                                                                                                                                                                                                    |

---

## 11. Pendências

- **Lista de pacotes com escopo de etapas** (a mais crítica — bloqueia a trigger de geração
  automática de `caso_etapas` e, portanto, o Quadro mostrável).
- **Lista de pessoas ativas** e seus papéis administrativos (a maioria é `operador` puro).
- **Confirmação de maternidades e equipamentos** (já mapeados via planilha, só validar se
  mudou algo em 2026).
- Significado do `*` que antecede alguns nomes de evento no Calendar.
- **Dono do processo** do lado do cliente — quem valida escopo e aceita entrega.
- **Prazo esperado e modelo comercial** do projeto.
- Validação jurídica do módulo de produtividade.
- Valores de `prazo_entrega` por pacote (BIRTH curto, demais 48h, MASTER maior) — entram no
  seed junto com a lista de pacotes.
