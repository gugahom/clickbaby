# Painel comercial — desenho (rascunho, revisado em 18/11/2026)

Proposta para discutir antes de implementar. Nada disto existe ainda. O que está marcado
**[a confirmar]** precisa da palavra do gestor.

---

## 1. O que é

Hoje o comercial trabalha em três planilhas e no celular da empresa. O sistema já cobre o
DEPOIS da venda (caso, valor vendido, tabela de preços, ofertas de Reels/New Born/Foto/Livro e
retorno agendado no modo comercial do relatório externo). Falta o ANTES: o **lead** — a mãe que
ainda não comprou.

A página comercial é onde o lead nasce, é trabalhado até virar venda (ou não), e de onde a venda
vira **caso** — o mesmo caso que o Quadro já opera. O **Calendário** passa a morar dentro dela
(decisão de 18/11: "ele importa apenas pra ele"). Depois entram a caixa de entrada do WhatsApp e
o robô (Z-API × oficial ainda pendente) e o "monte seu pacote" do cliente.

---

## 2. O que as planilhas dizem (conferido nos CSVs de 18/11)

### "PAINEL DE VENDAS" — os leads, uma aba por MÊS DA DPP

Medido na aba de OUTUBRO/26 (183 leads):

- **O prazo do vendedor é sempre DPP − 10 dias**: 142 de 142 linhas com prazo. A DPP é a data
  provável do parto informada pela mãe ou pelo pai — pode mudar, e o prazo anda junto.
- **Quem vende depende da origem.** Cupom da GNDI → Guizão; cupom da HSC → Rafinha; "CELL GUI"
  só fecha com o Guizão e "CELL RAFA" só com a Rafinha (parece ser o lead que o próprio vendedor
  trouxe **[a confirmar]**). Origens: cupom GNDI 136, CELL GUI 29, cupom HSC 13, CELL RAFA 5.
- **Passou o prazo sem venda, o lead vai para a REPESCAGEM da Vavá** (confirmado): 1º retorno,
  2º retorno, aguardando. Ela também fecha ("FECHADO VAVÁ").
- **Resultados do mês:** 46 vendas (Guizão 40, Rafinha 5, Vavá 1), 25 não quis, 13 já nasceu
  ("prazo encerrado" = perda, confirmado), 3 sem WhatsApp, 1 virou BIRTH, e 89 ainda em
  repescagem — **metade dos leads cai na repescagem**.
- **Conversão por origem** (só para mostrar o que o painel vai responder sozinho): cupom GNDI
  ~16%, CELL GUI ~66%.
- **NB** = interesse em New Born (confirmado). Em outubro, nenhum marcado.
- **Qualidade do dado:** 1 telefone inválido, 2 telefones repetidos, formatos misturados
  ("41 9112-2423", "41996275033") — a importação normaliza e aponta o que não deu.

### "VENDAS 2026" — o registro da venda, pelo DIA DA VENDA

Data da venda, mãe/bebê, pacote, valor, maternidade, mês da DPP, total da semana e do mês por
vendedor e por maternidade, e às vezes o **id do evento do Google** (o mesmo
`google_calendar_event_id` dos casos). Isto o sistema JÁ tem: `vendas_do_caso` + o modo
**Vendas** do relatório externo, que conta pelo dia em que a venda foi lançada.

### "PARTOS 2026" — o financeiro de cada parto, um bloco por vendedor

- **A divisão do trabalho comercial está nos títulos dos blocos:** Guizão = Brígida, HNSG,
  Unimed, Curitiba, Mackenzie, Rocio, Luiza Marillac; Rafinha = Santa Cruz; **Vavá = BIRTH,
  Reels, Foto/Livro e New Born** (a venda depois do parto). É a regra de distribuição que o
  robô vai precisar.
- Por parto: valor bruto, valor do New Born, forma de pagamento (link 6x/10x, Pix, crédito,
  dinheiro, **sorteio** — o prêmio do cupom —, "free médico", "já faturado"), data e NSU do
  pagamento, Uber, taxa do banco, taxa da maternidade (Curitiba R$ 110, Graças R$ 62,70),
  alimentação, custo do álbum (R$ 427), NF (~2,67% do valor), total de débitos e **líquido**.
- Uber e alimentação o sistema já tem (`despesas`). O resto — taxas, NF, líquido — é a margem
  por venda e esbarra no "não recriar status financeiro" do CLAUDE.md: **fase F**, com OK do
  gestor e a mudança registrada no CLAUDE.md.

---

## 3. Banco

### Tabelas novas

**`leads`** — uma linha por mãe em negociação.

| Coluna | Tipo | Nota |
|---|---|---|
| `mae_nome`, `bebe_nome` | text | bebê opcional |
| `telefone` | text | normalizado `+55DDDNÚMERO`; único entre leads ABERTOS (índice parcial) — é a chave que a caixa do WhatsApp vai usar |
| `dpp` | date | editável; o prazo anda junto |
| `maternidade_id` | fk | |
| `origem` | enum `origem_lead` | cupom · trazido pelo vendedor ("CELL") · anúncio · Instagram · indicação · monte seu pacote · outro |
| `origem_detalhe` | text | ex.: "Sorteio GNDI nov/26"; depois, o id do anúncio |
| `situacao` | enum `situacao_lead` | novo · em_contato · negociando · ganho · perdido |
| `motivo_perda` | enum | não quis · já nasceu · sem WhatsApp · sem resposta · outro (+ texto) |
| `vendedor_id` | fk pessoas | quem tem a venda (o "Responsável/Venda") |
| `proximo_retorno_em` | timestamptz | data PLANEJADA (a 3.4 permite) |
| `caso_id` | fk casos | preenchido quando vira venda — inclusive "virou BIRTH" |
| `interesse_new_born` | bool | a coluna NB |
| `observacao` | text | |

**`contatos_do_lead`** — APPEND-ONLY, como `eventos`. Cada toque: quem, quando (`now()` do
servidor), canal, resultado (sem resposta · respondeu · pediu retorno · mandou proposta) e nota.
"1º retorno", "último contato", "2º retorno da Vavá" saem DAQUI, contados — nunca digitados.

**`vendedores_da_maternidade`** — cadastro: maternidade → pessoa (GNDI → Guizão, HSC → Rafinha…),
editável pela gestão. Lead novo nasce com o vendedor da maternidade; "CELL" nasce com quem
trouxe. É a mesma tabela que o robô vai ler para distribuir.

**Repescagem é marca na pessoa** (`pessoas.faz_repescagem`, como as marcas do sino do New Born),
não nome no código.

### Derivado, não guardado (view `leads_do_comercial`, `security_invoker`)

- `prazo_venda` = `dpp − 10 dias` (o 10 mora num lugar só).
- `prioridade` = normal (>10 dias) · acompanhar (6–10) · atenção (3–5) · urgente (0–2) ·
  repescagem (passou do prazo) — só em lead aberto. É a legenda da planilha virando conta.
- **`fase` = venda ou repescagem**, pela data: passou do prazo e não fechou, o lead aparece na
  fila de quem faz repescagem. **Nada é reescrito pelo relógio** (mesmo argumento do sino e da
  avaliação de 15 dias); o `vendedor_id` continua dizendo quem teve a venda, e quem trabalhou a
  repescagem fica nos contatos.
- `ultimo_contato_em`, `total_contatos`, `retorno_atrasado`.

### Histórico

Situação, vendedor, ganho e perda vão para **`eventos`**, que ganha a coluna `lead_id` (nullable,
com índice). A policy de leitura de `eventos` passa a esconder as linhas com `lead_id` de quem
não tem a tela Comercial. O payload leva ids e motivos, nunca telefone.

### RPCs (todas `security definer`, conferem `tem_tela('comercial')`, gravam evento)

| RPC | Faz |
|---|---|
| `criar_lead(...)` | cria com o vendedor da maternidade; telefone com lead aberto devolve o existente |
| `editar_lead(...)` | só dados (nome, DPP, maternidade, origem, NB, observação) |
| `registrar_contato_do_lead(lead, canal, resultado, nota, proximo_retorno)` | o gesto do dia a dia, em um toque |
| `agendar_retorno_do_lead(lead, quando)` | |
| `passar_lead(lead, pessoa, motivo)` | troca de vendedor com registro |
| `marcar_lead_perdido(lead, motivo, texto)` / `reabrir_lead(lead, motivo)` | |
| `fechar_lead(lead, ...)` | cria o CASO (lógica de `criar_caso`, vai ao Google), lança a venda e liga `caso_id` |
| `definir_vendedor_da_maternidade(...)` | cadastro, só gestão |

### Segurança e LGPD

Telefone + DPP + maternidade de gestante é dado sensível. RLS por `tem_tela('comercial')`;
GRANT só de SELECT para `authenticated` (escrita só por RPC); entradas no
`privilegios-esperados.txt` e na sonda do anon. Telefone e nota nunca em log nem em `eventos`.

---

## 4. Tela — `/quadro/comercial`

Para os comerciais e a gestão (tela `comercial`). O relatório externo continua em Relatórios.

```
┌ Comercial ───────────────────────────── [Buscar mãe ou telefone] [+ Novo lead] ┐
│ Para hoje 12 · Urgentes 4 · Repescagem 9 · Fechados no mês 23 (31%)            │
│ [Hoje] [Funil] [Todos] [Calendário] [Pós-venda]                                │
├───────────────────────────────────────────────┬───────────────────────────────┤
│ fila de trabalho (prioridade, DPP, último     │ FICHA DO LEAD                 │
│ contato, próximo passo, vendedor, ações)      │ dados · WhatsApp (wa.me)      │
│                                               │ registrar contato · retorno   │
│                                               │ passar · fechar · perdido     │
│                                               │ linha do tempo                │
└───────────────────────────────────────────────┴───────────────────────────────┘
```

- **Hoje** (abre aqui): só o que pede gesto agora, em cinco grupos — retorno atrasado, retorno
  para hoje, novos (ninguém falou), repescagem (o prazo passou e a Vavá ainda não chamou) e sem
  próximo passo (houve contato e nenhum retorno está marcado — o lead que a planilha deixava
  sumir). Lead com retorno marcado para depois sai da fila até o dia dele; dentro de cada grupo,
  o prazo mais apertado primeiro. Cada um vê o seu por padrão ("Meus": o vendedor vê os da fase de
  venda; quem faz repescagem, os que passaram do prazo), com a lente "Equipe".
- **Funil**: Novo · Em contato · Negociando · Repescagem · Ganho/Perdido do mês; arrastar só no
  mouse, como as seções do Quadro.
- **Todos**: a planilha como tabela, com `FiltrosDeBusca`: mês da DPP, origem, vendedor,
  prioridade, situação; exportar CSV.
- **Calendário**: o calendário atual, trazido para dentro (mesmos componentes). **[a confirmar]**
  se ele sai da barra lateral ou fica nos dois lugares — hoje o ADM também o usa.
- **Pós-venda**: o modo comercial que hoje mora no relatório externo (ofertas e retorno agendado)
  — é o trabalho da Vavá com BIRTH, Reels, Foto/Livro e New Born.
- **Ficha**: dados; botão **WhatsApp** que abre a conversa por `wa.me` no WhatsApp Web do
  computador (funciona JÁ, sem API); "Registrar contato" com chips e atalhos de retorno (amanhã, 2,
  3, 7 dias ou outro dia e hora — o resultado sugere um: sem resposta → amanhã); Passar; **Fechar venda** (abre o formulário do caso já preenchido, com a tabela de
  preços); Perdido; linha do tempo. Com a API do WhatsApp, a conversa entra nessa coluna.
- **Números**: só a faixa de 4 KPIs no topo por enquanto (painel enxuto). Conversão por origem
  e por vendedor na fase C.

O sino chama o dono do lead quando um retorno dele vence (derivado, como o resto).

---

## 5. Fases

| Fase | Entrega | Depende de |
|---|---|---|
| **A** | leads + contatos + prioridade/repescagem + vendedor por maternidade + Hoje + Todos + ficha + wa.me + importação | seção 6 |
| **B** | Funil + fechar venda → caso + Calendário e Pós-venda trazidos para dentro | A |
| **C** | números do comercial (conversão por origem, vendedor, repescagem) | A rodando um mês |
| **D** | caixa de entrada do WhatsApp, com o canal trocável | decisão Z-API × oficial |
| **E** | robô de IA no 1º atendimento + distribuição (lê `vendedores_da_maternidade`) | D |
| **F** | financeiro das vendas ("Partos 2026": taxas, NF, líquido) | OK do gestor + CLAUDE.md |
| **G** | **"Monte seu pacote"** — ver abaixo | A; tabela de preços completa |

### G — "Monte seu pacote" (pedido do gestor, 18/11)

O cliente monta o próprio pacote "como num totem do McDonald's": escolhe a maternidade, o pacote
e os adicionais (Reels, New Born, Foto/Livro), vê o preço (a `precos_dos_pacotes` que já existe)
e envia. Do outro lado nasce um **lead** já com o pacote escolhido, na fila do vendedor daquela
maternidade (e, mais à frente, o robô manda o link).

Anotações para quando chegar a vez:
- É a **primeira porta pública** do sistema: hoje o `anon` não tem nada. Ela entra por uma Edge
  Function própria (a regra da seção 4 do CLAUDE.md: confere o pedido ANTES de usar a chave, e
  GRANT do tamanho exato), com anti-robô (o Turnstile da Cloudflare cabe, o site já está lá),
  limite por telefone e caixa de consentimento LGPD.
- Lugar natural: a raiz `clickbaby.com.br/`, que está livre para a landing.
- Preço público é decisão comercial: a tabela hoje só é lida por quem vê a venda.

---

## 6. Respostas do gestor (18/11) e o que ainda falta

Respondido:
- **Vendedor por maternidade**: a lista do "Partos 2026" vale para os leads, e **Fátima, Graças e
  Materdei ficam com o Guizão**. Na prática: tudo com o Guizão, menos a Santa Cruz (Rafinha). A
  tela já tem o cadastro ("Quem atende o quê", só para quem tem a tela Equipe) — falta preencher.
- **Repescagem**: só a Vavá, a partir do prazo (DPP − 10).
- **"Sem WhatsApp"** é perda (como "já nasceu").
- **Importação**: os meses passados entram como HISTÓRICO, para o painel de números já nascer com
  comparação; os meses com DPP pela frente entram como leads vivos.
- **Calendário**: fica nos dois lugares (barra lateral e aba do Comercial), **mas criar caso
  passa a ser só do comercial** — isso muda `criar_caso` (hoje é `eh_adm()`) e o "+ Novo caso" do
  Calendário; entra na fase B, junto com "fechar venda → caso".

Falta:
1. **"CELL GUI / CELL RAFA"** — o usuário vai perguntar ao gestor. Enquanto isso, a origem
   `vendedor` ("Celular do vendedor" na tela) cobre os dois, com o detalhe no texto da origem.

---

## 7. O que já está feito

- **A1 — banco** (migration `20261118150001`): tabelas, view, RPCs, eventos com `lead_id`, 29
  testes pgTAP. Branch `feat/comercial-leads-banco`.
- **A2 — tela** (`src/features/comercial`, branch `feat/comercial-tela`): abas **Hoje** e **Todos
  os leads**, lentes **Meus · Equipe**, os quatro números, a ficha (gestos no alto, régua do
  prazo, histórico), novo/editar lead, registrar contato com retorno sugerido pelo resultado,
  passar, perdido, fechou, reabrir, e "Quem atende o quê" (vendedor por maternidade +
  repescagem). Funil, Calendário e Pós-venda dentro da tela são da fase B.
- **A3 — importação**: falta. Os CSVs ficam fora do repositório (têm nome e telefone).
