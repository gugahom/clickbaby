-- =============================================================================
-- EDITAR E CANCELAR PELO CALENDÁRIO, COM O GOOGLE ACOMPANHANDO (30/09/2026,
-- pedido do usuário: "mais funcionalidades nos casos da agenda, poder editar,
-- excluir")
-- =============================================================================
--
-- Até aqui o caminho de volta (20260930092734) só CRIAVA: depois de ligado, o
-- caso seguia o Google, e o sync relia o título e a hora a cada 25 segundos.
-- Uma hora mudada no sistema voltava sozinha no ciclo seguinte — e isso não é
-- hipótese: o "Editar caso" do Quadro, que muda o nome da mãe por UPDATE
-- direto, sempre teve o nome revertido pelo título do Google.
--
-- AGORA A MUDANÇA FEITA POR UMA PESSOA NO SISTEMA VAI PARA O GOOGLE, pelo
-- mesmo desenho da criação (outbox): quem muda só MARCA o caso
-- (`google_desatualizado`), e o sync, no começo do ciclo, atualiza o evento e
-- desliga a marca. O que falhar fica marcado e volta no ciclo seguinte.
--
-- A MARCA É UMA TRIGGER, e não uma linha dentro de cada RPC, porque são três
-- portas que mudam um caso ligado ao Google: `editar_caso` (a nova, do
-- calendário), o UPDATE direto do "Editar caso" do Quadro e `cancelar_caso`.
-- Uma regra por porta seria a terceira esquecida. A trigger distingue a PESSOA
-- do SYNC por `auth.uid()`: o sync roda com a chave de serviço, sem usuário, e
-- é ele que escreve o que VEIO do Google — marcá-lo mandaria de volta ao
-- Google o que acabou de chegar de lá.
--
-- ENQUANTO A MARCA EXISTE, O SYNC NÃO RELÊ AQUELE EVENTO (trava em
-- `sync_upsert_caso` e `sync_cancelar_caso`), e por mais UM MINUTO depois de o
-- Google receber (`google_escrito_em`). O minuto cobre o ciclo que já tinha
-- lido a agenda ANTES da escrita: as execuções da Edge Function podem se
-- sobrepor (timeout de 30s, intervalo de 25s), e um ciclo assim traria o
-- título velho de volta por cima do novo. Uma mudança feita no GOOGLE nesse
-- minuto não se perde — o sync relê todo evento em todo ciclo, e ela entra
-- quando a quarentena acaba.
--
-- A VERSÃO (`google_versao`) resolve a outra corrida: se a pessoa edita de
-- novo enquanto o sync ainda escreve a edição anterior, o sync só desliga a
-- marca da versão que ele escreveu — a mais nova continua marcada e vai no
-- ciclo seguinte.
--
-- EXCLUIR É CANCELAR. Um caso tem eventos (append-only, invariante 3.3), e
-- `eventos` referencia `casos` com `on delete restrict`: ele não se apaga, se
-- cancela, com motivo, pelo `cancelar_caso` de sempre. O que muda é o Google:
-- o caso cancelado por uma pessoa PINTA O EVENTO DE CINZA (8), a convenção de
-- cancelamento da própria equipe. O título fica — a equipe continua sabendo
-- de quem era. Rascunho pendente descartado NÃO pinta: rascunho é o evento que
-- o parser não entendeu, e descartá-lo quase sempre quer dizer "isto não é um
-- caso" (um EVENTO, uma reunião), não "este atendimento caiu".
--
-- Este cancelamento pelo sistema fecha o "Ainda não faz" da seção 7.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. A marca "o Google está atrás do sistema"
-- -----------------------------------------------------------------------------

alter table public.casos
  add column google_desatualizado boolean not null default false,
  add column google_versao integer not null default 0,
  add column google_escrito_em timestamptz;

comment on column public.casos.google_desatualizado is
  'Uma PESSOA mudou o caso no sistema (nome, pacote, maternidade, previsão, New Born) ou o cancelou, e o evento do Google ainda não recebeu. O sync atualiza o evento e desliga a marca; enquanto ela existe, o sync não relê aquele evento (o Google está atrasado, não certo).';
comment on column public.casos.google_versao is
  'Conta as mudanças que foram para a fila do Google. O sync só desliga a marca da versão que escreveu — uma edição feita no meio da escrita continua marcada.';
comment on column public.casos.google_escrito_em is
  'Quando o sync atualizou o evento no Google pela última vez. Por um minuto depois disso o sync não relê o evento: um ciclo que leu a agenda antes da escrita traria o título velho de volta.';

alter table public.casos
  add constraint casos_google_desatualizado_com_evento
    check (not google_desatualizado or google_calendar_event_id is not null);

create index idx_casos_google_desatualizado on public.casos (updated_at) where google_desatualizado;


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
    or new.click_home is distinct from old.click_home
    or new.cor_calendar is distinct from old.cor_calendar
  ) then
    new.google_desatualizado := true;
    new.google_versao := old.google_versao + 1;
  end if;

  return new;
end;
$$;

comment on function public.marcar_caso_para_o_google() is
  'Trigger: mudança feita por uma PESSOA (auth.uid() presente) num caso ligado ao Google marca o caso para o sync atualizar o evento; cancelamento marca para pintar de cinza. Pacote ou maternidade novos recalculam a cor pela regra do cadastro.';

revoke all on function public.marcar_caso_para_o_google() from public;

create trigger marcar_caso_para_o_google
  before update on public.casos
  for each row
  execute function public.marcar_caso_para_o_google();


-- -----------------------------------------------------------------------------
-- 2. editar_caso — a RPC do calendário
-- -----------------------------------------------------------------------------
--
-- QUEM EDITA: o adm (eh_adm), os mesmos que criam. Por RPC, e não pelo UPDATE
-- direto do Quadro, porque a previsão e o New Born também mudam aqui, os nomes
-- saem em maiúsculas (como na criação — o sync relê o título), e a edição fica
-- em `eventos` com o que mudou.
--
-- O NEW BORN SÓ SE MARCA: a regra de sempre (seção 13). A etapa pode já ter
-- trabalho, e o caminho para desfazer é "Este caso não tem Click Home" na
-- seção, que dispensa a etapa.
--
-- TROCAR O PACOTE TRAZ AS ETAPAS QUE FALTAM e não tira nenhuma — é a trigger
-- de 20260907100016, que roda aqui como em qualquer UPDATE de pacote.
--
-- CANCELADO NÃO SE EDITA. Encerrado sim: o nome errado de uma família que já
-- recebeu as fotos continua sendo um nome errado.

create function public.editar_caso(
  p_caso_id        uuid,
  p_mae_nome       text,
  p_bebe_nome      text,
  p_pacote_id      uuid,
  p_maternidade_id uuid,
  p_previsao_em    timestamptz,
  p_click_home     boolean default false
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
    raise exception 'Informe o dia e a hora previstos.';
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
  if p_previsao_em is distinct from v_caso.previsao_em then v_campos := array_append(v_campos, 'previsao_em'); end if;
  if v_click is distinct from v_caso.click_home then v_campos := array_append(v_campos, 'click_home'); end if;

  if cardinality(v_campos) = 0 then
    return 'sem_efeito';
  end if;

  update public.casos
     set mae_nome       = v_mae,
         bebe_nome      = v_bebe,
         pacote_id      = p_pacote_id,
         maternidade_id = p_maternidade_id,
         previsao_em    = p_previsao_em,
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
      'previsao_nova', p_previsao_em,
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

comment on function public.editar_caso(uuid, text, text, uuid, uuid, timestamptz, boolean) is
  'Edita um caso pelo calendário: nomes (em maiúsculas), pacote, maternidade, previsão e New Born (só marca). Cancelado recusa. Grava caso_editado; o Google acompanha pela trigger marcar_caso_para_o_google. Só adm (eh_adm).';

revoke all on function public.editar_caso(uuid, text, text, uuid, uuid, timestamptz, boolean) from public, anon;
grant execute on function public.editar_caso(uuid, text, text, uuid, uuid, timestamptz, boolean) to authenticated;


-- -----------------------------------------------------------------------------
-- 3. O lado do sync — só service_role
-- -----------------------------------------------------------------------------

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
  cor_calendar      text
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.google_calendar_event_id, c.google_versao,
         c.status_operacional = 'cancelado',
         c.mae_nome, c.bebe_nome, p.nome, m.sigla, c.click_home, c.previsao_em, c.cor_calendar
  from public.casos c
  left join public.pacotes p on p.id = c.pacote_id
  left join public.maternidades m on m.id = c.maternidade_id
  where c.google_desatualizado
  order by c.updated_at, c.id
  limit 50;
$$;

comment on function public.sync_casos_para_atualizar_no_google() is
  'Os casos que uma pessoa mudou (ou cancelou) no sistema e cujo evento no Google ainda não acompanhou, com os pedaços do título prontos. Só service_role.';

revoke all on function public.sync_casos_para_atualizar_no_google() from public, anon, authenticated;
grant execute on function public.sync_casos_para_atualizar_no_google() to service_role;


-- `p_resultado`: 'atualizado' (o Google recebeu) ou 'evento_sumiu' (o evento
-- foi apagado na agenda — não há o que atualizar, e a checagem de deleção do
-- sync segue com o caso como sempre).
create function public.sync_marcar_google_atualizado(
  p_caso_id   uuid,
  p_versao    integer,
  p_resultado text default 'atualizado'
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_resultado not in ('atualizado', 'evento_sumiu') then
    raise exception 'Resultado desconhecido: %', p_resultado;
  end if;

  update public.casos
     set google_desatualizado = false,
         google_escrito_em = case when p_resultado = 'atualizado' then now() else google_escrito_em end
   where id = p_caso_id
     and google_desatualizado
     and google_versao = p_versao;

  if not found then
    -- Outra edição chegou no meio: a marca fica, e o próximo ciclo escreve a
    -- versão nova.
    return 'sem_efeito';
  end if;

  insert into public.eventos (caso_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    p_caso_id, null, 'caso_atualizado_no_google',
    jsonb_build_object('caso_id', p_caso_id, 'versao', p_versao, 'resultado', p_resultado),
    now()
  );

  return p_resultado;
end;
$$;

comment on function public.sync_marcar_google_atualizado(uuid, integer, text) is
  'Desliga a marca google_desatualizado depois que o sync escreveu a versão p_versao no Google (ou achou o evento apagado). Versão diferente = sem_efeito, a marca fica. Só service_role.';

revoke all on function public.sync_marcar_google_atualizado(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.sync_marcar_google_atualizado(uuid, integer, text) to service_role;


-- -----------------------------------------------------------------------------
-- 4. A trava: o sync não relê um evento que o sistema está atualizando
-- -----------------------------------------------------------------------------
--
-- Corpos IDÊNTICOS aos da 20260915030822, com uma mudança só em cada um: logo
-- depois do SELECT, caso marcado (ou escrito há menos de um minuto) devolve
-- sem_efeito. Mesma assinatura: `create or replace` mantém os privilégios, e
-- a versão anterior da Edge Function continua chamando as duas sem mudança.

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
  v_caso_id       uuid;
  v_status        public.status_operacional;
  v_previsao      timestamptz;
  v_razao         text;
  v_desatualizado boolean;
  v_escrito_em    timestamptz;
begin
  select c.id, c.status_operacional, c.previsao_em, c.google_desatualizado, c.google_escrito_em
    into v_caso_id, v_status, v_previsao, v_desatualizado, v_escrito_em
  from public.casos c
  where c.google_calendar_event_id = p_google_event_id
  for update;

  if not found then
    return 'sem_efeito';
  end if;

  -- O SISTEMA ESTÁ ATUALIZANDO ESTE EVENTO: a agenda que o sync leu está
  -- atrasada. Um caso levado pelo sistema para dentro da janela de leitura
  -- pareceria "sumido" até o Google receber a data nova.
  if v_desatualizado or v_escrito_em > now() - interval '1 minute' then
    return 'sem_efeito';
  end if;

  if v_status in ('encerrado', 'cancelado') then
    -- Terminal: o caso seguiu seu curso antes ou depois do evento sumir.
    return 'sem_efeito';
  end if;

  -- As duas travas, nesta ordem: trabalho é o sinal mais forte e o que
  -- responde "por quê" com mais clareza no evento de auditoria.
  if public.caso_tem_trabalho(v_caso_id) then
    v_razao := 'caso_com_trabalho';
  elsif v_previsao is not null and v_previsao <= now() then
    v_razao := 'horario_ja_passou';
  end if;

  if v_razao is not null then
    -- UMA VEZ POR CASO. O evento continua sumido e o cron roda a cada 25s:
    -- sem esta guarda seriam milhares de linhas por dia em `eventos`, que é
    -- append-only e não se limpa depois.
    if not exists (
      select 1 from public.eventos e
      where e.caso_id = v_caso_id
        and e.tipo = 'evento_calendar_removido'
        and e.payload ->> 'google_event_id' = p_google_event_id
    ) then
      insert into public.eventos (caso_id, pessoa_id, tipo, payload, ocorrido_em)
      values (
        v_caso_id,
        null,
        'evento_calendar_removido',
        jsonb_build_object(
          'caso_id', v_caso_id,
          'google_event_id', p_google_event_id,
          'preservado_por', v_razao
        ),
        now()
      );
    end if;
    return 'preservado';
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

revoke all on function public.sync_cancelar_caso(text, text) from public;
grant execute on function public.sync_cancelar_caso(text, text) to service_role;


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
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caso_id            uuid;
  v_existe             boolean;
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
  v_desatualizado      boolean;
  v_escrito_em         timestamptz;
begin
  select c.id, c.status_operacional, c.mae_nome, c.bebe_nome,
         c.pacote_id, c.maternidade_id, c.previsao_em, c.cor_calendar,
         c.google_desatualizado, c.google_escrito_em
    into v_caso_id, v_status_operacional, v_mae_atual, v_bebe_atual,
         v_pacote_atual, v_maternidade_atual, v_previsao_atual, v_cor_atual,
         v_desatualizado, v_escrito_em
  from public.casos c
  where c.google_calendar_event_id = p_google_event_id
  for update;

  v_existe := found;

  -- ---------------------------------------------------------------------
  -- 0. O SISTEMA ESTÁ ATUALIZANDO ESTE EVENTO (20260930164416): o título e a
  -- hora que chegaram são os de ANTES da mudança feita no sistema. Nem o
  -- card cinza entra agora — ele volta no primeiro ciclo depois da
  -- quarentena, porque o sync relê todo evento em todo ciclo.
  -- ---------------------------------------------------------------------
  if v_existe and (v_desatualizado or v_escrito_em > now() - interval '1 minute') then
    return 'sem_efeito';
  end if;

  -- ---------------------------------------------------------------------
  -- 1. Cancelamento tem prioridade — menos sobre um atendimento que aconteceu.
  -- ---------------------------------------------------------------------
  if p_cancelado then
    if not v_existe then
      return 'sem_efeito';
    end if;

    if v_status_operacional in ('encerrado', 'cancelado') then
      return 'sem_efeito';
    end if;

    if not public.caso_tem_trabalho(v_caso_id) then
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

    -- Cinza num caso com trabalho: registra uma vez e cai no UPDATE abaixo.
    if not exists (
      select 1 from public.eventos e
      where e.caso_id = v_caso_id and e.tipo = 'card_cinza_ignorado'
    ) then
      insert into public.eventos (caso_id, pessoa_id, tipo, payload, ocorrido_em)
      values (
        v_caso_id,
        null,
        'card_cinza_ignorado',
        jsonb_build_object(
          'caso_id', v_caso_id,
          'google_event_id', p_google_event_id,
          'preservado_por', 'caso_com_trabalho'
        ),
        now()
      );
    end if;
  end if;

  -- ---------------------------------------------------------------------
  -- 2a. Caso novo — INSERT.
  -- ---------------------------------------------------------------------
  if not v_existe then
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
  -- 2b. Caso já existe — UPDATE só dos campos de dado. status_operacional
  -- NUNCA é tocado aqui.
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

revoke all on function public.sync_upsert_caso(text, text, text, uuid, uuid, timestamptz, text, boolean) from public;
grant execute on function public.sync_upsert_caso(text, text, text, uuid, uuid, timestamptz, text, boolean) to service_role;
