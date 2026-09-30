-- =============================================================================
-- A AGENDA INTEIRA, E A HORA A DEFINIR (30/09/2026, pedido do usuário: "a
-- agenda não está pegando todos os casos futuros do calendar, preciso que venha
-- TUDO")
-- =============================================================================
--
-- Medido no remoto no dia, no resumo do próprio sync: dos 153 eventos lidos, 65
-- eram de DIA INTEIRO — o parto marcado com a data e sem a hora — e nenhum
-- virava caso. Havia 8 casos futuros no banco, o mais distante em 12/10. Dois
-- filtros, ambos decisões antigas e certas quando foram tomadas:
--
--   1. "SEM HORA NÃO VIRA CASO" (30/08, do gestor): o Quadro ordena e alerta
--      por horário, e mostrar meia-noite como hora de verdade inventaria um
--      dado. O argumento continua valendo — o que muda é que o dado passa a
--      ser dito em voz alta em vez de descartado: `previsao_sem_hora`.
--   2. A JANELA DE LEITURA ia só a seis semanas para frente (Edge Function, sem
--      migration). Passa a doze meses.
--
-- A HORA A DEFINIR É UMA MARCA, NÃO UM VALOR. `previsao_em` guarda a
-- meia-noite de Brasília daquele dia — é o que faz o `dia` do Quadro, o filtro
-- do calendário e a checagem de deleção do sync funcionarem sem mudar nada — e
-- `previsao_sem_hora` diz que aquela meia-noite não é hora nenhuma. Quem mostra
-- hora (o card, o alerta de horário, o sino, o calendário) lê a marca.
--
-- A MARCA VEM DO GOOGLE em chamada à parte (`sync_definir_previsao_sem_hora`),
-- pela mesma razão do Click Home: parâmetro novo em `sync_upsert_caso` criaria
-- uma segunda assinatura e deixaria a chamada ambígua para a versão anterior da
-- Edge Function, que roda a cada 25 segundos.
--
-- E VAI PARA O GOOGLE: `criar_caso` e `editar_caso` aceitam "hora a definir"
-- (`p_sem_hora`), e o sync escreve o evento como de dia inteiro. As duas mudam
-- de assinatura (DROP + CREATE, com o REVOKE de PUBLIC repetido), e as duas
-- funções de leitura do sync ganham a coluna.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. A marca
-- -----------------------------------------------------------------------------

alter table public.casos
  add column previsao_sem_hora boolean not null default false;

comment on column public.casos.previsao_sem_hora is
  'O parto tem DIA e ainda não tem HORA (evento de dia inteiro no Google, ou "hora a definir" no calendário do sistema). previsao_em guarda a meia-noite de Brasília daquele dia, e nada deve lê-la como horário: sem alerta de horário, sem hora no card.';

-- A meia-noite de Brasília do dia de um instante — o valor que previsao_em
-- guarda quando a hora não existe. Com hora, devolve o instante como veio.
create function public.previsao_do_dia(p_previsao timestamptz, p_sem_hora boolean)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select case
    when p_sem_hora and p_previsao is not null
      then ((p_previsao at time zone 'America/Sao_Paulo')::date)::timestamp at time zone 'America/Sao_Paulo'
    else p_previsao
  end;
$$;

revoke all on function public.previsao_do_dia(timestamptz, boolean) from public;


-- -----------------------------------------------------------------------------
-- 2. A view do Quadro leva a marca (no fim: `create or replace view` só aceita
--    coluna nova depois das que existem)
-- -----------------------------------------------------------------------------

create or replace view public.quadro_casos
with (security_invoker = true) as
  select
    c.id,
    c.mae_nome,
    c.bebe_nome,
    c.previsao_em,
    (c.previsao_em at time zone 'America/Sao_Paulo')::date as dia,
    c.cor_calendar,
    c.observacao,
    c.situacao_clinica,
    c.status_operacional,
    c.status_entrega,
    c.termo_status,
    c.pacote_id,
    p.nome as pacote_nome,
    p.slug as pacote_slug,
    extract(epoch from p.prazo_entrega) / 3600::numeric as prazo_entrega_horas,
    c.maternidade_id,
    m.nome as maternidade_nome,
    m.sigla as maternidade_sigla,
    n.concluido_em as nascimento_concluido_em,
    case
      when p.prazo_dias_uteis is not null
        then public.somar_dias_uteis(coalesce(c.reaberto_em, n.concluido_em), p.prazo_dias_uteis)
      else coalesce(c.reaberto_em, n.concluido_em) + p.prazo_entrega
    end
      + c.uti_acumulada
      + case when c.uti_desde is not null then now() - c.uti_desde
             else '00:00:00'::interval end
      as vence_em,
    c.uti_desde,
    c.uti_desde is not null as na_uti,
    c.uti_desde is not null as sla_pausado,
    extract(epoch from c.uti_acumulada +
      case when c.uti_desde is not null then now() - c.uti_desde
           else '00:00:00'::interval end) / 3600::numeric as uti_horas_total,
    c.pacote_id is null as falta_pacote,
    c.maternidade_id is null as falta_maternidade,
    c.pacote_id is null or c.maternidade_id is null as eh_rascunho,
    c.status_operacional = any (array['encerrado'::status_operacional, 'cancelado'::status_operacional]) as eh_terminal,
    etapas.total::integer as etapas_total,
    etapas.concluidas::integer as etapas_concluidas,
    c.created_at,
    c.updated_at,
    p.prazo_dias_uteis,
    extract(epoch from (
      case
        when p.prazo_dias_uteis is not null
          then public.somar_dias_uteis(coalesce(c.reaberto_em, n.concluido_em), p.prazo_dias_uteis)
        else coalesce(c.reaberto_em, n.concluido_em) + p.prazo_entrega
      end - coalesce(c.reaberto_em, n.concluido_em)
    )) / 3600::numeric as prazo_total_horas,
    c.reaberto_em,
    c.liberado_para_entrega_em,
    lib.nome as liberado_para_entrega_por_nome,
    coalesce(gasto.total, 0) as total_despesas,
    c.motivo_cancelamento,
    -- ARQUIVADO: terminal, e nada que o Quadro mostre depende dele. Ver o
    -- cabeçalho desta migration.
    (
      c.status_operacional = any (array['encerrado'::status_operacional, 'cancelado'::status_operacional])
      -- 1. Encerrado com vídeo ou fotolivro aberto continua na seção.
      and not (
        c.status_operacional = 'encerrado'
        and c.id in (
          select s.caso_id
            from public.caso_etapas s
           where s.tipo in ('edicao_video', 'album', 'click_home')
             and s.status not in ('concluida', 'dispensada')
        )
      )
      -- 2. Dia que ainda tem caso em aberto: este caso entra na conta dele.
      --    `coalesce` porque `x in (...)` com x nulo dá nulo, e o nulo tem a
      --    própria regra logo abaixo.
      and not coalesce(
        (c.previsao_em at time zone 'America/Sao_Paulo')::date in (
          select (o.previsao_em at time zone 'America/Sao_Paulo')::date
            from public.casos o
           where o.status_operacional <> all (array['encerrado'::status_operacional, 'cancelado'::status_operacional])
             and o.previsao_em is not null
        ),
        false
      )
      -- 2b. O mesmo para o bloco "Sem data prevista".
      and not (
        c.previsao_em is null
        and exists (
          select 1
            from public.casos o
           where o.previsao_em is null
             and o.status_operacional <> all (array['encerrado'::status_operacional, 'cancelado'::status_operacional])
        )
      )
    ) as arquivado,
    -- NO FIM, e não ao lado das outras colunas de caso: `create or replace
    -- view` recusa qualquer mudança na lista que já existe — acrescentar no
    -- meio RENOMEIA a coluna seguinte, e o Postgres para com
    -- "cannot change name of view column".
    c.encerrado_em,
    c.avaliacao_em,
    c.previsao_sem_hora
  from public.casos c
    left join public.pacotes p on p.id = c.pacote_id
    left join public.maternidades m on m.id = c.maternidade_id
    left join public.pessoas lib on lib.id = c.liberado_para_entrega_por
    left join public.caso_etapas n on n.caso_id = c.id and n.tipo = 'nascimento'
    left join lateral (
      select count(*) as total,
             count(*) filter (where ce.status = 'concluida') as concluidas
      from public.caso_etapas ce
      where ce.caso_id = c.id
    ) etapas on true
    left join lateral (
      select sum(d.valor) as total
      from public.despesas d
      where d.caso_id = c.id
    ) gasto on true;


-- -----------------------------------------------------------------------------
-- 3. O sync diz se o evento tem hora
-- -----------------------------------------------------------------------------

create function public.sync_definir_previsao_sem_hora(p_google_event_id text, p_sem_hora boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caso_id       uuid;
  v_atual         boolean;
  v_desatualizado boolean;
  v_escrito_em    timestamptz;
begin
  select c.id, c.previsao_sem_hora, c.google_desatualizado, c.google_escrito_em
    into v_caso_id, v_atual, v_desatualizado, v_escrito_em
  from public.casos c
  where c.google_calendar_event_id = p_google_event_id
  for update;

  if not found then
    return 'sem_efeito';
  end if;

  -- A mesma trava de sync_upsert_caso: o sistema está escrevendo este evento.
  if v_desatualizado or v_escrito_em > now() - interval '1 minute' then
    return 'sem_efeito';
  end if;

  if v_atual = coalesce(p_sem_hora, false) then
    return 'sem_efeito';
  end if;

  -- Sem linha em `eventos`: a mudança de previsão que vem junto já é gravada
  -- por sync_upsert_caso (caso_atualizado_via_sync). Esta é só a leitura dela.
  update public.casos set previsao_sem_hora = coalesce(p_sem_hora, false) where id = v_caso_id;
  return 'atualizado';
end;
$$;

comment on function public.sync_definir_previsao_sem_hora(text, boolean) is
  'Marca (ou desmarca) a hora a definir de um caso pelo evento do Google: dia inteiro = sem hora. Respeita a quarentena de quando o sistema está atualizando o evento. Só service_role.';

revoke all on function public.sync_definir_previsao_sem_hora(text, boolean) from public, anon, authenticated;
grant execute on function public.sync_definir_previsao_sem_hora(text, boolean) to service_role;


-- -----------------------------------------------------------------------------
-- 4. A mudança de hora para "a definir" (e de volta) também vai ao Google
-- -----------------------------------------------------------------------------

create or replace function public.marcar_caso_para_o_google()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- O sync (sem usuário) escreve o que VEIO do Google; migration e backfill
  -- também não têm usuário. Só gesto de pessoa vai para a fila.
  if auth.uid() is null then
    return new;
  end if;

  -- CANCELAMENTO por uma pessoa.
  if new.status_operacional = 'cancelado' and old.status_operacional is distinct from 'cancelado' then
    if new.google_pendente then
      -- Ainda não foi ao Google: não vai mais (sync_casos_para_o_google já
      -- ignora cancelado; isto só deixa o estado dizer a verdade).
      new.google_pendente := false;
    elsif new.google_calendar_event_id is not null
      and new.pacote_id is not null
      and new.maternidade_id is not null then
      new.google_desatualizado := true;
      new.google_versao := old.google_versao + 1;
    end if;
    return new;
  end if;

  if new.status_operacional = 'cancelado' then
    return new;
  end if;

  -- PACOTE OU MATERNIDADE NOVOS TRAZEM A COR DA REGRA (a do cadastro, a mesma
  -- de criar_caso): um caso que sai da HSC para o GNDI deixa de ser mirtilo.
  if (new.pacote_id is distinct from old.pacote_id or new.maternidade_id is distinct from old.maternidade_id)
     and new.pacote_id is not null and new.maternidade_id is not null then
    select coalesce(p.cor_calendar, m.cor_calendar) into new.cor_calendar
    from public.pacotes p, public.maternidades m
    where p.id = new.pacote_id and m.id = new.maternidade_id;
  end if;

  if new.google_calendar_event_id is not null and (
       new.mae_nome is distinct from old.mae_nome
    or new.bebe_nome is distinct from old.bebe_nome
    or new.pacote_id is distinct from old.pacote_id
    or new.maternidade_id is distinct from old.maternidade_id
    or new.previsao_em is distinct from old.previsao_em
    or new.previsao_sem_hora is distinct from old.previsao_sem_hora
    or new.click_home is distinct from old.click_home
    or new.cor_calendar is distinct from old.cor_calendar
  ) then
    new.google_desatualizado := true;
    new.google_versao := old.google_versao + 1;
  end if;

  return new;
end;
$$;



-- -----------------------------------------------------------------------------
-- 5. criar_caso e editar_caso aceitam hora a definir
-- -----------------------------------------------------------------------------

drop function public.criar_caso(text, text, uuid, uuid, timestamptz, boolean);

create function public.criar_caso(
  p_mae_nome       text,
  p_bebe_nome      text,
  p_pacote_id      uuid,
  p_maternidade_id uuid,
  p_previsao_em    timestamptz,
  p_click_home     boolean default false,
  p_sem_hora       boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pessoa_id uuid;
  v_cor       text;
  v_caso_id   uuid;
  v_mae       text := upper(btrim(coalesce(p_mae_nome, '')));
  v_bebe      text := nullif(upper(btrim(coalesce(p_bebe_nome, ''))), '');
  v_previsao  timestamptz := public.previsao_do_dia(p_previsao_em, coalesce(p_sem_hora, false));
begin
  select p.id into v_pessoa_id
  from public.pessoas p
  where p.auth_user_id = auth.uid() and p.ativo;

  if v_pessoa_id is null or not public.eh_adm() then
    raise exception 'Só a gestão, a coordenação, o comercial e o financeiro criam caso.';
  end if;

  if v_mae = '' then
    raise exception 'Informe o nome da mãe.';
  end if;

  -- A barra separa mãe de bebê no título do Google: um nome com barra quebraria
  -- a leitura do próprio evento que o sistema vai escrever.
  if strpos(v_mae, '/') > 0 or strpos(coalesce(v_bebe, ''), '/') > 0 then
    raise exception 'O nome não pode ter barra (/).';
  end if;

  if p_previsao_em is null then
    raise exception 'Informe o dia previsto.';
  end if;

  select coalesce(pc.cor_calendar, m.cor_calendar) into v_cor
  from public.pacotes pc, public.maternidades m
  where pc.id = p_pacote_id and pc.ativo
    and m.id = p_maternidade_id and m.ativo;

  if not found then
    raise exception 'Escolha um pacote e uma maternidade do cadastro.';
  end if;

  insert into public.casos (
    mae_nome, bebe_nome, pacote_id, maternidade_id, previsao_em, previsao_sem_hora,
    cor_calendar, click_home, criado_por, google_pendente
  )
  values (
    v_mae, v_bebe, p_pacote_id, p_maternidade_id, v_previsao, coalesce(p_sem_hora, false),
    v_cor, coalesce(p_click_home, false), v_pessoa_id, true
  )
  returning id into v_caso_id;

  insert into public.eventos (caso_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    v_caso_id, v_pessoa_id, 'caso_criado',
    jsonb_build_object(
      'caso_id', v_caso_id,
      'origem', 'calendario',
      'click_home', coalesce(p_click_home, false)
    ),
    now()
  );

  return v_caso_id;
end;
$$;


comment on function public.criar_caso(text, text, uuid, uuid, timestamptz, boolean, boolean) is
  'Cria um caso pelo calendário do sistema: pacote e maternidade do cadastro, previsão planejada (ou só o dia, com p_sem_hora), adicional New Born opcional. A cor vem da regra do cadastro, e o caso nasce PENDENTE de ir ao Google. Grava caso_criado. Só adm (eh_adm).';

revoke all on function public.criar_caso(text, text, uuid, uuid, timestamptz, boolean, boolean) from public, anon;
grant execute on function public.criar_caso(text, text, uuid, uuid, timestamptz, boolean, boolean) to authenticated;


drop function public.editar_caso(uuid, text, text, uuid, uuid, timestamptz, boolean);

create function public.editar_caso(
  p_caso_id        uuid,
  p_mae_nome       text,
  p_bebe_nome      text,
  p_pacote_id      uuid,
  p_maternidade_id uuid,
  p_previsao_em    timestamptz,
  p_click_home     boolean default false,
  p_sem_hora       boolean default false
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pessoa_id uuid;
  v_caso      public.casos%rowtype;
  v_mae       text := upper(btrim(coalesce(p_mae_nome, '')));
  v_bebe      text := nullif(upper(btrim(coalesce(p_bebe_nome, ''))), '');
  v_click     boolean;
  v_campos    text[] := '{}';
  v_sem_hora  boolean := coalesce(p_sem_hora, false);
  v_previsao  timestamptz := public.previsao_do_dia(p_previsao_em, coalesce(p_sem_hora, false));
begin
  select p.id into v_pessoa_id
  from public.pessoas p
  where p.auth_user_id = auth.uid() and p.ativo;

  if v_pessoa_id is null or not public.eh_adm() then
    raise exception 'Só a gestão, a coordenação, o comercial e o financeiro editam o caso.';
  end if;

  select * into v_caso from public.casos c where c.id = p_caso_id for update;
  if not found then
    raise exception 'Caso não encontrado.';
  end if;

  if v_caso.status_operacional = 'cancelado' then
    raise exception 'Caso cancelado não se edita.';
  end if;

  if v_mae = '' then
    raise exception 'Informe o nome da mãe.';
  end if;

  if strpos(v_mae, '/') > 0 or strpos(coalesce(v_bebe, ''), '/') > 0 then
    raise exception 'O nome não pode ter barra (/).';
  end if;

  if p_previsao_em is null then
    raise exception 'Informe o dia previsto.';
  end if;

  -- O cadastro ativo, ou o que o caso JÁ usa (um pacote aposentado não obriga
  -- a trocar o pacote para corrigir o nome da mãe).
  if not exists (
    select 1 from public.pacotes pc
    where pc.id = p_pacote_id and (pc.ativo or pc.id = v_caso.pacote_id)
  ) or not exists (
    select 1 from public.maternidades m
    where m.id = p_maternidade_id and (m.ativo or m.id = v_caso.maternidade_id)
  ) then
    raise exception 'Escolha um pacote e uma maternidade do cadastro.';
  end if;

  -- O sync grava "BEBÊ" quando o título não tem nome (o título precisa da
  -- barra). Deixar o campo vazio não é "apagar o nome": é o mesmo estado.
  if v_bebe is null and v_caso.bebe_nome = 'BEBÊ' then
    v_bebe := v_caso.bebe_nome;
  end if;

  v_click := v_caso.click_home or coalesce(p_click_home, false);

  if v_mae is distinct from v_caso.mae_nome then v_campos := array_append(v_campos, 'mae_nome'); end if;
  if v_bebe is distinct from v_caso.bebe_nome then v_campos := array_append(v_campos, 'bebe_nome'); end if;
  if p_pacote_id is distinct from v_caso.pacote_id then v_campos := array_append(v_campos, 'pacote_id'); end if;
  if p_maternidade_id is distinct from v_caso.maternidade_id then v_campos := array_append(v_campos, 'maternidade_id'); end if;
  if v_previsao is distinct from v_caso.previsao_em then v_campos := array_append(v_campos, 'previsao_em'); end if;
  if v_sem_hora is distinct from v_caso.previsao_sem_hora then v_campos := array_append(v_campos, 'previsao_sem_hora'); end if;
  if v_click is distinct from v_caso.click_home then v_campos := array_append(v_campos, 'click_home'); end if;

  if cardinality(v_campos) = 0 then
    return 'sem_efeito';
  end if;

  update public.casos
     set mae_nome       = v_mae,
         bebe_nome      = v_bebe,
         pacote_id      = p_pacote_id,
         maternidade_id = p_maternidade_id,
         previsao_em    = v_previsao,
         previsao_sem_hora = v_sem_hora,
         click_home     = v_click
   where id = p_caso_id;

  -- Os NOMES não entram no payload: `eventos` é legível por toda pessoa ativa
  -- e guarda o que mudou, não dado pessoal a mais. Quais campos, e o que era
  -- data e cadastro, basta para reconstruir o que aconteceu.
  insert into public.eventos (caso_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    p_caso_id, v_pessoa_id, 'caso_editado',
    jsonb_build_object(
      'caso_id', p_caso_id,
      'origem', 'calendario',
      'campos', to_jsonb(v_campos),
      'previsao_anterior', v_caso.previsao_em,
      'previsao_nova', v_previsao,
      'sem_hora', v_sem_hora,
      'pacote_anterior', v_caso.pacote_id,
      'pacote_novo', p_pacote_id,
      'maternidade_anterior', v_caso.maternidade_id,
      'maternidade_nova', p_maternidade_id
    ),
    now()
  );

  return 'editado';
end;
$$;


comment on function public.editar_caso(uuid, text, text, uuid, uuid, timestamptz, boolean, boolean) is
  'Edita um caso pelo calendário: nomes (em maiúsculas), pacote, maternidade, previsão (ou só o dia, com p_sem_hora) e New Born (só marca). Cancelado recusa. Grava caso_editado; o Google acompanha pela trigger marcar_caso_para_o_google. Só adm (eh_adm).';

revoke all on function public.editar_caso(uuid, text, text, uuid, uuid, timestamptz, boolean, boolean) from public, anon;
grant execute on function public.editar_caso(uuid, text, text, uuid, uuid, timestamptz, boolean, boolean) to authenticated;


-- -----------------------------------------------------------------------------
-- 6. O sync lê a marca para escrever o evento como de dia inteiro
-- -----------------------------------------------------------------------------

drop function public.sync_casos_para_o_google();

create function public.sync_casos_para_o_google()
returns table (
  caso_id           uuid,
  mae_nome          text,
  bebe_nome         text,
  pacote_nome       text,
  maternidade_sigla text,
  click_home        boolean,
  previsao_em       timestamptz,
  cor_calendar      text,
  previsao_sem_hora boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.mae_nome, c.bebe_nome, p.nome, m.sigla, c.click_home, c.previsao_em, c.cor_calendar, c.previsao_sem_hora
  from public.casos c
  join public.pacotes p on p.id = c.pacote_id
  join public.maternidades m on m.id = c.maternidade_id
  where c.google_pendente
    and c.status_operacional <> 'cancelado'
    and c.previsao_em is not null
  order by c.created_at, c.id
  limit 50;
$$;


revoke all on function public.sync_casos_para_o_google() from public, anon, authenticated;
grant execute on function public.sync_casos_para_o_google() to service_role;


drop function public.sync_casos_para_atualizar_no_google();

create function public.sync_casos_para_atualizar_no_google()
returns table (
  caso_id           uuid,
  google_event_id   text,
  versao            integer,
  cancelado         boolean,
  mae_nome          text,
  bebe_nome         text,
  pacote_nome       text,
  maternidade_sigla text,
  click_home        boolean,
  previsao_em       timestamptz,
  cor_calendar      text,
  previsao_sem_hora boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.google_calendar_event_id, c.google_versao,
         c.status_operacional = 'cancelado',
         c.mae_nome, c.bebe_nome, p.nome, m.sigla, c.click_home, c.previsao_em, c.cor_calendar, c.previsao_sem_hora
  from public.casos c
  left join public.pacotes p on p.id = c.pacote_id
  left join public.maternidades m on m.id = c.maternidade_id
  where c.google_desatualizado
  order by c.updated_at, c.id
  limit 50;
$$;


revoke all on function public.sync_casos_para_atualizar_no_google() from public, anon, authenticated;
grant execute on function public.sync_casos_para_atualizar_no_google() to service_role;
