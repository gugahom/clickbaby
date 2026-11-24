-- =============================================================================
-- OS LEADS DO COMERCIAL — fase A do painel comercial (18/11/2026)
-- =============================================================================
--
-- O sistema cobria o DEPOIS da venda (o caso, o valor vendido, as ofertas do
-- pós-venda). O ANTES morava na planilha "PAINEL DE VENDAS": a mãe que preencheu
-- o cupom do sorteio da maternidade, ou que um vendedor trouxe, sendo trabalhada
-- até fechar ou desistir. O desenho inteiro está em `docs/painel-comercial.md`.
--
-- O QUE A PLANILHA ENSINOU (aba de outubro/26, 183 leads):
--   * o prazo do vendedor é SEMPRE a DPP menos 10 dias (142 de 142 linhas);
--   * passou o prazo sem venda, o lead vai para a REPESCAGEM (a Vavá) —
--     metade dos leads do mês caiu lá;
--   * o vendedor sai da maternidade do cupom (GNDI → Guizão, HSC → Rafinha);
--   * "já nasceu" e "sem WhatsApp" são PERDA (decisão do gestor).
--
-- AS ESCOLHAS DESTA MIGRATION:
--   * `leads` guarda o que se DIGITA; prazo, prioridade, fase (venda ou
--     repescagem), último contato e quantos retornos são DERIVADOS na view
--     `leads_do_comercial`. Estado que o relógio mudaria vira tela discordando do
--     banco — mesmo argumento do sino e da avaliação de 15 dias. Nenhum job
--     move lead de fase.
--   * `contatos_do_lead` é APPEND-ONLY, como `eventos`: "1º retorno", "último
--     contato" e "2º retorno da Vavá" passam a ser CONTADOS, nunca digitados, e
--     o carimbo é do servidor (invariante 3.4).
--   * o vendedor de cada maternidade é CADASTRO (`vendedores_da_maternidade`),
--     e quem faz repescagem é MARCA NA PESSOA (`pessoas.faz_repescagem`) — nomes
--     de gente não entram no código.
--   * o histórico vai para `eventos`, que ganha `lead_id`. A policy de leitura
--     passa a esconder essas linhas de quem não tem a tela Comercial; o payload
--     leva ids e motivos, nunca telefone nem nota.
--   * telefone + DPP + maternidade de gestante é dado sensível: tudo legível só
--     por quem tem a tela Comercial, e escrito só por RPC.
--
-- O QUE FICA PARA DEPOIS: `fechar_lead` (fecha a venda criando o caso) é da fase
-- B; até lá, `marcar_lead_ganho` liga o lead a um caso criado no Calendário. A
-- importação das planilhas é a fase A3.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Tipos
-- -----------------------------------------------------------------------------

-- "vendedor" é o "CELL GUI / CELL RAFA" da planilha: o lead que o próprio
-- vendedor trouxe (a confirmar com o gestor; se for outra coisa, muda o rótulo).
create type public.origem_lead as enum (
  'cupom', 'vendedor', 'anuncio', 'instagram', 'indicacao', 'monte_seu_pacote', 'outro'
);

create type public.situacao_lead as enum ('novo', 'em_contato', 'negociando', 'ganho', 'perdido');

create type public.motivo_perda_lead as enum ('nao_quis', 'ja_nasceu', 'sem_whatsapp', 'sem_resposta', 'outro');

create type public.canal_contato_lead as enum ('whatsapp', 'ligacao', 'presencial', 'outro');

create type public.resultado_contato_lead as enum (
  'sem_resposta', 'respondeu', 'pediu_retorno', 'mandou_proposta', 'outro'
);

-- A fase em que o contato aconteceu, carimbada pelo servidor na hora: é o que
-- permite contar os retornos da repescagem depois, sem reconstruir o prazo.
create type public.fase_do_lead as enum ('venda', 'repescagem');


-- -----------------------------------------------------------------------------
-- 2. As duas regras que moram num lugar só
-- -----------------------------------------------------------------------------

create function public.dias_de_prazo_da_venda()
returns integer
language sql
immutable
set search_path = ''
as $$ select 10 $$;

comment on function public.dias_de_prazo_da_venda() is
  'Quantos dias antes da DPP acaba o prazo do vendedor. Medido na planilha PAINEL DE VENDAS: 142 de 142 linhas. Muda aqui e em nenhum outro lugar.';

revoke all on function public.dias_de_prazo_da_venda() from public, anon;
grant execute on function public.dias_de_prazo_da_venda() to authenticated;

-- O telefone vem em todo formato ("41 9112-2423", "41996275033", "+55 …"). Vira
-- +55DDDNÚMERO, que é a chave com que a caixa do WhatsApp vai achar o lead.
-- Devolve NULO para o que não dá para ler — quem chama decide o que fazer.
create function public.normalizar_telefone(p_telefone text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_digitos text := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
begin
  if length(v_digitos) in (10, 11) then
    return '+55' || v_digitos;
  end if;
  if left(v_digitos, 2) = '55' and length(v_digitos) in (12, 13) then
    return '+' || v_digitos;
  end if;
  return null;
end;
$$;

comment on function public.normalizar_telefone(text) is
  'Telefone brasileiro em qualquer formato → +55DDDNÚMERO; NULO quando não dá para ler.';

revoke all on function public.normalizar_telefone(text) from public, anon;
grant execute on function public.normalizar_telefone(text) to authenticated;


-- -----------------------------------------------------------------------------
-- 3. Os leads
-- -----------------------------------------------------------------------------

create table public.leads (
  id                  uuid primary key default gen_random_uuid(),
  mae_nome            text not null check (btrim(mae_nome) <> ''),
  bebe_nome           text check (bebe_nome is null or btrim(bebe_nome) <> ''),
  telefone            text not null check (telefone ~ '^\+55[0-9]{10,11}$'),
  dpp                 date,
  maternidade_id      uuid references public.maternidades (id) on delete restrict,
  origem              public.origem_lead not null default 'outro',
  origem_detalhe      text check (origem_detalhe is null or btrim(origem_detalhe) <> ''),
  situacao            public.situacao_lead not null default 'novo',
  motivo_perda        public.motivo_perda_lead,
  motivo_perda_texto  text check (motivo_perda_texto is null or btrim(motivo_perda_texto) <> ''),
  vendedor_id         uuid references public.pessoas (id) on delete restrict,
  proximo_retorno_em  timestamptz,
  caso_id             uuid references public.casos (id) on delete restrict,
  interesse_new_born  boolean not null default false,
  observacao          text check (observacao is null or btrim(observacao) <> ''),
  criado_por          uuid not null references public.pessoas (id) on delete restrict,
  encerrado_em        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint leads_perda_tem_motivo check ((situacao = 'perdido') = (motivo_perda is not null)),
  constraint leads_motivo_outro_tem_texto check (motivo_perda is distinct from 'outro' or motivo_perda_texto is not null),
  constraint leads_encerrado_tem_carimbo check ((situacao in ('ganho', 'perdido')) = (encerrado_em is not null)),
  constraint leads_caso_so_no_ganho check (caso_id is null or situacao = 'ganho')
);

comment on table public.leads is
  'A mãe em negociação, antes de virar caso. Legível só por quem tem a tela Comercial; escrita só pelas RPCs do comercial. Prazo, prioridade e fase são derivados em leads_do_comercial.';

-- Um telefone tem no máximo UM lead aberto: é a chave do WhatsApp. Lead
-- encerrado não conta — a mesma mãe volta no segundo filho.
create unique index leads_telefone_aberto_unico on public.leads (telefone)
  where situacao not in ('ganho', 'perdido');

create index leads_maternidade_id_idx on public.leads (maternidade_id);
create index leads_vendedor_id_idx on public.leads (vendedor_id);
create index leads_caso_id_idx on public.leads (caso_id);
create index leads_criado_por_idx on public.leads (criado_por);
create index leads_dpp_idx on public.leads (dpp);
create index leads_telefone_idx on public.leads (telefone);

create trigger leads_set_updated_at
  before update on public.leads
  for each row execute function public.set_updated_at();

alter table public.leads enable row level security;

create policy leads_select_comercial
  on public.leads
  for select
  to authenticated
  using ((select public.tem_tela('comercial')));

grant select on public.leads to authenticated;


-- -----------------------------------------------------------------------------
-- 4. Os contatos — append-only
-- -----------------------------------------------------------------------------

create table public.contatos_do_lead (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references public.leads (id) on delete restrict,
  pessoa_id   uuid not null references public.pessoas (id) on delete restrict,
  canal       public.canal_contato_lead not null,
  resultado   public.resultado_contato_lead not null,
  fase        public.fase_do_lead not null,
  nota        text check (nota is null or btrim(nota) <> ''),
  ocorrido_em timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.contatos_do_lead is
  'Cada toque num lead: quem, quando (relógio do servidor), canal, resultado e a fase em que aconteceu. APPEND-ONLY: "1º retorno", "último contato" e os retornos da repescagem são contados daqui.';

create index contatos_do_lead_lead_id_idx on public.contatos_do_lead (lead_id, ocorrido_em);
create index contatos_do_lead_pessoa_id_idx on public.contatos_do_lead (pessoa_id);

create trigger contatos_do_lead_set_updated_at
  before update on public.contatos_do_lead
  for each row execute function public.set_updated_at();

alter table public.contatos_do_lead enable row level security;

create policy contatos_do_lead_select_comercial
  on public.contatos_do_lead
  for select
  to authenticated
  using ((select public.tem_tela('comercial')));

grant select on public.contatos_do_lead to authenticated;


-- -----------------------------------------------------------------------------
-- 5. O vendedor de cada maternidade, e quem faz repescagem
-- -----------------------------------------------------------------------------

create table public.vendedores_da_maternidade (
  maternidade_id uuid primary key references public.maternidades (id) on delete restrict,
  pessoa_id      uuid not null references public.pessoas (id) on delete restrict,
  definido_por   uuid not null references public.pessoas (id) on delete restrict,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.vendedores_da_maternidade is
  'Quem vende os leads de cada maternidade (o cupom da GNDI vai para quem, o da HSC para quem). O lead novo nasce com essa pessoa; o robô do WhatsApp vai ler a mesma tabela. Escrita só por definir_vendedor_da_maternidade, de quem tem a tela Equipe.';

create index vendedores_da_maternidade_pessoa_id_idx on public.vendedores_da_maternidade (pessoa_id);
create index vendedores_da_maternidade_definido_por_idx on public.vendedores_da_maternidade (definido_por);

create trigger vendedores_da_maternidade_set_updated_at
  before update on public.vendedores_da_maternidade
  for each row execute function public.set_updated_at();

alter table public.vendedores_da_maternidade enable row level security;

create policy vendedores_da_maternidade_select_comercial
  on public.vendedores_da_maternidade
  for select
  to authenticated
  using ((select public.tem_tela('comercial')) or (select public.tem_tela('equipe')));

grant select on public.vendedores_da_maternidade to authenticated;

-- Marca na pessoa, como as do sino do New Born: a gestão aponta quem faz a
-- repescagem na ficha da Equipe. O UPDATE de `pessoas` já é de quem tem a tela
-- Equipe (policy pessoas_escrita_equipe), e o GRANT de tabela cobre a coluna.
alter table public.pessoas
  add column faz_repescagem boolean not null default false;

comment on column public.pessoas.faz_repescagem is
  'Esta pessoa trabalha a repescagem do comercial: vê na fila dela os leads cujo prazo de venda (DPP − 10) passou sem fechar.';


-- -----------------------------------------------------------------------------
-- 6. O histórico em `eventos`
-- -----------------------------------------------------------------------------

alter table public.eventos
  add column lead_id uuid references public.leads (id) on delete restrict;

create index eventos_lead_id_idx on public.eventos (lead_id);

-- Linha de lead é do comercial: quem não tem a tela não a lê. O resto de
-- `eventos` continua de toda pessoa ativa, como desde 25/08.
drop policy eventos_select_compartilhada on public.eventos;

create policy eventos_select_compartilhada
  on public.eventos
  for select
  to authenticated
  using (
    (select public.eh_pessoa_ativa())
    and (lead_id is null or (select public.tem_tela('comercial')))
  );


-- -----------------------------------------------------------------------------
-- 7. A view do comercial — o que se calcula
-- -----------------------------------------------------------------------------

create view public.leads_do_comercial
with (security_invoker = true)
as
with hoje as (
  select (now() at time zone 'America/Sao_Paulo')::date as dia
),
contatos as (
  select
    c.lead_id,
    count(*)::int                                       as total_contatos,
    count(*) filter (where c.fase = 'repescagem')::int  as contatos_na_repescagem,
    max(c.ocorrido_em)                                  as ultimo_contato_em,
    min(c.ocorrido_em)                                  as primeiro_contato_em
  from public.contatos_do_lead c
  group by c.lead_id
)
select
  l.*,
  m.sigla                                         as maternidade_sigla,
  m.nome                                          as maternidade_nome,
  v.nome                                          as vendedor_nome,
  l.dpp - public.dias_de_prazo_da_venda()         as prazo_venda,
  (l.dpp - public.dias_de_prazo_da_venda()) - h.dia as dias_para_prazo,
  case
    when l.situacao in ('ganho', 'perdido') then null
    when l.dpp is not null and (l.dpp - public.dias_de_prazo_da_venda()) < h.dia then 'repescagem'
    else 'venda'
  end                                             as fase,
  case
    when l.situacao in ('ganho', 'perdido') or l.dpp is null then null
    when (l.dpp - public.dias_de_prazo_da_venda()) - h.dia < 0  then 'repescagem'
    when (l.dpp - public.dias_de_prazo_da_venda()) - h.dia <= 2 then 'urgente'
    when (l.dpp - public.dias_de_prazo_da_venda()) - h.dia <= 5 then 'atencao'
    when (l.dpp - public.dias_de_prazo_da_venda()) - h.dia <= 10 then 'acompanhar'
    else 'normal'
  end                                             as prioridade,
  coalesce(c.total_contatos, 0)                   as total_contatos,
  coalesce(c.contatos_na_repescagem, 0)           as contatos_na_repescagem,
  c.ultimo_contato_em,
  c.primeiro_contato_em,
  (l.situacao not in ('ganho', 'perdido') and l.proximo_retorno_em is not null
   and l.proximo_retorno_em < now())              as retorno_atrasado
from public.leads l
cross join hoje h
left join public.maternidades m on m.id = l.maternidade_id
left join public.pessoas v on v.id = l.vendedor_id
left join contatos c on c.lead_id = l.id;

comment on view public.leads_do_comercial is
  'Os leads com o que se calcula: prazo (DPP − dias_de_prazo_da_venda), prioridade da legenda da planilha (normal >10 dias, acompanhar 6–10, atenção 3–5, urgente 0–2, repescagem passou do prazo), fase (venda ou repescagem), contatos e retorno atrasado. security_invoker: valem as RLS das tabelas.';

grant select on public.leads_do_comercial to authenticated;


-- -----------------------------------------------------------------------------
-- 8. Helpers internos das RPCs
-- -----------------------------------------------------------------------------

-- A pessoa ativa que chama, se ela tem a tela Comercial. Uma porta só para as
-- RPCs deste arquivo.
create function public.pessoa_do_comercial()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_pessoa_id uuid;
begin
  select p.id into v_pessoa_id
  from public.pessoas p
  where p.auth_user_id = auth.uid()
    and p.ativo;

  if v_pessoa_id is null or not public.tem_tela('comercial') then
    raise exception 'Só quem tem a tela Comercial mexe nos leads.';
  end if;

  return v_pessoa_id;
end;
$$;

revoke all on function public.pessoa_do_comercial() from public, anon, authenticated;

-- A pessoa que vai receber um lead precisa estar ativa e ter a tela Comercial.
create function public.pode_receber_lead(p_pessoa_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.pessoas p
    where p.id = p_pessoa_id
      and p.ativo
      and 'comercial' = any (public.telas_efetivas(p.telas, p.papel_sistema))
  );
$$;

revoke all on function public.pode_receber_lead(uuid) from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- 9. Criar um lead
-- -----------------------------------------------------------------------------

create function public.criar_lead(
  p_mae_nome           text,
  p_telefone           text,
  p_dpp                date default null,
  p_maternidade_id     uuid default null,
  p_origem             public.origem_lead default 'outro',
  p_bebe_nome          text default null,
  p_origem_detalhe     text default null,
  p_vendedor_id        uuid default null,
  p_interesse_new_born boolean default false,
  p_observacao         text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pessoa_id uuid := public.pessoa_do_comercial();
  v_telefone  text := public.normalizar_telefone(p_telefone);
  v_existente uuid;
  v_vendedor  uuid := p_vendedor_id;
  v_id        uuid;
begin
  if nullif(btrim(coalesce(p_mae_nome, '')), '') is null then
    raise exception 'O nome da mãe é obrigatório.';
  end if;

  if v_telefone is null then
    raise exception 'Telefone inválido: use DDD e número.';
  end if;

  -- Um telefone, um lead aberto: devolve o que já existe em vez de duplicar.
  select l.id into v_existente
  from public.leads l
  where l.telefone = v_telefone
    and l.situacao not in ('ganho', 'perdido');

  if v_existente is not null then
    return jsonb_build_object('id', v_existente, 'ja_existia', true);
  end if;

  if v_vendedor is null and p_maternidade_id is not null then
    select vm.pessoa_id into v_vendedor
    from public.vendedores_da_maternidade vm
    where vm.maternidade_id = p_maternidade_id;
  end if;

  if v_vendedor is not null and not public.pode_receber_lead(v_vendedor) then
    raise exception 'Essa pessoa não pode receber lead: precisa estar ativa e ter a tela Comercial.';
  end if;

  insert into public.leads (
    mae_nome, bebe_nome, telefone, dpp, maternidade_id, origem, origem_detalhe,
    vendedor_id, interesse_new_born, observacao, criado_por
  )
  values (
    btrim(p_mae_nome), nullif(btrim(coalesce(p_bebe_nome, '')), ''), v_telefone, p_dpp,
    p_maternidade_id, coalesce(p_origem, 'outro'), nullif(btrim(coalesce(p_origem_detalhe, '')), ''),
    v_vendedor, coalesce(p_interesse_new_born, false), nullif(btrim(coalesce(p_observacao, '')), ''),
    v_pessoa_id
  )
  returning id into v_id;

  insert into public.eventos (lead_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    v_id, v_pessoa_id, 'lead_criado',
    jsonb_build_object('origem', coalesce(p_origem, 'outro'), 'vendedor_id', v_vendedor,
                       'maternidade_id', p_maternidade_id),
    now()
  );

  return jsonb_build_object('id', v_id, 'ja_existia', false);
end;
$$;

comment on function public.criar_lead(text, text, date, uuid, public.origem_lead, text, text, uuid, boolean, text) is
  'Cria um lead. O vendedor é o informado ou, sem ele, o da maternidade. Telefone com lead aberto devolve o existente ({id, ja_existia: true}) em vez de duplicar. Quem tem a tela Comercial.';

revoke all on function public.criar_lead(text, text, date, uuid, public.origem_lead, text, text, uuid, boolean, text) from public, anon;
grant execute on function public.criar_lead(text, text, date, uuid, public.origem_lead, text, text, uuid, boolean, text) to authenticated;


-- -----------------------------------------------------------------------------
-- 10. Editar os dados de um lead
-- -----------------------------------------------------------------------------

create function public.editar_lead(
  p_lead_id            uuid,
  p_mae_nome           text,
  p_telefone           text,
  p_dpp                date,
  p_maternidade_id     uuid,
  p_origem             public.origem_lead,
  p_bebe_nome          text default null,
  p_origem_detalhe     text default null,
  p_interesse_new_born boolean default false,
  p_observacao         text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pessoa_id uuid := public.pessoa_do_comercial();
  v_telefone  text := public.normalizar_telefone(p_telefone);
  v_antes     public.leads%rowtype;
  v_campos    text[] := '{}';
begin
  select * into v_antes from public.leads where id = p_lead_id for update;

  if not found then
    raise exception 'Lead não encontrado.';
  end if;

  if nullif(btrim(coalesce(p_mae_nome, '')), '') is null then
    raise exception 'O nome da mãe é obrigatório.';
  end if;

  if v_telefone is null then
    raise exception 'Telefone inválido: use DDD e número.';
  end if;

  if v_telefone <> v_antes.telefone
     and v_antes.situacao not in ('ganho', 'perdido')
     and exists (
       select 1 from public.leads l
       where l.telefone = v_telefone and l.id <> p_lead_id
         and l.situacao not in ('ganho', 'perdido')
     ) then
    raise exception 'Já existe um lead aberto com esse telefone.';
  end if;

  -- O evento diz QUE campos mudaram, nunca os valores (telefone e nome ficam
  -- fora de `eventos`).
  if btrim(p_mae_nome) is distinct from v_antes.mae_nome then v_campos := v_campos || 'mae_nome'; end if;
  if nullif(btrim(coalesce(p_bebe_nome, '')), '') is distinct from v_antes.bebe_nome then v_campos := v_campos || 'bebe_nome'; end if;
  if v_telefone is distinct from v_antes.telefone then v_campos := v_campos || 'telefone'; end if;
  if p_dpp is distinct from v_antes.dpp then v_campos := v_campos || 'dpp'; end if;
  if p_maternidade_id is distinct from v_antes.maternidade_id then v_campos := v_campos || 'maternidade'; end if;
  if p_origem is distinct from v_antes.origem then v_campos := v_campos || 'origem'; end if;
  if nullif(btrim(coalesce(p_origem_detalhe, '')), '') is distinct from v_antes.origem_detalhe then v_campos := v_campos || 'origem_detalhe'; end if;
  if coalesce(p_interesse_new_born, false) is distinct from v_antes.interesse_new_born then v_campos := v_campos || 'interesse_new_born'; end if;
  if nullif(btrim(coalesce(p_observacao, '')), '') is distinct from v_antes.observacao then v_campos := v_campos || 'observacao'; end if;

  if cardinality(v_campos) = 0 then
    return;
  end if;

  update public.leads
     set mae_nome           = btrim(p_mae_nome),
         bebe_nome          = nullif(btrim(coalesce(p_bebe_nome, '')), ''),
         telefone           = v_telefone,
         dpp                = p_dpp,
         maternidade_id     = p_maternidade_id,
         origem             = coalesce(p_origem, v_antes.origem),
         origem_detalhe     = nullif(btrim(coalesce(p_origem_detalhe, '')), ''),
         interesse_new_born = coalesce(p_interesse_new_born, false),
         observacao         = nullif(btrim(coalesce(p_observacao, '')), '')
   where id = p_lead_id;

  insert into public.eventos (lead_id, pessoa_id, tipo, payload, ocorrido_em)
  values (p_lead_id, v_pessoa_id, 'lead_editado', jsonb_build_object('campos', v_campos), now());
end;
$$;

comment on function public.editar_lead(uuid, text, text, date, uuid, public.origem_lead, text, text, boolean, text) is
  'Muda os dados do lead (nome, telefone, DPP, maternidade, origem, New Born, observação). Situação e vendedor têm RPC própria. O evento diz só QUE campos mudaram.';

revoke all on function public.editar_lead(uuid, text, text, date, uuid, public.origem_lead, text, text, boolean, text) from public, anon;
grant execute on function public.editar_lead(uuid, text, text, date, uuid, public.origem_lead, text, text, boolean, text) to authenticated;


-- -----------------------------------------------------------------------------
-- 11. Registrar um contato — o gesto do dia a dia
-- -----------------------------------------------------------------------------

create function public.registrar_contato_do_lead(
  p_lead_id            uuid,
  p_canal              public.canal_contato_lead,
  p_resultado          public.resultado_contato_lead,
  p_nota               text default null,
  p_proximo_retorno_em timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pessoa_id uuid := public.pessoa_do_comercial();
  v_lead      public.leads%rowtype;
  v_fase      public.fase_do_lead;
  v_situacao  public.situacao_lead;
  v_id        uuid;
begin
  select * into v_lead from public.leads where id = p_lead_id for update;

  if not found then
    raise exception 'Lead não encontrado.';
  end if;

  if v_lead.situacao in ('ganho', 'perdido') then
    raise exception 'Lead encerrado — reabra antes de registrar contato.';
  end if;

  if p_canal is null or p_resultado is null then
    raise exception 'Diga o canal e o resultado do contato.';
  end if;

  -- A fase do momento, pelo relógio do servidor: o retorno da repescagem é
  -- contado por ela, e o prazo pode mudar depois se a DPP mudar.
  v_fase := case
    when v_lead.dpp is not null
         and v_lead.dpp - public.dias_de_prazo_da_venda() < (now() at time zone 'America/Sao_Paulo')::date
      then 'repescagem'::public.fase_do_lead
    else 'venda'::public.fase_do_lead
  end;

  insert into public.contatos_do_lead (lead_id, pessoa_id, canal, resultado, fase, nota)
  values (p_lead_id, v_pessoa_id, p_canal, p_resultado, v_fase, nullif(btrim(coalesce(p_nota, '')), ''))
  returning id into v_id;

  -- Novo vira em contato no primeiro toque; a proposta enviada vira negociação.
  v_situacao := case
    when p_resultado = 'mandou_proposta' then 'negociando'::public.situacao_lead
    when v_lead.situacao = 'novo' then 'em_contato'::public.situacao_lead
    else v_lead.situacao
  end;

  -- O retorno combinado foi cumprido por este contato: vale o próximo (ou nenhum).
  update public.leads
     set situacao           = v_situacao,
         proximo_retorno_em = p_proximo_retorno_em
   where id = p_lead_id;

  insert into public.eventos (lead_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    p_lead_id, v_pessoa_id, 'lead_contato',
    jsonb_build_object('contato_id', v_id, 'canal', p_canal, 'resultado', p_resultado,
                       'fase', v_fase, 'situacao_anterior', v_lead.situacao, 'situacao', v_situacao),
    now()
  );

  return v_id;
end;
$$;

comment on function public.registrar_contato_do_lead(uuid, public.canal_contato_lead, public.resultado_contato_lead, text, timestamptz) is
  'Registra um contato no lead (relógio do servidor), carimba a fase (venda ou repescagem), move a situação (novo → em contato; proposta → negociando) e troca o próximo retorno. Recusa lead encerrado.';

revoke all on function public.registrar_contato_do_lead(uuid, public.canal_contato_lead, public.resultado_contato_lead, text, timestamptz) from public, anon;
grant execute on function public.registrar_contato_do_lead(uuid, public.canal_contato_lead, public.resultado_contato_lead, text, timestamptz) to authenticated;


-- -----------------------------------------------------------------------------
-- 12. Agendar o próximo retorno
-- -----------------------------------------------------------------------------

create function public.agendar_retorno_do_lead(p_lead_id uuid, p_quando timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pessoa_id uuid := public.pessoa_do_comercial();
  v_lead      public.leads%rowtype;
begin
  select * into v_lead from public.leads where id = p_lead_id for update;

  if not found then
    raise exception 'Lead não encontrado.';
  end if;

  if v_lead.situacao in ('ganho', 'perdido') then
    raise exception 'Lead encerrado — reabra antes de agendar retorno.';
  end if;

  if v_lead.proximo_retorno_em is not distinct from p_quando then
    return;
  end if;

  update public.leads set proximo_retorno_em = p_quando where id = p_lead_id;

  insert into public.eventos (lead_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    p_lead_id, v_pessoa_id, 'lead_retorno_agendado',
    jsonb_build_object('antes', v_lead.proximo_retorno_em, 'depois', p_quando),
    now()
  );
end;
$$;

comment on function public.agendar_retorno_do_lead(uuid, timestamptz) is
  'Marca (ou, com nulo, tira) a data PLANEJADA do próximo retorno. Recusa lead encerrado.';

revoke all on function public.agendar_retorno_do_lead(uuid, timestamptz) from public, anon;
grant execute on function public.agendar_retorno_do_lead(uuid, timestamptz) to authenticated;


-- -----------------------------------------------------------------------------
-- 13. Passar o lead para outra pessoa
-- -----------------------------------------------------------------------------

create function public.passar_lead(p_lead_id uuid, p_para_pessoa_id uuid, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pessoa_id uuid := public.pessoa_do_comercial();
  v_lead      public.leads%rowtype;
begin
  select * into v_lead from public.leads where id = p_lead_id for update;

  if not found then
    raise exception 'Lead não encontrado.';
  end if;

  if p_para_pessoa_id is null or not public.pode_receber_lead(p_para_pessoa_id) then
    raise exception 'Essa pessoa não pode receber lead: precisa estar ativa e ter a tela Comercial.';
  end if;

  if v_lead.vendedor_id is not distinct from p_para_pessoa_id then
    return;
  end if;

  update public.leads set vendedor_id = p_para_pessoa_id where id = p_lead_id;

  -- O de/para é o histórico de quem trabalhou o lead (o espírito da 3.2).
  insert into public.eventos (lead_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    p_lead_id, v_pessoa_id, 'lead_passado',
    jsonb_build_object('de', v_lead.vendedor_id, 'para', p_para_pessoa_id,
                       'motivo', nullif(btrim(coalesce(p_motivo, '')), '')),
    now()
  );
end;
$$;

comment on function public.passar_lead(uuid, uuid, text) is
  'Troca o vendedor do lead, com o de/para em eventos. A pessoa precisa estar ativa e ter a tela Comercial.';

revoke all on function public.passar_lead(uuid, uuid, text) from public, anon;
grant execute on function public.passar_lead(uuid, uuid, text) to authenticated;


-- -----------------------------------------------------------------------------
-- 14. Encerrar e reabrir
-- -----------------------------------------------------------------------------

create function public.marcar_lead_perdido(
  p_lead_id uuid,
  p_motivo  public.motivo_perda_lead,
  p_texto   text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pessoa_id uuid := public.pessoa_do_comercial();
  v_lead      public.leads%rowtype;
  v_texto     text := nullif(btrim(coalesce(p_texto, '')), '');
begin
  select * into v_lead from public.leads where id = p_lead_id for update;

  if not found then
    raise exception 'Lead não encontrado.';
  end if;

  if v_lead.situacao in ('ganho', 'perdido') then
    raise exception 'Este lead já está encerrado.';
  end if;

  if p_motivo is null then
    raise exception 'Diga por que o lead foi perdido.';
  end if;

  if p_motivo = 'outro' and v_texto is null then
    raise exception 'Escreva o motivo em "outro".';
  end if;

  update public.leads
     set situacao           = 'perdido',
         motivo_perda       = p_motivo,
         motivo_perda_texto = v_texto,
         proximo_retorno_em = null,
         encerrado_em       = now()
   where id = p_lead_id;

  insert into public.eventos (lead_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    p_lead_id, v_pessoa_id, 'lead_perdido',
    jsonb_build_object('motivo', p_motivo, 'situacao_anterior', v_lead.situacao),
    now()
  );
end;
$$;

comment on function public.marcar_lead_perdido(uuid, public.motivo_perda_lead, text) is
  'Encerra o lead como perdido (não quis, já nasceu, sem WhatsApp, sem resposta, outro com texto).';

revoke all on function public.marcar_lead_perdido(uuid, public.motivo_perda_lead, text) from public, anon;
grant execute on function public.marcar_lead_perdido(uuid, public.motivo_perda_lead, text) to authenticated;

-- Até a fase B ("Fechar venda" criando o caso), a venda fechada se marca aqui,
-- com ou sem o caso que já foi criado no Calendário.
create function public.marcar_lead_ganho(p_lead_id uuid, p_caso_id uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pessoa_id uuid := public.pessoa_do_comercial();
  v_lead      public.leads%rowtype;
begin
  select * into v_lead from public.leads where id = p_lead_id for update;

  if not found then
    raise exception 'Lead não encontrado.';
  end if;

  if v_lead.situacao in ('ganho', 'perdido') then
    raise exception 'Este lead já está encerrado.';
  end if;

  if p_caso_id is not null and not exists (select 1 from public.casos c where c.id = p_caso_id) then
    raise exception 'Caso não encontrado.';
  end if;

  update public.leads
     set situacao           = 'ganho',
         caso_id            = p_caso_id,
         proximo_retorno_em = null,
         encerrado_em       = now()
   where id = p_lead_id;

  -- Quem fechou e quem tinha o lead: o relatório de conversão por vendedor lê
  -- daqui (a repescagem fecha venda também).
  insert into public.eventos (lead_id, caso_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    p_lead_id, p_caso_id, v_pessoa_id, 'lead_ganho',
    jsonb_build_object('vendedor_id', v_lead.vendedor_id, 'situacao_anterior', v_lead.situacao,
                       'fase', case
                         when v_lead.dpp is not null
                              and v_lead.dpp - public.dias_de_prazo_da_venda() < (now() at time zone 'America/Sao_Paulo')::date
                           then 'repescagem' else 'venda' end),
    now()
  );
end;
$$;

comment on function public.marcar_lead_ganho(uuid, uuid) is
  'Encerra o lead como venda, ligado (ou não ainda) ao caso. A fase B troca isto por fechar_lead, que cria o caso.';

revoke all on function public.marcar_lead_ganho(uuid, uuid) from public, anon;
grant execute on function public.marcar_lead_ganho(uuid, uuid) to authenticated;

create function public.reabrir_lead(p_lead_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pessoa_id uuid := public.pessoa_do_comercial();
  v_lead      public.leads%rowtype;
  v_motivo    text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  select * into v_lead from public.leads where id = p_lead_id for update;

  if not found then
    raise exception 'Lead não encontrado.';
  end if;

  if v_lead.situacao not in ('ganho', 'perdido') then
    raise exception 'Este lead já está aberto.';
  end if;

  if v_motivo is null then
    raise exception 'Diga por que o lead está sendo reaberto.';
  end if;

  -- Venda com caso não se desfaz por aqui: o caso existe, e quem o desfaz é o
  -- cancelamento do caso.
  if v_lead.caso_id is not null then
    raise exception 'Este lead virou caso — cancele o caso em vez de reabrir o lead.';
  end if;

  if exists (
    select 1 from public.leads l
    where l.telefone = v_lead.telefone and l.id <> p_lead_id
      and l.situacao not in ('ganho', 'perdido')
  ) then
    raise exception 'Já existe outro lead aberto com esse telefone.';
  end if;

  update public.leads
     set situacao           = 'em_contato',
         motivo_perda       = null,
         motivo_perda_texto = null,
         encerrado_em       = null
   where id = p_lead_id;

  insert into public.eventos (lead_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    p_lead_id, v_pessoa_id, 'lead_reaberto',
    jsonb_build_object('situacao_anterior', v_lead.situacao, 'motivo', v_motivo),
    now()
  );
end;
$$;

comment on function public.reabrir_lead(uuid, text) is
  'Devolve um lead encerrado para "em contato", com motivo. Recusa o que virou caso e o telefone que já tem outro lead aberto.';

revoke all on function public.reabrir_lead(uuid, text) from public, anon;
grant execute on function public.reabrir_lead(uuid, text) to authenticated;


-- -----------------------------------------------------------------------------
-- 15. O vendedor de cada maternidade — cadastro da gestão
-- -----------------------------------------------------------------------------

create function public.definir_vendedor_da_maternidade(p_maternidade_id uuid, p_pessoa_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pessoa_id uuid;
  v_antes     uuid;
begin
  select p.id into v_pessoa_id
  from public.pessoas p
  where p.auth_user_id = auth.uid()
    and p.ativo;

  if v_pessoa_id is null or not public.tem_tela('equipe') then
    raise exception 'Quem define o vendedor de cada maternidade é quem tem a tela Equipe.';
  end if;

  if not exists (select 1 from public.maternidades m where m.id = p_maternidade_id) then
    raise exception 'Maternidade não encontrada.';
  end if;

  if p_pessoa_id is not null and not public.pode_receber_lead(p_pessoa_id) then
    raise exception 'Essa pessoa não pode receber lead: precisa estar ativa e ter a tela Comercial.';
  end if;

  select vm.pessoa_id into v_antes
  from public.vendedores_da_maternidade vm
  where vm.maternidade_id = p_maternidade_id;

  if v_antes is not distinct from p_pessoa_id then
    return;
  end if;

  if p_pessoa_id is null then
    delete from public.vendedores_da_maternidade where maternidade_id = p_maternidade_id;
  else
    insert into public.vendedores_da_maternidade (maternidade_id, pessoa_id, definido_por)
    values (p_maternidade_id, p_pessoa_id, v_pessoa_id)
    on conflict (maternidade_id) do update
      set pessoa_id = excluded.pessoa_id, definido_por = excluded.definido_por;
  end if;

  insert into public.eventos (pessoa_id, tipo, payload, ocorrido_em)
  values (
    v_pessoa_id, 'vendedor_da_maternidade_definido',
    jsonb_build_object('maternidade_id', p_maternidade_id, 'antes', v_antes, 'depois', p_pessoa_id),
    now()
  );
end;
$$;

comment on function public.definir_vendedor_da_maternidade(uuid, uuid) is
  'Define (ou, com nulo, tira) quem vende os leads de uma maternidade. Quem tem a tela Equipe.';

revoke all on function public.definir_vendedor_da_maternidade(uuid, uuid) from public, anon;
grant execute on function public.definir_vendedor_da_maternidade(uuid, uuid) to authenticated;
