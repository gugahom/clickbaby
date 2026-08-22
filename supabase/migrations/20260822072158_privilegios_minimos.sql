-- =============================================================================
-- PRIVILÉGIOS MÍNIMOS no schema public — anon zerado, authenticated apertado,
-- e os DEFAULT PRIVILEGES corrigidos para o próximo objeto não nascer aberto.
--
-- O PROBLEMA
-- O banco remoto tinha `GRANT ALL` para anon e authenticated em TODAS as
-- tabelas e funções de public. Origem: os default privileges padrão do
-- Supabase Cloud —
--
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
--     GRANT ALL ON TABLES / FUNCTIONS / SEQUENCES TO anon, authenticated, ...
--
-- — que fazem todo objeto criado por postgres nascer aberto. O banco local não
-- os tem (auto_expose_new_tables desligado), então os dois ambientes divergiam
-- e nenhum `db reset` + `test db` conseguia enxergar isso.
--
-- Consequência já materializada: a migration 20260821100857 fechou o EXECUTE
-- de sync_upsert_caso para anon, e a 20260821102004 — que precisou de
-- drop + create para mudar o tipo de retorno — reabriu em silêncio, porque o
-- objeto novo herdou o default. Ficou explorável em produção até a
-- 20260822041132. Enquanto o default estiver errado, isso se repete.
--
-- A intenção do projeto é: escrita passa SÓ pelas RPCs (seção 4 do CLAUDE.md),
-- leitura é governada pela RLS. anon não participa de nada. Hoje a RLS segura
-- sozinha; isto acrescenta a segunda camada.
--
-- ORDEM (importa)
--   1. default privileges — primeiro, para nada nascer aberto no meio daqui;
--   2. anon a zero;
--   3. authenticated zerado e reconcedido item a item;
--   4. padroes_tempo deixada negando, de propósito;
--   5. service_role intocado.
--
-- TRÊS COISAS CONTRA-INTUITIVAS, TODAS VERIFICADAS EM ENSAIO ANTES DE ESCREVER
--
-- (a) Funções nascem com EXECUTE para PUBLIC. Revogar de anon/authenticated
--     não fecha nada, porque os dois herdam de PUBLIC. Por isso o revoke de
--     funções abaixo inclui `public`. Sem isso o bloco 4 seria decorativo.
--
-- (b) As policies de RLS chamam eh_pessoa_ativa()/eh_adm()/eh_atendimento() e
--     são avaliadas com o privilégio de QUEM CONSULTA. Sem EXECUTE nesses três
--     helpers, toda leitura do app morre com "permission denied for function
--     eh_pessoa_ativa". Eles são reconcedidos logo abaixo — não é descuido.
--
-- (c) Funções de TRIGGER não exigem EXECUTE de quem dispara o trigger.
--     set_updated_at e gerar_caso_etapas ficam fechadas para anon e
--     authenticated e os triggers seguem funcionando.
--
-- VERIFICAÇÃO
-- pgTAP cobre o que o local consegue provar. O que só o remoto revela fica com
-- `npm run auditar:privilegios` (diff do dump contra
-- supabase/seguranca/privilegios-esperados.txt) e `npm run sondar:anon`
-- (caixa-preta com a anon key). Ver a seção de privilégios no CLAUDE.md.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. DEFAULT PRIVILEGES — a causa raiz
--
-- Só `FOR ROLE postgres`: é o único concedente de defaults em public no remoto,
-- e os 33 objetos do schema têm OWNER postgres.
--
-- service_role NÃO entra: é o papel do backend confiável (Edge Function do
-- sync) e continua herdando tudo.
--
-- A PARTIR DAQUI, toda tabela/view/RPC nova precisa de GRANT explícito na
-- própria migration que a cria. É o comportamento que o local já tinha; o
-- objetivo é os dois ambientes convergirem para o local voltar a ser espelho.
-- -----------------------------------------------------------------------------

alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke all on functions from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;


-- -----------------------------------------------------------------------------
-- 2. anon — zero em tudo
--
-- O app não precisa de anon para nada: o login é GoTrue (não passa pelo
-- PostgREST) e nenhuma query de dados roda antes da sessão existir.
--
-- USAGE no schema FICA. Revogar trocaria "permission denied for table casos",
-- que diz qual objeto, por um erro genérico de schema, sem ganho real depois
-- que os privilégios de objeto sumiram.
-- -----------------------------------------------------------------------------

revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;


-- -----------------------------------------------------------------------------
-- 3. authenticated — tabelas: zera e reconcede o mínimo
--
-- `revoke all` derruba junto os GRANTs por coluna de casos, que são
-- reconcedidos logo abaixo.
-- -----------------------------------------------------------------------------

revoke all on all tables    in schema public from authenticated;
revoke all on all sequences in schema public from authenticated;

-- 3a. casos — SELECT e UPDATE só das colunas de dado.
-- As três colunas da máquina de estado (status_operacional, status_entrega,
-- motivo_cancelamento) continuam FORA: nem adm as muda por UPDATE direto, só
-- pelas RPCs de transição. É a dívida fechada pela migration 20260821065740,
-- preservada aqui.
grant select on public.casos to authenticated;

grant update (
  mae_nome,
  bebe_nome,
  pacote_id,
  maternidade_id,
  previsao_em,
  cor_calendar,
  observacao,
  situacao_clinica,
  termo_status
) on public.casos to authenticated;

-- 3b. Leitura pura — escrita 100% pelas RPCs.
grant select on public.caso_etapas  to authenticated;
grant select on public.handoffs     to authenticated;
grant select on public.entregaveis  to authenticated;
grant select on public.quadro_casos to authenticated;

-- eventos: SELECT e nada mais. A invariante 3.3 (append-only) pede enforcement
-- "por RLS E por permissão de tabela" — o GRANT ALL do remoto tinha eliminado a
-- segunda metade. A policy eventos_select_adm ainda restringe a leitura a adm.
grant select on public.eventos to authenticated;

-- 3c. Cadastros — as policies *_escrita_adm são FOR ALL, então o GRANT precisa
-- cobrir os quatro verbos; é a RLS que limita a escrita a adm.
grant select, insert, update, delete on public.pessoas       to authenticated;
grant select, insert, update, delete on public.maternidades  to authenticated;
grant select, insert, update, delete on public.pacotes       to authenticated;
grant select, insert, update, delete on public.pacote_etapas to authenticated;
grant select, insert, update, delete on public.escalas       to authenticated;

-- 3d. padroes_tempo — deliberadamente SEM grant nenhum.
--
-- A tabela tem RLS habilitada e ZERO policies desde a 20260821005147, que não a
-- listou. Ninguém a lê: não há referência a ela em src/, supabase/functions/ ou
-- supabase/tests/ — só no types/database.ts, que é gerado. Abrir agora seria
-- conceder acesso a dado que nada consome.
--
-- Quando a régua de produtividade (seção 9 do CLAUDE.md) for construída, ela
-- ganha o mesmo tratamento dos outros cadastros: SELECT compartilhado +
-- escrita adm, mais o GRANT correspondente.
comment on table public.padroes_tempo is
  'A régua da produtividade. Os números vêm do cliente e são calibrados com 30 a 60 dias de dados reais — nunca chutados no código. Versionada por vigente_desde: uma nova régua é uma linha nova, jamais um UPDATE na anterior. SEM policies e SEM grants de propósito (migration 20260822072158): nada lê esta tabela ainda. Ao construir a fila/painel, conceder SELECT compartilhado + escrita adm, igual aos demais cadastros.';


-- -----------------------------------------------------------------------------
-- 4. Funções
--
-- PUBLIC entra no revoke porque é dele que anon e authenticated herdam EXECUTE
-- por padrão — ver nota (a) no topo. Sem `from public`, este bloco não fecharia
-- nada.
-- -----------------------------------------------------------------------------

revoke execute on all functions in schema public from public, anon, authenticated;

-- 4a. Helpers das policies. Sem estes três, TODA leitura do app quebra — as
-- policies os chamam e rodam com o privilégio de quem consulta (nota (b)).
grant execute on function public.eh_pessoa_ativa() to authenticated;
grant execute on function public.eh_adm()          to authenticated;
grant execute on function public.eh_atendimento()  to authenticated;

-- 4b. RPCs de transição. Podem ficar abertas para authenticated porque cada uma
-- resolve auth.uid() -> pessoas no corpo e levanta exceção se não achar; o
-- GRANT não é a barreira delas.
grant execute on function public.iniciar_etapa(uuid)                to authenticated;
grant execute on function public.concluir_etapa(uuid, text)         to authenticated;
grant execute on function public.transferir_etapa(uuid, uuid, text) to authenticated;
grant execute on function public.confirmar_entrega(uuid)            to authenticated;
grant execute on function public.cancelar_caso(uuid, text)          to authenticated;

-- 4c. NÃO reconcedidas, de propósito:
--   set_updated_at()    e gerar_caso_etapas() — funções de trigger, não
--                       precisam de EXECUTE de quem dispara (nota (c));
--   sync_upsert_caso()  — SECURITY DEFINER que NÃO valida o chamador, porque
--                       não pode (roda sem usuário logado). Só service_role.
--                       Ver migration 20260822041132.


-- -----------------------------------------------------------------------------
-- 5. service_role — intocado
--
-- Nenhum comando acima o alcança. A Edge Function do sync depende de:
--   - EXECUTE em sync_upsert_caso;
--   - SELECT em pacotes e maternidades (resolve sigla/nome -> id antes da RPC).
-- Isso é verificado pelo pgTAP que acompanha esta migration.
-- -----------------------------------------------------------------------------
