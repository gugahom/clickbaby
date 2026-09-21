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
| MASTER                   | ✓       | ✓          | ✓     | ✓          | ✓           |       | ✓          |       | 10 dias úteis |
| MASTER + ÁLBUM           | ✓       | ✓          | ✓     | ✓          | ✓           |       | ✓          | ✓     | 10 dias úteis |
| BIRTH                    |         | ✓          |       |            | ✓           | ✓     |            |       | 24h           |
| BIRTH + REELS            |         | ✓          |       |            | ✓           | ✓     |            |       | 24h           |

**REELS e VÍDEO são etapas diferentes** (confirmado 27/08/2026, migration
`20260827140400`). `reels` é o vertical curto; `edicao_video` é o HORIZONTAL, só
nos dois MASTER. Até essa data todo pacote usava `edicao_video` para o que na
verdade era o reels, e `reels` estava órfão no enum.

**Reels existe em todo pacote MENOS os dois MASTER** (revisto em 03/09/2026,
migration `20260903193219`). Até essa data valia o contrário — "existe em todos,
mesmo os que não o vendem, a equipe faz" —, e era verdade quando foi escrito. O
dono da operação mudou a regra: no MASTER o vertical não é padrão, e quando for
vendido entra por `adicionar_etapa`. Casos MASTER criados ANTES continuam com o
reels que já tinham; a regra vale para os novos.

**Edição de fotos existe em todos**, e tem uma rodada por bloco de captura — ver
`rodada` logo abaixo.

**Precedência não é linear.** EDIÇÃO libera quando o nascimento conclui —
banho e fechamento não seguram a edição, e a edição não segura eles. E, desde
06/09/2026, **o banho não segura o fechamento**:

```
                      ┌→ banho                   (CAMPO)
entrada → nascimento ─┼→ fechamento              (CAMPO)
                      └→ foto · reels · vídeo    (EDIÇÃO)
```

Os dois de campo ficam habilitados ao mesmo tempo, a pedido do gestor: na
maternidade eles acontecem quase juntos e nem sempre nessa ordem — a família
chama para a foto de despedida com o banho ainda rolando, e a fotógrafa não
pode ficar esperando um botão liberar. A ORDEM DE LEITURA no card não mudou (o
banho continua vindo antes), e o fechamento continua sendo o gatilho da rodada
2 de edição. Concluir o fechamento com o banho aberto cria a rodada "B+F" antes
de o banho existir, e isso é aceitável pelo mesmo motivo de sempre: a rodada é
do BLOCO de captura, não da lista exata de etapas concluídas.

Isto é regra de TELA, como toda a precedência deste projeto: `iniciar_etapa` e
`concluir_etapa` aceitam qualquer ordem de propósito, porque campo admite
registro retroativo (seção 9).

**RODADAS DE EDIÇÃO.** Foto e reels são refeitos a cada bloco de captura, e a
coluna `caso_etapas.rodada` diz qual é. O número identifica o BLOCO, não a ordem
de chegada — um caso sem rodada 2 pula direto para a 3, e o rótulo continua
certo:

| rodada | material | nasce quando |
| ------ | -------- | ------------ |
| 1 | parto | com o caso (libera quando o nascimento conclui) |
| 2 | banho + fechamento ("B+F") | o fechamento conclui |
| 3 | encontro de irmãos | **nada mais cria** — ver abaixo |

**O NÚMERO NÃO BASTA PARA O RÓTULO.** A tabela acima vale para o que as TRIGGERS criam;
`reabrir_caso` numera a revisão com `max(rodada) + 1`, então uma edição de fotos reaberta
depois do parto e do B+F também cai na rodada 3 — e não tem nada a ver com o encontro de
irmãos. A regra que a tela usa (`rotuloDaRodada`, em `features/quadro/types.ts`): rodada 3
é "Irmãos" só no `reels`; nas outras etapas, e em qualquer rodada 4 ou acima, é "Revisão".
Ficou visível em 07/09/2026, quando o Quadro voltou a enxergar as rodadas altas.

**A RODADA 3 NÃO NASCE MAIS SOZINHA** (16/09/2026, `20260916233119`, pedido do gestor:
"tirar encontro de irmãos como reels e colocar como uma etapa a mais de acompanhamento").
Ela entrou em 03/09 (`20260903193219`) e a regra era verdadeira quando foi escrita: um caso
teve o reels concluído, a família viveu o encontro, e não havia onde registrar o material
novo — reabrir a rodada do parto misturaria dois trabalhos no mesmo carimbo, e o tempo de
ciclo da seção 9 sairia errado nos dois. Duas semanas de operação mudaram a conta: **nem
todo encontro vira vertical**, e a trigger decidia por quem edita. Em produção eram 10
rodadas 3 para 6 encontros concluídos, duas ainda pendentes — edição que ninguém pediu,
ocupando lugar na lista.
O encontro volta a ser **só o que ele é: uma etapa de ACOMPANHAMENTO** — trilha, ordem 9,
fora de todo pacote, entrando por `adicionar_etapa`, sem pré-requisito. Quando o material
do encontro precisar de vertical, o caminho é o de qualquer material fora do contrato:
`adicionar_etapa` para o reels, ou `reabrir_caso` se o caso já encerrou. **A decisão passou
a ser de uma pessoa olhando o material, em vez de uma trigger decidindo por todos.**
O QUE JÁ EXISTE FICA: as 10 rodadas criadas até aqui continuam onde estão, com seus eventos
e seus tempos, e as 2 pendentes se resolvem à mão pela tela. Por isso o rótulo "Irmãos"
também fica — chamá-las de "Revisão" mentiria sobre trabalho que está aberto na tela de
alguém. O preço é conhecido: a partir de agora a única coisa que cria rodada 3 é
`reabrir_caso`, e uma revisão de reels que caia nela vai aparecer como "Irmãos". É a mesma
imprecisão do parágrafo acima, agora sem contrapeso; quando incomodar, o conserto é olhar
se o caso tem um `encontro_irmaos`, não trocar o número por outro chute.

- **Entrada existe em todos menos BIRTH e BIRTH + REELS.**
- **Fechamento é de fábrica só nos quatro pacotes de acompanhamento completo** — STANDARD,
  BABY REELS, MASTER e MASTER + ÁLBUM. Na família BASIC e nos dois BIRTH ele é OPCIONAL:
  quando acontece, entra por `adicionar_etapa`, como qualquer etapa fora do pacote. A
  família BASIC nunca o teve; os dois BIRTH tiveram entre 27/08 e 04/09/2026 (migrations
  `20260827190426` e `20260904143000`). A regra de 27/08 era verdadeira quando foi
  escrita — "há fechamento e ele não estava sendo registrado" —, e uma semana de operação
  mostrou que ali ele é exceção. Etapa que quase sempre precisa ser dispensada é ruído no
  checklist, não registro.
  Consequência que vale dizer em voz alta: fechamento é o gatilho da rodada 2 de edição,
  então um BIRTH volta a não ter segunda rodada de fábrica. Quem acrescentar o fechamento
  pela tela e concluí-lo continua ganhando a rodada 2 — a trigger não mudou.
- **BIRTH** é feito sem contrato fechado, para apresentar aos pais pós-parto e tentar a
  venda. SLA de 24h (janela curta) faz sua edição subir na fila — ver seção 9.
- **BIRTH + REELS** é comercialmente distinto do BIRTH (a tentativa de venda já sai com o
  reels incluído), mesmo tendo exatamente as mesmas etapas e o mesmo SLA — por isso é um
  pacote próprio no cadastro, não uma variação do BIRTH.
- "Vídeo de venda" vs "vídeo de contrato" é a mesma etapa no fluxo de trabalho; a diferença
  está no pacote, não vira campo separado.
- **TROCAR O PACOTE traz as etapas que faltam** (07/09/2026, migration
  `20260907100016`). Um caso que vira de BASIC para BABY REELS ganha banho e fechamento na
  hora. Antes não ganhava nada: `gerar_caso_etapas` só roda no INSERT e na confirmação de
  rascunho (`pacote_id` saindo de NULL), e ainda tem a guarda de "nunca regenerar num caso
  que já tem etapa" — o card ficava com o checklist do pacote velho.
  **SÓ ACRESCENTA, nunca remove.** Etapa que o pacote novo não prevê continua: pode ter
  trabalho feito (um BABY REELS que vira BASIC não desfaz o banho que aconteceu), e
  `eventos` referencia `caso_etapas` com `on delete restrict`, então a remoção nem passaria.
  O que sobra do pacote antigo se resolve com "dispensar".
  A checagem é por TIPO, em qualquer rodada: um caso com edição de fotos nas rodadas 1 e 2
  não ganha uma terceira porque o pacote novo também prevê edição de fotos.
- **Três etapas existem FORA de qualquer pacote** (01/09/2026): `encontro_irmaos`,
  `saida_uti` e `alta`. Nenhum pacote as traz; elas só entram por `adicionar_etapa`,
  quando a família vive o momento e a equipe quer registrar o trabalho. São da trilha
  ACOMPANHAMENTO (acontecem na maternidade) e vêm depois do álbum na ordem de leitura.
  **O ENCONTRO DE IRMÃOS NÃO ESPERA NADA** (09/09/2026, pedido do gestor). Ele tem `ordem`
  9, então a precedência por trilha o punha atrás de entrada, nascimento e fechamento — e
  ele nascia bloqueado por etapas que podem nem ter sido registradas ainda. Bloquear o
  registro de uma coisa que **já aconteceu** é o contrário do que a trava existe para fazer:
  ela impede aprovar tudo de cima para baixo sem o trabalho acontecer, e aqui o gesto de
  ACRESCENTAR a etapa já é a afirmação de que aconteceu. Acrescentou, inicia e conclui.
  A lista é `SEM_PRE_REQUISITO` em `lib/acoes.ts`, e ela é o eixo OPOSTO do `NAO_SEGURA`
  que está logo acima dela — os nomes se parecem e as regras não: `NAO_SEGURA` é "esta etapa
  não segura as seguintes" (o banho), `SEM_PRE_REQUISITO` é "esta etapa não é segurada por
  nenhuma anterior".
  `saida_uti` e `alta` continuam FORA da lista: o pedido nomeou uma etapa. Se derem o mesmo
  problema, a correção é acrescentar o slug — nunca deduzir "toda etapa fora de pacote",
  que é uma regra que ninguém deu.
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

**O RÓTULO NA TELA É OUTRA COISA.** Desde 03/09/2026, a pedido do gestor, `operador`
aparece como **"Fotógrafo(a)"** — é como a empresa chama essas pessoas, e a seção 2 manda
usar o vocabulário da operação na tela. O VALOR NO BANCO continua `operador`, e a
distinção é o que mantém esta invariante de pé: o rótulo diz quem essas pessoas são na
empresa; o modelo continua sem tipo de pessoa, e ninguém filtra trabalho por ele. A tabela
`ROTULO_PAPEL` (`src/features/equipe/lib/apresentacao.ts`) é o único lugar da tradução.

O dia em que aparecer um pedido de "mostre só as fotógrafas" ou de barrar alguém de uma
etapa por causa deste campo, é esta invariante que está sendo quebrada — e o lugar de
decidir isso é uma conversa sobre mudar o modelo, não um filtro a mais.

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

**A ENTREGA É DE DUAS PESSOAS** (migration `20260906151515`). Quem termina o trabalho
**envia** o caso para a aba Entregáveis (`liberar_para_entrega`, aberta a qualquer pessoa
ativa — quem acabou de editar é quem sabe que acabou); quem **confirma** ali é
atendimento ou adm, e mais ninguém.

Isso restaura a checagem de papel que a `20260825014102` tinha derrubado, e a ida e volta
tem explicação. Em 25/08 a restrição saiu porque quem gerava os links eram as fotógrafas,
e prender o encerramento ao atendimento fazia gargalo de um passo que ele não executava.
Esse motivo acabou em 04/09 (`20260904190000`): o link passou a ser pedido na conclusão da
edição, então quando o caso chega ao fim os links já estão nele, e quem confirma não
precisa mais ser quem editou. Desde 15/09/2026 o link é cobrado no ENVIO para Entregáveis,
não na conclusão — e o argumento continua de pé: quando o caso chega ao ADM, o link principal
já está nele.

**Atenção a uma armadilha ao mexer nisso:** `eh_adm()` **não** inclui `atendimento` (ele é
comercial, coordenacao, financeiro, gestao). Escrever a checagem só com ele deixaria de
fora justamente a pessoa que faz a entrega. O par correto é `eh_atendimento() or eh_adm()`,
o mesmo que `cancelar_caso` usa — e é o que "atendimento ou adm" significa neste projeto.

`cancelar_caso` **continua** restrita ao mesmo par: cancelar é decisão comercial sobre o
contrato, não o fim natural de um trabalho. Esse par é, na prática, **todo papel menos
`operador`** (atendimento, comercial, coordenacao, financeiro, gestao), e na tela as portas de
cancelar — "Cancelar caso" no detalhe e "Descartar rascunho" no menu — **não existem** para
fotógrafa (15/09/2026, pedido do gestor), em vez de aparecerem apagadas.

`status_operacional = cancelado` exige `motivo_cancelamento` preenchido e não vazio — seja
porque o sync detectou o card cinza no Calendar (preenche um texto padrão automaticamente),
seja porque um humano cancelou manualmente (motivo digitado). Um caso cancelado nunca precisa
ter passado por entrega.

Constraint de banco (`casos_status_terminal_valido`) já aplica essa regra — não a duplique
como validação de aplicação que pode divergir da constraint.

**DUAS ETAPAS NÃO SEGURAM O ENCERRAMENTO:** `edicao_video` (desde 20260903153101) e
`album` (desde 20260910150425). As duas têm fluxo próprio numa seção lateral, levam semanas,
e sobrevivem à entrega das fotos. Toda outra etapa continua tendo que estar concluída ou
dispensada, e o caso continua exigindo ao menos um entregável.

**Regra de visibilidade do Quadro:** um dia só sai da tela quando **todos** os casos daquele
dia estão em `encerrado`, `cancelado` ou **enviados para Entregáveis**. Nunca por passagem
de data. Um caso atrasado mantém o bloco do dia visível, mesmo que trave semanas.

A terceira saída entrou em 06/09/2026, a pedido do gestor, e é uma exceção com limite
claro: o caso enviado **não sumiu**, mudou de lista — está na aba Entregáveis, visível para
a equipe inteira. A regra existe para trabalho parado não sair de vista, e um caso enviado
não é trabalho parado: é trabalho terminado esperando outra pessoa. Sem essa saída o Quadro
do dia continuaria mostrando cartões que ninguém mais vai tocar, e o "x de y concluídos"
passaria a medir a entrega do ADM em vez do trabalho do turno.

**`despesas` VOLTOU ao escopo em 12/09/2026** (instrução explícita do gestor, migration
`20260913022926`), e é só isso que voltou: o registro de GASTO por caso — o Uber no cartão
da empresa, a refeição extra. `status_financeiro` em `casos` continua removido, e com ele
qualquer noção de receita, margem ou fechamento de mês. O plano já dizia o porquê: "sem
receita, só despesa — não há margem por caso". Despesa não é status do caso e não entra em
nenhum dos dois caminhos terminais: um caso encerra com ou sem gasto lançado.

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
concluir_etapa_com_entregaveis(p_caso_etapa_id, p_entregaveis, p_observacao) -- sem uso na tela desde 15/09/2026
reabrir_etapa(p_caso_etapa_id, p_motivo)                -- desfaz conclusão ou dispensa
dispensar_etapa(p_caso_etapa_id, p_motivo)              -- "não vai acontecer"
adicionar_etapa(p_caso_id, p_tipo)                      -- etapa fora do pacote
agendar_etapa(p_caso_etapa_id, p_previsao_em)           -- hora do banho/fechamento
anotar_etapa(p_caso_etapa_id, p_observacao)             -- aviso, em qualquer status
registrar_estacao(p_caso_etapa_id, p_estacao)           -- "pc-1"
registrar_material_da_etapa(p_caso_etapa_id, p_campo, p_valor) -- cartão F/V, baixou, upload

-- pessoas
atribuir_etapa(p_caso_etapa_id, p_para_pessoa_id)
transferir_etapa(p_caso_etapa_id, p_para_pessoa_id, p_motivo)   -- handoff
planejar_rendicao(p_caso_etapa_id, p_proxima_pessoa_id)

-- fluxo do vídeo horizontal do MASTER (2 fases na tela + o fim; ver seção 13)
mover_video_master(p_caso_etapa_id, p_fase)
finalizar_video_master(p_caso_etapa_id, p_url)   -- link + conclusão na mesma transação

-- esteira do fotolivro (10 fases; ver seção 13)
mover_album(p_caso_etapa_id, p_fase)             -- escreve fase E status juntos
enviar_fotolivro_para_aprovacao(p_caso_etapa_id, p_link, p_capa) -- capa + link + fase, juntos
marcar_fotolivro_enviado(p_caso_etapa_id)        -- "Enviado ao cliente"; atendimento/adm

-- pedido de alteração pós-entrega, SÓ das duas com seção própria (ver seção 13)
pedir_alteracao_da_etapa(p_caso_etapa_id, p_motivo)  -- fase + pedido, sem reabrir o caso

-- caso
mover_para_uti(p_caso_id) / retornar_da_uti(p_caso_id)  -- congela o SLA
registrar_entregavel(p_caso_id, p_tipo, p_url)
remover_entregavel(p_entregavel_id, p_motivo)           -- link errado; confirmado recusa

-- despesas do caso (12/09/2026; ver seção 13)
registrar_despesa(p_caso_id, p_tipo, p_valor, p_pessoa_id, p_momento, p_descricao)
remover_despesa(p_despesa_id, p_motivo)                 -- não existe editar
restaurar_caso_cancelado_pelo_sync(p_caso_id, p_motivo) -- só o que o SYNC cancelou; atendimento/adm
devolver_para_o_quadro(p_caso_id, p_motivo)             -- tira de Entregáveis; atendimento/adm
liberar_para_entrega(p_caso_id)                         -- envia para a aba Entregas
confirmar_entrega(p_caso_id)                            -- encerra; atendimento/adm
cancelar_caso(p_caso_id, p_motivo)                      -- atendimento/adm
reabrir_caso(p_caso_id, p_motivo, p_etapas)             -- traz de volta um encerrado

-- sino do cabeçalho (17/09/2026; ver seção 13)
marcar_notificacoes_vistas()                            -- só o "já vi" — a lista é derivada

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

**HELPER DE RLS VAI DENTRO DE `(select ...)`** (18/09/2026, diagnóstico do Quadro lento,
migration `20260918085454`). `using (eh_pessoa_ativa())` faz o Postgres chamar a função em
CADA LINHA de cada varredura — no plano, `Filter: eh_pessoa_ativa()` em seis lugares da
consulta do Quadro, cada chamada lendo o JWT e buscando em `pessoas`. Medido: 4x mais lento
(11ms sem RLS, 44ms com ela). `using ((select public.eh_pessoa_ativa()))` vira um InitPlan e
roda UMA vez por consulta. As duas formas dão o mesmo resultado, então nenhum teste de
permissão pega a regressão — quem pega é `rls_uma_vez_por_consulta.test.sql`, que falha se
alguma policy chamar os helpers sem o `select` em volta.

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
- **Consulta que pode passar de MIL LINHAS precisa paginar.** O PostgREST recusa devolver
  mais que `db-max-rows` (mil, no Supabase) e **não erra**: manda as mil primeiras e cala.
  Em 07/09/2026 `caso_etapas` passou de mil (1009) e o Quadro parou de enxergar as nove
  últimas NA ORDEM DA CONSULTA — que ordena por `rodada`, então sumiram justamente as
  rodadas altas: as revisões de `reabrir_caso` e o encontro de irmãos. O sintoma foi um
  caso que a tela mostrava completo e que o banco recusava enviar para Entregáveis. É a
  pior classe de bug deste projeto: tela e banco discordando, sem erro em lugar nenhum.
  O helper é `buscarTudo` em `features/quadro/api/useQuadro.ts`, e ele cobra a página
  contra o `count` do servidor — não contra o tamanho da página. "Veio menos do que pedi,
  então acabou" é falso quando o teto do servidor é menor que a página: aí toda página vem
  curta e o laço para na primeira, truncando de novo com cara de sucesso.
  `casos` está em 192 e cresce ~135/mês: chega ao teto em poucos meses, e já pagina.
- **E toda consulta paginada precisa de ORDENAÇÃO TOTAL.** Paginar destapou o defeito
  seguinte, no dia seguinte: `LIMIT/OFFSET` só devolve cada linha uma vez quando não há
  EMPATE na ordenação. `rodada, ordem` empata às centenas — todo `fechamento` do sistema
  é (1, 4) —, e quando o corte de página cai dentro de um grupo empatado o Postgres pode
  escolher membros diferentes a cada consulta. Medido no remoto em 08/09/2026: 1028 linhas
  chegaram, 1000 distintas; 28 vieram duas vezes e outras 28 não vieram nenhuma. O sintoma
  foi um card com "Fechamento" repetido na fita e 5/5 numa trilha de quatro etapas — e o
  caro não é o que aparece duas vezes, é o que não aparece. A correção é acrescentar `id`
  como ÚLTIMO critério de `order` em toda consulta com `.range()`: ele é único, desempata
  sempre, e só decide entre linhas que já eram indistinguíveis na tela. A deduplicação
  dentro de `buscarTudo` é cinto de segurança e não devolve a linha perdida — o servidor
  nunca a mandou.
- **O QUADRO RECARREGA POR UM LUGAR SÓ: a fila de `api/recarga.ts`** (18/09/2026). Ações e
  Realtime entram na mesma espera de 400ms, e o eco da própria ação vira uma recarga só. Antes,
  cada ação recarregava no sucesso E no eco do Realtime — o Quadro inteiro duas vezes por
  toque, e foi um dos multiplicadores da lentidão de 18/09 (ver "O QUADRO SÓ CARREGA O QUE ESTÁ
  VIVO", na seção 13). A fila tem DOIS TAMANHOS: `agendarRecargaDoCaso` busca só os casos que
  mudaram e os costura na lista; `agendarRecargaDoQuadro` recarrega tudo, e fica para o que não
  diz de que caso se trata (reconexão do canal, ação sem caso conhecido). Ação nova passa por
  `useAcaoDoQuadro`, que descobre o caso sozinho. **Não chame `invalidateQueries(['quadro'])`
  direto** numa ação nova: ela volta a dobrar. E NÃO troque a fila por "ignorar o aviso se já
  houver recarga em andamento": aquela recarga pode ter lido o banco antes da mudança de outra
  pessoa, e o aviso engolido deixaria a tela errada até a rede de segurança de 2 minutos.
  A consulta do Quadro tem validade de 2 minutos (`staleTime`), para voltar à aba não
  recarregar a cada 30 segundos — o que, no celular, era a cada desbloqueio.
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
- **Iniciar antes de concluir é OBRIGATÓRIO na pós-produção**, e a trava está no banco
  (`concluir_etapa`, migration `20260825051226`): `edicao_foto`, `edicao_video`, `reels` e
  `album` sem `iniciado_em` são recusadas. Sem isso o tempo de ciclo da edição viria sempre
  zero e a medição desta seção não mediria nada.
  As etapas de CAMPO continuam aceitando registro retroativo — carimbam início e conclusão
  no mesmo instante —, e isso é deliberado: quem fotografa um parto nem sempre pode tocar
  no aparelho na hora.
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

**PRESENÇA NÃO É MEDIÇÃO** (06/09/2026). O cabeçalho mostra quem está com a tela aberta
agora, com bolinha de estado, e NADA disso é gravado: vive no canal de Presence do Realtime
enquanto a aba existe. A tentação de somar esse tempo vai aparecer — ela apareceu no
próprio pedido que criou a funcionalidade — e a resposta é o parágrafo abaixo. Aba aberta
não é trabalho: o Quadro numa TV "trabalharia" 24h, e quem fotografa um parto com o celular
no bolso "não trabalharia" nenhuma. A régua continua sendo etapa iniciada e concluída.

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
  **`midias` abriu UMA pasta em 21/09/2026** (`20260921202848`): `fotolivro/`, para a capa do
  fotolivro, com leitura e upload para pessoa ativa e upload só na pasta de uma etapa que é
  fotolivro. Sem update nem delete. O resto do bucket — foto e vídeo de parto — segue negado, e
  `buckets_privados.test.sql` afirma isso por nome.
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
- Não recrie `status_financeiro` (nem receita, margem ou fechamento de mês) sem instrução
  explícita. `despesas` e `tipo_despesa` VOLTARAM em 12/09/2026 por pedido do gestor e
  existem — o que segue fora é a trilha financeira do CASO, não o registro de gasto.
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

- **Sync do Calendar automático**, pg_cron a cada **25 segundos** (o intake principal da
  seção 7). Foi 2min, depois 1min (`20260831132545`), e desde 09/09/2026 são 25s
  (`20260909134858`) — a espera entre marcar o parto na agenda e ver o card no Quadro é, no
  pior caso, o intervalo inteiro do cron.
  **`'25 seconds'` não é expressão cron de cinco campos**: é a forma de INTERVALO que o
  pg_cron aceita desde a 1.5 (o local e o remoto rodam 1.6.4), e é o que permite descer de
  um minuto. Num Postgres com pg_cron anterior a migration falha no push, que é o certo —
  melhor recusar do que agendar outra coisa. `sync_agendado.test.sql` trava o valor.
  **O job não se atropela:** `disparar_sync_calendar` usa `net.http_post` do pg_net, devolve
  um id de requisição na hora e termina em milissegundos. Quem pode se sobrepor são as
  execuções da Edge Function (timeout de 30s, maior que o intervalo), e isso é aceitável
  porque as duas escritas do sync são idempotentes — `sync_upsert_caso` casa por
  `google_calendar_event_id` e `sync_cancelar_caso` devolve `sem_efeito` em caso terminal.
  **O `refetchInterval` do Quadro NÃO acompanha** e está em 2 minutos de propósito: quem
  traz o card novo à tela é o Realtime (escuta INSERT em `casos`), não o refetch — que é a
  rede de segurança para quando o canal cai. Persegui-lo multiplicaria o tráfego do Quadro
  inteiro para cobrir mais depressa uma falha rara.
  Cria, atualiza, e cancela por card cinza OU por deleção do evento. Evento de dia inteiro
  (sem hora) não vira caso; um caso JÁ conhecido acompanha o dia mesmo sem hora.
  **"O EVENTO SUMIU" NÃO É "O CONTRATO CAIU"** (15/09/2026, migration `20260915030822`).
  Investigado em produção: o sync cancelou 45 casos e nenhum foi inventado — todo evento
  estava de fato apagado ou cinza no Calendar. O defeito era a regra. Três casos tinham
  trabalho feito (nascimento concluído, edição, link) e foram cancelados porque o evento
  sumiu da agenda DEPOIS do parto; dois se perderam, porque cancelado não tinha volta.
  Para a equipe o parto acabou e o evento sai da agenda (o gestor acredita que ele é apagado
  sozinho pelo horário); com o caso já encerrado o sync ignora, com qualquer coisa pendente
  — reels, revisão, a confirmação do ADM — ele cancelava.
  **Duas travas, no BANCO** (a Edge Function não mudou e não precisa de deploy):
  a DELEÇÃO (`sync_cancelar_caso`) não cancela caso com TRABALHO nem caso cuja PREVISÃO JÁ
  PASSOU — a de horário existe porque campo aceita registro retroativo (seção 9), e o
  evento pode sumir antes de a fotógrafa tocar no aparelho. O CARD CINZA (`sync_upsert_caso`)
  só tem a de trabalho: cinza é o gesto explícito de cancelamento, e um cinza legítimo no
  próprio dia do evento existe no histórico. Conferido: nenhum dos 42 cancelamentos
  legítimos seria bloqueado por nenhuma das duas.
  **"Trabalho" é `caso_tem_trabalho`, a definição única:** etapa iniciada ou concluída, link
  de entrega, envio para Entregáveis, ou QUALQUER ação humana em `eventos`. Preservar grava
  `evento_calendar_removido` ou `card_cinza_ignorado` UMA VEZ por caso — o cron roda a cada
  25s e `eventos` é append-only, então sem essa guarda seriam milhares de linhas por dia.
  Cancelar um atendimento que aconteceu continua possível, pelo gesto humano de sempre
  (`cancelar_caso`).
  **`restaurar_caso_cancelado_pelo_sync`**, atendimento ou adm e com motivo obrigatório,
  desfaz SÓ o que o sync cancelou (o texto do motivo diz quem foi) — cancelamento da equipe é
  decisão comercial e segue sem volta. O status é derivado das etapas, e o sync não o cancela
  de novo: a restauração é ação humana, e ação humana conta como trabalho. No card, é o item
  "Restaurar caso" do menu, só nesses casos. Os dois atendimentos perdidos foram restaurados
  na própria migration; o terceiro ficou cancelado porque o gêmeo recriado já foi encerrado.
- **Quadro** em blocos por dia, de hoje até AMANHÃ (não mais que isso). Busca, alerta de
  horário chegando, realtime, auto-refresh alinhado ao cron.
  **DIA ATRASADO NASCE ABERTO** (17/09/2026, pedido do gestor). A regra antiga era POSIÇÃO —
  "os dois primeiros dias da lista" —, e a lista vai do mais velho para o mais novo: os dois
  abertos eram os dois dias mais ANTIGOS, e HOJE vinha fechado. Medido no remoto no dia:
  quatro dias com trabalho aberto (13, 15 e 16/09 com um caso cada, hoje com SETE), e os
  abertos eram 13 e 15. A regra agora é significado — **atrasado abre, hoje abre**; amanhã e
  o bloco SEM DATA nascem fechados, porque prévia e ausência de dado não são turno. Isso
  revisa o desenho do modo TV de 01/09 ("anteontem fechado"), e a revisão é do mesmo gestor.
  O cabeçalho do dia atrasado também pesa mais na cor — tingimento, nunca vermelho sólido,
  que é a linguagem do chamado dentro do card.
  **O CAMINHO PELO QUAL ELE VIU ISSO foi a UTI:** um caso volta da UTI para um dia de dois
  meses atrás — dia que tinha sumido do Quadro justamente porque só lhe restava o caso na
  UTI — e reaparecia fechado, obrigando a procurar e abrir. Vale para toda volta, não só a
  da UTI: reabertura, devolução de Entregáveis, cancelamento desfeito.
  **E O CORTE POR DIA NÃO LEVA MAIS O TURNO JUNTO.** `blocosVisiveis` cortava um `slice` na
  cabeça de uma lista crescente, ou seja, jogava fora o FIM — hoje e amanhã. Faltava UM dia
  parado a mais para o Quadro de hoje sair da tela com os sete casos dentro, atrás de um
  "Carregar mais dias" que ninguém aperta procurando por hoje. O limite continua (abrir
  trinta dias é uma parede), mas agora só corta passado distante; pode sobrar um buraco no
  meio da lista, e é preço aceito — a alternativa, mostrar sempre os mais novos, tiraria os
  dias parados de vista.
- **O QUADRO SÓ CARREGA O QUE ESTÁ VIVO** (18/09/2026, diagnóstico da lentidão: uma pausa de
  96ms levava 7 segundos para aparecer). O Quadro baixava o histórico INTEIRO a cada mudança —
  266 casos e 1.431 etapas no dia, 239 deles já encerrados ou cancelados —, em toda tela aberta
  e a cada aviso do Realtime de qualquer pessoa. Isolada, a consulta levava 44ms; em uso real,
  1,26s de média e picos de 8s, porque dezenas de cópias dela disputavam um banco de 60
  conexões. Em 30 dias foram 38.866 recargas completas, 13,7 das 20,2 horas de trabalho do
  banco. E a conta crescia sozinha, ~135 casos por mês.
  **Foram cinco correções, em duas PRs.** As três primeiras aliviaram: recarga única por toque,
  validade de 2 minutos (as duas na seção 5) e RLS avaliada uma vez por consulta
  (`20260918085454`). A estrutural veio em seguida, em duas frentes:
  **O ARQUIVO SAIU DA CARGA** (`20260918091859`). A view ganhou `arquivado`: terminal e sem nada
  que o Quadro mostre. Fora da aba Concluídos, um caso terminado só aparece em dois lugares — nas
  seções MASTER e FOTO/LIVRO, quando ENCERROU com o vídeo ou o fotolivro aberto, e no "x de y"
  de um dia que ainda tem caso aberto (o cartão some do bloco, mas conta). O Quadro carrega
  `arquivado = false` — 76 casos no dia, número que acompanha a operação e não o histórico —, e
  a aba **Concluídos busca o arquivo quando é aberta**, com um "Carregando" na primeira vez.
  **A regra do vídeo é SÓ DE ENCERRADO:** no remoto havia 12 cancelados com vídeo ou fotolivro
  pendente para sempre, e contá-los os carregaria em toda recarga até o fim dos tempos. A regra
  mora na VIEW, e não no cliente, porque a metade do dia olha os OUTROS casos — no cliente
  seriam três consultas encadeadas, no 4G do corredor. E é coluna de uma view que já existia:
  nenhum GRANT novo, nenhuma superfície nova para o `anon`.
  **O REALTIME BUSCA SÓ O CASO QUE MUDOU** (`api/atualizar-por-caso.ts`, com a decisão em
  `lib/remendo.ts`). O aviso traz o id do caso — o ÚNICO campo lido do payload —, a tela busca
  aquele caso pela mesma view e sob a mesma RLS, e o costura na lista em memória. **Na dúvida,
  recarrega tudo:** quando o caso PASSA A ESTAR aberto (criado, reaberto, restaurado, trocado de
  dia), porque ele pode trazer os terminados do dia dele e a busca por id não os traz; quando a
  lista mudou enquanto a busca viajava; e quando a busca falha. Uma lista remendada errada é a
  tela discordando do banco sem erro nenhum, e o remendo só acontece onde dá para provar que o
  resultado é o de uma recarga.
  **A LISTA DE IDS VAI EM LOTES DE 150** (`CASOS_POR_LOTE`, em `useQuadro.ts`). Ela viaja na
  URL, e até aqui o Quadro mandava todos os casos do sistema numa lista só: ~10kB no dia,
  crescendo uns 5kB por mês. Quem precisa do lote agora é a aba Concluídos.
- **O SINO DO CABEÇALHO** (17/09/2026, pedido do gestor, migration `20260917215442`).
  Ao lado da presença, um sino com contador; a bolinha fica **vermelha e pulsa** quando há
  algo esperando por MIM. Ele existe no celular, ao contrário da fileira de presença — quem
  está no corredor não escolhe a quem passar trabalho, mas é justamente ela que precisa
  saber que uma etapa foi atribuída ao seu nome.
  **A LISTA É DERIVADA, e não existe tabela de notificações.** A frase que decidiu o desenho
  é dele: "deve manter o fluxo de quando resolvido sumir nas notificações" — ou seja, a
  notificação não é registro, é ESTADO VIVO. Com tabela, toda ação teria que lembrar de
  apagar a linha correspondente, e a primeira regra esquecida viraria sino tocando por
  trabalho que já acabou: a mesma classe de defeito de tela e banco discordando sem erro que
  este projeto já pagou três vezes. Derivado, **resolver é apagar** — a condição deixa de ser
  verdade e o item some. O que se calcula está em `features/notificacoes/lib/derivar.ts`, e é
  lá que a lista do que conta como urgente se mexe.
  **DUAS FAMÍLIAS.** MINHAS — atribuição, rendição, alteração pedida em trabalho meu — são as
  únicas que acendem o pulso. GERAIS — aviso escrito num card, horário estourando, edição
  liberada sem ninguém, prazo vencido, alteração em trabalho de outra — entram no contador
  **sem gritar**. Um sino que pulsa por qualquer urgência da operação inteira pulsa o dia
  todo, e alerta que toca sempre é alerta que ninguém olha (foi o que aconteceu com a faixa
  de avisos antes de 15/09). Duas notificações são POR PAPEL: entrega esperando conferência e
  rascunho pendente são trabalho de atendimento e adm.
  **O QUE O BANCO GUARDA É SÓ O "JÁ VI"** — uma linha por pessoa em `notificacoes_vistas`,
  legível só por ela. Abrir o sino apaga o PULSO; o item continua listado até o trabalho ser
  resolvido, que é o que separa "já vi" de "já fiz". A tabela é própria (e não uma coluna em
  `pessoas`) porque o cadastro é de leitura geral e isso ali seria "a que horas fulana abriu o
  app", um relógio de presença pela porta dos fundos — ver a seção 9. **Não grava evento:**
  abrir o sino não é trabalho, e catorze pessoas abrindo dezenas de vezes por turno encheriam
  `eventos` de ruído de leitura. O backfill da migration nasce com `now()`, para o sino nascer
  calado em vez de estrear com o pulso aceso por trabalho velho.
  **CLICAR LEVA AO CASO:** `/?caso=<id>`, que o Quadro lê para trocar de aba, garantir o dia
  na tela, abrir o card e rolar até ele com um anel na cor da marca. Query e não rota própria
  — o caso não tem tela, ele tem um lugar DENTRO do Quadro —, e de brinde o endereço vira
  algo que uma pessoa manda para outra.
  **O CARIMBO DE NOVIDADE é `caso_etapas.updated_at`**, aproximado de propósito: ele diz
  "esta etapa mudou", não "foi atribuída às 14h". O exato viria de `eventos` — legível por
  toda pessoa ativa desde 25/08 (`20260825020122`; este parágrafo dizia "só adm", e estava
  errado) —, mas custaria uma consulta a mais a cada recarga do Quadro por uma precisão que o
  sino não usa.
  **Fica fora, por ora:** push no celular com o app fechado (pede service worker, VAPID e uma
  Edge Function — e cuidado de LGPD, porque o texto passaria pelo serviço do Google/Apple com
  nome de mãe e bebê dentro), som e vibração.
  **O VISUAL É O DA CAIXA DE ENTRADA QUE O GESTOR MANDOU** (18/09/2026): botão com borda e
  contador no canto, painel com abas, um ícone por linha, negrito e bolinha no que é novo,
  rodapé. Duas coisas mudaram de sentido com ele: o **contador conta NOVIDADES** (some quando
  não há nada novo — a "bolinha no momento que o usuário precisa dar atenção", do pedido
  original), e as abas são **"Todas" e "Para você"**, não "Todas" e "Não lidas" — com o
  abrir marcando tudo como visto, uma aba de não lidas ficaria vazia no instante em que fosse
  vista. Pelo mesmo motivo não existe "Marcar todas como lidas": abrir já faz isso.
  **Refeito com as peças da casa, SEM o shadcn que veio no exemplo** (seis pacotes: Radix
  Popover/Tabs/Slot/Label, cva e lucide). O projeto não usa shadcn (ver `Dialogo`); o `Button`
  dele seria um segundo sistema de botões ao lado do `Botao`, com ícone de 40px, abaixo do
  piso da seção 6; as classes de animação do exemplo pedem um plugin do Tailwind que não está
  instalado — não errariam, só não animariam —; e os tokens dele (`bg-popover`, `bg-accent`)
  não são os da casa. A animação é do `motion`, que já está no projeto.
  **AS GERAIS SE LIMPAM; AS "PARA VOCÊ", NÃO** (18/09/2026, pedido do gestor, migration
  `20260918083153`). As gerais falam do trabalho dos OUTROS, e ficariam acumuladas até outra
  pessoa agir — a lista viraria o painel da operação inteira. "Limpar gerais" grava um
  carimbo (`notificacoes_vistas.gerais_limpas_em`) e esconde as gerais nascidas até ali; as de
  depois aparecem. Carimbo e não lista do que foi limpo: uma tabela de dispensas cresceria
  para sempre, com linha de notificação que já sumiu. As "para você" continuam saindo só
  quando o trabalho anda — um botão que as escondesse faria a etapa atribuída parar de chamar
  sem ninguém dar play. **O carimbo do HORÁRIO é quando o alerta nasceu** (a hora marcada menos
  a janela vermelha), e não a hora marcada: esta fica no futuro enquanto o alerta é iminente,
  e ele escaparia da limpeza e contaria como novidade para sempre.
  **O SINO CHAMA ENQUANTO HOUVER ALGO PARA VOCÊ** (mesmo dia, pedido do gestor: "deve chamar
  mais a atenção"). O botão fica vermelho sólido, solta a onda do chamado — 12px, o dobro da
  da pílula, porque o sino mora no canto e precisa ser visto por quem NÃO está olhando para
  ele — e balança a cada três segundos. Vale enquanto EXISTIR notificação "para você", não só
  enquanto for nova: é a regra da pílula da atribuída, que pulsa até o play. Abrir o sino não
  o cala; o trabalho andar, sim. Com o painel aberto ele para de balançar.
- **A PRESENÇA ABRE UM PAINEL** (17/09/2026, pedido do gestor). A fileira de avatares virou
  GATILHO: o clique abre a lista com todo mundo que está na tela, com estado e frase de
  atividade por extenso, ocupadas primeiro — a pergunta ali é "quem está livre para pegar a
  próxima". Eu apareço em primeiro lugar, marcada com "você": sem isso a contagem do painel
  discordaria da sala. O cartão de hover SAIU: ele dizia o que cada linha do painel diz, e
  manter os dois faria o mesmo retrato responder de dois jeitos. A fileira continua fora do
  mobile pela razão de 06/09 — o espaço que sobra ali é do sino.
- **Etapas**: iniciar/pausar/concluir, handoff, rendição, aviso, estação (`pc-1`,
  anotável tanto nas seções laterais quanto na lista de etapas do card — a edição de
  FOTOS não tem seção, então lá era o único lugar possível, e até 06/09/2026 o campo
  aparecia sem ser editável),
  **dispensar** (não vai acontecer) e **acrescentar** fora do pacote — inclusive
  `encontro_irmaos`, `saida_uti` e `alta`, que nenhum pacote traz de fábrica.
  **A RENDIÇÃO SE TIRA** (21/09/2026, pedido do gestor). O menu da etapa ganha "Tirar
  rendição de X" quando há uma combinada. O banco sempre soube — `planejar_rendicao` com
  pessoa nula apaga o plano e grava `rendicao_cancelada` —, faltava a porta: a tela só
  deixava TROCAR quem assume.
- **Seções laterais**: REELS, MASTER e UTI. O **vídeo horizontal do MASTER** tem fluxo
  próprio de 4 fases (Editando · Alterações · Pronto para entrega · Enviado/finalizado),
  trazido do Trello da equipe. O vídeo NÃO se opera pelo card — só pela seção; foto e o
  resto continuam no card.
  **A seção MASTER tem a fase E o relógio** (09/09/2026, pedido do gestor). Até aqui só
  havia o seletor de fase, e a regra escrita era "o vídeo não anda por play/pause/concluir".
  Ela media bem o TRAJETO do vídeo e não media nada do TEMPO dentro dele: um vídeo de dez
  dias úteis ficava "Editando" a semana inteira, incluindo os dias em que ninguém sentou
  nele — e tempo de edição de vídeo é justamente o que a empresa quer cobrar (seção 9).
  As duas coisas não brigam porque respondem a perguntas diferentes: a fase é ONDE o vídeo
  está no fluxo, o relógio é QUANTO se trabalhou. O banco já as tratava juntas —
  `mover_video_master` sempre carimbou `iniciado_em`, `pausa_acumulada` e `pausado_em`, e
  `faseDoVideo` sempre leu `pausada` como "Editando". Faltava a porta na tela.
  Em ALTERAÇÕES e em PRONTO o play fica desabilitado dizendo que ali quem manda é a fase —
  a guarda já existia em `podeIniciar` e continua certa: nesses dois estados o vídeo não
  está sendo editado, está esperando alguém de fora.
  **O cartão da seção mostra o PACOTE** (09/09/2026, pedido do gestor), na mesma pílula
  `bg-marca-suave` da linha do Quadro. Ele decide o que aquele reels é — formato do
  vertical, se há cadeado a produzir, qual o prazo —, e sem ele quem edita tinha que voltar
  ao Quadro e abrir o card para descobrir de que pacote era a rodada que já estava em mãos.
  A seção existe justamente para não precisar voltar. Vale para a MASTER também, que
  compartilha o cartão (`CartaoDeEdicao`), e ali distingue MASTER de MASTER + ÁLBUM.
- **A seção FOTO/LIVRO** (10/09/2026, pedido do gestor, migration `20260910150425`). O
  fotolivro ganhou o mesmo arranjo do vídeo do MASTER — cartão na coluna lateral, seletor de
  fase, play/pause do lado — a partir do segundo quadro do Trello da equipe.
  **A FASE MORA NUMA COLUNA PRÓPRIA (`caso_etapas.fase_album`), e não em `status_etapa`.**
  Isto contraria a 20260901051229, que argumentou o contrário para o vídeo — e o argumento
  estava certo LÁ: as cinco fases do vídeo SÃO o status ("Editando" é `em_andamento`).
  No fotolivro não se repete: das dez fases, UMA é trabalho acontecendo ("Realizando
  diagramação"); as outras nove são o produto ESPERANDO — pagamento, aprovação do cliente,
  gráfica, entrega. Um status de etapa chamado `enviado_grafica` não descreve trabalho
  nenhum, e cairia nas quatro tabelas exaustivas de `StatusEtapa` da tela com uma linha sem
  significado para as outras dez etapas do sistema.
  **As duas nunca discordam porque nunca são escritas separadamente:** `mover_album` escreve
  fase E status na mesma transação — `diagramando` vira `em_andamento`, `entregue` vira
  `concluida`, e toda fase de espera vira **`pausada`**. Pausada e não `pendente`: o relógio
  de ciclo já desconta pausa, e é isso que faz o tempo medir DIAGRAMAÇÃO em vez de
  calendário. A objeção de "duas colunas para manter em acordo" só vale com dois caminhos de
  escrita; aqui existe um.
  **A coluna "ESTÁ NA UTI" do Trello NÃO virou fase** (decisão do gestor): UTI já é estado do
  CASO aqui — `uti_desde` pausa o SLA, tira o card do bloco do dia e tem seção própria.
  Repetir como fase criaria duas fontes que podem discordar.
  **"Aguardando pagamento" e "Aguardando diagramação" são DUAS fases**, e a distinção é de
  dono: a primeira espera o CLIENTE, a segunda espera a EQUIPE. Juntá-las apagaria de quem é
  a bola, que é o que a coordenação usa para saber de quem cobrar.
  **A seção gateia por TIPO DE ETAPA, não por pacote** (seção 12): `album` é de fábrica só no
  MASTER + ÁLBUM, mas entra em qualquer caso por `adicionar_etapa` — o Trello deles já mostra
  um BIRTH + REELS no meio dos MASTER.
  **Ordena pela ESTEIRA, não por prazo.** O prazo do pacote é do parto: ele venceu há semanas
  quando o álbum ainda está na gráfica, e ordenar por ele deixaria a lista inteira vermelha
  sem dizer nada. Fotolivro sem fase declarada vai para o TOPO — é o único que corre risco de
  ser esquecido de verdade.
  **A cor da fase diz DE QUEM É A BOLA**, não o quanto falta: âmbar quando é da equipe,
  neutra quando espera gente de fora, azul/verde no que anda. Um degradê de progresso seria
  bonito e inútil — a pergunta é "o que depende de mim".
  **O CARD NÃO OPERA O FOTO/LIVRO** (10/09/2026, pedido do gestor), pela mesma razão do
  vídeo: a linha da etapa mostra "na seção Foto/Livro" no lugar dos botões. Oferecer
  play/concluir ali daria DOIS caminhos para o mesmo trabalho, e o do card pularia de
  pendente direto para concluída sem passar por fase nenhuma. A linha CONTINUA aparecendo —
  o card é o checklist do caso, e sumir com ela esconderia o que falta. O que ela perde é só
  o poder de agir. Resolvida, a etapa sai da seção e recupera o desfazer no card.
  Quais etapas caem nessa regra é a tabela `SECAO_DA_ETAPA` em `AcoesDoCaso.tsx`, e ela
  também guarda o NOME da seção — antes o texto "na seção Master" estava cravado na linha, e
  a segunda etapa a entrar na regra teria mandado a pessoa para a seção errada.
  **O NOME É "FOTO/LIVRO", UM SÓ** (10/09/2026, pedido do gestor). O sistema chamava a mesma
  coisa de dois nomes — a etapa era "Álbum" e a seção era "Foto/Livro". Ficou o nome que a
  EQUIPE usa, que é o do quadro do Trello deles (seção 2: vocabulário da operação na tela).
  Mudaram o rótulo da ETAPA (`ROTULO_ETAPA`, e o mapa gêmeo em `features/equipe`) e o do
  ENTREGÁVEL (`ROTULO_TIPO` em `Entregaveis.tsx`); o identificador no banco continua `album`,
  mesmo arranjo de `operador`/"Fotógrafo(a)" e `entregas`/"Entregáveis".
  **ARMADILHA ao mexer nisso:** "álbum" também significa a GALERIA DO GOOGLE em vários
  lugares do código — "o link do álbum", "subir as fotos no álbum", "a Morgana abre o álbum e
  é a família errada". São duas coisas diferentes, e trocar aquelas por "Foto/Livro"
  produziria frases erradas. Uma busca-e-substitui cega quebra isso.
- **MASTER E FOTO/LIVRO ABREM EM MODAL** (15/09/2026, pedido do gestor). Na coluna da direita
  as duas seções continuam no mesmo lugar, fechadas do mesmo jeito (título e contador), mas o
  clique abre um modal largo (`SecaoEmModal`, sobre `ModalAmplo`) em vez da sanfona. Motivo: a
  sanfona tinha teto de 192px — pedido do próprio gestor, para nenhuma seção roubar altura do
  REELS —, e um cartão com nome, pacote, seletor de fase e play/pause não cabia para ser mexido.
  O modal resolve sem quebrar a regra do teto: o REELS não perde nada. Os CARTÕES SÃO OS MESMOS
  (`CartaoDeEdicao`, com as mesmas ações e o mesmo realtime). A UTI continua sanfona; o celular
  continua com as abas de tela cheia.
  **DUAS VISÕES EM TESTE, com chave no cabeçalho do modal:** LISTA (grade de cartões maiores, na
  ordem de sempre) e POR FASE (uma coluna por fase, "Sem fase" primeiro). A escolha fica no
  `localStorage` do aparelho e começa em POR FASE. Isso REABRE uma decisão escrita: quando as
  seções nasceram, o quadro de colunas foi descartado (ver `FaseDoVideo`), porque a pergunta
  ali é sobre UM caso e não sobre carga por coluna. O gestor pediu para ver e está inclinado à
  lista — **a visão que perder sai, e a chave junto**.
  **ARRASTAR ENTRE AS COLUNAS** (16/09/2026, pedido do gestor: "como em clickup e outros
  kanbans"). Só na visão POR FASE, e só no MOUSE: o arrastar nativo do HTML não existe no
  toque, e é o gesto mais difícil de acertar com uma mão num corredor (seção 6). **O SELETOR
  DE FASE DO CARTÃO CONTINUA SENDO O CAMINHO**, e é o único que funciona no celular e por
  teclado — arrastar é atalho, e cai nas MESMAS RPCs (`mover_video_master`, `mover_album`,
  `finalizar_video_master`), com o mesmo erro no mesmo alerta. Dois detalhes que não são
  capricho: um gesto começado num CONTROLE (o seletor, o campo do PC) não arrasta o cartão —
  quem sabe onde a mão caiu é o `mousedown`, e ele grava isso num `data-` do próprio nó —, e
  **"Sem fase" NÃO RECEBE cartão**, porque não existe RPC que APAGUE a fase de um trabalho, e
  oferecer um alvo que o banco recusa ensina a duvidar do quadro.
  **A COLUNA FINAL É DE SAÍDA e vive vazia:** quem chega nela conclui a etapa e sai da seção.
  Ela existe por dois motivos — é o alvo de quem arrasta para terminar (perguntando antes, e
  pedindo o link no vídeo, com o MESMO texto do seletor: `lib/fim-da-edicao.ts`), e é onde
  aparece o vídeo ANTIGO parado em "pronto para entrega", de quando essa fase era de
  passagem. Sem ela aquele vídeo caía em "Sem fase" com a pílula dizendo "Pronto para
  entrega" logo abaixo: a coluna e o cartão discordando na mesma tela.
- **O FIM DO VÍDEO E DO FOTO/LIVRO VIROU UM ESTADO SÓ** (16/09/2026, pedido do gestor,
  migration `20260916180834`). "Pronto para entrega" e "Enviado / finalizado" eram
  redundantes — a equipe marcava os dois no mesmo minuto, e o segundo só afirmava que
  alguém tinha mandado o link, que era justamente o que ninguém registrava.
  **NO VÍDEO, O FIM COBRA O LINK.** Escolher "Pronto para entrega" abre um diálogo que não
  fecha sem a URL; com ela, `finalizar_video_master` grava o entregável e conclui a etapa
  **na mesma transação** — meio caminho produziria link órfão num vídeo aberto, ou um vídeo
  "entregue" sem endereço para a família. O tipo de entregável **`video`** nasceu aqui
  (decisão do gestor: tipo próprio, não "wetransfer" — o meio pelo qual o arquivo viaja muda,
  e o que a lista precisa dizer é O QUE é aquele link). O seletor passa a ter duas fases
  (Editando, Alterações) mais o fim; `mover_video_master` continua aceitando 'concluida',
  porque a regra comercial vive na tela.
  **NO FOTO/LIVRO, o fim é confirmação simples**, sem link: o fotolivro é objeto físico. São
  nove fases na tela; `pronto_para_entrega` sumiu do seletor e o fim é `entregue`, agora
  rotulado "Pronto para entrega". O valor continua no enum — fase de banco não se apaga.
  **REVISTO EM 21/09/2026:** o fim do fotolivro voltou a ter duas fases, com a conferência da
  Morgana no meio — ver "O FOTOLIVRO PASSA POR ENTREGÁVEIS DUAS VEZES", logo abaixo.
- **O FOTOLIVRO PASSA POR ENTREGÁVEIS DUAS VEZES** (21/09/2026, pedido do gestor, migration
  `20260921202848`). O fluxo, nas palavras dele: terminada a diagramação, o fotolivro vai para
  Entregáveis "sinalizado como foto livro, pois a Morgana irá pegar o link e enviar para o
  cliente"; na seção ele FICA em "Aguardando aprovação"; aprovado, a Morgana segue arrastando
  (pago, gráfica); dez dias depois vai para "Pronto para entrega" e "mais uma vez vai para
  Entregáveis". Até aqui o "concluir" do cartão chamava `concluir_etapa` e o livro inteiro
  acabava — "o card simplesmente se move sozinho" —, e escolher a fase final também concluía.
  **A APROVAÇÃO EXIGE CAPA E LINK** (decisão do gestor: os dois obrigatórios). A capa é "png
  simples, podendo até ser um print da tela" — o diálogo (`DialogoAprovacaoDoFotolivro`) aceita
  arquivo ou Ctrl+V do print. Ela sobe para o bucket privado `midias`, na pasta
  `fotolivro/<caso_etapa_id>/`, e a etapa guarda só o CAMINHO (`fotolivro_capa`); o link fica em
  `fotolivro_link`. Colunas próprias, e não um entregável: a prova vai e volta com o cliente, não
  é o link final da família. Nomes com `fotolivro` porque "álbum" também é a galeria do Google
  (ver a armadilha acima). `enviar_fotolivro_para_aprovacao` grava os dois e move a fase NA
  MESMA TRANSAÇÃO, delegando a fase a `mover_album` — e `mover_album` recusa entrar em aprovação
  sem os dois, para quem não passar pelo diálogo. Os três caminhos da tela abrem o mesmo
  diálogo: o seletor, o arrastar e o "concluir" do cartão (que, antes da aprovação, passou a ser
  "terminar a diagramação e mandar para aprovação"; depois dela o cartão não conclui nada).
  **"ENVIADO AO CLIENTE" TIRA O LIVRO DE ENTREGÁVEIS** (decisão do gestor), e só ele: na seção o
  cartão continua em "Aguardando aprovação", com a pílula "Enviado ao cliente" no lugar de "Na
  fila do ADM". `marcar_fotolivro_enviado` é do atendimento ou adm (a Morgana é atendimento) e
  idempotente. Uma prova NOVA — a volta de um pedido de alterações — zera o carimbo e o livro
  volta para a fila.
  **"PRONTO PARA ENTREGA" VOLTOU A SER FASE, e "ENTREGUE" VIROU CONFIRMAÇÃO** (decisão do
  gestor). Em 16/09 as duas viraram uma só por redundância; agora entre elas existe a
  conferência. Pronto fica ABERTO (pausada) e aparece em Entregáveis; "Confirmar entrega" ali
  grava `entregue`, conclui a etapa e tira o cartão da seção. `mover_album` recusa `entregue` de
  quem não é atendimento ou adm, e de qualquer fase que não seja pronto. O seletor mostra todas
  as fases menos `entregue`, e o quadro por fase perdeu a coluna de saída do fotolivro.
  **O banco NÃO recusa `concluir_etapa` no fotolivro**: a tela não o oferece mais, e reescrever
  a RPC mais usada do sistema por um caminho que nenhuma tela chama não compensava. É o arranjo
  de sempre, a tela mais estrita que o banco.
  **A aba Entregáveis** mostra os livros numa seção própria, "Foto/Livro", depois dos casos, em
  cor da marca (o verde diz "fechar o caso", e o caso pode estar encerrado há semanas). A
  contagem e o anel da aba somam os dois. O sino avisa atendimento e adm com o mesmo tipo da
  entrega de caso.
- **A FICHA DO CARTÃO** (21/09/2026, pedido do gestor: "abrir esse card como num ClickUp ou
  Trello"). Nas seções MASTER e FOTO/LIVRO o NOME do caso no cartão é um botão que abre a ficha
  (`FichaDaEdicao`, sobre `ModalAmplo` no tamanho `ficha`): os controles do cartão no alto, a
  aprovação do fotolivro (capa em tamanho de ver, link para copiar, quem mandou e quando), os
  pedidos do cliente por extenso, os links do caso, os detalhes da etapa (com quem está, quem
  assume, estação, prazos) e o histórico do caso. **Nada ali é um segundo caminho:** os
  controles são os mesmos do cartão (`controlesDoMaster`/`controlesDoFotolivro` na QuadroPage
  servem os dois), a lista de links e o histórico são os do card do Quadro. A ficha guarda só
  os ids e relê o caso a cada render, então acompanha o Realtime. O nome como botão não
  atrapalha o arrastar: gesto começado num controle não arrasta, e o resto do cartão continua
  arrastável. O histórico ganhou frase para os eventos do fotolivro ("Moveu o Foto/Livro
  para…", "Mandou para aprovação", "Enviou a prova ao cliente").
- **PRAZO E PEDIDOS NO CARTÃO DE EDIÇÃO** (16/09/2026, pedido do gestor). Ao lado da fase, duas
  pastilhas novas no vídeo e no fotolivro:
  **PRAZO** (`PrazoDaEtapa`) é a "Data Entrega" do Trello deles: um `datetime-local` que grava
  `caso_etapas.previsao_em` por `agendar_etapa` — RPC que já existia para a hora do banho, e
  data PLANEJADA é a única que a invariante 3.4 deixa vir do cliente. Fica VERMELHA quando
  passa, sem pulso (o pulso é do chamado). **Não é o SLA:** o prazo do pacote é derivado do
  nascimento e responde "a empresa cumpriu o que vendeu"; este responde "para quando
  prometemos ESTE vídeo", e é combinado caso a caso, muitas vezes depois do caso encerrar.
  **PEDIDOS** (`PedidosDaEtapa`) é a observação da etapa (`anotar_etapa`), onde entram os
  pedidos da família — prints, link de música. O texto aparece POR EXTENSO dentro do cartão,
  que por isso cresceu.
  **EM ÂMBAR, COM TARJA E NOME** (16/09/2026, segunda volta do gestor: "o pedido ficou meio
  sem destaque"). Era um bloco no tom do cartão e passava por legenda. Agora a pastilha e o
  bloco dividem a cor de ATENÇÃO, e o bloco diz o que é ("Pedidos do cliente"). O que ele NÃO
  tem é o vermelho e a onda do aviso do Quadro, de propósito — ver o parágrafo seguinte.
  **E AS AÇÕES DESCERAM UMA LINHA** no cartão do MASTER e do FOTO/LIVRO (`acoesAbaixo`): são
  quatro controles — prazo, pedidos, fase e o play/concluir —, e dividir a largura com o nome
  da etapa espremia os dois ("ficou tudo meio amontoado no card"). No REELS continuam ao
  lado, porque lá são dois botões e uma linha a mais custaria altura na única seção com teto
  de 192px. **NÃO entra na faixa de aviso do card** (decisão do gestor): aquela
  faixa pulsa em vermelho para quem está na maternidade, e um pedido de música dentro de um
  vídeo de dez dias úteis ensinaria a equipe a ignorá-la. A lista está em
  `SEM_FAIXA_NO_CARD` (AvisosDoCaso) e é a mesma de `SECAO_DA_ETAPA`.
- **PEDIDO DE ALTERAÇÃO NÃO REABRE O CASO** (16/09/2026, pedido do gestor). Quando a família
  pede mudança num vídeo ou fotolivro já finalizado, a etapa volta SOZINHA para a fase de
  alteração — "Pedir alteração" na linha da etapa dentro do card, que chama
  `mover_video_master('em_alteracao')` ou `mover_album('pedido_de_alteracoes')`. As duas RPCs
  aceitam caso encerrado desde 20260903153101 e 20260910150425, e é para isto que serve.
  O caso continua encerrado, os links continuam confirmados, e o que reabre é o trabalho.
  **`reabrir_etapa` não serve:** recusa caso terminal e devolveria a etapa para "em
  andamento", que no vídeo não é fase nenhuma.
  **E O PEDIDO ENTRA PELO DIÁLOGO DE REABERTURA** (mesmo dia, segunda volta do gestor,
  migration `20260916215022`). De manhã as duas SAÍRAM da lista "o que precisa ser refeito",
  porque reabrir o caso inteiro por um ajuste de dez minutos era o que ele pediu para acabar.
  Ele olhou e trouxe o que faltava: **a equipe usa ESSE diálogo**, inclusive quando o pedido
  é só do vídeo — é lá que se escreve o que a família pediu, e é lá que se olha quando um caso
  entregue volta a ter trabalho. Tirar as duas da lista não tirou o pedido do caminho delas,
  só escondeu a porta.
  Então elas voltaram para a lista, **com comportamento diferente**, e quem decide é o TIPO:
  marcar "Foto" chama `reabrir_caso` (rodada nova, cartão de volta ao Quadro, prazo
  recomeçando); marcar "Vídeo" ou "Foto/Livro" chama `pedir_alteracao_da_etapa`, que devolve
  SÓ a etapa para a fase de alteração — **o caso continua encerrado**. Marcar dos dois lados
  faz as duas coisas, e o diálogo diz em voz alta o que acontece com o que está marcado
  agora: um botão com dois efeitos sem aviso seria pior que dois botões.
  A RPC nova faz as duas escritas **na mesma transação** — mover a fase e guardar o pedido —
  porque separadas a rede caindo no meio produz um vídeo em ALTERAÇÕES sem ninguém saber o
  que alterar, que é o estado que o pedido existe para evitar. Ela DELEGA a fase para
  `mover_video_master`/`mover_album` em vez de repetir o UPDATE (uma segunda definição de
  "mover" receberia só metade da próxima correção), e **SOMA** o pedido à observação em vez
  de escrever por cima: aquele campo é onde moram os PEDIDOS DO CLIENTE, e um pedido novo que
  apagasse o anterior mandaria a editora para a estação com metade do que a família pediu.
  As duas só aparecem na lista quando estão RESOLVIDAS — vídeo ainda aberto está na seção,
  onde a fase se muda direto.
  O botão da linha da etapa no card continua existindo, e desde 16/09 com o NOME escrito
  ("Pedir alteração") em vez de um ícone solto: ele é lido quase sempre em CONCLUÍDOS, onde
  não há pressa de um toque nem falta de largura, e uma seta sozinha não diz o que faz.
- **O FOTOLIVRO NÃO SEGURA O ENCERRAMENTO** (10/09/2026, decisão do gestor, mesma migration).
  É a segunda exceção da trava, ao lado do `edicao_video` — `liberar_para_entrega` e
  `confirmar_entrega` passaram a dizer `ce.tipo not in ('edicao_video', 'album')`.
  Mesmo motivo do vídeo, com um agravante: a maior parte da esteira do fotolivro é espera por
  gente de fora, trabalho que a equipe **não pode acelerar nem terminar**. Segurar o
  encerramento nisso prenderia o card na lista do dia por um mês. O evento de
  `entrega_confirmada` ganhou `fotolivro_pendente` ao lado de `video_master_pendente`, pela
  mesma razão de sempre: sem isso, daqui a um ano ninguém reconstrói por que um caso
  encerrado tinha etapa aberta.
  **A TELA SÓ ACOMPANHOU EM 14/09/2026.** A migration mudou as RPCs e ninguém mudou
  `lib/acoes.ts`: `podeLiberarParaEntrega` e `podeConfirmarEntrega` continuaram excluindo
  só `edicao_video`, e o botão de enviar ficava desabilitado dizendo "falta Foto/Livro"
  para um caso que o banco aceitaria. Quatro dias de tela e banco discordando sem erro em
  lugar nenhum — a mesma classe de bug da nota sobre paginação na seção 5. A lista agora é
  UMA constante, `NAO_SEGURAM_A_ENTREGA`, espelho literal do `not in` das duas RPCs; a
  próxima etapa que entrar nessa regra muda os dois lados ou nenhum. Em Concluídos o card
  ganhou o selo **"Foto/Livro em andamento"**, como o do vídeo.
- **O LINK DE ENTREGA É COBRADO NO ENVIO para Entregáveis** (15/09/2026, pedido do gestor),
  em TODO pacote — e não mais na conclusão da edição de fotos. Concluir qualquer etapa é um
  toque, no card e na seção lateral.
  **A história, porque ela vai tentar voltar.** De 04/09 a 15/09 a conclusão da edição de
  FOTOS abria um diálogo e não fechava sem o link (o de Google; no BIRTH, o CADEADO), e o reels
  do BIRTH mostrava o cadeado para o vertical subir dentro dele. O argumento era bom — quem acaba
  de editar tem a URL na mão —, e a operação mostrou o contrário: a etapa ficava presa esperando
  um endereço que muitas vezes ainda não existia, e quem ENVIA o caso é quem confere os links de
  qualquer forma. A equipe pediu a trava no envio, e foi o gestor que trouxe o pedido.
  **O que segura o envio agora** (`DialogoConfirmarEntrega`): TODO link do pacote (21/09/2026,
  pedido do gestor). De 15/09 a 21/09 só o LINK PRINCIPAL travava — Google fora do BIRTH,
  CADEADO nos dois BIRTH — e o WeTransfer era uma caixa marcável sem link nenhum: o caso ia
  para Entregáveis com um endereço de dois, e a caixa afirmava "WeTransfer completo" sobre um
  WeTransfer que não existia. O argumento de então era "um caso sem WeTransfer existe"; o gestor
  disse que não existe, em nenhum pacote. **Os links por pacote:** Google + WeTransfer na
  maioria; **Google + WeTransfer + CADEADO em BASIC e STANDARD** (`COM_CADEADO`, os dois
  NOMEADOS — BASIC + REELS e BASIC REELS ficam com dois; no remoto, nenhum BASIC REELS enviado
  desde 11/09 levou cadeado, e BASIC e STANDARD levaram em metade, que é a metade que o pedido
  fecha); só o CADEADO nos dois BIRTH. Faltando algum, a linha da caixa diz "Falta este link para
  enviar" (ou "para confirmar", na aba Entregáveis) e o "Adicionar link" o registra ali mesmo; o
  botão só acende com todos. O botão "Enviar para Entregáveis" do card deixou de exigir link
  para abrir — exigir ali prenderia a pessoa fora do único diálogo que pede o link.
  **O banco continua mais frouxo** (ao menos um entregável), e isso é deliberado: o diálogo é
  mais estrito que o banco, nunca mais frouxo, e os dois únicos caminhos até
  `liberar_para_entrega` e `confirmar_entrega` passam por ele.
  A trava do banco não mudou: `liberar_para_entrega` e `confirmar_entrega` exigem ao menos um
  entregável, e a do diálogo é mais estrita do que ela, nunca mais frouxa.
  **Saíram** `lib/links-da-conclusao.ts`, `DialogoConcluirComLinks` e o hook da conclusão com
  link. A RPC `concluir_etapa_com_entregaveis` ficou no banco, sem uso na tela.
- **A aba ENTREGÁVEIS** (06/09/2026), entre Quadro e Rascunhos. O card verde deixou de
  oferecer "Confirmar entrega" a qualquer um: quem termina o trabalho aperta **"Enviar para
  Entregáveis"**, o caso SAI DO QUADRO, e o ADM confere os links e confirma lá. É a
  separação que a operação já fazia — a fotografia é de uma pessoa, a entrega à família é de
  outra.
  **A LISTA É DE TODO MUNDO; a confirmação é do ADM e da gestão.** Quem enviou precisa poder
  ver se já foi entregue, ainda mais com o caso fora do Quadro — esconder a aba deixaria a
  fotógrafa sem lugar nenhum para olhar. Quem não confirma vê "aguardando o ADM" no lugar do
  botão, e não um botão cinza: uma fileira de botões desabilitados ensina a ignorar o que
  está desabilitado. A trava de verdade está em `confirmar_entrega` (ver invariante 3.5).
  **A MESMA CONFERÊNCIA acontece nos DOIS momentos** — o checklist aparece ao enviar e ao
  confirmar. É deliberado: quem edita marca o que produziu, quem entrega marca o que viu, e
  duas pessoas sobre a mesma lista pegam o que uma sozinha deixaria passar.
  **O QUE SE CONFERE MUDOU EM 11/09/2026** (pedido do gestor). Fora do BIRTH são DUAS
  caixas: *Fotos e reels completos no Google* — uma só, porque os dois moram no mesmo álbum,
  e conferir em duas linhas o que é um endereço só era pedir a mesma coisa duas vezes — e
  *WeTransfer completo*, que não estava na lista e é o segundo endereço que a família de
  fato recebe. Nos dois BIRTH é UMA caixa: *Link CADEADO completo*, no lugar das quatro
  antigas (fotos, reels, cadeado F+V e cadeado F+V com final), que conferiam endereços que
  a operação não produz mais separadamente.
  O rótulo da primeira ainda depende de HAVER REELS no caso — "Fotos completas no Google"
  quando não há, como no MASTER desde 03/09. A condição olha as ETAPAS, não o slug: pedir a
  conferência de um vertical que não existe ensina a marcar caixa sem olhar, que estraga a
  única coisa que este checklist faz.
  **O LINK FICA DEBAIXO DA CAIXA, e nasce ali quando não existe.** Conferir "fotos
  completas" sem o endereço à mão obrigava a fechar o diálogo, achar o link na lista do card
  e abrir de novo — e quem faz isso três vezes, na quarta marca sem olhar. Faltando o link
  daquele tipo, um "Adicionar link" ali mesmo o registra por `registrar_entregavel`, com o
  tipo da própria caixa.
  **A CAIXA ESPERA PELO LINK** (21/09/2026 — até essa data não esperava, e o motivo era poder
  enviar caso sem WeTransfer, que o gestor disse não existir). Marcar continua sendo gesto
  humano de conferência — o link existir não marca nada sozinho —, mas não se confere o que não
  existe: sem link daquele tipo a caixa fica apagada. Uma caixa marcada cujo link é apagado com
  o diálogo aberto deixa de contar.
  A pílula da aba ganha o **anel verde girando** quando há fila — o mesmo recurso do vídeo
  parado na seção REELS (`.anel-alerta`), ali em vermelho porque é prazo correndo, aqui em
  verde porque é trabalho pronto esperando alguém. Sem fila ele some; se girasse sempre não
  chamaria ninguém.
  A lista é ordenada por **ordem de envio**, não por prazo: prazo é a régua do Quadro, onde
  o trabalho ainda acontece; ali o trabalho acabou e quem espera há mais tempo vem antes.
  **OS TIPOS DE LINK SÃO SEIS** desde 16/09/2026: Google Photos, WeTransfer, cadeado, reels,
  Foto/Livro e **Vídeo** — este último nasceu com a finalização do horizontal do MASTER, e é
  o único que uma RPC registra sozinha (`finalizar_video_master`).
  **O LINK TEM AÇÕES** (07/09/2026): copiar e apagar, na própria linha. O caso que
  motivou é a Morgana abrindo o álbum e sendo a família errada. Copiar existe porque o
  link é para ser MANDADO — selecionar uma URL truncada com o dedo, num link clicável,
  abre a galeria em vez de copiar. Apagar só vale enquanto o link não foi confirmado:
  depois disso ele faz parte de uma entrega fechada, e o caminho é `reabrir_caso` — sem
  essa guarda um caso encerrado poderia ficar sem entregável, estado que a invariante 3.5
  proíbe.
  **APAGAR O LINK NÃO DEVOLVE O CASO.** São duas falhas diferentes: link errado com
  trabalho certo pede só um link novo; material errado pede `reabrir_etapa`. Quem julga
  que o trabalho tem de voltar aperta **"Devolver ao Quadro"**, com motivo obrigatório, e
  isso é do mesmo par de papéis que confirma — as duas são as saídas da mesma conferência.
  Devolver NÃO reabre etapa nenhuma: o trabalho continua concluído, o que voltou foi a
  entrega.
  **REABRIR UM CASO TAMBÉM TIRA ELE DAQUI** (09/09/2026, migration `20260909145223`).
  `reabrir_caso` é de 28/08 e as colunas `liberado_para_entrega_em/_por` chegaram em 06/09 —
  a função nunca soube que elas existiam, e um caso encerrado sempre passou por esta aba.
  Resultado: toda reabertura entre 06/09 e 09/09 deixou o caso num limbo — **fora do
  Quadro**, que lista só `liberado_para_entrega_em is null`, e **dentro de Entregáveis**,
  cobrando do ADM a entrega de um trabalho que acabou de voltar a fazer. A editora recebia
  a rodada nova só na seção lateral, **sem o card e portanto sem o motivo da reabertura**,
  que `reabrir_caso` grava na observação da etapa e que `AvisosDoCaso` mostraria.
  Quatro casos ficaram presos assim. O backfill da migration limpa só os que têm
  `liberado_para_entrega_em < reaberto_em`: **dois dos quatro foram reabertos, refeitos e
  reenviados de propósito**, e limpar os quatro os arrancaria da fila do ADM. A ordem dos
  carimbos é o que separa resíduo de envio novo.
  **A lição maior:** quando uma coluna nova entra, quem ESCREVE nela é fácil de achar; quem
  deveria LIMPÁ-LA não. `devolver_para_o_quadro` nasceu depois da aba e já limpava — a
  função que existia desde antes foi a que ficou para trás.
  **O nome na tela é "Entregáveis" e no código é `entregas`** — decisão do gestor sobre a
  tela, e o código não segue porque `Entregaveis.tsx` já é o componente da lista de LINKS do
  caso. Mesmo arranjo de `operador`/"Fotógrafo(a)" (invariante 3.1): o rótulo é do
  vocabulário da operação, o identificador é do código.
- **Encerramento** com o MESMO checklist de conferência do envio — ver a aba Entregáveis,
  acima — e ao menos um entregável registrado.
- **DESPESAS DO CASO** (12/09/2026, pedido do gestor, migration `20260913022926`). O botão
  **"Despesa"** fica ao lado de "Acrescentar etapa" — foi onde ele pediu, e os dois combinam:
  nenhum dos dois nasce do contrato, os dois nascem do que aconteceu. A LISTA e o TOTAL ficam
  embaixo, ao lado dos links de entrega, porque lançar e conferir são gestos diferentes:
  lançar acontece no corredor, conferir acontece sentado.
  **É A FAIXA "DESPESAS" DA PLANILHA**, que tem IDA 1 / VOLTA 1, IDA e VOLTA da substituição,
  IDA 2 / VOLTA 2, e duas colunas de REFEIÇÃO EXTRA (uma de parto, uma de fechamento), cada
  par com um dropdown de nome. Aqui isso é uma LISTA: a planilha repete as colunas porque
  grade não cresce, e o terceiro deslocamento não teria onde entrar.
  Tipos: `uber_ida`, `uber_volta`, `refeicao` e `outro` — este exige descrição, por
  constraint, senão vira linha que ninguém confere depois.
  **O "MOMENTO" É RÓTULO, NÃO ETAPA** (parto · substituição · fechamento, opcional). Amarrar
  a despesa a uma linha de `caso_etapas` seria mais bonito e quebraria na SUBSTITUIÇÃO, que
  é handoff e não etapa — não existe `caso_etapas` para "a Thalia rendeu a Sarah às 4h".
  **DUAS PESSOAS, DUAS COLUNAS:** `pessoa_id` é de quem foi o gasto (o dropdown de nome da
  planilha) e `registrado_por` é quem digitou. Elas discordam sempre que o ADM lança pela
  fotógrafa, que é metade dos casos. Sem `p_pessoa_id`, a despesa é de quem está lançando.
  **CASO CANCELADO ACEITA DESPESA**, e isso é deliberado: a corrida acontece mesmo quando o
  parto não acontece, e esse é justamente o gasto que a empresa precisa enxergar. Travar em
  "só caso aberto" apagaria do total do mês a viagem que foi paga à toa. Vale o mesmo para
  encerrado — a fatura do cartão chega depois da entrega.
  **NÃO EXISTE EDITAR.** Valor errado se corrige apagando e lançando de novo, como no link de
  entrega e pelo mesmo motivo: um UPDATE silencioso deixaria `eventos` dizendo R$ 140 num dia
  em que a linha viva diz R$ 14, sem nada que explique a diferença. O evento de remoção
  guarda o valor que era.
  **O TOTAL DA LISTA DO CARD É SOMADO NO CLIENTE** e isso só vale porque a lista inteira de
  UM caso está na tela, sem paginação. Tudo que soma MAIS de um caso é do BANCO — ver o
  relatório logo abaixo.
  A escrita é só por RPC — `authenticated` tem SELECT em `despesas` e mais nada.
- **RECOLHIMENTO DAS DESPESAS** (14/09/2026, pedido do gestor, migration `20260914195059`).
  **Quem LANÇA são as funcionárias, no card; quem RECOLHE é o financeiro.** Até aqui só
  existia o primeiro lado: o gasto vivia dentro de cada card, e somar um mês exigia abrir
  caso por caso.
  **A tela `/quadro/despesas`** é do `financeiro` e da `gestao` (`RotaDoFinanceiro`, guarda
  PRÓPRIA e não a `RotaDeGestao` com um papel a mais — juntar as duas abriria a Equipe para
  o financeiro). Um mês por vez, com seta e não calendário; totais do mês; uma linha por caso
  com a quebra por tipo; e **Exportar CSV** no formato que abre direto no Excel pt-BR (`;`
  como separador, vírgula decimal, BOM UTF-8 — sem os três o arquivo abre ilegível).
  **O MÊS É O DO ATENDIMENTO, não o do lançamento.** A planilha é por mês de parto: a corrida
  de um parto de setembro lançada em outubro, quando a fatura chegou, pertence a setembro.
  Filtrar pelo lançamento espalharia o gasto de um parto por dois meses.
  **TODA SOMA DE MAIS DE UM CASO É DO BANCO.** `despesas_por_caso` devolve uma linha por
  caso já somada e quebrada por tipo, e a tela pagina com `buscarTudo` mesmo sendo ~135
  casos por mês: relatório é justamente a consulta que alguém um dia estica para o ano, e
  sem paginação o PostgREST corta em mil e o total sai menor com cara de certo.
  `quadro_casos.total_despesas` traz o mesmo número para o card, sem consulta extra — ZERO
  e nunca nulo, para "sem despesa" não se confundir com "não carregou".
  **CANCELADOS ENTRAM NO RELATÓRIO**, com selo: é o gasto que não virou atendimento, e o
  que o financeiro mais precisa conseguir achar. Casos SEM gasto não entram — o relatório
  é de despesa, não de zeros.
  **O GASTO FICA EXPLÍCITO EM DOIS MOMENTOS.** No card, o chip "Despesas R$ X" aparece em
  qualquer estado quando há valor, e "Sem despesas" só em caso encerrado ou cancelado —
  num caso em andamento seria um lembrete permanente de algo que talvez nem aconteça. E no
  diálogo de ENVIO (e de confirmação), um bloco mostra o que foi lançado, com atalho para
  lançar ali: é o último momento em que quem trabalhou lembra do Uber daquela madrugada.
  **O bloco NÃO TRAVA o envio** — despesa não é status do caso (invariante 3.5) e nem todo
  atendimento tem gasto.
- **O vídeo horizontal do MASTER não segura o encerramento** (03/09/2026, migration
  `20260903153101`). Ele leva dez dias úteis e a família já recebeu fotos e reels; o cartão
  ficava semanas na lista do dia por causa dele. O caso encerra, o vídeo continua sendo
  operado pela seção MASTER (`mover_video_master` passou a aceitar caso **encerrado** —
  cancelado continua recusado), e em Concluídos o cartão aparece com o selo **"Vídeo em
  edição"**, sem apagar. A exceção nomeia `edicao_video` e mais nada: com a edição de fotos
  aberta, encerrar continua sendo recusado.
- **A faixa de avisos abre** (09/09/2026, pedido do gestor). As observações das etapas
  ABERTAS aparecem numa faixa de UMA LINHA no pé do card — com dois avisos ela virava um
  bloco e competia com o card em vez de acompanhá-lo. O preço era o texto cortado, e o
  motivo de uma reabertura não cabe numa linha: cortado no meio ele deixa de ser instrução
  e vira enfeite.
  O texto completo já existia em dois lugares e nenhum servia: o `title` do navegador **não
  existe no celular**, que é metade da operação, e o card expandido obriga a abrir o caso e
  procurar a etapa certa. Agora um toque na faixa abre um diálogo com todos os avisos por
  extenso, com `whitespace-pre-line` — a quebra de linha que a pessoa digitou é parte do que
  ela quis dizer.
  A faixa é um `<button>`, não um `div` com `onClick`: acionável por teclado é o que separa
  um controle de um enfeite que só funciona no mouse. Ela mora FORA do `<button>` do
  cabeçalho do card, então abrir o aviso **não expande o caso junto** — conferido na tela.
  O ícone de olho fica fora do `truncate`, num item que não encolhe: dentro dele seria a
  primeira coisa a sumir, justamente quando o texto é comprido.
  O nome da etapa ganha a rodada da segunda em diante (`Reels · Revisão`), porque o aviso
  mais comprido do sistema é o motivo de uma reabertura e ali dizer só "Reels" esconde o que
  distingue o trabalho novo do que já foi entregue.
  **`Dialogo` ganhou `soFechar`** para isso: um diálogo que só MOSTRA não tem o que
  cancelar, e "Cancelar" ao lado de "Fechar" oferece duas portas para a mesma saída.
  **O AVISO É VERMELHO E PULSA, NO ESTILO DA ETAPA ATRIBUÍDA** (15/09/2026, pedido do gestor,
  em duas voltas no mesmo dia). A faixa era um lavado claro no tom do rascunho, e a equipe
  passou a escrever os avisos com fileiras de emoji ("10:30 - Q 201 🟢🟢🟢") para chamar atenção
  — a prova de que ela não chamava. A primeira volta foi âmbar sólido; o gestor pediu o
  vermelho com a onda, igual à pílula de quem foi atribuída. Agora o aviso é uma PÍLULA
  vermelha com megafone (`IconeAviso`) no disco translúcido em que a atribuída tem as
  iniciais, texto em negrito na cor do card (5,9:1), e a mesma onda — a classe virou
  `.pulso-chamado`, porque serve às duas.
  **É PÍLULA COM MARGEM, não faixa de ponta a ponta:** o card tem `overflow-hidden` e a onda
  saindo de uma faixa encostada nas bordas seria cortada. Dentro do card aberto, a observação
  de etapa ABERTA vira o mesmo bloco vermelho pulsando; a de etapa concluída ou dispensada fica
  num bloco neutro, sem pulso — ali ela é relato, não chamado. O diálogo com o texto completo
  não pulsa: ele já é a resposta ao chamado.
  **Três vermelhos no card, separados pela FORMA:** horário estourando pinta o cartão inteiro
  e gira o anel da borda; a atribuída é pílula com iniciais; o aviso é pílula com megafone.
- **Rascunho descartado** some do Quadro inteiro, sem poluir Concluídos.
- **O RESPONSÁVEL EM DESTAQUE na trilha do card** (15/09/2026, pedido do gestor, em DUAS
  voltas no mesmo dia). EM ANDAMENTO, o nome aparece com as INICIAIS num círculo azul sólido e
  o primeiro nome em negrito extra, na cor principal do texto — na fita completa e no resumo
  compacto. Antes era um chip no mesmo tom da pílula, e o nome sumia no card branco.
  **ATRIBUÍDA É VERMELHA E PULSA** (`PilulaAtribuida`): nome numa pílula vermelha sólida, com
  uma onda saindo dela, na fita, no resumo do modo TV e na lista de etapas do card (ali com
  "aguardando início" por extenso). Na primeira volta a atribuída tinha o círculo na cor da
  marca e o vermelho ficou de fora por ser alarme; o gestor voltou pedindo MAIS destaque
  justamente nela — é o trabalho que tem dona e ainda não começou, e a dona precisa achar o
  próprio nome de longe. **O vermelho mudou de sentido por decisão dele:** deixou de ser só
  "tempo estourando" e passou a ser "precisa de alguém agora". O que ainda separa os dois é a
  FORMA — o alarme de tempo pinta o cartão inteiro e gira o anel da borda; a atribuída é uma
  pílula dentro dele, com pulso e sem giro. O pulso para no play. Pausado continua mostrando
  a palavra, não o nome. As iniciais vivem em `lib/iniciais.ts`, compartilhadas com o `Avatar`.
- **O MATERIAL DO ACOMPANHAMENTO** (15/09/2026, pedido do gestor, migration `20260915134638`)
  — "zerar a planilha". As colunas CARTÃO F, CARTÃO V, BAIXOU e UPLOAD da faixa ENTRADA viram
  quatro pílulas em TODA etapa de acompanhamento, no espaço entre o nome da etapa e os botões
  (`MaterialDoAcompanhamento`). Cartão F é texto curto ("14 HSC" existe: a HSC tem cartões
  próprios); Cartão V é o CEL CLICK escolhido numa lista, ou digitado quando o vídeo saiu
  de outro aparelho ("CELULAR SARAH"); Baixou e Upload são pessoas. **SÓ NO PC**, pedido do gestor: o corte é por CONTAINER (`@2xl` na lista de etapas),
  não por viewport, porque quem decide é a largura da lista.
  **`baixou_por` e `subiu_por` JÁ EXISTIAM** desde o schema inicial, com FK e índice, e nunca
  tinham sido escritas (zero linhas no remoto). Foram reaproveitadas — UPLOAD na tela é
  `subiu_por` no banco — em vez de criar uma segunda coluna para a mesma pergunta. Novas são
  só `cartao_foto` e `cartao_video`, as duas TEXTO. A constraint `caso_etapas_material_so_no_acompanhamento`
  recusa os quatro em etapa de edição. **Os seis CEL CLICK moram na TELA**, como sugestão, não no
  banco: o sétimo aparelho é uma linha de código, e o celular de alguém da equipe é texto
  digitado.
  A escrita é UM CAMPO POR CHAMADA (`registrar_material_da_etapa`), para duas pessoas mexendo em
  campos diferentes da mesma etapa não se sobrescreverem; valor igual ao gravado não gera
  evento, e em branco limpa. Aceita etapa e caso em qualquer estado: a planilha é preenchida
  DEPOIS, quando o cartão é baixado.
- **LISTAS DE PESSOAS FILTRAM POR DIGITAÇÃO** (15/09/2026, pedido do gestor). O `Dropdown`
  ganhou `buscavel`: um campo no topo do painel filtra sem acento e sem caixa, e Enter escolhe
  a primeira que sobrou. Vale em atribuir, rendição, handoff, "de quem foi" da despesa, e
  baixou/upload. O foco vai para o campo sozinho **só com ponteiro fino** (mouse): no celular o
  teclado subiria por cima da lista que a pessoa queria ver, e lá quase sempre se escolhe
  tocando.
- **Presença no cabeçalho** (06/09/2026): quem está com a tela aberta aparece ao lado do
  chip de conta, com bolinha de estado — a referência do gestor foi a planilha compartilhada
  do Sheets. Teto de quatro avatares e "+N" no resto; some no mobile, onde a faixa não cabe.
  **DOIS EIXOS, e é o que desembaraça o pedido.** A pessoa DECLARA disponibilidade no menu
  da própria foto (só **Disponível** e **Ausente** — decisão do gestor; "Não perturbar" e
  "Invisível" resolvem problemas de chat, não de escala), e a ATIVIDADE é derivada: quem tem
  etapa em andamento aparece como **Ocupada** sozinha, sem tocar em nada. É assim que "o
  status muda conforme ela mexe nos cards" sem inventar um segundo lugar para dizer a mesma
  coisa. "Ocupada" não está no menu de propósito: escolhê-la seria poder mentir sobre o
  trabalho. **Ausente ganha de Ocupada** — quem começou uma edição e foi almoçar sem pausar
  não pode aparecer como se estivesse lá.
  **"SEM PEGAR TRABALHO HÁ 3h"** é a métrica que o gestor queria de verdade — não horas
  online, mas quem está disponível e parada. Ela é DERIVADA, sem nada novo no banco: o
  tempo desde a última vez que a pessoa iniciou ou concluiu uma etapa (a mesma definição de
  "última atividade" da ficha da Equipe, para as duas telas não darem números diferentes).
  Aparece a partir de uma hora (`MINUTOS_ATE_MARCAR_PARADA`), e a bolinha fica VAZADA —
  mesma cor, porque ela continua disponível; o que muda é o preenchimento, que é a diferença
  entre "de mãos livres" e "de mãos livres há tempo demais".
  O que isso mede, com todas as letras: tempo sem TOCAR no sistema. Quem está dirigindo para
  a maternidade não tocou em nada e está trabalhando — por isso a marca serve para a
  coordenação olhar e perguntar, e não vira número guardado.
  **O HOVER ABRE UM CARTÃO** (07/09/2026): retrato, nome, papel, estado e a frase de
  atividade — que muda com o estado, porque o mesmo carimbo responde três perguntas
  diferentes ("Trabalhando há 25min", "Sem pegar trabalho há 3h", "Fora do posto"). Era um
  `title` do navegador: lento, sem retrato e sem cor. Abre no FOCO também, não só no hover —
  a fileira é navegável por teclado.
  A **linha divisória** que separa a fileira do chip de conta é borda do próprio
  `EquipePresente`, e não um `divide-x` no cabeçalho: assim ela some junto com a fileira no
  mobile e quando não há mais ninguém: no pai, sobraria uma linha sem nada de um lado.
  **Nada é gravado** (ver seção 9). A escolha manual fica no `localStorage`, que é
  preferência de UI e não dado de domínio.
- **Modo TV** (02/09/2026): botão na barra de navegação que reparte o Quadro em duas
  colunas — atraso à esquerda, turno à direita, nenhum dia atravessando — com cartão
  compacto (uma etapa por trilha). A escolha fica no `localStorage` do aparelho, e o botão
  **não tem trava de papel**: qualquer conta o vê.
  **A partir de 1280px, não 1536** (corrigido em 03/09/2026). O limite antigo escondia o
  botão na TV do gestor: 1920 com o navegador em 150% de zoom reporta 1280 de viewport. Só
  baixar o número não bastava — com o painel lateral em 30rem sobravam 356px por coluna e o
  cartão compacto ficava MAIS ALTO que a 1920. Por isso o lateral encolhe para 18rem no modo
  TV abaixo de 1536, e volta aos 30rem acima disso.
- **Navegação**: a faixa abaixo da marca aparece quando há para onde ir — fora do Quadro
  (voltar pelo **Painel**, que é de todo mundo) ou para a gestão (Painel + **Equipe**). Quem
  opera dentro do Quadro não a vê: ali não há destino, e uma faixa permanente custaria 44px
  de altura onde altura é o recurso escasso. Prender quem opera na tela de Perfil sem
  caminho de volta foi exatamente o defeito que essa regra corrigiu (03/09/2026).
- **Equipe** (`/quadro/equipe`), só para `gestao`. Cadastro com ações: a lista separa
  **Equipe**, **Sem acesso** e **Inativas** (as duas últimas são exceções que pedem ação),
  e o estado ao vivo é um selo na linha. Selecionar alguém abre a ficha com o que ela tem
  em mãos (etapa + nome do caso + há quanto tempo), os dados de acesso, e as ações:
  **trocar papel**, **desativar/reativar** e **excluir**.
  **Métricas saíram da ficha em 03/09/2026, por decisão do gestor** — concluídas na
  janela, tempo médio de ciclo e divisão campo × ilha existiram e foram removidas porque
  ainda não está acordado o que se mede. Elas voltam na tela de métricas, depois do acordo;
  não as recoloque aqui.
  **Desativar é a ação principal; excluir é a exceção.** As onze FKs para `pessoas` são
  `on delete restrict` — quem já trabalhou sai da operação, não do cadastro. O botão de
  excluir só aparece para quem nunca tocou em nada, e o banco recusa o resto.
  Não mostra o e-mail de login: ele vive em `auth.users`, fora do alcance do cliente.
- **Perfil** (`/quadro/perfil`), de qualquer pessoa logada, no menu do nome ("Editar
  perfil"). **Troca a senha**, exigindo a atual — o Supabase não exige; a exigência é nossa,
  porque os CEL CLICK trocam de mão com a sessão aberta. E **troca a foto**, pela canetinha
  sobre o retrato. Nome e apelido ainda não se editam: pedem a RPC `atualizar_meu_perfil`,
  pelo mesmo motivo da foto (RLS não filtra coluna).
- **Foto de perfil** (migration `20260903161526`): bucket privado `avatares`, arquivo na
  pasta do próprio `auth.uid()`, caminho gravado pela RPC `definir_minha_foto` e leitura
  por URL assinada de uma hora. A URL não é guardada em lugar nenhum — seria guardar um
  segredo com validade. O avatar aparece no chip do cabeçalho e na Equipe. Exige a senha atual, o que o Supabase
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
6. **Sem workflow de CI para `db push` — nem para `functions deploy`.** O `db push` é
   manual e já ficou para trás de um merge três vezes, chegando ao gestor como "está
   bugado". O gestor já aprovou construir o workflow; falta fazer.
   **O deploy de Edge Function tem o mesmo buraco, e é PIOR de enxergar.** Em 04/09/2026 a
   `admin-pessoas` estava publicada e ATIVA, e mesmo assim o cadastro pela tela nunca
   funcionou em produção: faltava CORS. O `supabase functions serve` responde ao preflight
   por conta própria, então o botão funcionava no local — e o supabase-js traduz preflight
   barrado, função fora do ar e sinal caído para a mesma frase, "Failed to send a request
   to the Edge Function". **Lição para a próxima função chamada pelo front: "passou no
   local" não é evidência nenhuma sobre CORS.** O que trava isso agora é
   `supabase/functions/_shared/cors.test.ts`; conferir em produção é um
   `curl -i -X OPTIONS` com `Origin` — sem `Access-Control-Allow-Origin` na resposta, o
   navegador barra.
   **E o import da biblioteca nas Edge Functions vai com VERSÃO TRAVADA.** Com
   `npm:@supabase/supabase-js@2`, cada deploy resolve a versão do dia, enquanto o
   `functions serve` usa o que tem em cache: local e produção rodam bibliotecas
   diferentes sem ninguém pedir. Foi o que sobrou depois do CORS — o cadastro passou a
   devolver 401 só em produção, com o mesmo código que dava 201 no local. Junto com o pin,
   `auth.getUser()` passou a receber o token EXPLÍCITO: a forma sem argumento procura uma
   sessão guardada que não existe (`persistSession: false`) e depende de um fallback
   interno da biblioteca para o header `Authorization` — exatamente o tipo de coisa que
   muda entre versões.
7. **`anon` ainda tem privilégio de tabela em `storage.objects`** (issue #20). A primeira
   policy chegou em 03/09/2026 com a foto de perfil, e o `buckets_privados.test.sql` falhou
   de propósito, como previsto — o que entrou no lugar nomeia as quatro policies do avatar e
   afirma que `midias` e `comprovantes` continuam SEM policy, portanto negados.
   O que NÃO deu para fazer: revogar de `anon` os sete privilégios que ele tem na tabela. Ela
   pertence a `supabase_storage_admin`, e `postgres` não é membro dele — o REVOKE roda sem
   erro e não revoga nada. Hoje quem segura o `anon` é a RLS (nenhuma policy o alcança); a
   exceção é TRUNCATE, que RLS não filtra — privilégio latente, sem caminho conhecido de
   exploração. Fechar exige rodar o revoke como o dono da tabela, fora do caminho de
   migration. Ver também a issue #21 (bucket `comprovantes` órfão).
8. **Fila de edição: a TELA não existe.** A view e os testes ficaram quando o gestor pediu
   para tirá-la. (A trava "iniciar antes de concluir", que esta dívida dizia faltar, existe
   desde a migration `20260825051226` e está DENTRO de `concluir_etapa`: etapa de
   pós-produção sem `iniciado_em` é recusada pelo banco. O texto antigo desta dívida e o da
   seção 9 descreviam o mundo de antes dela.)
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
