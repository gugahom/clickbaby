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

### Achado crítico: gargalo de estações de vídeo

A empresa tem **4 estações de edição de foto e 2 de vídeo**, com **3 pessoas por turno
noturno**.

Na planilha, o uso das duas máquinas de vídeo é praticamente idêntico: `PC VÍDEO` em 422
casos e `PC - 6` em 419. Uma divisão 50/50 sustentada por oito meses indica saturação —
as duas máquinas rodam em capacidade máxima o tempo todo.

**Implicação:** parte do atraso na edição de vídeo, hoje atribuído a baixa produtividade da
equipe noturna, pode ser fila por indisponibilidade de estação. Isso precisa ser medido
antes de qualquer cobrança de desempenho. É a primeira métrica que o sistema deve produzir.

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

### Entrada do caso

```
Comercial fecha contrato (WhatsApp)
   → cria card no Google Calendar
      → entra na planilha
```

O Google Calendar é o ponto de integração natural para o intake automático.

### Ciclo de vida

```
Comercial → Campo → Edição → Entrega → Encerrado
                        ↓
                   Despesas → Conferência ADM
```

**Duas trilhas de encerramento independentes.** Um caso pode estar entregue à família e
ainda pendente no financeiro. Modelar como campo único de status gera bug imediato.

### Definição de pronto

A missão com o cliente termina na **criação e confirmação dos links**. A Morgana
(atendimento) confere se todos os links estão prontos e marca a entrega — esse é o estado
terminal do caso.

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
  id, nome, slug, ativo bool

pacote_etapas                        -- define o escopo de cada pacote
  id, pacote_id, etapa_tipo, obrigatoria bool, ordem int

equipamentos
  id, tipo enum(cartao_foto, celular_captura, pc_edicao_foto, pc_edicao_video),
  identificador,                     -- 'CEL CLICK 3', 'PC VÍDEO', 'cartão 14'
  maternidade_fixa_id null,          -- cartões dedicados ao HSC
  device_token null,                 -- vincula o PWA ao aparelho
  ativo bool
```

### Núcleo operacional

```
casos
  id, mae_nome, bebe_nome,
  pacote_id, maternidade_id,
  previsao_em timestamptz,
  google_calendar_event_id null,
  situacao_clinica enum(aguardando, internada, inducao,
                        trabalho_parto, nasceu, uti, alta),
  status_operacional enum(agendado, em_atendimento, em_edicao,
                          aguardando_entrega, encerrado, cancelado),
  status_entrega enum(pendente, links_prontos, confirmado),
  status_financeiro enum(sem_despesa, lancado, conferido),
  termo_status enum(assinado, pendente, sem_contrato, nao_aplicavel),
  observacao text,
  criado_por, created_at

caso_etapas
  id, caso_id,
  tipo enum(entrada, nascimento, banho, fechamento,
            edicao_foto, edicao_video, reels),
  status enum(pendente, atribuida, em_andamento, concluida, dispensada),
  responsavel_id null,
  atribuido_por null, atribuido_em null,       -- Sarah distribuindo a fila
  equipamento_captura_id null,                 -- CEL CLICK
  cartao_id null,
  estacao_id null,                             -- PC de edição
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

### Entrega e financeiro

```
entregaveis
  id, caso_id,
  tipo enum(google_photos, wetransfer, cadeado, reels, album),
  url, criado_por, criado_em,
  confirmado_por null, confirmado_em null      -- gesto da Morgana

despesas
  id, caso_id, pessoa_id,
  tipo enum(uber_ida, uber_volta, uber_substituicao, refeicao_parto,
            refeicao_fechamento),
  valor numeric(10,2),
  comprovante_url null,
  lancado_em, conferido_por null, conferido_em null
```

### Escala e medição

```
escalas
  id, pessoa_id, data, turno enum(diurno, noturno, comercial),
  inicio timestamptz, fim timestamptz

padroes_tempo                          -- a régua da produtividade
  id, etapa_tipo, pacote_id null,
  minutos_esperados int,
  vigente_desde date

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
2. **Concluir etapa exige responsável e equipamento.** O equipamento de captura é
   auto-preenchido pelo `device_token` do PWA.
3. **Um caso só vai para `encerrado`** quando `status_entrega = confirmado`.
   `status_financeiro` é independente e não bloqueia o encerramento.
4. **Estação de edição é recurso exclusivo.** Duas etapas de vídeo não podem estar
   `em_andamento` na mesma estação simultaneamente — a validação é o que expõe a fila.
5. **Toda transição de status grava em `eventos`,** sempre com timestamp de servidor,
   nunca do cliente.

---

## 6. Medição de produtividade

O cliente quer evidência objetiva para cobrar tempo de edição de vídeo. Definição acordada:
**registro aberto pelas próprias operadoras, com padrões conhecidos e timestamp confiável** —
não vigilância silenciosa.

### Como funciona

1. **A fila é um objeto real.** Toda etapa de edição pendente entra numa fila com timestamp
   de entrada. Sarah atribui, a operadora assume ("iniciar"), edita, conclui.
2. **Timestamp de servidor.** O tempo de ciclo sai da diferença entre `iniciado_em` e
   `concluido_em`, ambos gravados pelo backend.
3. **Padrão por tipo de peça.** `padroes_tempo` guarda o tempo esperado por tipo de etapa e
   pacote. Sem essa régua, nenhuma cobrança é assertiva — a conversa termina em "esse vídeo
   era mais difícil" e o gestor não tem resposta.
4. **A régua se constrói com dados.** Os primeiros 30–60 dias servem para calibrar o padrão.
   Não definir os números por palpite antes disso.

### Indicadores

| Indicador                 | Definição                                    |
| ------------------------- | -------------------------------------------- |
| Tempo de ciclo por etapa  | `concluido_em − iniciado_em`                 |
| Aderência ao padrão       | tempo real ÷ `minutos_esperados`             |
| Vazão por turno           | etapas concluídas ÷ turno                    |
| Fila de edição            | itens pendentes e idade do mais antigo       |
| **Ocupação das estações** | % do turno com as 2 máquinas de vídeo em uso |
| Tempo de espera na fila   | entrada na fila → início da edição           |

O indicador de ocupação de estação é o que separa "a equipe está lenta" de "faltam
máquinas". Precisa estar no painel desde o primeiro dia.

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

**A. Quadro** — substitui o vidro. Lista de casos ativos com família, pacote, maternidade,
situação clínica e responsável atual. Filtro por maternidade. Mobile-first, tema escuro para
o turno noturno, fonte grande e alto contraste. Atualização em tempo real em todos os
dispositivos. _É a tela que precisa ser excelente; as outras podem ser funcionais._

**B. Caso** — detalhe e ações. Etapas do pacote listadas, botão de concluir etapa, handoff,
lançamento de despesa com foto do comprovante. Máximo de seleção, mínimo de digitação.

**C. Fila de edição** — visão da Sarah para atribuir, visão da operadora para assumir e
concluir. Contador de fila e idade do item visíveis para todos.

**D. Novo caso** — formulário mínimo do comercial: mãe, bebê, pacote, maternidade, previsão.

**E. Entrega** — tela da Morgana: links do caso, checklist de completude, botão de confirmar.

**F. Despesas e conferência** — lançamento pela operadora, conferência pelo ADM, exportação.

**G. Painel** — indicadores da seção 6, casos parados, despesa do mês.

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

- **Google Calendar (fase 5)** — o card do calendário já é o intake real. Sincronizar
  elimina digitação dupla do comercial.
- **Watcher do PC servidor (fase 5, opcional)** — um serviço Node no servidor de arquivos
  lendo data de criação dos arquivos exportados fornece carimbo objetivo de conclusão da
  edição, independente do que foi declarado. Divergência sistemática entre declarado e real é
  o sinal mais forte que existe. Fica fora do MVP por ser infraestrutura local.

---

## 9. Roadmap

| Fase  | Escopo                                                            | Duração | Entregável                          |
| ----- | ----------------------------------------------------------------- | ------- | ----------------------------------- |
| **0** | Schema, auth, RLS, cadastros, import da planilha histórica        | 1–2 sem | base pronta                         |
| **1** | Quadro + Caso + etapas de campo + handoff                         | 2–3 sem | **demo mostrável**                  |
| **2** | Fila de edição, timestamps, ocupação de estação                   | 1–2 sem | primeira evidência de produtividade |
| **3** | Entregáveis + confirmação da Morgana + despesas + conferência ADM | 2 sem   | ciclo completo                      |
| **4** | Painel de indicadores + exportação para o financeiro              | 1–2 sem | MVP fechado                         |
| **5** | Google Calendar, watcher do servidor, refinamentos                | —       | pós-MVP                             |

**Total até MVP fechado: 7 a 11 semanas.** Demo apresentável ao cliente ao fim da fase 1.

### Fora do escopo do MVP

Registro de ponto e cálculo de jornada · geração automática de escala · CRM comercial ·
portal da família · integração com WhatsApp · reserva de equipamento · NPS e avaliação ·
produção de álbum · receita e margem por caso.

---

## 10. Riscos

| Risco                                             | Severidade | Mitigação                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **LGPD — dado sensível**                          | Alta       | Nome de mãe e recém-nascido, hospital e condição clínica (UTI, indução, cesárea de emergência) são dado pessoal sensível de saúde e de menor. Exigem controle de acesso por RLS, log de acesso, política de retenção e termo de consentimento. Não é item de fase 2 — é requisito de fase 0. A planilha atual tem 70 casos "Não Assinado" e 19 "ASS PENDENTE", o que já é exposição. |
| **Trabalhista**                                   | Alta       | Log com timestamp é prova documental em reclamatória, independentemente de como se chame. Mitigado pelo desenho da seção 6: não calcular jornada, alinhar com o ponto oficial, comunicar a equipe. Recomenda-se validar com o jurídico ou contador do cliente **antes** de construir.                                                                                                |
| **Gargalo de hardware confundido com desempenho** | Média      | Medir ocupação das estações de vídeo desde o primeiro dia (seção 2).                                                                                                                                                                                                                                                                                                                 |
| **Rejeição da equipe**                            | Média      | Fila visível para todos, padrões acordados abertamente, sem vigilância silenciosa.                                                                                                                                                                                                                                                                                                   |
| **Adoção no campo**                               | Média      | O registro precisa ser mais rápido que escrever no vidro, ou o vidro volta. Meta: concluir etapa em até 3 toques.                                                                                                                                                                                                                                                                    |
| **Convivência com a planilha**                    | Baixa      | A planilha não morre no dia 1. Exportação no formato atual é requisito da fase 4.                                                                                                                                                                                                                                                                                                    |

---

## 11. Pendências

- **Dono do processo** do lado do cliente — quem valida escopo e aceita entrega.
- **Prazo esperado e modelo comercial** do projeto.
- Validação jurídica do módulo de produtividade.
- Confirmação de que os `CEL CLICK 1–6` são os mesmos aparelhos que rodarão o PWA.
- Números iniciais de `padroes_tempo` por tipo de peça.
