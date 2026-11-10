-- =============================================================================
-- O CASO VOLTA PARA A AGENDA (10/11/2026, pedido do gestor)
-- =============================================================================
--
-- "Já foi feita a entrada, foi feito até despesas com ele, só que o bebê não vai
-- nascer hoje." A mãe é mandada para casa e volta outro dia. Sem um caminho
-- próprio o caso ficava no dia antigo, atrasado, até o parto de verdade — e
-- cancelar apagaria a entrada, as despesas e o resto do que já aconteceu.
--
-- `devolver_para_a_agenda` muda o DIA do caso e deixa todo o resto onde está:
--   * etapas, despesas, links, venda e histórico ficam como estão;
--   * o evento no Google acompanha pela trigger `marcar_caso_para_o_google`, a
--     mesma do "Editar caso" — o caso sai do Quadro e volta na véspera;
--   * o nascimento previsto (`cesarea_em`) anda os mesmos dias que a previsão;
--   * toda etapa EM ANDAMENTO pausa: os dias em casa não são trabalho (seção 9);
--   * a ENTRADA já CONCLUÍDA volta para ser feita de novo (decisão do gestor) —
--     PAUSADA e não pendente, com o início mantido: no dia novo a fotógrafa dá
--     "retomar", e o relógio soma as duas idas sem contar os dias em casa. É o
--     mesmo argumento de `reabrir_etapa` (apagar o início zeraria o tempo de
--     ciclo). E não grava `etapa_reaberta`: aquele evento é o "voltou para
--     ajuste" do relatório, e a família ir para casa não é retrabalho.
--
-- Recusa o que já não está no dia: caso terminal, enviado para Entregáveis, na
-- UTI, rascunho — e o caso cujo bebê JÁ NASCEU. O dia novo tem de ser depois de
-- hoje. Atendimento ou adm, o par de `cancelar_caso`: o botão mora ao lado dele.
-- =============================================================================

create function public.devolver_para_a_agenda(
  p_caso_id     uuid,
  p_previsao_em timestamptz,
  p_sem_hora    boolean default false,
  p_motivo      text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pessoa_id  uuid;
  v_caso       public.casos%rowtype;
  v_sem_hora   boolean := coalesce(p_sem_hora, false);
  v_previsao   timestamptz := public.previsao_do_dia(p_previsao_em, coalesce(p_sem_hora, false));
  v_dias       integer;
  v_pausadas   uuid[];
  v_entrada    uuid[];
begin
  select p.id into v_pessoa_id
  from public.pessoas p
  where p.auth_user_id = auth.uid()
    and p.ativo;

  if v_pessoa_id is null or not (public.eh_atendimento() or public.eh_adm()) then
    raise exception 'Só o atendimento e a gestão devolvem um caso para a agenda.';
  end if;

  select * into v_caso from public.casos where id = p_caso_id for update;

  if not found then
    raise exception 'Caso não encontrado.';
  end if;

  if v_caso.status_operacional in ('encerrado', 'cancelado') then
    raise exception 'Caso encerrado ou cancelado não volta para a agenda.';
  end if;

  if v_caso.liberado_para_entrega_em is not null then
    raise exception 'O caso já foi enviado para Entregáveis.';
  end if;

  if v_caso.uti_desde is not null then
    raise exception 'O caso está na UTI — retorne-o da UTI antes.';
  end if;

  if v_caso.pacote_id is null or v_caso.maternidade_id is null then
    raise exception 'Rascunho pendente não volta para a agenda: confirme o pacote e a maternidade antes.';
  end if;

  if exists (
    select 1 from public.caso_etapas ce
    where ce.caso_id = p_caso_id
      and ce.tipo in ('nascimento', 'acompanhamento')
      and ce.status = 'concluida'
  ) then
    raise exception 'O bebê já nasceu — o caso não volta para a agenda.';
  end if;

  if p_previsao_em is null then
    raise exception 'Informe o dia em que o caso volta.';
  end if;

  if (v_previsao at time zone 'America/Sao_Paulo')::date <= (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'O caso volta num dia depois de hoje.';
  end if;

  -- Os dias que o caso andou: o nascimento previsto anda junto.
  v_dias := (v_previsao at time zone 'America/Sao_Paulo')::date
          - (coalesce(v_caso.previsao_em, v_previsao) at time zone 'America/Sao_Paulo')::date;

  with pausadas as (
    update public.caso_etapas
       set status = 'pausada',
           pausado_em = now()
     where caso_id = p_caso_id
       and status = 'em_andamento'
    returning id
  )
  select coalesce(array_agg(id), '{}') into v_pausadas from pausadas;

  with entrada as (
    update public.caso_etapas
       set status = 'pausada',
           concluido_em = null,
           pausado_em = now()
     where caso_id = p_caso_id
       and tipo = 'entrada'
       and status = 'concluida'
    returning id
  )
  select coalesce(array_agg(id), '{}') into v_entrada from entrada;

  update public.casos
     set previsao_em = v_previsao,
         previsao_sem_hora = v_sem_hora,
         cesarea_em = cesarea_em + make_interval(days => v_dias)
   where id = p_caso_id;

  insert into public.eventos (caso_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    p_caso_id,
    v_pessoa_id,
    'caso_voltou_para_a_agenda',
    jsonb_build_object(
      'previsao_anterior', v_caso.previsao_em,
      'previsao_nova', v_previsao,
      'sem_hora', v_sem_hora,
      'etapas_pausadas', to_jsonb(v_pausadas),
      'entrada_para_refazer', to_jsonb(v_entrada),
      'motivo', nullif(btrim(coalesce(p_motivo, '')), '')
    ),
    now()
  );
end;
$$;

comment on function public.devolver_para_a_agenda(uuid, timestamptz, boolean, text) is
  'O bebê não nasceu no dia: o caso volta para a agenda num dia depois de hoje, com tudo o que já tem. Pausa as etapas em andamento, devolve a entrada concluída para ser refeita (pausada, mantendo o início), anda o nascimento previsto junto, e o Google acompanha pela trigger. Recusa terminal, enviado, UTI, rascunho e bebê já nascido. Atendimento ou adm.';

revoke all on function public.devolver_para_a_agenda(uuid, timestamptz, boolean, text) from public, anon;
grant execute on function public.devolver_para_a_agenda(uuid, timestamptz, boolean, text) to authenticated;
