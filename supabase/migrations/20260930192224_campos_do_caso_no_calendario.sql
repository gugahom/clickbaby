-- =============================================================================
-- OS CAMPOS DO CASO NO CALENDÁRIO: CESÁREA, OBSERVAÇÕES E FOTOLIVRO
-- (30/09/2026, pedido do gestor: "uma hora prevista e uma hora da cesárea,
-- porque eles trabalham assim na agenda deles", "um campo de observações — o
-- template eu passo depois", e "além do newborn, um checkbox de fotolivro")
-- =============================================================================
--
-- A HORA DA CESÁREA É OUTRA COISA QUE A PREVISÃO. A previsão é quando a equipe
-- precisa estar lá — é por ela que o Quadro alerta e o evento do Google começa;
-- a cesárea é a hora marcada da cirurgia. Data PLANEJADA, que a invariante 3.4
-- deixa vir do cliente, como a previsão.
--
-- AS OBSERVAÇÕES são o texto da DESCRIÇÃO do evento no Google (onde a equipe
-- guarda o cadastro da família). Coluna própria, `observacao_calendar`, e não
-- `observacao`: a dívida #11 já pedia isso — misturar com a observação interna
-- faria o sync sobrescrever o que a equipe escreveu. Por enquanto a descrição
-- NÃO é importada do Google, e por isso a regra de escrita é assimétrica:
--   * caso CRIADO PELO SISTEMA (`criado_por` preenchido): a descrição do evento
--     é nossa — observações e cesárea vão para ela, na criação e na edição;
--   * caso que VEIO DO GOOGLE: a descrição é da equipe, e o sistema não a toca.
--     Escrever nela apagaria o cadastro que está lá (CPF, e-mail, médico) em
--     troca de um campo que, aqui, nasceu vazio.
-- Quando o template chegar, a conversa é importar a descrição — e aí a regra
-- vira uma só.
-- Os TEXTOS não vão para `eventos` (só o nome do campo que mudou): a descrição
-- da agenda carrega documento e contato da família.
--
-- O FOTOLIVRO VENDIDO é a etapa `album` fora do pacote, por `adicionar_etapa`
-- — o caminho que o Quadro já usa. Só se marca, como o New Born.
-- =============================================================================

alter table public.casos
  add column cesarea_em timestamptz,
  add column observacao_calendar text;

comment on column public.casos.cesarea_em is
  'A hora marcada da cesárea (planejada). Diferente de previsao_em, que é quando a equipe precisa estar na maternidade.';
comment on column public.casos.observacao_calendar is
  'As observações do evento da agenda (a descrição do Google). Escritas pelo calendário do sistema; vão para o evento só nos casos que o sistema criou. Não é a observação interna do caso.';


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
    -- A descrição do evento só é do sistema no caso que o SISTEMA criou (ver
    -- o cabeçalho): só ali a observação e a cesárea mudam o evento.
    or (new.criado_por is not null and (
         new.observacao_calendar is distinct from old.observacao_calendar
      or new.cesarea_em is distinct from old.cesarea_em))
  ) then
    new.google_desatualizado := true;
    new.google_versao := old.google_versao + 1;
  end if;

  return new;
end;
$$;



drop function public.criar_caso(text, text, uuid, uuid, timestamptz, boolean, boolean);

create function public.criar_caso(
  p_mae_nome       text,
  p_bebe_nome      text,
  p_pacote_id      uuid,
  p_maternidade_id uuid,
  p_previsao_em    timestamptz,
  p_click_home     boolean default false,
  p_sem_hora       boolean default false,
  p_cesarea_em     timestamptz default null,
  p_observacao     text default null,
  p_fotolivro      boolean default false
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
  v_obs       text := nullif(btrim(coalesce(p_observacao, '')), '');
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

  if length(coalesce(v_obs, '')) > 4000 then
    raise exception 'As observações passam de 4.000 caracteres.';
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
    cor_calendar, click_home, criado_por, google_pendente, cesarea_em, observacao_calendar
  )
  values (
    v_mae, v_bebe, p_pacote_id, p_maternidade_id, v_previsao, coalesce(p_sem_hora, false),
    v_cor, coalesce(p_click_home, false), v_pessoa_id, true, p_cesarea_em, v_obs
  )
  returning id into v_caso_id;

  insert into public.eventos (caso_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    v_caso_id, v_pessoa_id, 'caso_criado',
    jsonb_build_object(
      'caso_id', v_caso_id,
      'origem', 'calendario',
      'click_home', coalesce(p_click_home, false),
      'fotolivro', coalesce(p_fotolivro, false)
    ),
    now()
  );

  -- O FOTOLIVRO VENDIDO entra como etapa fora do pacote, pelo caminho de
  -- sempre (idempotente: no MASTER + ÁLBUM ele já veio com o pacote).
  if coalesce(p_fotolivro, false) then
    perform public.adicionar_etapa(v_caso_id, 'album');
  end if;

  return v_caso_id;
end;
$$;


comment on function public.criar_caso(text, text, uuid, uuid, timestamptz, boolean, boolean, timestamptz, text, boolean) is
  'Cria um caso pelo calendário: pacote e maternidade do cadastro, previsão (ou só o dia), hora da cesárea, observações, New Born e Foto/Livro opcionais. A cor vem da regra do cadastro; o caso nasce PENDENTE de ir ao Google. Só adm (eh_adm).';

revoke all on function public.criar_caso(text, text, uuid, uuid, timestamptz, boolean, boolean, timestamptz, text, boolean) from public, anon;
grant execute on function public.criar_caso(text, text, uuid, uuid, timestamptz, boolean, boolean, timestamptz, text, boolean) to authenticated;


drop function public.editar_caso(uuid, text, text, uuid, uuid, timestamptz, boolean, boolean);

create function public.editar_caso(
  p_caso_id        uuid,
  p_mae_nome       text,
  p_bebe_nome      text,
  p_pacote_id      uuid,
  p_maternidade_id uuid,
  p_previsao_em    timestamptz,
  p_click_home     boolean default false,
  p_sem_hora       boolean default false,
  p_cesarea_em     timestamptz default null,
  p_observacao     text default null,
  p_fotolivro      boolean default false
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
  v_obs       text := nullif(btrim(coalesce(p_observacao, '')), '');
  v_tem_livro boolean;
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

  if length(coalesce(v_obs, '')) > 4000 then
    raise exception 'As observações passam de 4.000 caracteres.';
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
  if p_cesarea_em is distinct from v_caso.cesarea_em then v_campos := array_append(v_campos, 'cesarea_em'); end if;
  if v_obs is distinct from v_caso.observacao_calendar then v_campos := array_append(v_campos, 'observacao_calendar'); end if;

  -- O FOTOLIVRO só se marca, como o New Born: a etapa pode ter trabalho, e
  -- desfazer é dispensar na seção Foto/Livro.
  select exists (
    select 1 from public.caso_etapas ce where ce.caso_id = p_caso_id and ce.tipo = 'album'
  ) into v_tem_livro;
  if coalesce(p_fotolivro, false) and not v_tem_livro then
    v_campos := array_append(v_campos, 'fotolivro');
  end if;
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
         cesarea_em     = p_cesarea_em,
         observacao_calendar = v_obs,
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

  if 'fotolivro' = any (v_campos) then
    perform public.adicionar_etapa(p_caso_id, 'album');
  end if;

  return 'editado';
end;
$$;


comment on function public.editar_caso(uuid, text, text, uuid, uuid, timestamptz, boolean, boolean, timestamptz, text, boolean) is
  'Edita um caso pelo calendário: nomes, pacote, maternidade, previsão (ou só o dia), cesárea, observações, New Born e Foto/Livro (os dois só marcam). Cancelado recusa. Grava caso_editado sem os textos; o Google acompanha pela trigger. Só adm (eh_adm).';

revoke all on function public.editar_caso(uuid, text, text, uuid, uuid, timestamptz, boolean, boolean, timestamptz, text, boolean) from public, anon;
grant execute on function public.editar_caso(uuid, text, text, uuid, uuid, timestamptz, boolean, boolean, timestamptz, text, boolean) to authenticated;


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
  previsao_sem_hora boolean,
  cesarea_em        timestamptz,
  observacao_calendar text
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.mae_nome, c.bebe_nome, p.nome, m.sigla, c.click_home, c.previsao_em, c.cor_calendar, c.previsao_sem_hora, c.cesarea_em, c.observacao_calendar
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
  previsao_sem_hora boolean,
  cesarea_em        timestamptz,
  observacao_calendar text,
  descricao_do_sistema boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.google_calendar_event_id, c.google_versao,
         c.status_operacional = 'cancelado',
         c.mae_nome, c.bebe_nome, p.nome, m.sigla, c.click_home, c.previsao_em, c.cor_calendar, c.previsao_sem_hora, c.cesarea_em, c.observacao_calendar,
         c.criado_por is not null
  from public.casos c
  left join public.pacotes p on p.id = c.pacote_id
  left join public.maternidades m on m.id = c.maternidade_id
  where c.google_desatualizado
  order by c.updated_at, c.id
  limit 50;
$$;


revoke all on function public.sync_casos_para_atualizar_no_google() from public, anon, authenticated;
grant execute on function public.sync_casos_para_atualizar_no_google() to service_role;
