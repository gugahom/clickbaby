-- =============================================================================
-- Revisão do sync do Calendar — três problemas reais reportados pelo gestor.
--
-- 1. CRON A CADA MINUTO, não dois. "Card fica dias pra trás" tem uma causa
--    boba que o intervalo maior expõe mais: se o sync falhar uma vez (rede,
--    cota do Google, o que for), o próximo disparo só vem dois minutos
--    depois. Um minuto reduz a janela de qualquer falha isolada pela metade,
--    e o custo é desprezível — mesma RPC idempotente, mesma cota do Google
--    (~1440 chamadas/dia contra uma cota na casa do milhão).
--
-- 2. EVENTO DELETADO DO CALENDAR AGORA CANCELA O CASO. Até aqui só o card
--    CINZA cancelava (eventoIndicaCancelamento em logica.ts). Um evento
--    apagado direto — sem passar pelo cinza — simplesmente para de aparecer
--    na resposta da Calendar API, e o sync não tinha NENHUM sinal disso: o
--    caso ficava aberto no Quadro para sempre, órfão do evento que o
--    originou. `sync_cancelar_caso` é a RPC que faltava — documentada como
--    "ainda não implementada" desde a migration 20260821064027, e citada na
--    seção 12 do CLAUDE.md como se já existisse. A Edge Function (index.ts)
--    passa a comparar os ids de evento devolvidos pelo Google contra os
--    casos abertos cujo previsao_em cai dentro da janela consultada — se um
--    caso não aparece mais e deveria (a janela cobre a data dele), o evento
--    foi removido, não é o card só estar fora do alcance da consulta.
--
--    NÃO É A MESMA RPC de sync_upsert_caso porque o cancelamento por
--    deleção não tem mais o título do evento — não tem como decidir
--    pacote/maternidade porque não há o que decidir, só encerrar o que já
--    existe. Por isso é uma função enxuta, por google_event_id + motivo.
--
-- 3. (revisado em index.ts, não aqui) Evento de DIA INTEIRO — só `date`,
--    sem `dateTime` — deixa de virar caso. Um card sem hora definida ainda
--    não tem informação suficiente pro Quadro (que ordena e destaca por
--    horário); a equipe está decidindo a hora, não errou o cadastro. Nasce
--    caso só quando `dateTime` aparece. Ver resolverPrevisaoEm e
--    eventoTemApenasData em logica.ts, e a nota grande em index.ts.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- sync_cancelar_caso — cancela por evento sumido do Calendar.
-- -----------------------------------------------------------------------------

create or replace function public.sync_cancelar_caso(
  p_google_event_id text,
  p_motivo          text default 'Evento removido do Google Calendar (sem correspondência na sincronização)'
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caso_id uuid;
  v_status  public.status_operacional;
begin
  select c.id, c.status_operacional into v_caso_id, v_status
  from public.casos c
  where c.google_calendar_event_id = p_google_event_id
  for update;

  if not found then
    -- Nenhum caso para esse event_id: nada a cancelar. Não é erro — o sync
    -- só chama isto para ids que ele mesmo já sabe que existiam.
    return 'sem_efeito';
  end if;

  if v_status in ('encerrado', 'cancelado') then
    -- Já terminal: o caso seguiu seu curso normal (foi entregue, por
    -- exemplo) antes ou depois do evento sumir do Calendar. Não desfaz um
    -- encerramento — a invariante 3.5 do CLAUDE.md não tem caminho de volta
    -- por aqui.
    return 'sem_efeito';
  end if;

  update public.casos
     set status_operacional  = 'cancelado',
         motivo_cancelamento = p_motivo
   where id = v_caso_id;

  insert into public.eventos (caso_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    v_caso_id,
    null,
    'caso_cancelado_via_sync',
    jsonb_build_object(
      'caso_id', v_caso_id,
      'google_event_id', p_google_event_id,
      'motivo', p_motivo
    ),
    now()
  );

  return 'caso_cancelado';
end;
$$;

comment on function public.sync_cancelar_caso(text, text) is
  'Cancela um caso cujo evento sumiu do Google Calendar sem passar pelo card cinza (deleção direta). Diferente de sync_upsert_caso: não recebe título nem dados do evento (o evento não existe mais para ler) — só o event_id que já se sabe pertencer a um caso aberto, e o motivo. Sem efeito se o caso já não existir ou já estiver terminal. Chamada pela Edge Function do sync (service_role) depois de comparar os ids devolvidos pelo Google contra os casos abertos da janela consultada.';

revoke all on function public.sync_cancelar_caso(text, text) from public;
grant execute on function public.sync_cancelar_caso(text, text) to service_role;


-- -----------------------------------------------------------------------------
-- Cron: 2 minutos -> 1 minuto.
-- -----------------------------------------------------------------------------

do $$
begin
  perform cron.unschedule('sync-calendar');
exception
  when others then null;
end;
$$;

select cron.schedule(
  'sync-calendar',
  '* * * * *',
  $$select public.disparar_sync_calendar()$$
);
