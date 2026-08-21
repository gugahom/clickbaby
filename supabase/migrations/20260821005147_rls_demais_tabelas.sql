-- =============================================================================
-- RLS por papel — etapa 2 (item 2 da seção 13 do CLAUDE.md): as demais tabelas.
-- Mesmo padrão validado em casos/caso_etapas na etapa 1 (migration
-- 20260820090536), reutilizando public.eh_pessoa_ativa() e public.eh_adm().
--
-- Categorização das tabelas, conforme o modelo pedido:
--   - Cadastros (SELECT geral, escrita só adm):
--       pessoas, maternidades, pacotes, pacote_etapas, escalas
--   - Operacionais (SELECT geral, escrita 100% negada — RPC ainda não existe):
--       handoffs, entregaveis
--   - eventos (caso especial): SELECT só adm, escrita negada para todo mundo
--     (append-only via trigger/RPC SECURITY DEFINER — invariante 3.3).
--
-- escalas é cadastro, não operacional: a escala 12/36 é definida pela
-- gestão, dado administrativo, não uma transição de estado que precise de
-- RPC. Decisão confirmada explicitamente (categorização inicial deste
-- arquivo tinha tratado como operacional, por exclusão — corrigido).
--
-- SELECT em toda tabela é público entre autenticados ativos (sem filtro de
-- status) — mesma separação autorização/visualização estabelecida na etapa 1
-- para casos: RLS decide QUEM lê a tabela, não quais linhas aparecem em qual
-- tela.
--
-- Nenhuma tabela aqui ganha um caminho de escrita "interino" tipo o de
-- casos_update_adm/casos_update_atendimento_confirma_entrega — aquele existe
-- só porque confirmar_entrega/cancelar_caso têm um pedido explícito de teste
-- manual antes da RPC existir (ver dívida registrada na seção 13 do
-- CLAUDE.md). Cadastros aqui recebem escrita direta por adm porque é assim
-- que o modelo pedido define (não é interino: gestão de cadastro é
-- deliberadamente direta, nunca vai virar RPC).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. GRANTs de tabela
--
-- auto_expose_new_tables desligado (ver migration 20260820090536) — sem GRANT
-- explícito, authenticated não chega nem a ser avaliado pela RLS.
-- Só SELECT para as operacionais e eventos: escrita fica de fato inatingível
-- (nem GRANT existe), não só sem policy.
-- -----------------------------------------------------------------------------

grant select on public.handoffs to authenticated;
grant select on public.entregaveis to authenticated;
grant select on public.eventos to authenticated;

grant select, insert, update, delete on public.pessoas to authenticated;
grant select, insert, update, delete on public.maternidades to authenticated;
grant select, insert, update, delete on public.pacotes to authenticated;
grant select, insert, update, delete on public.pacote_etapas to authenticated;
grant select, insert, update, delete on public.escalas to authenticated;


-- -----------------------------------------------------------------------------
-- 2. Policies — operacionais: só SELECT, nenhuma escrita
-- -----------------------------------------------------------------------------

create policy handoffs_select_compartilhada
  on public.handoffs
  for select
  to authenticated
  using (public.eh_pessoa_ativa());

comment on policy handoffs_select_compartilhada on public.handoffs is
  'Leitura compartilhada. Escrita 100% via transferir_etapa() (RPC futura) — nenhuma policy de INSERT/UPDATE/DELETE aqui, nem para adm.';

create policy entregaveis_select_compartilhada
  on public.entregaveis
  for select
  to authenticated
  using (public.eh_pessoa_ativa());

comment on policy entregaveis_select_compartilhada on public.entregaveis is
  'Leitura compartilhada. Escrita 100% via registrar_entregavel()/confirmar_entrega() (RPC futura) — nenhuma policy de INSERT/UPDATE/DELETE aqui, nem para adm.';


-- -----------------------------------------------------------------------------
-- 3. Policies — cadastros: SELECT geral, escrita só adm
-- -----------------------------------------------------------------------------

create policy pessoas_select_compartilhada
  on public.pessoas
  for select
  to authenticated
  using (public.eh_pessoa_ativa());

create policy pessoas_escrita_adm
  on public.pessoas
  for all
  to authenticated
  using (public.eh_adm())
  with check (public.eh_adm());

comment on policy pessoas_escrita_adm on public.pessoas is
  'Gestão de cadastro de pessoas (contratação, desligamento, papel_sistema, pin_hash) é ação administrativa direta, não passa por RPC.';

create policy maternidades_select_compartilhada
  on public.maternidades
  for select
  to authenticated
  using (public.eh_pessoa_ativa());

create policy maternidades_escrita_adm
  on public.maternidades
  for all
  to authenticated
  using (public.eh_adm())
  with check (public.eh_adm());

create policy pacotes_select_compartilhada
  on public.pacotes
  for select
  to authenticated
  using (public.eh_pessoa_ativa());

create policy pacotes_escrita_adm
  on public.pacotes
  for all
  to authenticated
  using (public.eh_adm())
  with check (public.eh_adm());

create policy pacote_etapas_select_compartilhada
  on public.pacote_etapas
  for select
  to authenticated
  using (public.eh_pessoa_ativa());

create policy pacote_etapas_escrita_adm
  on public.pacote_etapas
  for all
  to authenticated
  using (public.eh_adm())
  with check (public.eh_adm());

create policy escalas_select_compartilhada
  on public.escalas
  for select
  to authenticated
  using (public.eh_pessoa_ativa());

create policy escalas_escrita_adm
  on public.escalas
  for all
  to authenticated
  using (public.eh_adm())
  with check (public.eh_adm());

comment on policy escalas_escrita_adm on public.escalas is
  'Definição de escala (12/36) é dado administrativo da gestão, não uma transição de estado — escrita direta por adm, sem RPC, mesmo padrão de pessoas/maternidades/pacotes.';


-- -----------------------------------------------------------------------------
-- 4. Policies — eventos: SELECT só adm, escrita de ninguém
--
-- Sem GRANT de insert/update/delete (bloco 1) e sem policy nenhuma dessas
-- operações: mesmo adm não escreve direto em eventos. A única via de escrita
-- é SECURITY DEFINER (a trigger gerar_caso_etapas hoje; RPCs de transição
-- depois) — invariante 3.3.
-- -----------------------------------------------------------------------------

create policy eventos_select_adm
  on public.eventos
  for select
  to authenticated
  using (public.eh_adm());

comment on policy eventos_select_adm on public.eventos is
  'Só adm lê eventos — é o log de auditoria por trás do painel, não uma tela operacional. Sem policy de escrita nenhuma: append-only, só via SECURITY DEFINER (trigger/RPC) — invariante 3.3 do CLAUDE.md.';
