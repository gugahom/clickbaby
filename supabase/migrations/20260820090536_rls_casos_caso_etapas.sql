-- =============================================================================
-- RLS por papel — etapa 1 (item 2 da seção 13 do CLAUDE.md): só casos e
-- caso_etapas. As demais tabelas ficam para a próxima etapa.
--
-- Mapeamento de papel usado nesta migration ('adm' não é valor do enum
-- papel_sistema — decisão tomada com o usuário nesta tarefa):
--   operador     -> papel_sistema = 'operador'                      (default)
--   adm          -> papel_sistema in ('comercial','coordenacao',
--                                      'financeiro','gestao')
--   atendimento  -> papel_sistema = 'atendimento'
--
-- Modelo de acesso pedido para estas duas tabelas:
--   - SELECT compartilhado entre qualquer pessoa autenticada e ativa, SEM
--     filtro de status. Autorização e visualização são coisas diferentes:
--     RLS decide QUEM pode ver a tabela, não QUAIS linhas aparecem numa tela
--     específica. "Só casos ativos no Quadro" é filtro da query da tela do
--     Quadro (que ainda não existe), nunca da policy — filtrar terminal
--     aqui quebraria a invariante 3.5 (um caso encerrado continua visível
--     enquanto o dia não fecha inteiro, ao lado dos casos ainda abertos).
--   - Nenhuma escrita direta operacional (iniciar/concluir/atribuir etapa,
--     handoff) — fica 100% para as RPCs SECURITY DEFINER da próxima tarefa.
--     Por isso caso_etapas não recebe NENHUMA policy de INSERT/UPDATE/DELETE
--     aqui: fica negado por padrão para todo mundo, inclusive adm.
--   - UPDATE de casos.* é liberado, por ora, só para adm (correção
--     administrativa) e atendimento (confirmar entrega / encerrar caso).
--
-- ATENÇÃO — interino: as duas UPDATE policies de casos abaixo liberam a
-- LINHA inteira para adm/atendimento, não só as colunas de entrega/status.
-- Não há como restringir por coluna numa policy de RLS sem reimplementar a
-- validação de transição aqui dentro — exatamente o que a seção 4 do
-- CLAUDE.md pede para NÃO fazer ("o frontend nunca faz UPDATE direto em
-- colunas de status, responsável ou timestamp"). Isto só existe porque as
-- RPCs confirmar_entrega/cancelar_caso ainda não existem (próximo item do
-- roadmap). Quando existirem, a expectativa é apertar ou remover estas duas
-- policies e deixar a escrita 100% por trás das RPCs, como o resto do
-- ciclo de vida do caso.
--
-- INSERT/DELETE em casos não entram nesta migration — ninguém tem hoje
-- (nem adm). O fallback de intake manual (seção 7 do CLAUDE.md) vai
-- precisar de policy própria quando essa tarefa chegar.
--
-- GRANTs explícitos: auto_expose_new_tables está desligado no config.toml
-- deste projeto ("novo padrão cloud: não expõe automaticamente"), então as
-- tabelas não têm privilégio nenhum para authenticated ainda. RLS sozinha
-- não basta — sem GRANT de tabela, o Postgres nega o acesso antes mesmo de
-- avaliar a policy.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Funções auxiliares de papel
--
-- SECURITY DEFINER: pessoas está com RLS habilitada e sem nenhuma policy
-- ainda (nega tudo), então sem isso a própria checagem de papel falharia.
-- Mesmo padrão de privilégio elevado da trigger de geração de etapas.
-- STABLE (não IMMUTABLE): o resultado depende de auth.uid() e do estado da
-- tabela pessoas dentro da transação/consulta atual, não é uma constante.
-- -----------------------------------------------------------------------------

create or replace function public.eh_pessoa_ativa()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.pessoas p
    where p.auth_user_id = auth.uid()
      and p.ativo
  );
$$;

comment on function public.eh_pessoa_ativa() is
  'Usuário autenticado tem uma pessoa vinculada (auth_user_id) e ativa, qualquer papel. Gate mínimo de leitura compartilhada do Quadro.';

create or replace function public.eh_adm()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.pessoas p
    where p.auth_user_id = auth.uid()
      and p.ativo
      and p.papel_sistema in ('comercial', 'coordenacao', 'financeiro', 'gestao')
  );
$$;

comment on function public.eh_adm() is
  '"adm" não é um valor do enum papel_sistema — é o conjunto dos papéis administrativos (comercial, coordenacao, financeiro, gestao), por decisão tomada na migration 20260820090536.';

create or replace function public.eh_atendimento()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.pessoas p
    where p.auth_user_id = auth.uid()
      and p.ativo
      and p.papel_sistema = 'atendimento'
  );
$$;

comment on function public.eh_atendimento() is
  'papel_sistema = atendimento (hoje, só a Morgana). Confirma entrega e encerra caso, junto com adm.';


-- -----------------------------------------------------------------------------
-- 2. GRANTs de tabela
-- -----------------------------------------------------------------------------

grant select, update on public.casos to authenticated;
grant select on public.caso_etapas to authenticated;


-- -----------------------------------------------------------------------------
-- 3. Policies — casos
-- -----------------------------------------------------------------------------

create policy casos_select_compartilhada
  on public.casos
  for select
  to authenticated
  using (public.eh_pessoa_ativa());

comment on policy casos_select_compartilhada on public.casos is
  'Leitura compartilhada: qualquer pessoa autenticada e ativa lê qualquer caso, terminal ou não. Filtro de "só ativos no Quadro" é responsabilidade da query da tela, não desta policy — ver aviso no topo da migration sobre a invariante 3.5.';

create policy casos_update_adm
  on public.casos
  for update
  to authenticated
  using (public.eh_adm())
  with check (public.eh_adm());

comment on policy casos_update_adm on public.casos is
  'Correção administrativa direta, só adm. INTERINO: linha inteira, sem RPC — ver aviso no topo da migration.';

create policy casos_update_atendimento_confirma_entrega
  on public.casos
  for update
  to authenticated
  using (public.eh_atendimento())
  with check (public.eh_atendimento());

comment on policy casos_update_atendimento_confirma_entrega on public.casos is
  'Confirmar entrega / encerrar caso, atendimento (além de adm, coberto pela policy casos_update_adm). INTERINO: linha inteira, sem RPC — ver aviso no topo da migration.';


-- -----------------------------------------------------------------------------
-- 4. Policies — caso_etapas
--
-- Só SELECT, sem filtro de status (mesmo raciocínio da policy de casos
-- acima). Nenhuma policy de INSERT/UPDATE/DELETE: escrita operacional
-- (iniciar/concluir/atribuir etapa, handoff) fica 100% negada até a RPC
-- existir — nem adm tem atalho aqui, diferente de casos.
-- -----------------------------------------------------------------------------

create policy caso_etapas_select_compartilhada
  on public.caso_etapas
  for select
  to authenticated
  using (public.eh_pessoa_ativa());

comment on policy caso_etapas_select_compartilhada on public.caso_etapas is
  'Leitura compartilhada, mesma regra de casos_select_compartilhada: sem filtro de status. Quem pode ver a tabela, não quais linhas aparecem numa tela específica.';
