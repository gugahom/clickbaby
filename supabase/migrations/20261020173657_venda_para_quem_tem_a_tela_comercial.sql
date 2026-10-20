-- A VENDA PARA QUEM TEM A TELA COMERCIAL (20/10/2026, pedido do gestor: "colocar
-- valor do pacote e etc para todos os usuários que tem comercial").
--
-- A 20261014104728 deu o valor vendido e o contrato a `eh_atendimento() or
-- eh_adm()` — um corte por PAPEL. Desde 30/09/2026 o acesso também é por TELA
-- (`pessoas.telas`), e a gestão concede a tela Comercial pessoa a pessoa: quem a
-- ganhou sem um desses papéis vendia sem poder lançar o que vendeu. Agora a tela
-- Comercial também lê e escreve a venda e o contrato — na RLS das duas tabelas e
-- nas três RPCs, recriadas iguais, só com a porta maior. É o arranjo de "a tela
-- dá o poder junto" dos Relatórios e da Equipe.
--
-- Nada muda para quem já podia. Valor e link continuam fora de `eventos`.

drop policy vendas_do_caso_select_atendimento_adm on public.vendas_do_caso;
create policy vendas_do_caso_select_quem_vende
  on public.vendas_do_caso
  for select
  to authenticated
  using ((select public.eh_atendimento()) or (select public.eh_adm()) or (select public.tem_tela('comercial')));

drop policy contratos_dos_casos_select_atendimento_adm on public.contratos_dos_casos;
create policy contratos_dos_casos_select_quem_vende
  on public.contratos_dos_casos
  for select
  to authenticated
  using ((select public.eh_atendimento()) or (select public.eh_adm()) or (select public.tem_tela('comercial')));

create or replace function public.registrar_venda_do_caso(
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

  if not (public.eh_atendimento() or public.eh_adm() or public.tem_tela('comercial')) then
    raise exception 'Quem lança o valor da venda é o atendimento, a gestão ou quem tem a tela Comercial.';
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
  'Lança uma linha de venda no caso (pacote ou venda a mais), com o valor. Atendimento, adm ou quem tem a tela Comercial.';

revoke all on function public.registrar_venda_do_caso(uuid, public.item_de_venda, numeric, text) from public;
revoke all on function public.registrar_venda_do_caso(uuid, public.item_de_venda, numeric, text) from anon;
grant execute on function public.registrar_venda_do_caso(uuid, public.item_de_venda, numeric, text) to authenticated;


-- -----------------------------------------------------------------------------
-- Apagar uma venda — não existe editar
-- -----------------------------------------------------------------------------

create or replace function public.remover_venda_do_caso(p_venda_id uuid)
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

  if not (public.eh_atendimento() or public.eh_adm() or public.tem_tela('comercial')) then
    raise exception 'Quem apaga o valor da venda é o atendimento, a gestão ou quem tem a tela Comercial.';
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
  'Apaga uma linha de venda do caso. Valor errado se corrige apagando e lançando de novo. Atendimento, adm ou quem tem a tela Comercial.';

revoke all on function public.remover_venda_do_caso(uuid) from public;
revoke all on function public.remover_venda_do_caso(uuid) from anon;
grant execute on function public.remover_venda_do_caso(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- O link do contrato — em branco tira
-- -----------------------------------------------------------------------------

create or replace function public.definir_contrato_do_caso(p_caso_id uuid, p_url text)
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

  if not (public.eh_atendimento() or public.eh_adm() or public.tem_tela('comercial')) then
    raise exception 'Quem informa o contrato é o atendimento, a gestão ou quem tem a tela Comercial.';
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
  'Grava, troca ou (em branco) tira o link do contrato do caso. O link não vai para eventos. Atendimento, adm ou quem tem a tela Comercial.';

revoke all on function public.definir_contrato_do_caso(uuid, text) from public;
revoke all on function public.definir_contrato_do_caso(uuid, text) from anon;
grant execute on function public.definir_contrato_do_caso(uuid, text) to authenticated;

comment on table public.vendas_do_caso is
  'O que foi vendido em cada caso, uma linha por item (pacote, Reels, New Born, Foto/Livro, outro), com o valor. Legível por atendimento, adm e quem tem a tela Comercial; escrita só por registrar_venda_do_caso e remover_venda_do_caso.';
comment on table public.contratos_dos_casos is
  'O link do contrato de cada caso. Dá acesso a documento com dados da família: legível por atendimento, adm e quem tem a tela Comercial, fora de eventos e de log. Escrita só por definir_contrato_do_caso.';
