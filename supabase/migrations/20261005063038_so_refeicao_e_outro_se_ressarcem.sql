-- =============================================================================
-- SÓ REFEIÇÃO E "OUTRO" SE RESSARCEM (05/10/2026, correção do gestor)
-- =============================================================================
--
-- A 20261005060950 pôs a caixa de ressarcimento em TODO gasto, e o gestor
-- corrigiu no mesmo dia: "as únicas taxas que são ressarcidas são as de
-- refeição e 'outros'". O Uber não passa por ressarcimento — é o gasto que vai
-- no cartão da empresa (seção 3.5 do CLAUDE.md) —, e uma caixa nele somaria
-- corridas no "A ressarcir" do financeiro, dinheiro que ninguém deve a ninguém.
--
-- DUAS TRAVAS, a mesma regra:
--   * a CONSTRAINT é a regra de verdade: gasto de Uber não fica ressarcido por
--     caminho nenhum;
--   * a RPC recusa antes, com uma frase que a tela consegue mostrar, em vez do
--     nome de uma constraint.
-- DESMARCAR continua aceito em qualquer tipo, para nada ficar trancado.
--
-- No remoto, no dia, NENHUM gasto estava marcado (a caixa tinha uma hora de
-- vida), então a constraint nasce sem nada a corrigir.
--
-- A lista tem espelho na tela (`TIPOS_RESSARCIVEIS`, em
-- features/despesas/api/useRelatorioDespesas.ts) e muda nos dois ou em nenhum.
-- =============================================================================

alter table public.despesas
  add constraint despesas_so_refeicao_e_outro_se_ressarcem
    check (ressarcido_em is null or tipo in ('refeicao', 'outro'));


create or replace function public.marcar_despesa_ressarcida(p_despesa_id uuid, p_ressarcida boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quem    uuid;
  v_caso_id uuid;
  v_pessoa  uuid;
  v_tipo    public.tipo_despesa;
  v_valor   numeric(10, 2);
  v_antes   timestamptz;
begin
  if not public.tem_tela('despesas') then
    raise exception 'Só quem tem a tela Despesas marca o ressarcimento.';
  end if;

  select p.id into v_quem from public.pessoas p where p.auth_user_id = auth.uid();

  select d.caso_id, d.pessoa_id, d.tipo, d.valor, d.ressarcido_em
    into v_caso_id, v_pessoa, v_tipo, v_valor, v_antes
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

  if p_ressarcida and v_tipo not in ('refeicao', 'outro') then
    raise exception 'Só refeição e "outro" se ressarcem. O Uber não passa por ressarcimento.';
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
  'Marca (true) ou desmarca (false) que o financeiro devolveu este gasto a quem o pagou. Só refeição e outro se ressarcem; só a tela Despesas; carimbo do servidor; as duas direções vão para eventos.';
