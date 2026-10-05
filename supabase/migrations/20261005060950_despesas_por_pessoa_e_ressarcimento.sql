-- =============================================================================
-- DESPESAS: A PESSOA DE CADA GASTO E O RESSARCIMENTO (05/10/2026, pedido do
-- gestor)
-- =============================================================================
--
-- Duas coisas para o FINANCEIRO, na tela de Despesas:
--
--   * O NOME DE CADA LANÇAMENTO. A tela mostrava o caso somado por tipo, e o
--     financeiro não via de quem era cada Uber — justamente quem ele tem de
--     ressarcir. Uma view nova, `despesas_detalhe`, traz uma linha por gasto com
--     DE QUEM FOI (`pessoa_id`, quem recebe o reembolso) e QUEM LANÇOU
--     (`registrado_por`): elas discordam quando o ADM lança pela fotógrafa.
--
--   * O RESSARCIMENTO. Uma caixa por gasto, "o financeiro saber que já ressarciu
--     o funcionário com aquele gasto". `despesas.ressarcido_em/_por` carimbados
--     no servidor (invariante 3.4) por `marcar_despesa_ressarcida`, que é de
--     quem tem a TELA Despesas — a tela dá o poder, como Relatórios e Equipe. A
--     caixa DESMARCA (um clique errado não pode virar pagamento registrado para
--     sempre), e as duas direções ficam em `eventos`.
--
-- E UMA TRAVA: gasto já ressarcido não se apaga no card. O dinheiro saiu; sumir
-- com o lançamento deixaria o financeiro sem o registro do que pagou. Desmarca o
-- ressarcimento antes, e aí apaga.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. As colunas do ressarcimento
-- -----------------------------------------------------------------------------

alter table public.despesas
  add column ressarcido_em  timestamptz,
  add column ressarcido_por uuid references public.pessoas (id) on delete restrict,
  add constraint despesas_ressarcimento_inteiro
    check ((ressarcido_em is null) = (ressarcido_por is null));

create index idx_despesas_ressarcido_por on public.despesas (ressarcido_por);

comment on column public.despesas.ressarcido_em is
  'Quando o financeiro marcou que devolveu este gasto a quem o pagou. Só por marcar_despesa_ressarcida; nulo = a ressarcir.';


-- -----------------------------------------------------------------------------
-- 2. Marcar e desmarcar
-- -----------------------------------------------------------------------------

create function public.marcar_despesa_ressarcida(p_despesa_id uuid, p_ressarcida boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quem    uuid;
  v_caso_id uuid;
  v_pessoa  uuid;
  v_valor   numeric(10, 2);
  v_antes   timestamptz;
begin
  if not public.tem_tela('despesas') then
    raise exception 'Só quem tem a tela Despesas marca o ressarcimento.';
  end if;

  select p.id into v_quem from public.pessoas p where p.auth_user_id = auth.uid();

  select d.caso_id, d.pessoa_id, d.valor, d.ressarcido_em
    into v_caso_id, v_pessoa, v_valor, v_antes
  from public.despesas d
  where d.id = p_despesa_id;

  if v_caso_id is null then
    raise exception 'Despesa % não encontrada.', p_despesa_id;
  end if;

  -- Já está como pedido: não faz nada, nem grava evento (dois cliques na mesma
  -- caixa não são dois pagamentos).
  if (v_antes is not null) = coalesce(p_ressarcida, false) then
    return;
  end if;

  if p_ressarcida then
    update public.despesas set ressarcido_em = now(), ressarcido_por = v_quem where id = p_despesa_id;
  else
    update public.despesas set ressarcido_em = null, ressarcido_por = null where id = p_despesa_id;
  end if;

  insert into public.eventos (caso_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    v_caso_id,
    v_quem,
    case when p_ressarcida then 'despesa_ressarcida' else 'ressarcimento_desfeito' end,
    jsonb_build_object('despesa_id', p_despesa_id, 'pessoa_id', v_pessoa, 'valor', v_valor, 'ressarcida_em', v_antes),
    now()
  );
end;
$$;

comment on function public.marcar_despesa_ressarcida(uuid, boolean) is
  'Marca (true) ou desmarca (false) que o financeiro devolveu este gasto a quem o pagou. Só a tela Despesas; carimbo do servidor; as duas direções vão para eventos.';

revoke all on function public.marcar_despesa_ressarcida(uuid, boolean) from public, anon;
grant execute on function public.marcar_despesa_ressarcida(uuid, boolean) to authenticated;


-- -----------------------------------------------------------------------------
-- 3. Gasto ressarcido não se apaga
-- -----------------------------------------------------------------------------

create or replace function public.remover_despesa(
  p_despesa_id uuid,
  p_motivo     text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_autor      uuid;
  v_caso_id    uuid;
  v_tipo       public.tipo_despesa;
  v_valor      numeric(10, 2);
  v_ressarcida timestamptz;
begin
  select p.id into v_autor
  from public.pessoas p
  where p.auth_user_id = auth.uid()
    and p.ativo;

  if v_autor is null then
    raise exception 'Usuário autenticado não corresponde a nenhuma pessoa ativa.';
  end if;

  select d.caso_id, d.tipo, d.valor, d.ressarcido_em
    into v_caso_id, v_tipo, v_valor, v_ressarcida
  from public.despesas d
  where d.id = p_despesa_id;

  if v_caso_id is null then
    raise exception 'Despesa % não encontrada.', p_despesa_id;
  end if;

  -- O DINHEIRO JÁ SAIU (05/10/2026): sumir com o lançamento deixaria o
  -- financeiro sem o registro do que pagou.
  if v_ressarcida is not null then
    raise exception 'Esta despesa já foi ressarcida. Peça ao financeiro para desmarcar o ressarcimento antes de apagar.';
  end if;

  delete from public.despesas where id = p_despesa_id;

  insert into public.eventos (caso_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    v_caso_id,
    v_autor,
    'despesa_removida',
    jsonb_build_object(
      'caso_id', v_caso_id,
      'tipo', v_tipo,
      'valor', v_valor,
      'motivo', nullif(btrim(coalesce(p_motivo, '')), '')
    ),
    now()
  );
end;
$$;


-- -----------------------------------------------------------------------------
-- 4. Uma linha por gasto, com os nomes
-- -----------------------------------------------------------------------------
--
-- `security_invoker`, como `despesas_por_caso`: a view respeita a RLS de quem
-- consulta. O dia é o do CASO (mês de atendimento), como no resto da tela.

create view public.despesas_detalhe
with (security_invoker = true) as
  select
    d.id,
    d.caso_id,
    (c.previsao_em at time zone 'America/Sao_Paulo')::date as dia,
    c.mae_nome,
    c.bebe_nome,
    pc.nome            as pacote_nome,
    m.sigla            as maternidade_sigla,
    c.status_operacional,
    d.tipo,
    d.momento,
    d.valor,
    d.descricao,
    d.registrado_em,
    d.pessoa_id,
    pe.nome            as pessoa_nome,
    d.registrado_por,
    rp.nome            as registrado_por_nome,
    d.ressarcido_em,
    rs.nome            as ressarcido_por_nome
  from public.despesas d
    join public.casos c on c.id = d.caso_id
    left join public.pacotes pc on pc.id = c.pacote_id
    left join public.maternidades m on m.id = c.maternidade_id
    left join public.pessoas pe on pe.id = d.pessoa_id
    left join public.pessoas rp on rp.id = d.registrado_por
    left join public.pessoas rs on rs.id = d.ressarcido_por;

comment on view public.despesas_detalhe is
  'Uma linha por gasto, com o caso, de quem foi, quem lançou e o ressarcimento. A tela de Despesas lê daqui desde 05/10/2026.';

grant select on public.despesas_detalhe to authenticated;
