-- =============================================================================
-- A TABELA DE PREÇOS DOS PACOTES, E A VENDA COM AS DUAS CONDIÇÕES
-- (27/10/2026, pedido do gestor)
-- =============================================================================
--
-- O gestor desenhou no quadro como quer a venda no "Novo caso": escolhido o
-- pacote, a linha vem pronta — "BABY REELS → até 6x R$ 265,00 ou R$ 1.490,00 no
-- Pix" —, bem à vista, "para passar para o cliente e para o vendedor saber mais
-- fácil como é que vai funcionar a cobrança". Um botão EDITAR troca os valores
-- quando há negociação.
--
-- 1. OS PREÇOS SÃO POR PACOTE E MATERNIDADE (`precos_dos_pacotes`). A tabela do
--    gestor tem dois grupos — Brígida, Fátima, Santa Cruz, Mackenzie e Marilac
--    num, Graças e Curitiba no outro —, e cada linha diz em quantas vezes no
--    cartão, o valor de cada parcela e o valor no Pix. Uma linha por pacote e
--    maternidade, e não por "grupo": o grupo é um jeito de escrever a tabela, e a
--    primeira maternidade que fugir dele seria uma exceção sem lugar.
--    FICAM SEM PREÇO, de propósito: BIRTH, BIRTH + REELS, BASIC + REELS, NEWBORN e
--    EVENTO (a tabela não os cobre) e a maternidade ROCIO (decisão do gestor:
--    valor à mão). Sem linha, a venda volta a ser digitada.
--    A LEITURA é de quem vê a venda — o mesmo par de `vendas_do_caso`. NÃO HÁ
--    ESCRITA pelo app ainda: preço novo é migration nova, até existir a tela.
--    O seed local repete estas linhas, porque no `db reset` os pacotes originais
--    só nascem no seed, depois das migrations.
--
-- 2. A LINHA DE VENDA GUARDA AS DUAS CONDIÇÕES (decisão do gestor, perguntado):
--    `parcelas` passa a ser o "ATÉ Nx" e `valor_parcela`, o valor de cada uma; o
--    `valor` de sempre é o do PIX — e é ele que conta como vendido no relatório
--    (decisão do gestor). Como o cliente pagou deixou de ser perguntado na hora.
--    As linhas de 26/10 lançadas com `forma_pagamento` ficam como estão: lá
--    `parcelas` é em quantas vezes ele pagou e `valor`, o total. As duas formas
--    não se misturam numa linha (constraint).
--
-- 3. `registrar_venda_do_caso` ganha `p_valor_parcela` (DROP + CREATE, com o
--    REVOKE de PUBLIC e de anon repetido). `p_forma` continua aceito, para a tela
--    antiga em cache não perder a venda.
-- =============================================================================

create table public.precos_dos_pacotes (
  id             uuid primary key default gen_random_uuid(),
  pacote_id      uuid not null references public.pacotes (id) on delete restrict,
  maternidade_id uuid not null references public.maternidades (id) on delete restrict,
  -- "Até 6x": o máximo de parcelas no cartão.
  parcelas       smallint not null check (parcelas between 1 and 24),
  valor_parcela  numeric(10, 2) not null check (valor_parcela > 0),
  valor_pix      numeric(10, 2) not null check (valor_pix > 0),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint precos_dos_pacotes_um_por_pacote_e_maternidade unique (pacote_id, maternidade_id)
);

comment on table public.precos_dos_pacotes is
  'A tabela de preços do gestor (27/10/2026): por pacote e maternidade, até N vezes de tanto no cartão ou tanto no Pix. Preenche a venda do caso; o Editar da tela troca os valores numa negociação.';

-- A unique já indexa pelo pacote; a maternidade ganha o seu.
create index precos_dos_pacotes_maternidade_id_idx on public.precos_dos_pacotes (maternidade_id);

create trigger precos_dos_pacotes_set_updated_at
  before update on public.precos_dos_pacotes
  for each row execute function public.set_updated_at();

alter table public.precos_dos_pacotes enable row level security;

create policy precos_dos_pacotes_select_quem_vende
  on public.precos_dos_pacotes
  for select
  to authenticated
  using ((select public.eh_atendimento()) or (select public.eh_adm()) or (select public.tem_tela('comercial')));

grant select on public.precos_dos_pacotes to authenticated;

-- OS PREÇOS DE 27/10/2026, como o gestor mandou. "Master + Foto Livro" é o
-- MASTER + ÁLBUM; "Basic Reels" é o BASIC REELS (sem o "+").
insert into public.precos_dos_pacotes (pacote_id, maternidade_id, parcelas, valor_parcela, valor_pix)
select p.id, m.id, t.parcelas, t.valor_parcela, t.valor_pix
from (values
  ('a', 'basic',                6, 152.00,  850.00),
  ('a', 'standard',             6, 177.00,  990.00),
  ('a', 'baby-reels',           6, 265.00, 1490.00),
  ('a', 'master',               6, 315.00, 1790.00),
  ('a', 'master-album',        10, 296.00, 2960.00),
  ('a', 'basic-reels-contrato', 6, 205.00, 1200.00),
  ('b', 'basic',                6, 159.00,  880.00),
  ('b', 'standard',             6, 184.00, 1029.00),
  ('b', 'baby-reels',           6, 271.00, 1530.00),
  ('b', 'master',               6, 322.00, 1830.00),
  ('b', 'master-album',        10, 299.00, 2990.00),
  ('b', 'basic-reels-contrato', 6, 205.00, 1200.00)
) as t(grupo, slug, parcelas, valor_parcela, valor_pix)
join (values
  ('a', 'GNDI'), ('a', 'HNSF'), ('a', 'HSC'), ('a', 'MACKENZIE'), ('a', 'MARILAC'),
  ('b', 'HNSG'), ('b', 'CWB')
) as g(grupo, sigla) on g.grupo = t.grupo
join public.pacotes p on p.slug = t.slug
join public.maternidades m on m.sigla = g.sigla
on conflict (pacote_id, maternidade_id) do nothing;


-- -----------------------------------------------------------------------------
-- 2. A venda com as duas condições
-- -----------------------------------------------------------------------------

alter table public.vendas_do_caso
  add column valor_parcela numeric(10, 2) check (valor_parcela > 0),
  drop constraint vendas_do_caso_forma_e_parcelas_juntas,
  -- As parcelas dizem uma de duas coisas: em quantas vezes ele PAGOU (a linha de
  -- 26/10, com a forma) ou em ATÉ quantas pode pagar (a de hoje, com o valor da
  -- parcela). Sem uma das duas, o número não diz nada; com as duas, diria duas.
  add constraint vendas_do_caso_parcelas_tem_sentido
    check ((parcelas is null) = (forma_pagamento is null and valor_parcela is null)),
  add constraint vendas_do_caso_forma_ou_condicao
    check (forma_pagamento is null or valor_parcela is null);

comment on column public.vendas_do_caso.valor_parcela is
  'O valor de cada parcela no cartão, "até `parcelas` vezes" (27/10/2026). Com ele, `valor` é o do Pix — o que conta como vendido.';
comment on column public.vendas_do_caso.parcelas is
  'Com `valor_parcela`: ATÉ quantas vezes no cartão (27/10/2026). Com `forma_pagamento` (as linhas de 26/10): em quantas vezes foi pago.';

drop function public.registrar_venda_do_caso(uuid, public.item_de_venda, numeric, text, public.forma_de_pagamento, integer);

create function public.registrar_venda_do_caso(
  p_caso_id       uuid,
  p_item          public.item_de_venda,
  p_valor         numeric,
  p_descricao     text default null,
  p_forma         public.forma_de_pagamento default null,
  p_parcelas      integer default null,
  p_valor_parcela numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pessoa_id uuid;
  v_descricao text := nullif(btrim(coalesce(p_descricao, '')), '');
  -- Forma sem parcelas é à vista (a linha de 26/10).
  v_parcelas  integer := case when p_forma is not null then coalesce(p_parcelas, 1) else p_parcelas end;
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

  if p_forma is not null and p_valor_parcela is not null then
    raise exception 'A venda leva a condição do cartão OU a forma em que foi paga, não as duas.';
  end if;

  if p_valor_parcela is not null and round(p_valor_parcela, 2) <= 0 then
    raise exception 'O valor da parcela precisa ser maior que zero.';
  end if;

  if p_valor_parcela is not null and p_parcelas is null then
    raise exception 'Diga em até quantas vezes vale o valor da parcela.';
  end if;

  if p_forma is null and p_valor_parcela is null and p_parcelas is not null then
    raise exception 'Diga o valor de cada parcela.';
  end if;

  if v_parcelas is not null and v_parcelas not between 1 and 24 then
    raise exception 'As parcelas vão de 1 (à vista) a 24.';
  end if;

  insert into public.vendas_do_caso
    (caso_id, item, descricao, valor, registrado_por, forma_pagamento, parcelas, valor_parcela)
  values
    (p_caso_id, p_item, v_descricao, round(p_valor, 2), v_pessoa_id, p_forma, v_parcelas, round(p_valor_parcela, 2))
  returning id into v_id;

  -- Sem valor, descrição nem condição: `eventos` é lido pela equipe inteira.
  insert into public.eventos (caso_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    p_caso_id, v_pessoa_id, 'venda_registrada',
    jsonb_build_object('venda_id', v_id, 'item', p_item),
    now()
  );

  return v_id;
end;
$$;

comment on function public.registrar_venda_do_caso(uuid, public.item_de_venda, numeric, text, public.forma_de_pagamento, integer, numeric) is
  'Lança uma linha de venda no caso: o valor no Pix e, desde 27/10/2026, até quantas vezes de quanto no cartão. Atendimento, adm ou quem tem a tela Comercial.';

revoke all on function public.registrar_venda_do_caso(uuid, public.item_de_venda, numeric, text, public.forma_de_pagamento, integer, numeric) from public;
revoke all on function public.registrar_venda_do_caso(uuid, public.item_de_venda, numeric, text, public.forma_de_pagamento, integer, numeric) from anon;
grant execute on function public.registrar_venda_do_caso(uuid, public.item_de_venda, numeric, text, public.forma_de_pagamento, integer, numeric) to authenticated;


-- -----------------------------------------------------------------------------
-- 3. O "Pagamento" do relatório diz a condição
-- -----------------------------------------------------------------------------

-- Mesma assinatura e mesmo retorno: só o texto de `pagamentos` aprende a linha
-- nova — "Até 6x de R$ 265,00 ou Pix". `pix` e `cartao` continuam somando pela
-- FORMA, então só falam das linhas de 26/10; a tela deixou de mostrá-los.
create or replace function public.venda_no_periodo(p_caso_id uuid, p_de date, p_ate date)
returns table (
  total        numeric,
  pix          numeric,
  cartao       numeric,
  primeiro_dia date,
  pagamentos   text
)
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(v.valor), 0),
         coalesce(sum(v.valor) filter (where v.forma_pagamento = 'pix'), 0),
         coalesce(sum(v.valor) filter (where v.forma_pagamento = 'cartao'), 0),
         min((v.created_at at time zone 'America/Sao_Paulo')::date),
         string_agg(distinct
           case
             when v.valor_parcela is not null then
               'Até ' || v.parcelas || 'x de R$ '
                 || translate(to_char(v.valor_parcela, 'FM999,999,990.00'), ',.', '.,') || ' ou Pix'
             when v.forma_pagamento = 'pix' then case when v.parcelas > 1 then 'Pix ' || v.parcelas || 'x' else 'Pix' end
             when v.forma_pagamento = 'cartao' then 'Cartão ' || v.parcelas || 'x'
             else 'Sem forma'
           end, ', ')
  from public.vendas_do_caso v
  where v.caso_id = p_caso_id
    and (p_de is null or (v.created_at at time zone 'America/Sao_Paulo')::date >= p_de)
    and (p_ate is null or (v.created_at at time zone 'America/Sao_Paulo')::date <= p_ate);
$$;
