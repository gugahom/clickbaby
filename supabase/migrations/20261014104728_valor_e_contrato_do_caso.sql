-- =============================================================================
-- O VALOR DA VENDA E O CONTRATO DO CASO (14/10/2026, pedido do gestor)
-- =============================================================================
--
-- "Seria importante se a gente tivesse um campo aqui onde a gente conseguisse
-- lançar o valor do pacote (…) depois ele pode vender o Reels e daí ele poderia
-- ir adicionando as vendas adicionais." E o link do contrato, "para ele
-- consultar". Lançados no Calendário, ao criar ou editar o caso, e vistos na
-- confirmação da entrega — quem entrega é o administrativo, que hoje busca o
-- valor e o contrato no WhatsApp para fazer a cobrança.
--
-- ISTO REVISA UMA REGRA ESCRITA. Desde 20/08/2026 o sistema não guardava nada
-- de RECEITA ("sem receita, só despesa", CLAUDE.md seção 3.5 e 12). O pedido é
-- explícito e é do gestor, que é o dono dessa decisão. O que entra é o VALOR
-- VENDIDO por caso; `status_financeiro` continua fora, e com ele "pago",
-- "margem" e "fechamento de mês". A tela do financeiro (a previsão por mês) e a
-- do comercial ficam para depois, por decisão dele.
--
-- Decisões do gestor, perguntado:
--   * UMA LISTA, não um campo: uma linha para o pacote e uma para cada venda a
--     mais (Reels, New Born, Foto/Livro, outro), cada uma com o seu valor; o
--     total é a soma. Mesmo arranjo das despesas: não existe editar — valor
--     errado se apaga e se lança de novo.
--   * QUEM VÊ é todo papel MENOS `operador` — atendimento, comercial,
--     coordenação, financeiro, gestão (`eh_atendimento() or eh_adm()`), os
--     mesmos que veem o Calendário e confirmam a entrega. O BANCO esconde, não
--     só a tela: por isso duas tabelas próprias, e não colunas em `casos`, que
--     toda pessoa ativa lê pela view do Quadro.
--
-- O QUE NÃO VAI PARA `eventos`: o valor e o link. `eventos` é lido por toda
-- pessoa ativa, fotógrafas inclusive — gravar ali o que a RLS esconde abriria
-- a porta dos fundos. O evento diz QUE houve uma venda de Reels; quanto, só a
-- tabela sabe. O link do contrato é tratado como o link de entrega (seção 10):
-- dá acesso a documento com dados da família, e não vai para log nenhum.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. As vendas
-- -----------------------------------------------------------------------------

create type public.item_de_venda as enum ('pacote', 'reels', 'new_born', 'foto_livro', 'outro');

comment on type public.item_de_venda is
  'O que foi vendido numa linha de vendas_do_caso: o pacote do contrato ou uma venda a mais.';

create table public.vendas_do_caso (
  id             uuid primary key default gen_random_uuid(),
  caso_id        uuid not null references public.casos (id) on delete restrict,
  item           public.item_de_venda not null,
  descricao      text check (descricao is null or btrim(descricao) <> ''),
  valor          numeric(10, 2) not null check (valor > 0),
  registrado_por uuid not null references public.pessoas (id) on delete restrict,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint vendas_do_caso_outro_tem_descricao check (item <> 'outro' or descricao is not null)
);

comment on table public.vendas_do_caso is
  'O que foi vendido em cada caso, uma linha por item (pacote, Reels, New Born, Foto/Livro, outro), com o valor. Legível só por atendimento e adm; escrita só por registrar_venda_do_caso e remover_venda_do_caso.';

create index vendas_do_caso_caso_id_idx on public.vendas_do_caso (caso_id);
create index vendas_do_caso_registrado_por_idx on public.vendas_do_caso (registrado_por);

create trigger vendas_do_caso_set_updated_at
  before update on public.vendas_do_caso
  for each row execute function public.set_updated_at();

alter table public.vendas_do_caso enable row level security;

create policy vendas_do_caso_select_atendimento_adm
  on public.vendas_do_caso
  for select
  to authenticated
  using ((select public.eh_atendimento()) or (select public.eh_adm()));

grant select on public.vendas_do_caso to authenticated;


-- -----------------------------------------------------------------------------
-- 2. O contrato — um link por caso
-- -----------------------------------------------------------------------------

create table public.contratos_dos_casos (
  caso_id      uuid primary key references public.casos (id) on delete restrict,
  url          text not null check (url ~* '^https?://\S+$'),
  definido_por uuid not null references public.pessoas (id) on delete restrict,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.contratos_dos_casos is
  'O link do contrato de cada caso. Dá acesso a documento com dados da família: legível só por atendimento e adm, fora de eventos e de log. Escrita só por definir_contrato_do_caso.';

create index contratos_dos_casos_definido_por_idx on public.contratos_dos_casos (definido_por);

create trigger contratos_dos_casos_set_updated_at
  before update on public.contratos_dos_casos
  for each row execute function public.set_updated_at();

alter table public.contratos_dos_casos enable row level security;

create policy contratos_dos_casos_select_atendimento_adm
  on public.contratos_dos_casos
  for select
  to authenticated
  using ((select public.eh_atendimento()) or (select public.eh_adm()));

grant select on public.contratos_dos_casos to authenticated;


-- -----------------------------------------------------------------------------
-- 3. Lançar uma venda
-- -----------------------------------------------------------------------------

create function public.registrar_venda_do_caso(
  p_caso_id   uuid,
  p_item      public.item_de_venda,
  p_valor     numeric,
  p_descricao text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pessoa_id uuid;
  v_descricao text := nullif(btrim(coalesce(p_descricao, '')), '');
  v_id        uuid;
begin
  select p.id into v_pessoa_id
  from public.pessoas p
  where p.auth_user_id = auth.uid()
    and p.ativo;

  if v_pessoa_id is null then
    raise exception 'Usuário autenticado não corresponde a nenhuma pessoa ativa.';
  end if;

  if not (public.eh_atendimento() or public.eh_adm()) then
    raise exception 'Quem lança o valor da venda é o atendimento ou a gestão.';
  end if;

  if not exists (select 1 from public.casos c where c.id = p_caso_id) then
    raise exception 'caso % não encontrado.', p_caso_id;
  end if;

  if p_valor is null or round(p_valor, 2) <= 0 then
    raise exception 'O valor da venda precisa ser maior que zero.';
  end if;

  if p_item = 'outro' and v_descricao is null then
    raise exception 'Diga o que foi vendido em "outro".';
  end if;

  insert into public.vendas_do_caso (caso_id, item, descricao, valor, registrado_por)
  values (p_caso_id, p_item, v_descricao, round(p_valor, 2), v_pessoa_id)
  returning id into v_id;

  -- Sem o valor e sem a descrição: `eventos` é lido pela equipe inteira.
  insert into public.eventos (caso_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    p_caso_id, v_pessoa_id, 'venda_registrada',
    jsonb_build_object('venda_id', v_id, 'item', p_item),
    now()
  );

  return v_id;
end;
$$;

comment on function public.registrar_venda_do_caso(uuid, public.item_de_venda, numeric, text) is
  'Lança uma linha de venda no caso (pacote ou venda a mais), com o valor. Atendimento ou adm.';

revoke all on function public.registrar_venda_do_caso(uuid, public.item_de_venda, numeric, text) from public;
revoke all on function public.registrar_venda_do_caso(uuid, public.item_de_venda, numeric, text) from anon;
grant execute on function public.registrar_venda_do_caso(uuid, public.item_de_venda, numeric, text) to authenticated;


-- -----------------------------------------------------------------------------
-- 4. Apagar uma venda — não existe editar
-- -----------------------------------------------------------------------------

create function public.remover_venda_do_caso(p_venda_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pessoa_id uuid;
  v_venda     public.vendas_do_caso%rowtype;
begin
  select p.id into v_pessoa_id
  from public.pessoas p
  where p.auth_user_id = auth.uid()
    and p.ativo;

  if v_pessoa_id is null then
    raise exception 'Usuário autenticado não corresponde a nenhuma pessoa ativa.';
  end if;

  if not (public.eh_atendimento() or public.eh_adm()) then
    raise exception 'Quem apaga o valor da venda é o atendimento ou a gestão.';
  end if;

  select * into v_venda
  from public.vendas_do_caso v
  where v.id = p_venda_id
  for update;

  if not found then
    raise exception 'Esta venda já foi apagada.';
  end if;

  delete from public.vendas_do_caso where id = p_venda_id;

  insert into public.eventos (caso_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    v_venda.caso_id, v_pessoa_id, 'venda_removida',
    jsonb_build_object('venda_id', p_venda_id, 'item', v_venda.item),
    now()
  );
end;
$$;

comment on function public.remover_venda_do_caso(uuid) is
  'Apaga uma linha de venda do caso. Valor errado se corrige apagando e lançando de novo. Atendimento ou adm.';

revoke all on function public.remover_venda_do_caso(uuid) from public;
revoke all on function public.remover_venda_do_caso(uuid) from anon;
grant execute on function public.remover_venda_do_caso(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- 5. O link do contrato — em branco tira
-- -----------------------------------------------------------------------------

create function public.definir_contrato_do_caso(p_caso_id uuid, p_url text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pessoa_id uuid;
  v_url       text := nullif(btrim(coalesce(p_url, '')), '');
  v_antes     text;
begin
  select p.id into v_pessoa_id
  from public.pessoas p
  where p.auth_user_id = auth.uid()
    and p.ativo;

  if v_pessoa_id is null then
    raise exception 'Usuário autenticado não corresponde a nenhuma pessoa ativa.';
  end if;

  if not (public.eh_atendimento() or public.eh_adm()) then
    raise exception 'Quem informa o contrato é o atendimento ou a gestão.';
  end if;

  if not exists (select 1 from public.casos c where c.id = p_caso_id) then
    raise exception 'caso % não encontrado.', p_caso_id;
  end if;

  if v_url is not null and v_url !~* '^https?://\S+$' then
    raise exception 'O link do contrato precisa começar com http:// ou https:// e não ter espaço.';
  end if;

  select c.url into v_antes
  from public.contratos_dos_casos c
  where c.caso_id = p_caso_id
  for update;

  if v_antes is not distinct from v_url then
    return;
  end if;

  if v_url is null then
    delete from public.contratos_dos_casos where caso_id = p_caso_id;
  else
    insert into public.contratos_dos_casos (caso_id, url, definido_por)
    values (p_caso_id, v_url, v_pessoa_id)
    on conflict (caso_id) do update
      set url = excluded.url,
          definido_por = excluded.definido_por;
  end if;

  -- Sem o link: ele dá acesso ao contrato da família (seção 10).
  insert into public.eventos (caso_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    p_caso_id, v_pessoa_id,
    case when v_url is null then 'contrato_removido' else 'contrato_definido' end,
    jsonb_build_object('trocou', v_antes is not null and v_url is not null),
    now()
  );
end;
$$;

comment on function public.definir_contrato_do_caso(uuid, text) is
  'Grava, troca ou (em branco) tira o link do contrato do caso. O link não vai para eventos. Atendimento ou adm.';

revoke all on function public.definir_contrato_do_caso(uuid, text) from public;
revoke all on function public.definir_contrato_do_caso(uuid, text) from anon;
grant execute on function public.definir_contrato_do_caso(uuid, text) to authenticated;
