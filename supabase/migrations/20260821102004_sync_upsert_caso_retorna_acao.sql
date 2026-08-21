-- =============================================================================
-- sync_upsert_caso passa a RETORNAR qual ação tomou, em vez de void.
--
-- Motivo: a fatia 2 do sync (Edge Function, supabase/functions/sync-calendar)
-- precisa devolver um resumo (quantos criados/atualizados/cancelados/
-- rascunhos/sem efeito) depois de processar o lote de eventos. Sem algum
-- retorno da função, a única forma de saber "o que aconteceu" seria a Edge
-- Function reimplementar a mesma decisão (checando o estado do caso antes e
-- depois) ou ganhar SELECT direto em casos só pra isso — as duas quebram o
-- princípio "a RPC decide, a Edge Function só chama" e a segunda alargaria
-- privilégio de service_role sem necessidade real. Só surfaçar o resultado
-- que a função já decide internamente resolve sem duplicar lógica.
--
-- Postgres não permite CREATE OR REPLACE mudar o tipo de retorno de uma
-- função existente — precisa DROP antes. O corpo da função é idêntico ao da
-- migration 20260821095647; a única mudança é `returns void` -> `returns
-- text` e cada `return;` virar `return '<ação>';`.
--
-- Valores possíveis: caso_criado, rascunho_criado, caso_atualizado,
-- caso_cancelado, sem_efeito (cobre tanto o cancelamento que não achou caso
-- quanto o que já estava terminal, e o update que não mudou nada).
-- =============================================================================

drop function if exists public.sync_upsert_caso(text, text, text, uuid, uuid, timestamptz, text, boolean);

create function public.sync_upsert_caso(
  p_google_event_id text,
  p_mae_nome text,
  p_bebe_nome text,
  p_pacote_id uuid,
  p_maternidade_id uuid,
  p_previsao_em timestamptz,
  p_cor_calendar text,
  p_cancelado boolean
)
returns text
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
      return 'sem_efeito';
    end if;

    if v_status_operacional in ('encerrado', 'cancelado') then
      -- Já terminal: card cinza chegando atrasado ou duplicado, no-op.
      return 'sem_efeito';
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

    return 'caso_cancelado';
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

    if p_pacote_id is null or p_maternidade_id is null then
      return 'rascunho_criado';
    else
      return 'caso_criado';
    end if;
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
    return 'sem_efeito';
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

  return 'caso_atualizado';
end;
$$;

comment on function public.sync_upsert_caso(text, text, text, uuid, uuid, timestamptz, text, boolean) is
  'Upsert de caso por google_calendar_event_id, chamado pela Edge Function do sync (service_role) — nunca por usuário logado. Cancelamento tem prioridade; caso novo nasce rascunho pendente se pacote_id ou maternidade_id vierem null; update de caso existente nunca sobrescreve pacote_id/maternidade_id já resolvidos nem toca status_operacional. Idempotente: sem mudança real, sem UPDATE e sem evento. Retorna a ação tomada (caso_criado, rascunho_criado, caso_atualizado, caso_cancelado, sem_efeito) para a Edge Function montar o resumo do lote sem reimplementar a decisão.';

revoke all on function public.sync_upsert_caso(text, text, text, uuid, uuid, timestamptz, text, boolean) from public;
grant execute on function public.sync_upsert_caso(text, text, text, uuid, uuid, timestamptz, text, boolean) to service_role;
