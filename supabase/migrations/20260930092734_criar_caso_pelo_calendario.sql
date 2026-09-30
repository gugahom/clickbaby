-- =============================================================================
-- CRIAR CASO PELO CALENDÁRIO, COM CÓPIA NO GOOGLE (30/09/2026, pedido do gestor)
-- =============================================================================
--
-- Até aqui o único jeito de um caso nascer era o sync do Google Calendar (seção
-- 7 do CLAUDE.md): o comercial marca o parto na agenda e o sync cria o caso. O
-- calendário do sistema vai SUBSTITUIR aquela agenda como entrada, e o primeiro
-- passo é criar o caso aqui — com pacote e maternidade escolhidos em lista, o
-- que elimina o rascunho pendente na origem: não há título para o parser
-- adivinhar.
--
-- O GOOGLE CONTINUA COMPLETO (decisão do usuário): o caso criado aqui também
-- vira evento na agenda, no formato de título que a equipe usa
-- ("MÃE/BEBÊ - PACOTE - SIGLA") e com a cor da regra abaixo. Quem escreve é o
-- próprio sync, que já roda a cada 25 segundos com a credencial do Google: a
-- RPC só marca o caso como PENDENTE, e o sync cria o evento e liga o id. Uma
-- Edge Function nova chamada pela tela teria CORS, deploy e um segundo lugar
-- com a credencial — e se ela falhasse no meio, ninguém tentaria de novo. Aqui,
-- o que falhar fica pendente e o próximo ciclo tenta outra vez.
--
-- DEPOIS DE LIGADO, O CASO SEGUE O GOOGLE como qualquer caso do sync: o sync
-- relê o título e a hora do evento a cada ciclo. Mudar a hora ainda é no
-- Google, até a próxima etapa (editar pelo calendário e aposentar a leitura).
--
-- APAGAR O EVENTO NO GOOGLE NÃO CANCELA ESTE CASO: a criação grava um evento
-- com a pessoa que criou, e `caso_tem_trabalho` conta ação humana como
-- trabalho — as travas de 20260915030822 o preservam. É o certo: o que nasceu
-- de um gesto no sistema se desfaz por um gesto no sistema (`cancelar_caso`).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. A regra da cor, no cadastro
-- -----------------------------------------------------------------------------
--
-- A cor do evento no Google (o `colorId`, de 1 a 11) é organização da equipe,
-- e até aqui o sistema só a guardava (`casos.cor_calendar`, "herdada, não
-- interpretada"). Para ESCREVER um evento, ela precisa de regra — e a regra
-- saiu dos 317 casos reais do remoto, medida em 30/09/2026, não de palpite:
--   * BIRTH e BIRTH + REELS são TOMATE (11) em qualquer maternidade — 90 de 93;
--   * o resto segue a MATERNIDADE: GNDI banana (5, 61 de 71), HSC mirtilo
--     (9, 52 de 55), HNSG uva (3, 34 de 38), CWB manjericão (10, 15 de 15),
--     HNSF a cor padrão da agenda (17 de 21).
-- Rocio, Mackenzie e Marilac têm poucos casos e nenhum padrão: ficam sem cor
-- (padrão da agenda) até a gestão dizer.
--
-- O PACOTE GANHA DA MATERNIDADE (o BIRTH é vermelho na HSC também). Mora em
-- colunas de CADASTRO, e não no código: mudar a cor de uma maternidade é um
-- UPDATE de adm, pela mesma policy `*_escrita_adm` de sempre.

alter table public.maternidades
  add column cor_calendar text,
  add constraint maternidades_cor_calendar_valida
    check (cor_calendar is null or cor_calendar in ('1','2','3','4','5','6','7','8','9','10','11'));

alter table public.pacotes
  add column cor_calendar text,
  add constraint pacotes_cor_calendar_valida
    check (cor_calendar is null or cor_calendar in ('1','2','3','4','5','6','7','8','9','10','11'));

comment on column public.maternidades.cor_calendar is
  'A cor (colorId do Google, 1 a 11) dos eventos desta maternidade na agenda. Nula = cor padrão da agenda. O pacote tem precedência (pacotes.cor_calendar). A cor 8 (grafite) é a do CARD CINZA, que o sync lê como cancelamento — não use.';
comment on column public.pacotes.cor_calendar is
  'A cor (colorId do Google) dos eventos deste pacote — quando preenchida, GANHA da maternidade. Hoje só os dois BIRTH (tomate).';

-- O cinza (8) é o card cinza: um evento criado com ele seria cancelado pelo
-- próprio sync no ciclo seguinte. A regra acima não o usa, e esta trava
-- impede que um UPDATE futuro o use.
alter table public.maternidades add constraint maternidades_cor_nao_e_cinza check (cor_calendar is distinct from '8');
alter table public.pacotes add constraint pacotes_cor_nao_e_cinza check (cor_calendar is distinct from '8');

update public.pacotes set cor_calendar = '11' where slug in ('birth', 'birth-reels');
update public.maternidades set cor_calendar = '5'  where sigla = 'GNDI';
update public.maternidades set cor_calendar = '9'  where sigla = 'HSC';
update public.maternidades set cor_calendar = '3'  where sigla = 'HNSG';
update public.maternidades set cor_calendar = '10' where sigla = 'CWB';


-- -----------------------------------------------------------------------------
-- 2. A marca "ainda não foi para o Google"
-- -----------------------------------------------------------------------------

alter table public.casos
  add column google_pendente boolean not null default false;

comment on column public.casos.google_pendente is
  'Caso criado pelo sistema cujo evento ainda não existe no Google Calendar. O sync cria o evento e desliga a marca (sync_vincular_evento_google). Nunca é verdadeira junto com google_calendar_event_id.';

alter table public.casos
  add constraint casos_google_pendente_sem_evento
    check (not google_pendente or google_calendar_event_id is null);

create index idx_casos_google_pendente on public.casos (created_at) where google_pendente;


-- -----------------------------------------------------------------------------
-- 3. criar_caso — a RPC da tela
-- -----------------------------------------------------------------------------
--
-- QUEM CRIA: o adm — gestão, coordenação, comercial e financeiro (decisão do
-- usuário, "esses 4 tipos de perfil"), o mesmo `eh_adm()` que marca feriado.
-- O atendimento vê o calendário e não cria.
--
-- NOMES EM MAIÚSCULAS, porque é assim que a equipe escreve na agenda e é o que
-- o sync vai reler do título: guardar "Ana" e escrever "ANA" faria o primeiro
-- ciclo reescrever o nome, gerando uma diferença que ninguém fez.
--
-- A PREVISÃO VEM DO CLIENTE, e pode: é data PLANEJADA, a única que a
-- invariante 3.4 deixa entrar pela tela (comentário de `casos.previsao_em`).

create function public.criar_caso(
  p_mae_nome       text,
  p_bebe_nome      text,
  p_pacote_id      uuid,
  p_maternidade_id uuid,
  p_previsao_em    timestamptz,
  p_click_home     boolean default false
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
    raise exception 'Informe o dia e a hora previstos.';
  end if;

  select coalesce(pc.cor_calendar, m.cor_calendar) into v_cor
  from public.pacotes pc, public.maternidades m
  where pc.id = p_pacote_id and pc.ativo
    and m.id = p_maternidade_id and m.ativo;

  if not found then
    raise exception 'Escolha um pacote e uma maternidade do cadastro.';
  end if;

  insert into public.casos (
    mae_nome, bebe_nome, pacote_id, maternidade_id, previsao_em,
    cor_calendar, click_home, criado_por, google_pendente
  )
  values (
    v_mae, v_bebe, p_pacote_id, p_maternidade_id, p_previsao_em,
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

comment on function public.criar_caso(text, text, uuid, uuid, timestamptz, boolean) is
  'Cria um caso pelo calendário do sistema: pacote e maternidade do cadastro, previsão planejada, adicional New Born opcional. A cor vem da regra do cadastro, e o caso nasce PENDENTE de ir ao Google (o sync escreve o evento). Grava caso_criado em eventos. Só adm (eh_adm).';

revoke all on function public.criar_caso(text, text, uuid, uuid, timestamptz, boolean) from public, anon;
grant execute on function public.criar_caso(text, text, uuid, uuid, timestamptz, boolean) to authenticated;


-- -----------------------------------------------------------------------------
-- 4. O lado do sync — só service_role
-- -----------------------------------------------------------------------------
--
-- A leitura dos pendentes é FUNÇÃO, e não SELECT da Edge Function na tabela:
-- o GRANT de `service_role` em `casos` diverge entre local e remoto (dívida #5),
-- e uma função definer não depende dele. Ela já devolve os pedaços do título
-- prontos (pacote pelo NOME do cadastro, maternidade pela SIGLA) — o mesmo
-- vocabulário que o parser reconhece de volta.
--
-- Cancelado antes de ir ao Google não vai: não há o que avisar à agenda.

create function public.sync_casos_para_o_google()
returns table (
  caso_id           uuid,
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
  select c.id, c.mae_nome, c.bebe_nome, p.nome, m.sigla, c.click_home, c.previsao_em, c.cor_calendar
  from public.casos c
  join public.pacotes p on p.id = c.pacote_id
  join public.maternidades m on m.id = c.maternidade_id
  where c.google_pendente
    and c.status_operacional <> 'cancelado'
    and c.previsao_em is not null
  order by c.created_at, c.id
  limit 50;
$$;

comment on function public.sync_casos_para_o_google() is
  'Os casos criados pelo sistema que ainda não viraram evento no Google, com os pedaços do título prontos. Só service_role (Edge Function do sync).';

revoke all on function public.sync_casos_para_o_google() from public, anon, authenticated;
grant execute on function public.sync_casos_para_o_google() to service_role;


create function public.sync_vincular_evento_google(p_caso_id uuid, p_google_event_id text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_google_event_id is null or btrim(p_google_event_id) = '' then
    raise exception 'Informe o id do evento.';
  end if;

  update public.casos
     set google_calendar_event_id = p_google_event_id,
         google_pendente = false
   where id = p_caso_id
     and google_pendente;

  if not found then
    return 'sem_efeito';
  end if;

  insert into public.eventos (caso_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    p_caso_id, null, 'caso_enviado_ao_google',
    jsonb_build_object('caso_id', p_caso_id, 'google_event_id', p_google_event_id),
    now()
  );

  return 'vinculado';
end;
$$;

comment on function public.sync_vincular_evento_google(uuid, text) is
  'Liga o evento que o sync acabou de criar no Google ao caso pendente, e desliga a marca. Idempotente: caso já ligado devolve sem_efeito. Só service_role.';

revoke all on function public.sync_vincular_evento_google(uuid, text) from public, anon, authenticated;
grant execute on function public.sync_vincular_evento_google(uuid, text) to service_role;
