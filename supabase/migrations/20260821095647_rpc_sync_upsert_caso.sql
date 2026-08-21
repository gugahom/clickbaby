-- =============================================================================
-- sync_upsert_caso — fatia 1 do sync do Google Calendar (seção 7 do
-- CLAUDE.md). NÃO fala com o Google nem faz parsing: recebe dados já
-- parseados e já resolvidos para id, decide o que persistir. É o único
-- ponto do sync com privilégio de sistema — roda como a Edge Function
-- (service_role), nunca como usuário logado.
--
-- RASCUNHO PENDENTE — decisão tomada com o usuário: sem coluna nem enum
-- novo. Deriva de `pacote_id IS NULL OR maternidade_id IS NULL`, mesma
-- convenção já registrada no comentário de casos.pacote_id (migration
-- 20260820061127). maternidade_id solta o NOT NULL aqui, espelhando o que
-- já foi feito para pacote_id — sem isso, a metade do rascunho pendente
-- por maternidade ambígua seria impossível de representar.
--
-- A trigger gerar_caso_etapas_on_update JÁ cobre "rascunho resolvido"
-- (when old.pacote_id is null and new.pacote_id is not null) — nenhum
-- ajuste nela. sync_upsert_caso só precisa fazer um UPDATE de verdade na
-- coluna quando ela estava nula, pra disparar o gatilho que já existe.
--
-- SEGURANÇA — buraco identificado antes de implementar: por padrão
-- Postgres concede EXECUTE em função nova para PUBLIC. Sem revogar isso
-- explicitamente, qualquer authenticated (inclusive operador comum)
-- poderia criar/cancelar casos direto, pulando toda RPC normal e toda
-- regra de papel. EXECUTE fica só para service_role. Por isso mesmo a
-- função NÃO verifica auth.uid()/pessoa — não tem ator humano aqui
-- (eventos.pessoa_id sempre null), o próprio GRANT é o controle de acesso.
-- =============================================================================

alter table public.casos
  alter column maternidade_id drop not null;

comment on column public.casos.maternidade_id is
  'NULL enquanto o caso é um rascunho pendente (sync não conseguiu mapear a maternidade com certeza — seção 7 do CLAUDE.md), igual pacote_id. Rascunho pendente é derivado de pacote_id IS NULL OR maternidade_id IS NULL — não existe coluna/flag própria.';

create or replace function public.sync_upsert_caso(
  p_google_event_id text,
  p_mae_nome text,
  p_bebe_nome text,
  p_pacote_id uuid,
  p_maternidade_id uuid,
  p_previsao_em timestamptz,
  p_cor_calendar text,
  p_cancelado boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caso_id            uuid;
  v_status_operacional public.status_operacional;
  v_mae_atual          text;
  v_bebe_atual         text;
  v_pacote_atual       uuid;
  v_maternidade_atual  uuid;
  v_previsao_atual     timestamptz;
  v_cor_atual          text;
  v_pacote_novo        uuid;
  v_maternidade_novo   uuid;
  v_algo_mudou         boolean;
begin
  select c.id, c.status_operacional, c.mae_nome, c.bebe_nome,
         c.pacote_id, c.maternidade_id, c.previsao_em, c.cor_calendar
    into v_caso_id, v_status_operacional, v_mae_atual, v_bebe_atual,
         v_pacote_atual, v_maternidade_atual, v_previsao_atual, v_cor_atual
  from public.casos c
  where c.google_calendar_event_id = p_google_event_id
  for update;

  -- ---------------------------------------------------------------------
  -- 1. Cancelamento tem prioridade sobre qualquer outra decisão.
  -- ---------------------------------------------------------------------
  if p_cancelado then
    if not found then
      -- Não existe caso pra esse evento: não faz sentido criar um só
      -- pra cancelar em seguida.
      return;
    end if;

    if v_status_operacional in ('encerrado', 'cancelado') then
      -- Já terminal: card cinza chegando atrasado ou duplicado, no-op.
      return;
    end if;

    update public.casos
       set status_operacional  = 'cancelado',
           motivo_cancelamento = 'Cancelado via Google Calendar (card cinza)'
     where id = v_caso_id;

    insert into public.eventos (caso_id, pessoa_id, tipo, payload, ocorrido_em)
    values (
      v_caso_id,
      null,
      'caso_cancelado_via_sync',
      jsonb_build_object('caso_id', v_caso_id, 'google_event_id', p_google_event_id),
      now()
    );

    return;
  end if;

  -- ---------------------------------------------------------------------
  -- 2a. Caso novo — INSERT. A trigger AFTER INSERT já gera as etapas
  -- sozinha se p_pacote_id vier preenchido; se vier null, o caso nasce
  -- como rascunho pendente e a trigger não faz nada (comportamento já
  -- coberto por gerar_caso_etapas).
  -- ---------------------------------------------------------------------
  if not found then
    insert into public.casos (
      mae_nome, bebe_nome, pacote_id, maternidade_id,
      previsao_em, cor_calendar, google_calendar_event_id
    )
    values (
      p_mae_nome, p_bebe_nome, p_pacote_id, p_maternidade_id,
      p_previsao_em, p_cor_calendar, p_google_event_id
    )
    returning id into v_caso_id;

    insert into public.eventos (caso_id, pessoa_id, tipo, payload, ocorrido_em)
    values (
      v_caso_id,
      null,
      case
        when p_pacote_id is null or p_maternidade_id is null
          then 'rascunho_pendente_criado'
        else 'caso_criado_via_sync'
      end,
      jsonb_build_object(
        'caso_id', v_caso_id,
        'google_event_id', p_google_event_id,
        'rascunho_pendente', (p_pacote_id is null or p_maternidade_id is null)
      ),
      now()
    );

    return;
  end if;

  -- ---------------------------------------------------------------------
  -- 2b. Caso já existe — UPDATE só dos campos de dado. pacote_id e
  -- maternidade_id só mudam se estavam NULL (rascunho sendo resolvido);
  -- nunca sobrescrevem um valor já resolvido, mesmo que o calendar mande
  -- outra coisa depois. status_operacional NUNCA é tocado aqui — o
  -- calendar não manda no estado operacional de um caso que já pode estar
  -- em andamento no sistema.
  -- ---------------------------------------------------------------------
  v_pacote_novo      := coalesce(v_pacote_atual, p_pacote_id);
  v_maternidade_novo := coalesce(v_maternidade_atual, p_maternidade_id);

  v_algo_mudou :=
    v_mae_atual is distinct from p_mae_nome
    or v_bebe_atual is distinct from p_bebe_nome
    or v_previsao_atual is distinct from p_previsao_em
    or v_cor_atual is distinct from p_cor_calendar
    or v_pacote_atual is distinct from v_pacote_novo
    or v_maternidade_atual is distinct from v_maternidade_novo;

  if not v_algo_mudou then
    -- Idempotente: mesmo evento re-processado sem nada de novo. Nenhum
    -- UPDATE, nenhum evento — não polui o log de auditoria com ruído.
    return;
  end if;

  update public.casos
     set mae_nome     = p_mae_nome,
         bebe_nome    = p_bebe_nome,
         previsao_em  = p_previsao_em,
         cor_calendar = p_cor_calendar,
         pacote_id    = v_pacote_novo,
         maternidade_id = v_maternidade_novo
   where id = v_caso_id;
  -- Se pacote_id foi de NULL pra preenchido agora, gerar_caso_etapas_on_update
  -- dispara sozinha e gera as caso_etapas — nenhuma chamada explícita aqui.

  insert into public.eventos (caso_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    v_caso_id,
    null,
    'caso_atualizado_via_sync',
    jsonb_build_object(
      'caso_id', v_caso_id,
      'google_event_id', p_google_event_id,
      'rascunho_resolvido',
        (v_pacote_atual is null and v_pacote_novo is not null)
        or (v_maternidade_atual is null and v_maternidade_novo is not null)
    ),
    now()
  );
end;
$$;

comment on function public.sync_upsert_caso(text, text, text, uuid, uuid, timestamptz, text, boolean) is
  'Upsert de caso por google_calendar_event_id, chamado pela Edge Function do sync (service_role) — nunca por usuário logado. Cancelamento tem prioridade; caso novo nasce rascunho pendente se pacote_id ou maternidade_id vierem null; update de caso existente nunca sobrescreve pacote_id/maternidade_id já resolvidos nem toca status_operacional. Idempotente: sem mudança real, sem UPDATE e sem evento.';

revoke all on function public.sync_upsert_caso(text, text, text, uuid, uuid, timestamptz, text, boolean) from public;
grant execute on function public.sync_upsert_caso(text, text, text, uuid, uuid, timestamptz, text, boolean) to service_role;

-- service_role não tem privilégio nenhum por padrão nas tabelas criadas
-- depois do bootstrap inicial (mesma razão do auto_expose_new_tables
-- desligado — migration 20260820090536). A Edge Function do sync precisa
-- ler pacotes/maternidades diretamente para resolver pacote_bruto/
-- maternidade_sigla (saída do parser) em uuid ANTES de chamar
-- sync_upsert_caso — essa resolução acontece fora desta função, então
-- SECURITY DEFINER não cobre. Só leitura: o sync nunca escreve cadastro.
grant select on public.pacotes to service_role;
grant select on public.maternidades to service_role;
