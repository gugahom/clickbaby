-- =============================================================================
-- Trigger de geração automática de caso_etapas a partir de pacote_etapas.
-- Item 1 da seção 13 do CLAUDE.md.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. casos.pacote_id passa a aceitar NULL
--
-- Necessário para o cenário de rascunho pendente (seção 7 do CLAUDE.md): o
-- sync do Google Calendar cria o caso antes de saber o pacote com certeza, e
-- o pacote só é preenchido depois, por confirmação manual. É essa transição
-- NULL -> preenchido que a trigger abaixo observa para dar a partida na
-- geração de etapas.
--
-- O restante do fluxo com pacote_id NULL (visibilidade do rascunho fora do
-- Quadro operacional, RLS, RPC de confirmação) é escopo de tarefas futuras
-- (RLS e sync, itens 2 e 5 da seção 13) — aqui só destrava o schema.
-- -----------------------------------------------------------------------------

alter table public.casos
  alter column pacote_id drop not null;

comment on column public.casos.pacote_id is
  'NULL enquanto o caso é um rascunho pendente (sync não conseguiu mapear o pacote com certeza — seção 7 do CLAUDE.md). Preencher este campo dispara a geração automática de caso_etapas.';


-- -----------------------------------------------------------------------------
-- 2. Função da trigger
--
-- Cobre INSERT (pacote já vem preenchido) e UPDATE (rascunho confirmado
-- depois). Mesma função nos dois triggers: a guarda "só gera se o caso ainda
-- não tem nenhuma caso_etapa" fica em um único lugar, então não existe como o
-- INSERT e o UPDATE divergirem em comportamento.
--
-- SECURITY DEFINER: caso_etapas e eventos não recebem INSERT direto de
-- operador nenhum (só via RPC ou, aqui, via trigger de sistema — mesmo
-- desenho de privilégio elevado da seção 4 do CLAUDE.md). Sem isto, a RLS que
-- vier na próxima migration bloquearia a própria geração automática.
-- search_path fixo e vazio, com todo objeto referenciado por schema
-- qualificado (public.*), para não ficar exposta a search_path hijacking.
-- -----------------------------------------------------------------------------

create or replace function public.gerar_caso_etapas()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quantidade integer;
begin
  -- Rascunho pendente sem pacote ainda: nada a gerar, sem erro.
  if new.pacote_id is null then
    return new;
  end if;

  -- Nunca regenerar etapas de um caso que já tem alguma — cobre o caso de a
  -- trigger de UPDATE disparar mais de uma vez por engano e qualquer futuro
  -- update que volte a tocar pacote_id.
  if exists (
    select 1 from public.caso_etapas where caso_id = new.id
  ) then
    return new;
  end if;

  insert into public.caso_etapas (caso_id, tipo, status, ordem)
  select new.id, pe.etapa_tipo, 'pendente', pe.ordem
  from public.pacote_etapas pe
  where pe.pacote_id = new.pacote_id;

  get diagnostics v_quantidade = row_count;

  -- Pacote sem etapas cadastradas (seed ainda não chegou — ver seção 13 do
  -- CLAUDE.md): zero linhas geradas, sem erro e sem evento — não houve
  -- geração para registrar.
  if v_quantidade > 0 then
    insert into public.eventos (caso_id, pessoa_id, tipo, payload)
    values (
      new.id,
      null, -- geração automática, sem ator humano — eventos.pessoa_id é nullable por isso
      'etapas_geradas',
      jsonb_build_object(
        'pacote_id', new.pacote_id,
        'quantidade', v_quantidade
      )
    );
  end if;

  return new;
end;
$$;

comment on function public.gerar_caso_etapas() is
  'Gera caso_etapas a partir de pacote_etapas quando um caso ganha pacote_id (no INSERT ou na confirmação de um rascunho pendente). Nunca regenera etapas existentes. Registra evento append-only etapas_geradas quando gera pelo menos uma etapa — invariantes 3.3 e 3.4 do CLAUDE.md.';


-- -----------------------------------------------------------------------------
-- 3. Triggers
-- -----------------------------------------------------------------------------

create trigger gerar_caso_etapas_on_insert
  after insert on public.casos
  for each row
  execute function public.gerar_caso_etapas();

comment on trigger gerar_caso_etapas_on_insert on public.casos is
  'Gera as caso_etapas do pacote assim que o caso nasce com pacote_id preenchido. Caso nasça como rascunho pendente (pacote_id NULL), a função não faz nada.';

create trigger gerar_caso_etapas_on_update
  after update on public.casos
  for each row
  when (old.pacote_id is null and new.pacote_id is not null)
  execute function public.gerar_caso_etapas();

comment on trigger gerar_caso_etapas_on_update on public.casos is
  'Gera as caso_etapas quando um rascunho pendente é confirmado (pacote_id passa de NULL para preenchido). Não dispara em nenhuma outra alteração de pacote_id.';
