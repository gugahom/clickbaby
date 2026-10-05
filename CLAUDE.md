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

**EVENTO e NEWBORN** (30/09/2026, decisão do gestor, migrations `20260930200345` e
`20260930200425`) são pacotes do cadastro, mas NÃO são parto — ficam fora da tabela acima:
- **EVENTO** — `acompanhamento` (a etapa única de campo, play e concluir), `edicao_foto` e
  `reels`. Prazo de 48h, contado da conclusão do ACOMPANHAMENTO (não há nascimento; a view usa
  um ou outro em `vence_em`, e `nascimento_concluido_em` continua sendo só do parto). A edição
  espera o acompanhamento como a do parto espera o nascimento (`anteriorPendente`).
- **NEWBORN** — o ensaio na casa de uma família que já teve o parto: `acompanhamento` e
  `click_home`, sem prazo de pacote. Concluído o ensaio, `quadro_casos.na_secao` o tira do Quadro
  e ele vive só na seção New Born; `confirmar_entrega_do_click_home` o ENCERRA (pela
  `confirmar_entrega` de sempre). Medido em 30/09: os 7 newborns da agenda tinham, cada um, o
  caso do parto da mesma família — e nenhum desses partos tinha o Click Home marcado.
- O parser os reconhece PELO COMEÇO do título ("EVENTO/NOME - … - MAT", "EVENTO - NOME - MAT",
  "NEWBORN/MÃE/BEBÊ - … - MAT"), e o pacote escrito no meio não vale. No EVENTO a mãe é "EVENTO"
  e o nome do evento fica no lugar do bebê. Casos que já existiam com esses títulos não mudaram:
  o sync não troca pacote preenchido.

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
- **O NEWBORN É O "CLICK HOME", E ELE É ADICIONAL — NÃO PACOTE** (22/09/2026, decisão do
  gestor). Na agenda ele vem GRUDADO num pacote de parto: "STANDARD + CLICK HOME". Como
  pacote, cada combinação vendida viraria uma linha nova no cadastro (BABY REELS + CLICK
  HOME, MASTER + CLICK HOME, …) e a mesma família acabaria com dois casos ou com o pacote
  errado. Então ele é uma ETAPA do mesmo caso (`click_home`, ordem 12, trilha edição), com
  seção própria como o vídeo do MASTER e o Foto/Livro — ver a seção 13. O ensaio acontece na
  CASA da família, 10 a 12 dias depois da entrega do pacote.
  Isto REVISA a estratégia escrita aqui até 22/09 ("quando um produto novo virar recorrente,
  cadastra-se como pacote próprio"), que continua valendo para produto que SUBSTITUI o
  pacote — EVENTO e as combinações "OUTROS" seguem esperando decisão do dono. O que mudou é
  que o NEWBORN não substitui nada: ele se soma.
  **Não há composição de múltiplos pacotes num caso**, e isto continua verdade: o adicional
  não é um pacote, é uma etapa.
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

**TRÊS ETAPAS NÃO SEGURAM O ENCERRAMENTO:** `edicao_video` (desde 20260903153101),
`album` (desde 20260910150425) e `click_home` (desde 20260922212901). As três têm fluxo
próprio numa seção lateral, levam semanas, e sobrevivem à entrega das fotos — o ensaio Click
Home acontece 10 a 12 dias DEPOIS dela. Toda outra etapa continua tendo que estar concluída ou
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
enviar_video_para_entrega(p_caso_etapa_id, p_link_video, p_link_wetransfer) -- 2 links + pronto; NÃO conclui
enviar_video_nos_links_do_caso(p_caso_etapa_id)  -- pronto SEM par novo: o vídeo foi para os links do caso (29/09/2026)
confirmar_entrega_do_video(p_caso_etapa_id)      -- conclui, em Entregáveis; atendimento/adm

-- esteira do ensaio CLICK HOME (5 fases; ver seção 13)
mover_click_home(p_caso_etapa_id, p_fase)        -- escreve fase E status juntos
enviar_click_home_para_escolha(p_caso_etapa_id, p_link) -- link da galeria + fase
confirmar_entrega_do_click_home(p_caso_etapa_id) -- finaliza, em Entregáveis; atendimento/adm

-- esteira do fotolivro (10 fases; ver seção 13)
mover_album(p_caso_etapa_id, p_fase)             -- escreve fase E status juntos
enviar_fotolivro_para_aprovacao(p_caso_etapa_id, p_link, p_capa) -- capa + link + fase, juntos
marcar_fotolivro_enviado(p_caso_etapa_id)        -- "Enviado ao cliente"; atendimento/adm

-- pedido de alteração pós-entrega, SÓ das duas com seção própria (ver seção 13)
pedir_alteracao_da_etapa(p_caso_etapa_id, p_motivo)  -- fase + pedido, sem reabrir o caso

-- em que pé está o trabalho de campo (28/09/2026; ver seção 13)
mover_fase_de_campo(p_caso_etapa_id, p_fase)     -- só entrada e nascimento; qualquer pessoa ativa

-- caso
criar_caso(p_mae_nome, p_bebe_nome, p_pacote_id, p_maternidade_id, p_previsao_em, p_click_home) -- pelo calendário; adm (30/09/2026)
editar_caso(p_caso_id, p_mae_nome, p_bebe_nome, p_pacote_id, p_maternidade_id, p_previsao_em, p_click_home) -- idem; o Google acompanha (30/09/2026)
registrar_termo(p_caso_id, p_termo)              -- termo de uso de imagem; atendimento/adm
registrar_avaliacao(p_caso_id)                   -- avaliação da família; atendimento/adm
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

-- telas por pessoa (30/09/2026; ver seção 13)
tem_tela(p_tela)                                        -- helper das policies e da porta dos relatórios

-- o modo comercial do relatório externo (01/10/2026; ver seção 13)
definir_oferta_comercial(p_caso_id, p_oferta, p_fase)   -- tela Comercial; vendido cria a etapa
definir_retorno_comercial(p_caso_id, p_retorno_em)      -- tela Comercial; a data de voltar à família (05/10/2026)
definir_foto_da_pessoa(p_pessoa_id, p_foto_path)        -- a Equipe troca a foto de outra pessoa

-- relatório interno das pessoas (28/09/2026; ver seção 13) — SÓ GESTÃO, leitura
metricas_por_etapa / metricas_da_equipe_por_etapa / metricas_por_pessoa (p_inicio, p_fim)
metricas_prazo_do_periodo (p_inicio, p_fim)
metricas_serie_da_equipe(p_inicio, p_fim, p_grao, p_pessoa_id)  -- os 6 KPIs por dia/bloco/mês/período; com pessoa, a produção dela (29/09/2026)
metricas_fases_de_campo(p_inicio, p_fim)  -- tempo em cada fase do campo, por pessoa (29/09/2026)
metricas_pontos_por_pessoa(p_inicio, p_fim)  -- o ranking por pontos, já dividido (29/09/2026)
metricas_plantoes_por_pessoa(p_inicio, p_fim)  -- horas de plantão da escala, por pessoa (30/09/2026)
pontos_por_item_vigentes() / definir_pontos_do_item(p_item, p_pontos)  -- a régua dos pontos; linha nova, nunca UPDATE

-- relatório EXTERNO — a operação inteira, com filtros (29/09/2026; ver seção 13) — SÓ GESTÃO, leitura
operacao_buscar(p_filtros, p_ordem, p_limite, p_deslocamento) / operacao_facetas(p_filtros) / operacao_resumo(p_filtros)
operacao_grafico(p_filtros, p_eixo)  -- o recorte por dia, mês ou dimensão: o gráfico e a planilha (30/09/2026)
padroes_de_tempo() / definir_padrao_de_tempo(p_etapa_tipo, p_minutos)   -- a régua; linha nova, nunca UPDATE
metricas_dentro_do_padrao(p_inicio, p_fim)  -- quantas etapas ficaram dentro do padrão, por pessoa (30/09/2026)

-- só service_role (Edge Function do sync)
sync_upsert_caso(...) / sync_cancelar_caso(p_google_event_id, p_motivo)
sync_marcar_click_home(p_google_event_id)               -- o "+ CLICK HOME" do título
sync_casos_para_o_google() / sync_vincular_evento_google(p_caso_id, p_google_event_id) -- o caminho de volta (30/09/2026)
sync_casos_para_atualizar_no_google() / sync_marcar_google_atualizado(p_caso_id, p_versao, p_resultado) -- a edição e o cancelamento vão ao evento
```

**Ainda NÃO existe:** `atualizar_situacao_clinica`. `situacao_clinica` continua por UPDATE
direto de adm — ver a dívida no fim da seção 13. `termo_status` SAIU do UPDATE direto em
22/09/2026, quando ganhou `registrar_termo`: metade daquela dívida está fechada.

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
    /relatorios      o relatório interno das pessoas (28/09/2026) e, em /externo, o da
                     operação inteira com filtros (29/09/2026) — ver a seção 13
    /calendario      partos, horas marcadas, prazos e feriados (30/09/2026) — ver a seção 13
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
   leitura do app morre. Nunca os revogue de `authenticated`. Desde 30/09/2026
   vale o mesmo para `tem_tela`, que as policies de `pessoas` e `escalas` chamam.
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
- **NÃO EXISTE `<select>` NATIVO** (01/10/2026, pedido do gestor: "um padrão de dropdown em
  todo o sistema"). Toda escolha passa pelo `Dropdown` da casa: `variante="campo"` em
  formulário, `variante="pilula"` (com `prefixo`, "Ordenar · Mais antigos") em barra de
  ferramentas. Gatilho próprio (`gatilho`) só para o que não é campo — as pílulas de FASE, o
  chip da conta, os menus de ícone. Um gatilho feito à mão que imita campo é o padrão se
  desfazendo; foram três, e voltaram ao gatilho padrão.
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
- Maternidade por sigla ao fim, ou embutida no nome do pacote — ou pelo NOME ("FÁTIMA",
  "LUISA MARILAC", "SANTA CRUZ"). Os nomes entraram em 30/09/2026, quando a agenda inteira foi
  lida pela primeira vez e 27 dos 33 rascunhos eram maternidade escrita pelo nome; sem ela
  reconhecida no fim, o pacote também não casava. A lista é EXPLÍCITA (`MATERNIDADES` em
  `_shared/parse-evento.ts`): grafia nova continua virando rascunho até entrar lá.
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

### Cor herdada, não interpretada — e, desde 30/09/2026, com regra para ESCREVER

`casos.cor_calendar` guarda a cor do evento como veio, sem tentar decodificar o que significa
(é organização interna do cliente). O Quadro só herda e exibe.

Para o sistema ESCREVER um evento (o caminho de volta, logo abaixo), a cor precisou de regra,
e ela foi MEDIDA nos 317 casos do remoto, não suposta: **BIRTH e BIRTH + REELS são tomate
(11) em qualquer maternidade**; o resto segue a MATERNIDADE — GNDI banana (5), HSC mirtilo
(9), HNSG uva (3), CWB manjericão (10), HNSF a cor padrão da agenda. Rocio, Mackenzie e
Marilac ficaram sem cor por falta de padrão. A regra mora no CADASTRO
(`pacotes.cor_calendar` ganha de `maternidades.cor_calendar`), e uma constraint proíbe o
grafite (8): ele é o card cinza, e um evento criado com ele seria cancelado pelo próprio sync.

### O caminho de volta: caso criado no sistema vira evento no Google (30/09/2026)

O calendário do sistema cria caso (`criar_caso`, só adm) e ele vai para o Google — que
continua completo como contingência, decisão do usuário. **Quem escreve é o próprio sync**,
não uma Edge Function nova: `criar_caso` marca `casos.google_pendente`, e no começo de cada
ciclo `enviarCasosAoGoogle` lê os pendentes (`sync_casos_para_o_google`, por função e não pela
tabela — o GRANT de `service_role` em `casos` diverge entre local e remoto, dívida #5), cria o
evento e liga o id (`sync_vincular_evento_google`). O que falhar fica pendente e volta no
ciclo seguinte.
- **O ID DO EVENTO VEM DO ID DO CASO** ("cb" + o uuid sem hífens). O Google aceita id
  escolhido pelo cliente, e isso torna a escrita idempotente: a segunda tentativa recebe 409 e
  só liga. Sem isso, uma queda entre criar o evento e ligá-lo deixaria evento duplicado.
- **O TÍTULO VOLTA IGUAL**: "MÃE/BEBÊ - PACOTE[ + CLICK HOME] - SIGLA", com "BEBÊ" quando não
  há nome. Depois de ligado, o sync relê o título a cada ciclo e ATUALIZA o caso a partir dele,
  como faz com todo evento conhecido; um título que o parser lesse diferente trocaria o
  checklist sozinho. `evento-do-caso.test.ts` passa toda combinação do cadastro (288) pelo
  parser. **Pacote ou maternidade nova entra nesse teste.**
- **DEPOIS DE LIGADO, O CASO SEGUE O GOOGLE** — nome e hora (pacote e maternidade o sync nunca
  troca depois de preenchidos). **E O GOOGLE SEGUE O SISTEMA** desde a migration
  `20260930164416`: uma mudança feita por uma PESSOA num caso ligado — pelo "Editar caso" do
  calendário (`editar_caso`), pelo do Quadro (UPDATE direto) ou cancelando — é marcada pela trigger
  `marcar_caso_para_o_google` (`casos.google_desatualizado`), e o sync, antes de ler a agenda,
  faz GET do evento e PUT com título, hora e cor novos (`atualizarCasosNoGoogle`). A trigger
  separa pessoa de sync por `auth.uid()`: o sync não tem usuário, e o que ele escreve veio do
  Google — marcá-lo mandaria de volta o que acabou de chegar.
  **ENQUANTO MARCADO, O SYNC NÃO RELÊ AQUELE EVENTO**, e por mais um minuto depois da escrita
  (`google_escrito_em`) — trava dentro de `sync_upsert_caso` e `sync_cancelar_caso`. O minuto
  cobre o ciclo que leu a agenda antes da escrita (as execuções podem se sobrepor). Mudança feita
  no Google nesse minuto não se perde: entra no primeiro ciclo depois. `google_versao` resolve a
  outra corrida — o sync só desliga a marca da versão que escreveu.
  **O EVENTO VOLTA INTEIRO** (PUT a partir do GET): descrição, convidados e a DURAÇÃO ficam como a
  equipe deixou, e o `*` antes do nome também — o sistema não sabe lê-lo e não o apaga. Antes
  disso, o "Editar caso" do Quadro sempre teve o nome revertido pelo título do Google.
- **APAGAR OU PINTAR DE CINZA O EVENTO NÃO CANCELA** um caso criado pelo sistema: a criação
  grava `caso_criado` com a pessoa, e `caso_tem_trabalho` conta ação humana. O que nasceu de um
  gesto no sistema se desfaz por `cancelar_caso`.
- **ESCOPO E PERMISSÃO**: o token passou de `calendar.readonly` para `calendar.events` (só
  eventos — nada de agenda nem compartilhamento), e a conta de serviço precisa ter, na agenda,
  "Fazer alterações nos eventos". Sem a permissão a leitura continua e a escrita dá 403: o caso
  fica pendente, com o erro no resumo do sync (sem título, como sempre).
- **CANCELAR NO SISTEMA PINTA O EVENTO DE CINZA** (30/09/2026) — o card cinza da própria equipe;
  o título fica. Rascunho pendente descartado NÃO pinta (descartar diz "não é caso", não "o
  atendimento caiu"), e o caso ainda pendente de ir ao Google simplesmente não vai mais.
  Um caso não se APAGA (tem `eventos`, append-only): "excluir" na tela é `cancelar_caso`.

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

### Backup — a cópia de fora (30/09/2026)

O guia completo, para a gestão, é `docs/backup.md`. O que importa para quem mexe no código:

- **Duas camadas.** O Supabase guarda uma cópia diária por 7 dias, DENTRO do projeto
  (conferido com `supabase backups list`: backup físico diário, sem PITR). A de fora é o
  fluxo `.github/workflows/backup-noturno.yml`: toda madrugada, `supabase db dump` de
  papéis, estrutura e dados (inclui `auth.users`), conferido por
  `scripts/conferir-backup.mjs`, criptografado com `age` e guardado no bucket R2
  `clickbaby-backup` (`diario/` 60 dias, `mensal/` 1 ano, por regra do bucket).
- **O GitHub só tem a chave PÚBLICA.** Ele tranca e não abre; a privada fica com a gestão,
  fora do GitHub e da Cloudflare. Não troque isso por uma senha simétrica em segredo do
  repositório: o segredo que tranca passaria a abrir também.
- **Nada do conteúdo vai para o log.** O conferidor imprime só contagens. Um `cat`, um
  `head` ou um "mostra uma linha de exemplo" num passo de depuração vaza nome de mãe e bebê
  num log que qualquer colaborador do repositório lê.
- **Não leva os arquivos do Storage** (capas do fotolivro, fotos de perfil). É o próximo
  passo, se a gestão quiser.
- **Tabela nova que não pode faltar** no backup entra em `OBRIGATORIAS` do conferidor.
- **O teste de restauração é manual** e pede um alvo DESCARTÁVEL (projeto Supabase de teste
  ou uma pilha local separada). Esvaziar o banco local de desenvolvimento para carregar a
  cópia por cima foi recusado pela trava de ações destrutivas em 30/09 — e com razão.

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
  Cria, atualiza, e cancela por card cinza OU por deleção do evento.
  **A AGENDA INTEIRA, COM HORA A DEFINIR** (30/09/2026, pedido do usuário: "preciso que venha
  TUDO", migration `20260930184200`). Até aqui o sync lia só SEIS SEMANAS para frente, e evento
  de DIA INTEIRO não virava caso ("sem hora não vira caso", do gestor, 30/08) — medido no dia, 65
  dos 153 eventos lidos eram assim, a maior parte dos partos futuros, e o banco tinha 8 casos
  futuros. Agora a janela é de DOZE MESES e o dia inteiro vira caso com `casos.previsao_sem_hora`:
  `previsao_em` guarda a meia-noite de Brasília daquele dia (o `dia` do Quadro e o filtro do
  calendário funcionam sem mudança) e a MARCA diz que aquilo não é hora. O argumento de 30/08
  continua de pé e é por ele que a marca existe: **nada lê essa meia-noite como horário** — o
  card mostra "hora a definir", o alerta de horário (e o sino) o ignoram, o calendário o põe em
  "dia todo". A marca vem do Google por `sync_definir_previsao_sem_hora`, à parte (a mesma razão
  do Click Home), e vai para ele: `criar_caso`/`editar_caso` aceitam `p_sem_hora` e o sync
  escreve o evento como de dia inteiro. **Com doze meses, o ciclo compara antes de chamar**
  (`casoJaEstaComoOEvento`): o caso conhecido que já está igual ao evento não vai ao banco.
  **A CONTA A OBSERVAR:** o Quadro carrega todo caso não arquivado, e os futuros entram nisso. Se
  a carga pesar, o corte é o Quadro não carregar caso além de amanhã — com o remendo do Realtime
  (`lib/remendo.ts`) seguindo o mesmo corte, senão tela e recarga discordam.
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
- **O SINO É SÓ O QUE TEM O MEU NOME** (01/10/2026, segunda volta do gestor: "entrei e tinha
  25 notificações (…) quero que seja o para você mesmo, quando o meu nome é marcado"). O item de
  30/09, logo abaixo, mantinha o trabalho do PAPEL (rascunho, entrega para conferir) como "para
  você", e para a gestão isso era a operação inteira de novo: SAIU — "não é todo mundo que
  resolve os rascunhos"; o ADM acha a fila pelo anel verde de Entregáveis. Fica: atribuída a
  mim, rendição que eu assumo, alteração no meu trabalho, e as URGÊNCIAS do MEU trabalho — hora
  chegando ou estourada de etapa de campo minha que não começou, prazo do pacote vencido com
  edição minha aberta, aviso numa etapa minha. Passou da hora ou do prazo, a linha fica
  vermelha (`urgente`). E **O QUE CHEGA COM A TELA ABERTA APARECE SOZINHO**: um cartão "Para
  você · agora" embaixo do sino, por nove segundos, com o caso a um toque — só para o que nasce
  durante a sessão (o que já existia ao entrar fica no sino), comparando os ids da renderização
  anterior, sem efeito. Era o que faltava de "sensação de urgência", nas palavras dele.
- **O SINO É SÓ "PARA VOCÊ"** (30/09/2026, pedido do gestor: "vai ser só para você, e só vai
  notificar o usuário que tiver que ser notificado mesmo"). As GERAIS saíram — aviso num card,
  horário estourando, edição sem ninguém, prazo vencido, alteração no trabalho de outra pessoa —,
  e com elas as abas "Todas/Para você" e o "Limpar gerais". Ficam: atribuição, rendição e
  alteração no trabalho MEU; e, para atendimento e adm, o trabalho do ADM (entrega esperando
  conferência, rascunho, vídeo/Foto/Livro/New Born para entregar), que passou a contar como "para
  você" (decisão do gestor, perguntado). Com isso o sino chama sempre que há item na lista — para
  o ADM, enquanto houver fila em Entregáveis. A coluna `gerais_limpas_em` e a RPC de limpar
  ficaram no banco, sem uso. O texto abaixo descreve o desenho ANTERIOR, de duas famílias.
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
  teclado — arrastar é atalho, e cai nas MESMAS RPCs e nos MESMOS diálogos do seletor
  (`mover_video_master`, `mover_album`, e os diálogos de terminar o vídeo e de mandar o
  fotolivro para aprovação), com o mesmo erro no mesmo alerta. Dois detalhes que não são
  capricho: um gesto começado num CONTROLE (o seletor, o campo do PC) não arrasta o cartão —
  quem sabe onde a mão caiu é o `mousedown`, e ele grava isso num `data-` do próprio nó —, e
  **"Sem fase" NÃO RECEBE cartão**, porque não existe RPC que APAGUE a fase de um trabalho, e
  oferecer um alvo que o banco recusa ensina a duvidar do quadro.
  **NÃO HÁ MAIS COLUNA DE SAÍDA** (21/09/2026). De 16/09 a 21/09 a última coluna concluía a
  etapa ao receber o cartão; desde que o vídeo e o fotolivro passam por Entregáveis, a última
  coluna ("Pronto para entrega") SEGURA o cartão até a Morgana confirmar a entrega lá. Soltar
  nela, no vídeo, abre o pedido dos dois links; em "Aguardando aprovação", no fotolivro, o de
  capa e link.
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
  **REVISTO EM 21/09/2026:** o vídeo também passou a ter a conferência da Morgana entre o fim
  da edição e a entrega, com DOIS links — ver "O VÍDEO DO MASTER PASSA POR ENTREGÁVEIS", logo
  abaixo. `finalizar_video_master` saiu.
  **NO FOTO/LIVRO, o fim é confirmação simples**, sem link: o fotolivro é objeto físico. São
  nove fases na tela; `pronto_para_entrega` sumiu do seletor e o fim é `entregue`, agora
  rotulado "Pronto para entrega". O valor continua no enum — fase de banco não se apaga.
  **REVISTO EM 21/09/2026:** o fim do fotolivro voltou a ter duas fases, com a conferência da
  Morgana no meio — ver "O FOTOLIVRO PASSA POR ENTREGÁVEIS DUAS VEZES", logo abaixo.
- **O VÍDEO DO MASTER PASSA POR ENTREGÁVEIS** (21/09/2026, pedido do gestor, migration
  `20260921211604`). Medido no remoto no dia: 18 vídeos concluídos e só 3 links do tipo
  `video`. A maioria terminou pelo ✓ do cartão da seção, que chamava `concluir_etapa` direto —
  sem link e sem ninguém conferir —, e o caminho que pedia link (`finalizar_video_master`)
  também concluía na hora: "ao concluir no botão de finalizar, o card simplesmente some".
  **TERMINAR A EDIÇÃO COBRA DOIS LINKS** (decisão do gestor): o do vídeo e o **WeTransfer do
  vídeo**. O segundo é um tipo de entregável PRÓPRIO (`video_wetransfer`), e não o
  `wetransfer`: o caso já tem o WeTransfer das FOTOS, e a conferência do envio do caso exige
  "um wetransfer" — um vídeo terminado antes do envio das fotos satisfaria a caixa com o
  arquivo errado. `enviar_video_para_entrega` grava os dois e leva o vídeo para "Pronto para
  entrega" NA MESMA TRANSAÇÃO; os três caminhos da tela — o seletor, o arrastar e o ✓ do
  cartão, que virou "finalizar a edição" — abrem o mesmo diálogo (`DialogoFinalizarVideo`).
  **O VÍDEO NÃO SOME: vai para Entregáveis, sinalizado como VÍDEO** — selo sólido, cor
  própria, e a frase "as fotos já foram entregues — agora é só o vídeo", porque "o que está
  passando mais uma vez nos entregáveis é apenas o vídeo; a Morgana precisa ver isso
  visualmente". A linha mostra SÓ os dois links do vídeo. "Confirmar entrega do vídeo"
  (`confirmar_entrega_do_video`, atendimento ou adm) conclui a etapa, confirma os dois links e
  tira o cartão da seção. Na seção, em pronto, o cartão mostra "Em Entregáveis".
  **As travas moram em `mover_video_master`:** pronto exige os dois links ainda não
  conferidos, e "concluída" só do atendimento ou adm, a partir de pronto. **PRONTO ABRE A
  PAUSA:** o vídeo esperando o ADM não está sendo editado, e sem isto os dias em Entregáveis
  entrariam no tempo de edição, que é o número que a empresa usa para cobrar (seção 9).
  **Versão nova:** depois de um pedido de alteração, terminar de novo cobra um par novo; os
  links já entregues ficam (são histórico da entrega que aconteceu), e um par ainda não
  conferido — o vídeo voltou de pronto para editando sem confirmação — é trocado, com a
  contagem em `links_substituidos` no evento. `concluir_etapa` segue aceitando o vídeo no
  banco; a tela não o oferece mais.
  **SE O CASO JÁ TEM LINKS, O VÍDEO VAI PARA ELES** (29/09/2026, pedido do gestor: "finalizar
  o master está pedindo links de novo; se já existirem links ele só deve pedir para adicionar
  o vídeo a esses links"). Medido no remoto no dia: o vídeo MASTER em edição estava num caso
  que já tinha o álbum do Google e o WeTransfer das fotos, e o diálogo mandava criar outro par.
  Agora `DialogoFinalizarVideo` mostra os links do caso (os do vídeo de uma entrega anterior
  primeiro, depois os das fotos — `lib/links-do-video.ts`, espelho da lista do banco) e pede
  só "Adicionei o vídeo a esses links"; "usar links novos" volta ao par de sempre, que também
  é o único caminho quando o caso não tem link nenhum. `enviar_video_nos_links_do_caso`
  carimba `caso_etapas.video_nos_links_do_caso_em` e leva a "pronto" — a trava de
  `mover_video_master` aceita o par novo OU esse carimbo com o caso tendo link, e nada além.
  Em Entregáveis, a linha do vídeo mostra os links do caso com "o vídeo foi adicionado aos
  links que o caso já tinha". QUEM LIMPA o carimbo: voltar a editar e mandar um par novo; a
  confirmação não limpa, e ele fica como registro de como o vídeo foi entregue.
  **Isto revisa 21/09 só no "sempre par novo"**: o tipo `video_wetransfer` continua existindo
  e continua sendo o que o par novo grava.
- **QUEM EDITA SE ATRIBUI NA PRÓPRIA SEÇÃO** (21/09/2026, pedido do gestor; o Foto/Livro
  entrou junto, por decisão dele). O vídeo e o fotolivro não se operam pelo card do Quadro,
  então a coordenação não tinha onde dizer quem pega cada um. `AtribuicaoDaSecao` é uma pílula
  com o nome de quem está com o trabalho (ou "Atribuir"), no cartão e na ficha, com as MESMAS
  duas portas do card: antes de começar é atribuir; depois é handoff, com motivo e linha em
  `handoffs` (invariante 3.2). O seletor de pessoa (`DialogoPessoa`) saiu de `AcoesDoCaso`
  para ser usado pelos dois.
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
- **A SEÇÃO CLICK HOME** (22/09/2026, pedido do gestor, migrations `20260922212852` e
  `20260922212901`). O ensaio newborn na casa da família ganhou o mesmo arranjo do vídeo e do
  fotolivro — cartão na coluna da direita, seletor de fase, play/pause, ficha, quadro por
  fase com arrastar — a partir do terceiro quadro do Trello deles.
  **CINCO FASES, as colunas que ele mandou:** Aguardando edição · Editando · Criar galeria
  online · Enviar para escolha · Finalizado. Não há fase antes delas (decisão dele): o cartão
  nasce em "aguardando edição", com o ensaio já fotografado. **DUAS são trabalho** — editando
  e criar galeria viram `em_andamento`; as outras são espera e viram `pausada`, para o ciclo
  medir trabalho e não calendário.
  **O FIM PASSA POR ENTREGÁVEIS**, como os outros dois: "Enviar para escolha" exige o LINK da
  galeria (`enviar_click_home_para_escolha`, tipo de entregável próprio `click_home`), o
  cartão aparece na aba com selo CLICK HOME, e "Finalizado" é a confirmação da Morgana ali
  (`confirmar_entrega_do_click_home`, atendimento ou adm). Sem isso o link da galeria seria de
  novo o que ninguém registra — foi o que aconteceu com o vídeo até 21/09.
  **ELE NÃO SEGURA O ENCERRAMENTO** — a TERCEIRA exceção, ao lado de `edicao_video` e `album`,
  e a mais evidente das três: o ensaio acontece 10 a 12 dias DEPOIS da entrega. A lista tem
  espelho na tela (`NAO_SEGURAM_A_ENTREGA`) e nas duas RPCs, e muda nos três ou em nenhum.
  A regra do ARQUIVO (`quadro_casos.arquivado`) também o nomeia: sem isso um caso encerrado
  com o ensaio pela frente sairia da carga e o cartão sumiria da seção.
  **COMO ELE CHEGA:** o título do evento do PARTO traz o sufixo, e é o único lugar — **não
  existe um segundo evento no Calendar** quando a sessão é marcada (confirmado com o gestor);
  a data combinada entra pelo prazo do cartão (`agendar_etapa`). O parser tira "CLICK HOME" do
  texto e devolve uma bandeira, e por isso o pacote volta a casar — até aqui "STANDARD + CLICK
  HOME" não era igual a pacote nenhum e o caso virava RASCUNHO PENDENTE, que é o motivo de o
  produto nunca ter aparecido. A Edge Function chama `sync_marcar_click_home` À PARTE, e não
  um parâmetro novo em `sync_upsert_caso`: acrescentar argumento cria segunda assinatura e
  deixa a chamada ambígua para a versão anterior da função, que roda a cada 25 segundos.
  **A COLUNA `casos.click_home` É A MEMÓRIA DO SYNC**, e a etapa é a verdade da tela. Ela
  existe porque o rascunho pendente chega SEM pacote: criar a etapa ali faria
  `gerar_caso_etapas` ver "este caso já tem etapa" na confirmação e nunca gerar as do pacote —
  a guarda dela é exatamente essa. Pela mesma razão a trigger se chama
  `gerar_etapa_do_click_home`: triggers disparam em ORDEM ALFABÉTICA, e `gerar_caso_…` precisa
  vir antes.
  **SÓ MARCA, NUNCA DESMARCA:** tirar o sufixo do título não desfaz um ensaio que pode já ter
  sido fotografado. Quem precisa desfazer usa "Este caso não tem Click Home" no seletor, que
  dispensa a etapa.
  **O NOME NA TELA É "NEW BORN"** (decisão do gestor, 22/09/2026, ao ver a seção pronta), e
  **na agenda continua "CLICK HOME"** — é a grafia que a equipe digita no título e a que o
  parser procura. Os dois nomes são a mesma coisa, e o identificador no banco é `click_home`:
  mesmo arranjo de `album`/"Foto/Livro" e de `operador`/"Fotógrafo(a)". Ao mexer nisto, não
  troque as menções ao TÍTULO DO EVENTO — ali "CLICK HOME" é literal.
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
  **OS TIPOS DE LINK SÃO SETE** desde 21/09/2026: Google Photos, WeTransfer, cadeado, reels,
  Foto/Livro, **Vídeo** (16/09) e **WeTransfer do vídeo** (21/09). Os dois do vídeo são os
  únicos que uma RPC registra sozinha (`enviar_video_para_entrega`).
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
  **A REFEIÇÃO É R$ 35 FIXOS** (21/09/2026, pedido do gestor): escolhido o tipo, o diálogo
  mostra o valor e não abre campo. A trava é da TELA (`VALOR_DA_REFEICAO` em
  `DespesasDoCaso`); o banco segue aceitando qualquer valor positivo.
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
  **FILTRO POR TIPO** (30/09/2026, pedido do gestor: "filtrar por refeição"): Refeição, Outro,
  Uber ida e Uber volta, que SOMAM entre si; o total, os cartões, a lista e o CSV passam a ser do
  recorte, e cada caso mostra só o valor dos tipos marcados. É filtro de TELA sobre a lista que já
  vem do banco inteira e somada por tipo — nenhuma soma nova.
  **A tela `/quadro/despesas`** é do `financeiro` e da `gestao` (desde 30/09/2026, a TELA
  Despesas, ver "TELAS POR PESSOA"; antes, `RotaDoFinanceiro`, guarda
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
  **O GASTO FICA EXPLÍCITO NO CARD ABERTO E NO ENVIO.** De 14/09 a 21/09/2026 o card FECHADO
  também tinha um chip ("Despesas R$ X", ou "Sem despesas" nos terminados); saiu a pedido do
  gestor — o gasto fica na lista de baixo, no card aberto, e na tela de Despesas. No lugar,
  nos CONCLUÍDOS, o card fechado mostra **"Nasceu dd/mm/aaaa"** (`nascimento_concluido_em`),
  que ele quer à vista "até no futuro para filtros". E no
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
- **O AVISO SE EXCLUI** (21/09/2026, pedido do gestor): lixeira em cada aviso do diálogo que
  a faixa abre, e "Excluir aviso" no menu da etapa. **E SE EDITA ALI TAMBÉM** (30/09/2026,
  pedido do gestor: "editar o alerta no próprio alerta detalhado, ao invés de ter que ir para o
  card"): lápis ao lado da lixeira, abrindo o mesmo `AnotarDialogo` do "Editar aviso" do menu. É `anotar_etapa` com texto em branco — o
  banco sempre apagou assim, e o texto antigo fica em `observacao_removida`. Antes a única
  porta era apagar o texto à mão em "Editar aviso".
- **O TERMO DE USO DE IMAGEM** (22/09/2026, pedido do gestor, migration `20260922183631`).
  É a coluna TERMO da planilha de atendimento, e responde uma pergunta da MÍDIA da empresa:
  dá para usar as fotos deste parto num post? A escolha está no contrato de cada família,
  quem a fecha é a Morgana, e por isso a pergunta mora no diálogo de **confirmar a entrega**
  — o último gesto dela sobre o caso. **São QUATRO respostas** desde 28/09/2026: Autorizado,
  Não autorizado, Ass pendente e Sem contrato, em grade de dois por dois (com quatro numa
  fileira, um `flex-wrap` deixaria três numa linha e uma órfã na outra).
  **"AUTORIZADO" É O `assinado` DE SEMPRE**, só com outro rótulo — assinar o termo É
  autorizar, e trocar o identificador reescreveria histórico por uma palavra (mesmo arranjo de
  `operador`/"Fotógrafo(a)"). **"NÃO AUTORIZADO" (`nao_autorizado`) é o valor novo**
  (migration `20260928150931`), e ele existe porque a família que RECUSOU só tinha onde cair
  como "ass pendente", que diz "ainda não chegou": a diferença entre "não respondeu" e
  "respondeu que não" é a que decide se uma foto pode ser publicada um dia. Com ele, o
  VERMELHO passou a ser do "não" e **Sem contrato ficou NEUTRO** — ali não há autorização, mas
  também não há recusa.
  **TRAVA O BOTÃO de confirmar** (decisão do gestor), ao contrário do bloco de despesas do
  mesmo diálogo — que, aliás, SAIU da confirmação em 28/09/2026 (pedido do gestor): quem lê
  ali é o ADM, que não esteve no atendimento e não tem o que lançar, e o bloco só alongava o
  diálogo em que ele confere links e responde o termo. No ENVIO ele continua, que é o último
  momento em que quem trabalhou lembra do Uber daquela madrugada. O termo trava: o campo
  existe para a mídia FILTRAR depois, e um filtro cheio de "não informado" não responde nada. O banco não trava — `confirmar_entrega` encerra sem termo,
  como sempre; é o arranjo de sempre, a tela mais estrita que o banco. São DUAS chamadas e
  não uma transação: termo e encerramento são fatos independentes (a resposta vale com o caso
  aberto ou fechado), e o termo vai primeiro para o caso não encerrar sem ele.
  **NULO É "NINGUÉM PERGUNTOU AINDA"**, e foi por isso que a coluna deixou de ser NOT NULL:
  ela nascia `pendente` por padrão e nenhuma tela jamais a escreveu, então o primeiro filtro
  da mídia leria "ASS PENDENTE" em toda a história da empresa. O backfill zerou só o valor
  padrão. Nos Concluídos, caso sem resposta **não mostra selo** — e o menu do cartão tem
  "Termo de imagem" para responder depois, que é também a porta da correção: a resposta é
  dada no mesmo minuto do encerramento, e `registrar_termo` aceita caso em qualquer estado
  justamente para um engano não ficar trancado.
  **BIRTH ABRE MARCADO COMO "SEM CONTRATO"** — são vendidos depois do parto e não têm
  contrato assinado —, marcado e não travado: um BIRTH que virou venda com contrato existe.
  **QUEM RESPONDEU E QUANDO FICA EM `eventos`** (`termo_registrado`, com o valor anterior), e
  não em colunas novas: append-only, uma correção não apaga a resposta de hoje. O quarto
  valor do enum, `nao_aplicavel`, a RPC RECUSA — valor de enum não se apaga, e uma quarta
  resposta que ninguém sabe ler acabaria no filtro da mídia como "talvez".
- **A AVALIAÇÃO DA FAMÍLIA, E OS CONCLUÍDOS EM TRÊS COLUNAS** (28/09/2026, pedido do gestor,
  migration `20260928153831`). A operação já fazia isto numa planilha à parte: quinze dias
  depois de entregar, alguém procura a família caso a caso e pede a avaliação. A aba passou a
  mostrar esse caminho — **Entregues · Avaliação interna · Concluídos** —, e com isso ela
  deixou de ser arquivo morto e virou FILA DE TRABALHO.
  **A PASSAGEM DOS 15 DIAS É UMA CONTA, NÃO UM JOB.** Nada no banco muda quando o prazo vence:
  a coluna é derivada de `casos.encerrado_em` na hora de desenhar (`lib/avaliacao.ts`), e o
  relógio de minuto do Quadro faz o cartão atravessar sozinho. Um cron que movesse casos
  criaria um estado guardado que pode discordar do calendário — a mesma razão pela qual o sino
  não tem tabela de notificações.
  **`encerrado_em` FALTAVA DESDE SEMPRE:** o sistema sabia que o caso encerrou, não QUANDO —
  só varrendo `eventos`. Agora `confirmar_entrega` o carimba, e o backfill o reconstruiu do
  evento `entrega_confirmada` (caindo para a confirmação dos links e, em último caso, para
  `updated_at`).
  **SAIR DA COLUNA DO MEIO É UM BOTÃO** — "Avaliação feita", dentro do cartão e só nessa
  coluna (`registrar_avaliacao`, atendimento ou adm, idempotente, com evento). Os 15 dias são
  regra de TELA: o banco recusa só o que não faz sentido em prazo nenhum (caso aberto,
  cancelado, avaliação repetida).
  **ENTREGA NOVA ZERA A AVALIAÇÃO**, e a limpeza mora dentro de `confirmar_entrega`, ao lado
  do carimbo — é a lição da 20260909145223: quem ESCREVE numa coluna nova é fácil de achar,
  quem deveria LIMPÁ-LA não. Um caso reaberto e reentregue tem quinze dias novos.
  **O HISTÓRICO INTEIRO NASCEU NA TERCEIRA COLUNA** (decisão desta migration): o backfill deu
  `avaliacao_em = encerrado_em` aos casos que já eram terminais, com **`avaliacao_por` NULO**,
  que se lê como "veio do histórico, ninguém marcou isto". Sem isso, centenas de casos antigos
  cairiam de uma vez em "Avaliação interna", como se todos precisassem de uma ligação que a
  planilha já resolveu.
  **CANCELADO VAI DIRETO PARA "CONCLUÍDOS"** (decisão do gestor): contrato que caiu não tem
  família para avaliar.
  **O BIRTH TAMBÉM** (30/09/2026, decisão do gestor): é feito sem contrato, para tentar a venda,
  e não passa pela avaliação. E é na aba Concluídos que a VENDA dele entra: um BIRTH encerrado
  aceita link novo, só **Google Drive** (tipo `google_drive`, migration `20260930202028`) e
  **WeTransfer** — `registrar_entregavel` sempre aceitou caso em qualquer estado; quem limitava
  era a tela.
  **E A ABA FICOU RESTRITA** ao mesmo par de papéis — atendimento e adm, ou seja, todo papel
  menos `operador` (`podeVerConcluidos`). Isso NÃO fere a invariante 3.1, que proíbe filtrar
  TRABALHO por tipo de pessoa: é permissão de tela por papel administrativo, como a Equipe
  (gestão) e as Despesas (financeiro). E é regra de TELA — a RLS de `casos` não mudou, o
  arquivo continua legível; quem não vê a aba também não o BAIXA, o que de quebra tira uma
  consulta de ~200 casos do celular da fotógrafa.
- **AS FASES DO TRABALHO DE CAMPO** (28/09/2026, pedido do gestor, migration
  `20260928183313`). Duas etapas ganharam um estado interno, "para conhecimento da gestão de
  que pé está o trabalho sendo realizado, para evitar mostrar 4 horas de nascimento ou algo
  assim":
  **ENTRADA** — Deslocamento/recebimento · Aguardando internamento.
  **NASCIMENTO** — Admissão CCO · Nascimento · Cuidados.
  **O PROBLEMA ERA DE LEITURA, e era real.** A etapa de nascimento engloba a admissão no
  centro cirúrgico, o parto e os cuidados com o bebê; na fita isso virava "Nascimento — 4h", e
  quem lê de longe entende um parto de quatro horas. A etapa sempre mediu bem o TRABALHO e
  nunca disse nada sobre o PÉ em que ele estava.
  **NÃO SÃO ETAPAS.** Etapa tem responsável, handoff, relógio de ciclo, precedência e entra no
  "x de y" do dia. Quebrar o nascimento em três multiplicaria o checklist de todo caso e
  pediria play/pause dentro de um centro cirúrgico — que é exatamente onde ninguém toca no
  aparelho. A fase é um ESTADO da etapa, declarado num toque.
  **NÃO É `situacao_clinica`**, e esta é a confusão a evitar ao mexer aqui: aquela coluna
  descreve a MÃE (aguardando, internada, indução, trabalho de parto, nasceu, UTI, alta), esta
  descreve o TRABALHO DA FOTÓGRAFA — deslocamento e admissão no CCO não são estado clínico de
  ninguém. As duas se encostam em "aguardando internamento", e encosto não é duplicata. O
  resto vale dizer em voz alta: `situacao_clinica` está morta na prática (300 dos 313 casos no
  valor padrão, nenhuma tela a escreve — dívida #4), e é esta coluna nova que a operação vai
  de fato preencher.
  **A FASE NÃO É O STATUS**, e aqui a diferença é mais forte que no fotolivro: as cinco fases
  são TODAS trabalho acontecendo. Por isso `mover_fase_de_campo` não toca em `status`,
  `iniciado_em` nem na pausa — ao contrário de `mover_album` e `mover_click_home`, que escrevem
  fase e status juntos porque lá a esteira é quase toda espera. Quem diz se há trabalho em
  curso continua sendo o play/pause.
  **NÃO NASCE SOZINHA NO PLAY** (decisão do gestor, perguntado): podia — dar play na entrada é
  quase sempre sair de casa —, e ele preferiu que nada seja afirmado sem gesto humano, como no
  termo e na avaliação. Etapa iniciada mostra "Definir fase" até alguém dizer a primeira.
  **O RELÓGIO DA FITA PASSA A SER O DA FASE** (decisão dele) quando há fase declarada: é o
  número que ele pediu para consertar. O total da etapa não se perde — continua no detalhe do
  caso e em `eventos`.
  **QUALQUER PESSOA ATIVA DECLARA**: quem sabe que o bebê nasceu é quem está na sala. Exigir
  papel poria a coordenação entre o parto e o registro dele. O seletor mora na linha da etapa
  dentro do card (junto do status, onde ele pediu) e não no espaço do material do
  acompanhamento, que se esconde em tela estreita — quem marca está no corredor, com o celular.
  **ONDE APARECE**: na fita do card, no resumo do modo TV (a tela da gestão, que é de onde
  nasceu o pedido) e na lista de etapas do card aberto. Na fita os rótulos são CURTOS
  (`ROTULO_FASE_CAMPO_CURTO`) porque a pílula divide a largura com nome, responsável e relógio:
  "Aguardando", "CCO" e — para não ler "Nascimento · Nascimento" — **"Parto"**. No seletor
  valem os nomes que o gestor deu.
  **A MÉTRICA MORA EM `eventos`**: cada mudança grava `fase_de_campo_registrada` com a fase, a
  anterior e `segundos_na_anterior`, que é o que os relatórios (item 4 da fila) vão somar.
  `caso_etapas.fase_campo_em` guarda só o começo da fase ATUAL, para a tela não consultar
  `eventos` a cada recarga do Quadro.
  **SÓ ESTAS DUAS ETAPAS TÊM FASE.** A lista está na constraint
  `caso_etapas_fase_campo_valida` e no espelho `FASES_DA_ETAPA` da tela — muda nos dois ou em
  nenhum. Estender para banho e fechamento é uma regra que ninguém deu.
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
- **NAVEGAÇÃO: BARRA LATERAL NO COMPUTADOR, FAIXA NO CELULAR** (28/09/2026, pedido do
  gestor: "uma sidebar que pode ficar escondida com ícones e os nomes das telas"). A faixa
  horizontal funcionava com três itens e pararia de funcionar com seis — área comercial,
  relatórios e calendário estão na fila —, porque uma fileira de palavras no alto compete
  com o cabeçalho, que já tem marca, presença, sino e conta. A barra cresce para BAIXO, que
  é a direção em que sobra espaço.
  **SEMPRE ESTREITA (3.5rem), e abre sozinha no ponteiro ou no foco.** Aberta ela custaria
  13rem da largura do Quadro, que é a tela mais apertada do sistema (a coluna lateral de
  30rem e o modo TV já disputaram cada pixel). **E abre POR CIMA:** a largura reservada é
  sempre a estreita, e quem cresce é o painel flutuante — empurrar recalcularia o layout do
  Quadro a cada passagem de mouse.
  **NÃO HÁ BOTÃO DE FIXAR.** Houve, entre as duas primeiras versões, e o gestor o tirou
  depois de usar ("totalmente inútil"). Ele estava certo: com a barra abrindo no caminho do
  mouse, fixá-la só trocava 3.5rem de largura permanente por nomes que já apareciam quando
  se precisava deles. Se um dia alguém pedir a barra travada aberta, o caminho é uma
  preferência de aparelho como o modo TV — não um botão dentro dela.
  **A PÁGINA ROLA DENTRO DO `main`, NÃO NA JANELA** (29/09/2026, pedido do gestor: "a
  sidebar acompanhe quando a página crescer"). Rolando a janela, a fileira da barra tinha a
  altura da TELA e o conteúdo a ultrapassava: a barra acabava no meio da página e aparecia o
  fundo embaixo. Com `overflow-y-auto` no `main`, a barra vai sempre até o chão e o cabeçalho
  fica parado. O Quadro não sentiu — ele já era `h-full` com rolagens próprias. Quem precisar
  de "rolar a página" rola o `main` (`scrollIntoView` já faz isso sozinho).
  **E O `main` É `relative`** (mesmo dia, segunda volta: "correção nesse rodapé"). Sem isso,
  todo elemento absoluto de dentro — os rótulos `sr-only` das tabelas — se media pela JANELA,
  e os que moravam no fim de uma página comprida esticavam o DOCUMENTO: aparecia uma segunda
  barra de rolagem, e rolar por ela subia o app inteiro, com o fundo à mostra embaixo da
  barra. Conferido nas cinco telas: o documento tem a altura da janela, e os únicos absolutos
  afetados eram os `sr-only`. Não tire o `relative`.
  **A FAIXA DO CELULAR CONTINUA EXISTINDO** para quem tem mais de um destino: barra lateral
  no toque não serve — custa largura onde ela é escassa, e "abrir no hover" não existe.
  **A NAVEGAÇÃO NÃO EXISTE PARA QUEM SÓ OPERA** (regra do gestor, 28/09/2026: "essa sidebar
  fica invisível para as fotógrafas, visto que elas precisam de acesso apenas para a
  operação"). A condição é uma só — ter mais de um destino —, e vale em TODA tela, inclusive
  no Perfil, onde até aqui a navegação aparecia só para oferecer a volta.
  **E O CAMINHO DE VOLTA NÃO SUMIU JUNTO:** a MARCA do cabeçalho virou link para o Quadro. A
  tela de Perfil sem saída foi um defeito real, corrigido em 03/09/2026, e "beco curto"
  continua sendo beco; a marca resolve para todo mundo, é o gesto que todo site tem e não
  custa pixel nenhum de tela. Ao mexer na navegação, este link é a rede — não o tire.
  Nada disso fere a invariante 3.1: ela proíbe filtrar TRABALHO por tipo de pessoa, e isto é
  permissão de TELA por papel administrativo, como a Equipe, as Despesas e os Concluídos.
  Quem opera não perdeu acesso a nada, e a RLS não mudou.
  **QUEM VÊ O QUÊ está em `destinosDe` (`app/layout/destinos.ts`), uma tabela só**, lida
  pelas duas formas: com duas, as regras de papel seriam escritas duas vezes e a próxima
  tela entraria só numa delas. A lista espelha as guardas de rota — destino que a guarda
  devolveria é porta pintada na parede. Quem opera dentro do Quadro não vê navegação
  nenhuma: espaço permanente para um item só é moldura vazia.
  **"PAINEL" VIROU "QUADRO"**: a barra apontava para a mesma tela com outro nome, e com
  ícone ao lado a discordância ficaria pior — nenhum desenho representa "Painel".
  **OS DESTINOS SÃO AGRUPADOS** em **Operação** e **Gestão**, no esqueleto do componente que
  o gestor mandou, com os rótulos abrindo junto com a largura. Reservar a altura do rótulo
  na barra estreita evitaria o salto e criaria um defeito pior: buracos entre ícones que,
  sem texto, não dizem o que separam. Os rótulos só aparecem quando há mais de um grupo, e o
  RESPIRO DOS DOIS LADOS DO RÓTULO mora na altura dessa mesma caixa (28/09/2026, em duas
  voltas do gestor: "tá muito colado" e "preciso que a PÍLULA dê uma afastada dos títulos"):
  o `pb-3` separa o título do item abaixo, e o que sobra da altura cai acima pelo
  `items-end`, separando-o do grupo anterior. Com a barra fechada a caixa tem altura zero —
  **e o padding também**, porque `height: 0` não engole o `padding` (o border-box o conta por
  fora do zero) e cada grupo estufaria a coluna de ícones em 12px sem nada para mostrar.
  **AS PÍLULAS TÊM 36px**, e não os 44 do primeiro desenho ("as pílulas estão muuuito
  gordas"): o piso de 44px da seção 6 é do DEDO no corredor, e esta barra só existe no
  computador — a mesma distinção que a faixa da navegação já fazia. Com texto de 14px, 44
  deixava um vão vazio em cima e embaixo que engordava a pílula sem acrescentar alvo
  aproveitável.
  **FEITO COM AS PEÇAS DA CASA**, como o sino em 18/09: o exemplo trazia cinco pacotes novos
  (framer-motion, @base-ui/react, tailwind-merge, @tabler/icons-react, clsx) e nenhum entrou
  — `clsx` já está aqui, o `motion` do projeto É o framer-motion, os ícones são nossos, e
  `twMerge` resolve um problema que não temos. **A pílula ativa DESLIZANTE ficou de fora por
  uma medida:** o projeto carrega `domAnimation`, e animação de layout (`layoutId`) exige
  trocar para `domMax` — uns 10kB em todo carregamento, no 4G do corredor, por um deslize
  que ninguém pediu.
  **O INTERRUPTOR DO MODO TV SUBIU PARA O CABEÇALHO**, ao lado da presença e da conta: ele
  nunca foi navegação (ajusta a TELA em que se está), e sozinho na antiga faixa deixaria
  uma barra de 44px com um botão no canto.
  **A BARRA E O MODO TV COEXISTEM** (correção do gestor no mesmo dia: "eles preferem o modo
  de visualização do modo TV"). A primeira versão escondia a barra ali, supondo que o modo
  só vive na TV da sala — e a suposição estava errada: é a visualização que a gestão usa no
  dia a dia, então esconder a barra tirava a navegação justamente de quem navega. A conta de
  espaço fecha: em 1280px o modo TV já encolhe a coluna lateral para 18rem e sobram ~496px
  por coluna; a barra recolhida leva 56px disso (468) e, fixa, 208 (392) — ambos acima dos
  356px que motivaram aquele ajuste. O grid do Quadro é `minmax(0,1fr)`: ele se mede pelo
  espaço que recebe, não pela janela.
  A superfície é `--gradiente-barra`: a ponta AZUL do gradiente do cabeçalho, descendo e
  escurecendo, para a barra ler como a continuação daquele canto — um L em volta do
  conteúdo. O gradiente do cabeçalho é horizontal e atravessa as duas cores da marca;
  espremido numa coluna de 3.5rem viraria listra.
- **A TELA COMERCIAL** (01/10/2026, migrations `20261001001602` e `20261001001607`) é a sétima,
  do padrão dos papéis `comercial` e `gestao`. **Desde 01/10/2026 (migration
  `20261001143922`) ela abre o RELATÓRIO EXTERNO INTEIRO** — `exigir_operacao` aceita a tela
  Relatórios ou a Comercial —, e quem tem só ela vê o destino **"Relatório externo"** e liga a
  chave Comercial quando quer. Pedido do gestor: "essa não é a nossa tela comercial ainda (…) a
  pessoa vai lá e muda o toggle". Na primeira versão (mesmo dia, de madrugada) ela abria só o
  modo comercial, com um destino chamado "Comercial" que parecia a página comercial. O relatório
  INTERNO continua só da tela Relatórios.
- **TELAS POR PESSOA** (30/09/2026, pedido do gestor, migration `20260930232424`). Quem vê
  qual tela deixou de ser só o PAPEL: a gestão concede e tira telas pessoa a pessoa na ficha da
  Equipe — é a porta para o que vem, o painel comercial e o financeiro, em que a pessoa entra
  direto numa tela só dela. `pessoas.telas` (enum `tela`: quadro, concluidos, calendario, equipe,
  despesas, relatorios) NULO é "o padrão do papel" (`telas_padrao_do_papel`, espelho em
  `features/auth/telas.ts`) — exatamente o que valia antes, então ninguém mudou de acesso.
  **A TELA DÁ O PODER JUNTO** (decisão do gestor, perguntado): nas telas RELATÓRIOS e EQUIPE o
  banco confere a tela, não o papel. `exigir_gestao()` — a porta das quinze funções dos dois
  relatórios — virou `tem_tela('relatorios')` (o NOME ficou, para não reescrever quinze funções);
  a escrita em `pessoas` e em `escalas` deixou de ser `eh_adm()` (que incluía comercial,
  coordenação e financeiro sem tela nenhuma para isso) e passou a ser `tem_tela('equipe')`; a
  Edge Function `admin-pessoas` também. Nas outras telas os dados já eram de toda pessoa ativa, e
  a tela é só a porta: criar caso, cancelar e confirmar entrega continuam sendo do PAPEL.
  **NINGUÉM SE TRANCA PARA FORA:** o trigger `guardar_acesso_a_equipe` recusa a mudança (telas,
  papel, ativo, exclusão) que deixaria nenhuma pessoa ativa com conta e com a tela Equipe. E toda
  mudança de telas ou de papel grava `acesso_alterado` em `eventos`, com o antes e o depois.
  **NA TELA:** as três guardas por papel (`RotaDeGestao`, `RotaDoFinanceiro`,
  `RotaAdministrativa`) viraram UMA, `RotaDaTela`, e `destinosDe` lê as telas da pessoa. Sem a
  tela Quadro, "/" leva à primeira tela que a pessoa tem; sem nenhuma, uma frase e o Perfil. A
  aba Concluídos é a tela `concluidos`. A pessoa logada só vê a própria mudança depois de
  recarregar — o banco já vale na hora.
- **A ESCALA DE PLANTÃO** (30/09/2026, pedido do gestor, mesma migration). A ficha da Equipe
  lança plantões na tabela `escalas` (vazia desde o schema inicial): um dia, ou uma sequência
  pelo ritmo 12x36 ou por dias da semana, com atalhos Dia 07–19 e Noite 19–07; o noturno termina
  no dia seguinte, e o `turno` é derivado do horário de início. Não há editar — plantão trocado se
  apaga e se lança de novo. O relatório interno mostra, no perfil da pessoa, as HORAS DE PLANTÃO
  (`metricas_plantoes_por_pessoa`) ao lado das horas COM ETAPA ABERTA (soma do tempo líquido das
  etapas com relógio), com a proporção. **É ESCALA PLANEJADA, NÃO PONTO** (seção 9): a frase do
  bloco diz o que a conta não pega — campo registrado depois, deslocamento, tempo entre etapas —
  e que campo em paralelo conta duas vezes, porque a leitura crua seria injusta com quem fotografa.
- **Equipe** (`/quadro/equipe`), de quem tem a tela Equipe. Desde 30/09/2026 a ficha também
  muda FOTO (pasta `avatares/equipe/<pessoa_id>/`, `definir_foto_da_pessoa`) e NOME/APELIDO de
  qualquer pessoa, as TELAS e a ESCALA — ver os dois itens acima —, e os grupos "Sem acesso" e
  "Inativas" nascem FECHADOS (pedido do gestor: "para não ficar poluindo").
  **O QUE SE MEXE MORA NUM MODAL** (mesmo dia, segunda volta do gestor): a coluna da direita
  ficou com o RESUMO (quem é, o que segura agora, se entra, telas, próximo plantão) e o botão
  "Gerenciar", que abre `GerenciarPessoa` (sobre `ModalAmplo`, tamanho `ficha`) com foto, nome,
  telas, escala, papel, desativar e excluir, em duas colunas. A coluna não sumiu porque uma
  lista sem detalhe ao lado ficaria "vazia demais", nas palavras dele. O texto abaixo descreve a
  ficha de antes, com as ações na coluna. Cadastro com ações: a lista separa
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
- **RELATÓRIOS — O RELATÓRIO INTERNO DAS PESSOAS** (`/quadro/relatorios`, só `gestao`;
  28/09/2026, migration `20260929020655`). A aba nasceu vazia no mesmo dia e ganhou conteúdo
  depois de um INVENTÁRIO dos dados de produção. O pedido: "métrica das fotógrafas, tempo,
  nascimentos, entradas, TUDO", com ranking, análise individual, dashboard e gráficos. Há um
  segundo relatório previsto, EXTERNO (operação, filtros de busca), que ainda não existe.
  **O INVENTÁRIO ACHOU TRÊS DEFEITOS DE DADO, e o desenho inteiro responde a eles** (medidos
  no remoto, 27/08 → 28/09):
  1. *Partos creditados a quem não estava na sala* — uma conta de gestão com 51 nascimentos
     em 33 dias, 47 "pegos para si" e 15 de 48 SOBREPOSTOS a outro parto dela. Por isso o
     **crédito é do RESPONSÁVEL** (`responsavel_id`, 100% preenchido), não de quem clicou
     concluir (`eventos.pessoa_id`, outra pessoa em 18% do campo), e existe a marca **EM
     PARALELO** (campo cruzado no tempo com outra etapa do mesmo tipo, da mesma pessoa, em
     outro caso). É marca, não exclusão, e vale para qualquer papel.
  2. *O relógio da edição não media trabalho* — 48% das edições de foto e reels concluídas
     com menos de 5 min de relógio. **Ciclo < 5 min é "SEM MEDIÇÃO"**: conta no volume, fica
     fora do tempo, e a coluna `medidas` diz quantas tinham relógio. **TEMPO NÃO ORDENA
     RANKING** — ordenaria para premiar quem não abre o relógio.
  3. *`escalas` e `padroes_tempo` vazias* — sem turno e sem os "padrões conhecidos por todas"
     do plano. A régua agora se define na tela (ver abaixo).
  **AS MÉTRICAS COMEÇAM EM 01/10/2026** (decisão do gestor: "ignorando esse mês e o
  passado"). NADA FOI APAGADO — `eventos` é append-only. É um PISO,
  `inicio_das_metricas()`, aplicado DENTRO de toda função: nem uma chamada direta à API lê
  setembro. A tela tem o espelho `INICIO_DAS_METRICAS` só para não oferecer o mês.
  **SÓ A GESTÃO** (decisão do gestor; ele recusou a ficha visível para a própria pessoa):
  (Desde 30/09/2026 `exigir_gestao()` é a TELA Relatórios — ver "TELAS POR PESSOA". Até ali:)
  `exigir_gestao()` é `papel_sistema = 'gestao'`, NÃO `eh_adm()`, que inclui comercial,
  coordenação e financeiro. **O ranking é de quem FEZ** — a gestão que fotografa entra
  (invariante 3.1); "só as fotógrafas" seria filtrar por tipo de pessoa.
  **É UM PAINEL DE KPI, e isso foi corrigido no mesmo dia.** A primeira versão tinha quatro
  abas (equipe, ranking por tipo com chips e marcas, ficha individual de cinco cartões,
  padrões) e mostrava tudo o que o banco sabe; o gestor a recusou — "ficou muita informação
  (…) o ponto principal desses dashs são KPI da equipe (…) foco em KPI e métricas". **Não a
  reconstrua achando que é melhoria:** o que saiu saiu por excesso, não por defeito.
  **TRÊS ABAS, um mês no topo recortando todas:**
  EQUIPE — seis KPIs em dois grupos, cada um com a **variação contra o mês anterior** (seta e
  sinal, nunca só cor; a cor vem de "subir é bom?", e volume e tempo de edição são neutros) e
  uma **mini-linha** bloco a bloco. *Entrega:* prazo cumprido (o número-herói), do parto ao
  envio (com a espera do ADM na linha de baixo), voltou para ajuste. *Produção:* partos,
  edições entregues, tempo de edição de fotos (com "% com relógio aberto" na linha de baixo —
  a qualidade do registro mora ali, e só ali).
  **O CARTÃO ABRE O GRÁFICO AO LADO** (29/09/2026, pedido do gestor: "espaço em branco demais"
  e "minigráficos mais mostráveis"). No computador (≥1280px) os cartões viram uma coluna à
  esquerda e o gráfico do KPI ESCOLHIDO ocupa o resto da largura, na altura da lista; abaixo
  disso, cartões em cima e gráfico embaixo, e o toque rola até ele. A página passou de 72rem
  para 100rem. Duas decisões conversadas com ele: o painel **nasce cheio** (no prazo, o
  número-herói) — um lado que só aparece depois do clique deixaria o vazio lá quase sempre —
  e o clique **não desliza a tela**, porque tiraria o cartão de baixo do mouse. Continua UM
  gráfico na visão; o que muda é o assunto.
  **SÓ A PRODUÇÃO VIRA GRÁFICO** (terceira volta do gestor: "apenas o que está nomeado de
  produção é importante virar gráfico (…) esses números fixos são mais importantes"). Partos,
  edições e tempo de edição ficam à esquerda, clicáveis — o painel abre em PARTOS —, e a
  ENTREGA (prazo, do parto ao envio, voltou para ajuste) desceu para uma faixa de números
  fixos embaixo, sem mini-linha e sem clique, marcada "da equipe".
  **FILTRO POR PESSOA** no título da Produção ("assim que selecionar uma pessoa ele deve
  filtrar os partos realizados por esse funcionário"): os três cartões E o gráfico passam a
  ser da produção dela (`p_pessoa_id` na série, crédito do RESPONSÁVEL, lido de
  `metricas_por_etapa` — nenhuma definição nova). A Entrega NÃO filtra: o prazo é fato do
  caso, que passa por várias mãos, e dividi-lo inventaria um dono.
  **O GRÁFICO: TRÊS JANELAS, E O SELO É A COMPARAÇÃO** (segunda volta do mesmo dia). A
  primeira versão comparava mês com mês e ano com ano, com o outro período em cinza ao lado —
  o gestor achou "meio esquisito". Ficaram ÚLTIMA SEMANA e ÚLTIMOS 30 DIAS (dia a dia) e
  ÚLTIMO ANO (12 meses, mês a mês), todas terminando hoje — ou no último dia do mês escolhido,
  quando ele já passou, para o gráfico não falar de outro mês que não o da tela. A comparação
  virou o SELO do título: a janela inteira contra a de mesmo tamanho logo antes, com seta e
  sinal (p.p. nas taxas, horas e minutos nos tempos, % no volume) e a cor de "subir é bom?".
  O selo lê a janela INTEIRA num balde só (grão `periodo`), não a soma dos dias: mediana não
  se compõe.
  **A COMPARAÇÃO VOLTOU COMO LINHA ROSA** (terceira volta): "a outra linha pode aparecer em
  rosa, como usamos nas cores de todo o sistema". Período anterior de mesmo tamanho (o
  padrão) ou mesmo período do ano passado, alinhado pedaço a pedaço, TRACEJADO e sem área
  embaixo; nas barras, o par lado a lado. O selo compara com o que estiver escolhido.
  **O VISUAL VEIO DE UM EXEMPLO DE SHADCN/RECHARTS** que o gestor mandou (área com degradê,
  linha e pontos com brilho, grade tracejada, dica em cartão), com a opção de BARRAS ao lado,
  e SEM a tabela gêmea (pedido dele). Feito em SVG da casa, como o sino e a barra lateral: o
  recharts somaria mais de 100kB ao carregamento de todo mundo por um gráfico que só a gestão
  abre. Duas diferenças deliberadas do exemplo: a curva é MONÓTONA (a "natural" passa do
  ponto, e um prazo de 100% desenharia barriga acima de 100%), e dia sem dado é BURACO na
  linha, não zero. Sem a tabela, o gráfico é focável e as setas andam de pedaço em pedaço.
  **UMA FORMA PARA OS SEIS:** o número do próprio KPI. O prazo deixou de ser pilha "no prazo ×
  atrasado"; as contagens estão na dica. **Volume é POR DIA no gráfico** (o mês corrente está
  pela metade, um ano tem meses de 28 a 31 dias) — o cartão continua com o total do mês.
  **A MINI-LINHA DO CARTÃO É EM BLOCOS**, não na semana do calendário: 1–7, 8–14, 15–21 e
  22–fim, contados do dia 1. Pedaço no futuro ou antes do piso é SEM DADO (nulo), não zero.
  **UMA FUNÇÃO, TRÊS LEITURAS:** `metricas_serie_da_equipe` (migration `20260929053020`) devolve
  os seis KPIs por pedaço, e o cartão (um balde = o mês), a mini-linha e o gráfico leem dela —
  por isso não discordam. Ela NÃO redefine nada: chama `metricas_prazo_do_periodo`,
  `metricas_da_equipe_por_etapa` e `metricas_por_pessoa` balde a balde, com teto de 62
  pedaços. As duas séries semanais de 28/09 saíram na mesma migration; os grãos `dia` e
  `periodo` vieram na `20260929064502`, e `p_pessoa_id` na `20260929073949` (assinatura nova:
  DROP + CREATE, com o REVOKE de PUBLIC repetido). Com 15 meses de dado fictício, 30 dias levam ~0,6s
  (cada balde refaz três consultas) — se a produção pesar, o lugar de otimizar é ali. O valor de cada KPI num
  pedaço é `GRAFICO_DO_KPI`, em `lib/kpis.ts` — uma definição só.
  PESSOAS — três destaques (mais partos, mais edições, melhor prazo) e UMA tabela de KPIs que
  É o ranking: cada coluna ordena, o primeiro toque põe o melhor em cima, empate divide a
  posição, e zero numa coluna de volume não tem posição ("não fez esse tipo de trabalho").
  Tempo não é coluna.
  **TOCAR NUMA PESSOA ABRE O MINI PERFIL** (29/09/2026, pedido do gestor: "com todas as infos
  que coletamos nos cards (…) quantidade de produção e tempo médio em cada etapa"), no lugar
  das três linhas de resumo que abriam dentro da tabela. No computador fica AO LADO da tabela,
  já aberto na primeira pessoa da ordem, com a MESMA ALTURA dela ("os cards devem se igualar
  em tamanho"); no celular, embaixo e só depois do toque. O × fecha o perfil e a tabela ocupa
  a largura; tocar em alguém reabre.
  **A ABA TEM FILTROS PRÓPRIOS** (`AbaPessoas`, pedido do gestor: "datas e etc."): PERÍODO (o
  mês do topo, os últimos 7 dias, HOJE, ou datas escolhidas — entre 01/10/2026 e hoje; "30
  dias" saiu por ser redundante com o mês, e o "24h" que o gestor sugeriu virou "Hoje" porque
  o relatório conta por dia do calendário),
  TRABALHO (todos, quem fez campo, quem fez edição no período) e BUSCA pelo nome. O período
  vale para a aba inteira — tabela, destaques e perfil, que diz qual é ("nos últimos 7 dias").
  Filtrar por trabalho não fere a 3.1: é "quem FEZ edição neste período", lido das etapas
  concluídas, e a mesma pessoa aparece nos dois se fez as duas coisas. Com período fora de
  "Mês", o seletor de mês do topo não vale para esta aba. Quatro
  blocos: os quatro números (partos, edições, prazo, ajustes); PRODUÇÃO POR ETAPA (feitas,
  tempo médio, média da equipe); FASES DO CAMPO (tempo médio em cada fase, por etapa); e o
  que mais os cards guardam (material, passagens, atribuições, entregas, termos, avaliações,
  concluídas por outra pessoa, campo em paralelo — só o que for maior que zero).
  **TEMPO MÉDIO É MÉDIA**, como ele pediu (`soma_min / medidas`), só das etapas com relógio
  de verdade; a da equipe é soma sobre soma, que se compõe (mediana não). Na EDIÇÃO, quando
  parte das etapas não teve relógio, a linha diz "10 de 17 com relógio" — âmbar abaixo de
  metade; no CAMPO não, porque registrar depois é permitido (seção 9). A comparação com a
  equipe é neutra, sem cor.
  **AS FASES DO CAMPO VIRARAM MÉTRICA** (`metricas_fases_de_campo`, migration
  `20260929092831`), como o pedido que as criou previa. A fase dura da declaração à próxima,
  ou à conclusão da etapa — e NUNCA passa da conclusão: a primeira versão deixava uma fase
  declarada depois de concluir esticar a anterior (o parto de 60 min virava 90), e o teste F1
  pegou. Mesma fase duas vezes na mesma etapa soma; a média é por etapa. Crédito do
  responsável, piso de 01/10, só gestão. Os dados fictícios ganharam fases em 85% das
  entradas e nascimentos.
  **O RANKING POR PONTOS** (29/09/2026, pedido do gestor e do André, migration
  `20260929210556`). É o que eles já faziam numa planilha com um chat: cada etapa vale um PESO
  ("não posso colocar o mesmo peso para quem editou um Reels, que leva 40 minutos, e quem
  fotografou um parto"), e a etapa que passou de mão tem os pontos DIVIDIDOS. A régua de
  fábrica é a tabela que eles mandaram: Nascimento 3 · Fotografia de Birth 3 · Foto parto 2 ·
  Foto/Livro 1,5 · Entrada 1 · Banho 1 · Vídeo MASTER 1 · Fechamento 0,5 · Reels parto 0,5 ·
  Foto B+F 0,5 · Reels B+F 0,5. **Três suposições, porque a tabela não as cobre:** encontro de
  irmãos, alta e saída da UTI valem o fechamento (0,5 — a própria tabela descreve o fechamento
  como "encontros de irmãos, alta ou fotos finais no quarto"); REVISÃO (rodada 3+) e NEW BORN
  começam em ZERO; e a divisão é em partes iguais para QUALQUER número de pessoas.
  **O ITEM NÃO É O TIPO DA ETAPA** (enum `item_de_pontuacao`, mapeado por `item_de_pontuacao()`,
  UMA definição): a edição de fotos é "foto parto" na rodada 1 e "foto B+F" na 2, e o
  nascimento de pacote cujo slug começa com `birth` é "fotografia de Birth" — o mesmo critério
  de `termo.ts`.
  **QUEM DIVIDE:** o RESPONSÁVEL mais todo mundo que aparece num HANDOFF da etapa, de um lado ou
  do outro. Handoff só existe depois de o trabalho começar (antes é atribuição), então quem está
  nele pôs a mão. Quem só clicou "concluir" no lugar de alguém NÃO divide — creditar quem clicou
  era o defeito nº 1 do inventário.
  **A RÉGUA SE MUDA NA TELA** — aba **Pontuação**, pedido deles ("a gente precisa começar a usar
  pra ver"). É versionada como os padrões de tempo: peso novo vale da data em diante, o mês que
  passou continua contado com o peso dele, e no mesmo dia corrige; cada mudança fica em
  `eventos`. **"Hoje" nunca é antes de 01/10/2026** (`dia_da_regua_de_pontos`): a régua de
  fábrica vale dessa data, e sem o piso um peso definido em 29/09 ficaria ATRÁS dela.
  **NA TELA:** a coluna Pontos abre a tabela de Pessoas e é a ordem padrão; o primeiro destaque
  é "Mais pontos"; o perfil ganhou o bloco de pontos por item, com quantas etapas e quantas
  foram divididas. A contagem de etapas do bloco de pontos pode passar a de "Produção por
  etapa": aquela conta só o responsável, esta conta quem pôs a mão.
  **O RANKING GANHOU CARA DE PÓDIO** (30/09/2026, pedido do gestor: a empresa quer começar a
  trabalhar com GAMIFICAÇÃO). No alto da aba Pessoas, `RankingDePontos`: posição, COROA de ouro,
  prata e bronze pousada no retrato dos três primeiros (por posição — empate em primeiro leva
  duas de ouro), nome, pontos, uma barra contra os pontos do líder ("quanto falta para
  alcançar") e quantas posições cada um SUBIU ou DESCEU contra o período anterior de mesmo
  tamanho. Veio de um exemplo de leaderboard com shadcn e lucide, feito com as peças da casa
  (`IconeCoroa`, `Avatar`, tokens `--ouro`/`--prata`/`--bronze`); o "nível" e a liga do exemplo
  saíram a pedido dele ("só o nome mesmo"). Mostra os cinco primeiros e a própria pessoa depois
  de um "…" se ficou de fora; o resto abre num toque, e tocar numa linha abre o perfil. A BUSCA
  POR NOME NÃO O RECORTA (procurar alguém não o põe em primeiro); o filtro de trabalho sim, e aí
  a variação some, porque o período anterior não foi recortado igual. A variação também some
  quando o período anterior não tem ponto nenhum — em outubro de 2026 ele é setembro, antes do
  piso. Ele tomou o lugar do destaque "Mais pontos"; os outros três ficam ao lado, empilhados.
  PADRÕES DE TEMPO — uma linha por etapa: padrão em vigor, mediana da equipe no mês, quantas
  ficaram DENTRO do padrão, e o campo para definir (o número é da gestão).
  **A RÉGUA PASSOU A SER USADA** (30/09/2026, pedido do gestor: "uma forma de eles escolherem
  os padrões que esperam (…) para que seja feito nessa média", migration `20260930052252`).
  Até aqui ela era guardada e ninguém a lia — e a aba só listava etapa com medição no mês, então
  em produção, antes de 01/10, ela abria em "nada medido" sem deixar definir nada. Agora TODA
  etapa aparece (campo e edição separados), o padrão se escolhe em HORAS e MINUTOS, a mediana
  do mês vira o atalho "usar 1h35", e `metricas_dentro_do_padrao` conta, por pessoa e etapa,
  quantas medidas ficaram dentro dele: a aba mostra a equipe ("52% · 64 de 124") e o perfil de
  cada pessoa ganhou a coluna "No padrão" ("5/6", âmbar abaixo da metade — ali há cor, porque a
  régua é a que a própria gestão escolheu).
  **O PADRÃO É O DA DATA DA CONCLUSÃO**, e antes da primeira régua de uma etapa vale a primeira:
  sem isso, o padrão definido em novembro deixaria outubro sem comparação nenhuma. É o arranjo
  da régua de pontos, que vale desde 01/10 mesmo definida depois. **Por etapa, não por pacote**
  (perguntado ao gestor em 30/09): a coluna `pacote_id` de `padroes_tempo` continua sem uso.
  A variação só aparece quando o mês anterior tem dado — em outubro de 2026 ele é setembro,
  antes do piso, e um "+100%" contra zero seria mentira com cara de conquista.
  **"VOLTOU PARA AJUSTE"** soma `caso_reaberto` (crédito da última rodada concluída do tipo
  reaberto) e `etapa_reaberta` de etapa concluída há MAIS DE 30 MIN — no remoto, 116 das 180
  reaberturas foram desfeitas em minutos (clique errado), e contá-las triplicaria o número.
  **TODA SOMA É DO BANCO**, e mediana não se compõe: por isso a série chama as funções do
  período balde a balde em vez de somar pedaços, e `metricas_da_equipe_por_etapa` existe ao
  lado da por pessoa.
  Sem paginação — as funções devolvem linhas por pessoa e tipo, algumas centenas no máximo.
  **OS GRÁFICOS SÃO DA CASA** (SVG, sem biblioteca), com cores próprias validadas por script
  de daltonismo: `--grafico` (o azul da marca numa luminosidade de gráfico),
  `--grafico-atrasado` e `--grafico-comparacao` (a linha de comparação: o rosa `--acento` numa
  luminosidade de gráfico, ΔE 11 contra o azul no claro e 16 no escuro). **"No prazo" é AZUL e não verde**: verde ×
  vermelho deu ΔE 4,1 para deuteranopia (reprova); azul × vermelho, 25,8. Todo gráfico com
  legenda quando há duas séries, dica no mouse E no foco do teclado (a tabela gêmea saiu a pedido do gestor em 29/09; o gráfico é percorrível pelas setas).
  **DADOS FICTÍCIOS NO LOCAL:** `npm run seed:metricas` põe de OUTUBRO DE 2026 A DEZEMBRO DE
  2027 (~1.850 casos, 12 pessoas com nomes de pedras preciosas, cada uma com um perfil de
  ritmo, disciplina com o relógio, atraso e retrabalho). A equipe MELHORA mês a mês e o volume
  tem estação, para as comparações terem o que mostrar. Idempotente por mês. Só local, por
  construção: vai direto para o container. Os testes pgTAP das métricas moram em 2029 para não
  colidir com ele.
  **DATA SIMULADA, SÓ EM DESENVOLVIMENTO:** esses meses estão no futuro e o gráfico só desenha
  o que já passou, então no local a tela ABRE em 31/12/2027, o último dia dos dados fictícios
  (o gestor procurou os dados com a data real e não os achou). `?hoje=2027-06-15` simula outro
  dia, `?hoje=real` volta à data de verdade, e um selo no topo diz qual está valendo. `hojeDoRelatorio` (em `lib/metricas.ts`)
  lê o parâmetro atrás de `import.meta.env.DEV`, que vira `false` no build — conferido: a
  leitura da URL não existe no bundle publicado.
- **RELATÓRIOS — O RELATÓRIO EXTERNO, A OPERAÇÃO INTEIRA** (`/quadro/relatorios/externo`, só
  `gestao`; 29/09/2026, migration `20260929233525`). O interno olha a EQUIPE; este olha os
  CASOS. O que importa nele, nas palavras do gestor, são os FILTROS: "como SóCarrão ou
  Webmotors, um filtro bem completo (…) de misturar vários tipos de filtros para chegar num
  denominador comum". A referência foi estudada na SóCarrão (a Webmotors bloqueia robô, e não
  se contorna).
  **É BUSCA FACETADA, o modelo dos classificados:** dentro de um grupo as opções SOMAM (HSC ou
  HNSG), entre grupos CORTAM (HSC e atrasado), e cada opção mostra QUANTOS CASOS daria com todos
  os OUTROS filtros marcados e sem o do próprio grupo — é o que deixa misturar sem cair num
  resultado vazio. Os aplicados viram etiquetas com × no alto, com "Limpar filtros".
  **OS GRUPOS:** período do atendimento (com atalhos: este mês, mês passado, 30 dias, este ano,
  tudo), situação (em andamento, em Entregáveis, entregue, cancelado pela equipe, cancelado pela
  AGENDA — o sync só escreve dois textos fixos de motivo, e é por eles que se separa —,
  rascunho), prazo (enviado no prazo, enviado atrasado, vencido sem envio, dentro do prazo, sem
  prazo; conta no ENVIO, e caso encerrado antes de 06/09 usa o encerramento), maternidade,
  pacote, QUEM FEZ + NA ETAPA (dois grupos de UMA condição: "a Jade fez o PARTO" é diferente
  de "a Jade fez alguma coisa"), adicionais, termo de imagem, horário do parto (turnos), dia da
  semana, ocorrências Sim/Não (UTI, passagem de turno, reaberto, avaliação, despesa), faixas
  (horas do parto ao envio, valor de despesa) e busca por nome sem acento.
  **UMA REGRA PARA AS TRÊS FUNÇÕES** (`operacao_marcas`): lê o `jsonb` UMA vez e devolve, por
  caso, uma marca por grupo e quantos falharam. Lista e resumo são os casos sem falha; a
  contagem do grupo X são os casos em que só X falhou, ou nenhum. A primeira versão avaliava a
  regra caso a caso e grupo a grupo, relendo o `jsonb`: 8 segundos para as facetas de 1.800
  casos fictícios. Com as marcas, 105ms sem filtro nenhum e ~30ms num mês. A view
  `operacao_dos_casos` (sem GRANT, lida só pelas funções) traz os atributos de cada caso, em
  cima de `quadro_casos`.
  **NÃO HÁ PISO DE DATA**, ao contrário do interno: aquele mede PESSOAS e começa em 01/10/2026;
  este acha CASOS, e um caso de agosto continua sendo um caso que alguém vai querer achar. A
  tela abre no mês corrente (no local, com a data simulada do interno).
  **TUDO MORA NO ENDEREÇO** (filtros, ordem, página): um link leva a busca junto, e o "voltar"
  do navegador desfaz o último filtro — os classificados de referência não fazem isso.
  **TOCAR NUM CASO ABRE O CASO NO QUADRO** (`/?caso=`), que já sabe achá-lo — no dia, em
  Entregáveis ou nos Concluídos. A lista é paginada NO BANCO (50 por vez, ordenação total com o
  id no fim) e traz o total do recorte; em cima dela, os NÚMEROS DO RECORTE (casos, partos, %
  no prazo, mediana parto→envio, despesas, cancelados), que é o que um relatório tem e um
  classificado não. Os nomes das opções abertas vêm do CADASTRO, para a etiqueta de uma
  maternidade marcada que zerou ainda dizer qual era.
  **NA BARRA LATERAL, "Relatórios" VIROU UM GRUPO QUE ABRE** (pedido do gestor: "um dropdown com
  as duas opções, interno e externo"): o pai é botão, os filhos aparecem com a barra aberta e
  nascem abertos quando se está numa tela de dentro; fechada, é o pai que acende. Na faixa do
  celular cada filho vira pílula com o nome completo ("Relatório interno"). O interno continua
  em `/relatorios`. Os filhos moram em `Destino.filhos` (`destinos.ts`), a mesma tabela única.
  **O RECORTE VIRA GRÁFICO E PLANILHA** (30/09/2026, segunda volta do gestor: "todo filtro
  colocado virar gráfico E planilha para exportar", migration `20260930052252`). Uma chave
  "Casos · Gráfico" troca a lista pelo gráfico do MESMO recorte, e os seis cartões de números
  viram botões que escolhem o que se desenha. O eixo é o TEMPO (dia a dia até 62 dias, mês a mês
  acima disso ou em "tudo", com o gráfico da casa do relatório interno) ou uma DIMENSÃO
  (maternidade, pacote, situação, prazo, quem fez o parto, turno, dia da semana, termo), em
  barras deitadas — é o "agrupar por" que ficou pendente. Tocar numa barra MARCA aquela opção
  como filtro, menos em "quem fez o parto" (o banco agrupa pelo nome; o filtro é por pessoa).
  `operacao_grafico` devolve os mesmos números de `operacao_resumo` pedaço a pedaço, com a
  mediana refeita no banco: somar as linhas dá o resumo, e o teste G2 trava isso.
  **"Exportar planilha"** tem duas saídas, no formato da de Despesas (`lib/csv.ts`, que saiu de
  `features/despesas` para ser das duas): os CASOS do recorte, todos e não só a página (de 200
  em 200 até o total), e os NÚMEROS por trás do gráfico, no eixo escolhido. A dos casos leva
  nome de mãe e bebê — é por isso que ela só existe atrás da gestão (seção 10).
  **A TABELA RESPIRA** (mesmo pedido: "muito coladinho"): mais espaço entre as colunas, um vão
  maior entre os números e "Parto por", e maternidade e pacote numa coluna de duas linhas — sem
  isso a tabela rolava de lado em telas de ~1300px. O nome é a única coluna que encolhe (quebra
  em duas linhas). As datas do período ficaram uma por linha, porque lado a lado cortavam o ano,
  e só UM atalho de período acende (em 30/09, "este mês" e "últimos 30 dias" eram iguais e
  acendiam juntos).
  **CADA FILTRO VIRA UMA COLUNA** (30/09/2026, terceira volta do gestor, migration
  `20260930204404`). A lista abre com QUATRO colunas fixas — data, mãe/bebê, maternidade,
  pacote — e DOS MAIS ANTIGOS para os mais recentes (no mesmo dia, pela hora). Cada grupo que
  ganha filtro acrescenta a sua à direita, NA ORDEM EM QUE FOI APLICADO; tirou o filtro, a
  coluna sai. A ordem mora no ENDEREÇO (a ordem dos parâmetros, que `escreverNoEndereco`
  preserva), então um link leva as colunas junto. Cada TIPO de link marcado é uma coluna
  própria; "Quem fez" e "Na etapa" dividem uma; maternidade e pacote já são fixas
  (`colunasDosFiltros`, em `filtros.ts`). No celular, as colunas viram linhas do cartão.
  **DOIS GRUPOS NOVOS:** LINKS (os tipos de link de entrega do caso, ou "sem nenhum link") e
  EQUIPAMENTO (o CEL CLICK e o cartão de memória lançados no card, `cartao_video` e
  `cartao_foto`, em maiúsculas e sem espaço sobrando — "cel:CEL CLICK 3", "cartao:14 HSC").
  **O LINK NA COLUNA É CLICÁVEL, COM COPIAR; NA PLANILHA, SÓ O TIPO** (decisões do gestor): o
  link é a chave da galeria da família, e um arquivo encaminhado abriria todas. A busca devolve
  o endereço só da página da tela.
  **TUDO NASCE FECHADO** no painel, MENOS O PERÍODO, que fica sempre aberto e sem seta desde
  05/10/2026 (pedido do gestor; `Secao fixa`); abre sozinho só o grupo que chega com filtro
  marcado. O atalho "Últimos 30 dias" virou **"Próximos 30 dias"** no mesmo dia ("fica
  redundante" com o mês passado): com a agenda inteira no sistema, há partos marcados pela
  frente, e nenhum atalho olhava para eles. Ordem dos grupos, do gestor: período, links, termo,
  situação, prazo, maternidade, pacote, quem fez, na etapa, equipamento, e o resto.
  **O MODO COMERCIAL** (01/10/2026, pedido do gestor, migration `20261001001607`). A planilha
  do atendimento em que o comercial controla o que já OFERECEU depois do parto virou um modo
  deste relatório: uma chave "Comercial" no cabeçalho, e a lista passa a ser só de PARTOS, com
  três colunas fixas depois do pacote — REELS, NEW BORN e FOTO/LIVRO — e o seletor de fase de
  cada oferta, na mesma pílula das seções do Quadro: **Apresentar · Enviado · Recusou · Vendido**
  ("recusou" no lugar do "não quis" do pedido). Os filtros por fase das três vêm primeiro no
  painel, e a planilha exportada leva as três colunas.
  **QUAIS CASOS** (decisão do gestor, perguntado): REELS só nos BASIC e STANDARD puros — os que
  não venderam o vertical; a equipe o faz mesmo assim e o comercial o oferece depois; NEW BORN e
  FOTO/LIVRO em todo parto que ainda não tem a etapa; EVENTO e NEWBORN fora.
  **O BIRTH ENTROU EM 01/10/2026** (`20261001143918` e `20261001143922`, pedido do gestor: "os
  BIRTH são vendidos, então têm que ser apresentados"): a oferta **Birth** — a venda do próprio
  pacote — é a primeira coluna, e só existe nos dois BIRTH. Lá New Born e Foto/Livro ficam
  ESCONDIDOS ("apenas birth, mas em casos MUITO RAROS é possível que aconteça essa venda") e a
  célula mostra **"＋ Oferecer"**, que abre a oferta só naquele caso; dali em diante ela anda
  como em qualquer parto. Reels nunca: o BIRTH já faz o reels. BIRTH vendido não cria etapa. Onde a
  oferta não se aplica, a célula é um traço. A regra mora na view `operacao_dos_casos`
  (`comercial`, `oferta_*`), e a fase em `ofertas_comerciais` — sem linha, "apresentar".
  **VENDIDO CRIA A ETAPA** no New Born e no Foto/Livro (decisão do gestor), depois de uma
  confirmação na tela — e cria MESMO NO CASO ENCERRADO, que é quando a venda acontece:
  `definir_oferta_comercial` insere a etapa direto, porque `adicionar_etapa` recusa caso
  terminal. Nenhum gatilho deriva status de etapa, então o caso continua encerrado, e as duas
  etapas já não seguram o encerramento nem saem do arquivo do Quadro. Só cria: voltar a fase
  não apaga etapa.
  **QUEM MUDA A FASE** é a tela Comercial; quem só tem Relatórios vê a pílula e não a abre.
  **O RETORNO AGENDADO** (05/10/2026, pedido do gestor, migration `20261005055525`): a ÚLTIMA
  coluna do modo comercial é a data de voltar a procurar a família que disse "agora não" — e,
  "bem no futuro", a data de uma mensagem automática de WhatsApp, por isso é DATA e não texto.
  UMA POR CASO (`retornos_comerciais`, escrita só por `definir_retorno_comercial`, com o antes e
  o depois em `eventos`; nulo tira o retorno e apaga a linha). O diálogo tem atalhos (+7, +15,
  +30 dias, +3 meses); a pílula fica vermelha vencida, âmbar de hoje a 7 dias. O filtro é por
  SITUAÇÃO (`situacao_do_retorno`: vencido, hoje e próximos 7 dias, mais adiante, sem), e a
  busca ganhou a ordem "Retorno mais próximo", só oferecida no modo comercial.
  Custo medido no local: as ofertas levaram as facetas de ~105ms para ~275ms no histórico
  inteiro; num mês, ~40ms.
  **Fica para as próximas voltas:** buscas salvas.
- **O CALENDÁRIO** (`/quadro/calendario`, 30/09/2026, item 5 da fila do gestor). Todos os
  papéis MENOS `operador` (decisão do gestor; desde 30/09/2026, a tela `calendario` — o padrão
  do papel é o mesmo), pela guarda `RotaAdministrativa`, que usa a
  mesma regra da aba Concluídos (`podeVerConcluidos`) — regra de tela, a RLS não mudou.
  **É A PRIMEIRA DE TRÊS ETAPAS**, combinadas com o usuário: (1) MOSTRAR o que o banco já sabe;
  (2) a ESCALA de plantão, registrada na seção Equipe (pedido do gestor: "a gestão sabe os
  turnos"), usando a tabela `escalas` que existe vazia desde o schema inicial; (3) marcar o
  parto no próprio sistema, com o Google Calendar recebendo uma cópia (o gestor quer o Google
  como contingência). Até a etapa 3, o Google continua sendo a ENTRADA dos casos pelo sync.
  **O medo da gestão ("perder todos os dados") foi respondido pelo backup noturno**, não pelo
  Google — ver "Backup" na seção 11 e `docs/backup.md`.
  **SEM MIGRATION:** tudo o que ele mostra já é legível — três consultas por período
  (`quadro_casos` pelo `dia` e pelo `vence_em`, `caso_etapas` pela `previsao_em`) mais
  `feriados`, com `buscarTudo` e ordenação total. Quatro tipos de item, uma cor cada (a legenda
  é também o filtro): PARTO (previsão do caso; "Nasceu" esmaecido quando já nasceu; rascunho
  marcado), HORA MARCADA (banho, fechamento e as outras de campo, com o responsável), ENTREGA
  COMBINADA (vídeo, Foto/Livro, New Born — o `previsao_em` da seção lateral) e PRAZO DO PACOTE
  (só de caso ainda não ENVIADO; vermelho quando venceu). Cancelado não aparece; o nascimento
  não vira item de etapa, porque o caso já é o item do parto.
  **O DESENHO É O DO EXEMPLO QUE O GESTOR MANDOU** (30/09/2026, "nosso calendário vai virar"
  um `EventManager` de shadcn), feito com as PEÇAS DA CASA — o exemplo traria sete pacotes
  (Radix, cva, lucide…) e um segundo sistema de botões, diálogos e selects; é o arranjo do sino
  e da barra lateral. Quatro visões: **Mês**, **Semana** e **Dia** em GRADE DE HORAS (como no
  Google, com a faixa "dia todo" em cima e a grade abrindo nas 6h) e **Lista** por dia. Busca
  sem acento e dois menus de filtro de marcar — Tipos e Maternidades; o de Cores saiu a pedido do
  usuário, porque a cor É a maternidade e o filtro dela já responde pelo nome —, com as etiquetas
  dos ativos e "Limpar" (somam dentro do menu, cortam entre menus, como o relatório externo).
  Passar o mouse num item abre o cartão de detalhes; tocar abre o detalhe, com "Abrir o caso no
  Quadro". A visão e o dia moram no endereço. No celular, o mês mostra bolinhas e a semana rola
  dentro da própria grade.
  **EDITAR, CANCELAR E ARRASTAR** (30/09/2026, segunda volta: "poder editar, excluir"). Tinham
  ficado de fora porque o sync desfaria a mudança; com o Google acompanhando (seção 7), entraram.
  No detalhe do PARTO: "Editar caso" (adm — o mesmo formulário da criação, aberto no caso) e
  "Cancelar caso" (atendimento ou adm, com motivo; "Descartar rascunho" no rascunho). Na HORA
  MARCADA e na ENTREGA COMBINADA: "Mudar horário" (`agendar_etapa`, qualquer um que vê o
  calendário; não toca no Google, que só tem o parto). O PRAZO DO PACOTE não tem ação — é conta.
  **ARRASTAR SÓ ABRE O FORMULÁRIO**, já com o dia e a hora de onde o item caiu ("Antes: …"
  embaixo): um arrasto errado não pode mudar um parto na agenda da equipe inteira. Só no mouse
  (o arrastar do HTML não existe no toque); no mês e na faixa "dia todo" muda o dia e mantém a
  hora. O detalhe e o cartão de hover dizem quando o Google ainda não acompanhou ("atualizando
  no Google").
  **AS CORES SÃO AS DO GOOGLE, EM TODO ITEM**: o banho, o prazo e o vídeo de um caso vêm na cor
  do caso (a regra do cadastro), e o tipo se lê no texto. **O que vem pela frente é COR CHEIA**
  (a primeira versão tingia de leve e o gestor achou "muito apagado"), com o texto branco ou
  escuro de mais contraste (`textoSobre`: o branco do Google fica abaixo de 3:1 no Banana e no
  Pavão). **O que já passou, ou já foi feito, fica em FUNDO BRANCO COM A BOLINHA da cor** —
  pedido dele, "como no calendar", depois de ver e recusar uma versão ESMAECIDA (opacidade), que
  lia como defeito. A exceção é o PRAZO VENCIDO SEM ENVIO, vermelho cheio mesmo no passado. A
  regra é `aparencia`, em `lib/estilos.ts`. Sem cor, a padrão da agenda (Pavão: no print do
  Google da equipe, a HNSF aparece assim). O seed fictício grava a cor pela regra do cadastro.
  **FERIADO SE MARCA NA VISÃO DO DIA**, só pelo ADM (`podeEditarCadastro`, espelho de
  `eh_adm()` — a policy `feriados_escrita_adm` já existia, e o INSERT/DELETE é direto, como todo
  cadastro). Ele muda o prazo dos dois MASTER na hora, porque `quadro_casos` recalcula
  `vence_em` na leitura: conferido no local, um MASTER nascido em 09/10 vence em 23/10 e, com
  12/10 marcado, em 26/10. Por isso o Quadro recarrega junto, e o botão avisa no `title`.
  Sem Realtime próprio: o calendário relê a cada 2 minutos — o que muda nele muda no Quadro.
  **CRIA CASO** ("ele está entrando para substituir"): "+ Novo caso" no alto e "+ Novo caso
  neste dia" na visão do dia, só para o adm (`eh_adm`, os quatro papéis administrativos — o
  atendimento vê e não cria). O formulário é o título do Google em campos: mãe, bebê
  (opcional), pacote e maternidade em LISTA COM BUSCA (a busca só filtra, o valor sai de lista
  fechada — daqui não sai rascunho pendente), dia, hora, e New Born. Antes de salvar ele mostra
  o evento como vai aparecer no Google — título e cor.
  O caminho até o Google está na seção 7.
  **CESÁREA, OBSERVAÇÕES E FOTO/LIVRO** (30/09/2026, pedido do gestor, migration
  `20260930192224`). O formulário tem HORA PREVISTA (quando a equipe precisa estar lá — a do
  alerta e a do evento; vazia = hora a definir) e HORA DA CESÁREA (`casos.cesarea_em`, a da
  cirurgia). OBSERVAÇÕES é `casos.observacao_calendar`, o texto da descrição do evento — o
  template vem do gestor. FOTO/LIVRO marca a etapa `album` por `adicionar_etapa`, só marca,
  como o New Born. **A descrição do evento só é escrita no caso que o SISTEMA criou**
  (`criado_por`): no que veio do Google ela é da equipe (tem CPF, e-mail, médico), e reescrevê-la
  com um campo que aqui nasceu vazio apagaria o cadastro. O texto não vai para `eventos`.
  **O FORMULÁRIO ABRE LARGO, EM DUAS COLUNAS** (30/09/2026, pedido do gestor: "não gosto de ele
  ficar extenso verticalmente e ter que ter scroll"): `Dialogo` ganhou `largo`; à esquerda o que
  é o título do evento e a prévia do Google, à direita adicionais, termo e observações. E o
  **TERMO DE IMAGEM entrou no cadastro** (mesmo pedido): opcional, o BIRTH abre em "Sem
  contrato", e vai por `registrar_termo` depois de salvar o caso — a confirmação da entrega
  continua perguntando quando ficou sem resposta.
  **O DETALHE FECHA NO X** (`Dialogo` ganhou `fecharNoCanto`) e **"Abrir o caso no Quadro" só
  aparece quando o caso ESTÁ lá** (`useNoQuadro`: não arquivado e dia até amanhã).
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
3. **O relatório EXTERNO nasceu em 29/09/2026** (a operação inteira, com filtros) e ganhou
   gráfico, agrupamento e planilha em 30/09; faltam as buscas salvas. (`escalas` ganhou tela em
   30/09/2026, na Equipe — o que segue abaixo vale até ela ser preenchida.) E `escalas` continua vazia: sem
   turno registrado, não há "vazão por turno" (o plano previa), só "dias com trabalho", que é
   mais fraco. Preencher escalas NÃO é registro de ponto (seção 9): é a escala planejada.
4. **`atualizar_situacao_clinica` sem RPC.** `situacao_clinica` continua por UPDATE direto
   de adm, e desde 28/09/2026 vale perguntar se ela deve existir: as fases do trabalho de
   campo cobrem a pergunta que a operação de fato faz, e esta coluna segue no valor padrão em
   300 dos 313 casos. Aposentá-la é conversa com o gestor, não limpeza silenciosa — o que ela
   guarda dos 13 casos escritos é dado de saúde, e apagar isso tem regra própria (seção 10). Quando ganhar RPC, revogar o privilégio de coluna — não basta parar de usar.
   `termo_status` era a outra metade e fechou em 22/09/2026 (`registrar_termo`, migration
   `20260922183631`): a RPC nasceu e o `revoke update (termo_status)` veio na mesma
   migration, que é o par que esta dívida pede.
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
   bugado". O gestor já aprovou construir o workflow; falta fazer. (O primeiro workflow do
   repositório entrou em 30/09/2026 e é o do BACKUP, não o de deploy — ver "Backup" na
   seção 11.)
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
   `somar_dias_uteis`, e portanto o prazo dos dois MASTER. Desde 30/09/2026 o ADM marca e
   desmarca feriado pelo Calendário; o que falta é a gestão dizer QUAIS.
10. **Raiz do domínio dá 404.** `clickbaby.com.br/` está reservada para a landing da
   empresa, que não existe. O app vive em `/quadro`.
11. **Observação do Calendar não é importada.** O `description` do evento do Google não vem
   para o caso. Se vier, tem que ser campo PRÓPRIO (`observacao_calendar`), separado da
   observação interna — senão o sync sobrescreve o que a equipe escreveu.
   O campo existe desde 30/09/2026 (escrito pelo calendário do sistema) e a importação
   continua pendente: espera o template do gestor, e traz documento e contato da família para
   uma tabela legível por toda pessoa ativa — decidir a RLS antes.
12. **Parser: combinações "OUTROS" não são pacotes.** (O EVENTO virou pacote em 30/09/2026 —
    ver a seção 2.) Os rascunhos pendentes que
    sobraram esperam decisão do dono sobre cadastro e padronização de título, não código.
    Não melhore o parser por heurística — é o "assumir quando ambíguo" que a seção 7 proíbe.
    O NEWBORN saiu desta lista em 22/09/2026: ele é o "CLICK HOME", virou ADICIONAL (uma
    etapa do mesmo caso) e o parser passou a lê-lo. Os rascunhos que eram dele se resolvem
    confirmando o pacote — a etapa nasce junto.

### Fora do escopo, mapeado

Importação da planilha histórica (pós-MVP), login por PIN (seção 8, fase 1), cláusula LGPD
no contrato (controlador × operador), conta de teste no remoto para a sonda cobrir
`authenticated`.

**Dívida fechada — UPDATE direto de `casos`:** a policy `casos_update_atendimento_confirma_entrega`
foi derrubada (atendimento age só via RPC agora). `casos_update_adm` continua existindo, mas
`status_operacional`, `status_entrega` e `motivo_cancelamento` perderam o privilégio de
UPDATE por coluna para `authenticated` — nem adm consegue mudar esses três por UPDATE direto
mais, só pelas RPCs de transição. Ver migration `20260821065740`.
