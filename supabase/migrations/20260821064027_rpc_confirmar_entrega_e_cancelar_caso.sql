-- =============================================================================
-- Os dois caminhos terminais do caso (item 3 da seção 13, invariante 3.5 do
-- CLAUDE.md): confirmar_entrega e cancelar_caso.
--
-- Decisão de design — confirmar_entrega ENCERRA o caso no mesmo gesto, não
-- em dois passos. Duas evidências no próprio schema: (1) o comentário de
-- entregaveis já diz "a confirmação (confirmado_por/confirmado_em) é o
-- gesto do atendimento que fecha o caso"; (2) a lista de RPCs da seção 4 não
-- tem nenhuma encerrar_caso separada. A função carimba confirmado_por/
-- confirmado_em em todo entregavel do caso ainda não confirmado, seta
-- status_entrega='confirmado' e status_operacional='encerrado' na mesma
-- transação — satisfaz casos_status_terminal_valido de uma vez, sem passar
-- por um estado intermediário inválido.
--
-- Restrição de papel — primeira vez que uma RPC nega por papel_sistema, não
-- só por identidade. Reusa public.eh_adm()/public.eh_atendimento() (migration
-- 20260820090536), em vez de duplicar a lista de papéis administrativos:
--   confirmar_entrega: eh_atendimento() OR eh_adm()
--   cancelar_caso:     eh_atendimento() OR eh_adm() (decisão tomada com o
--                      usuário nesta tarefa — mesma restrição, cancelamento
--                      manual é gesto de fechamento com implicação de
--                      negócio, o caminho automático via card cinza já
--                      cobre o caso comum)
--
-- cancelar_caso funciona a partir de qualquer status_operacional não
-- terminal. A constraint casos_status_terminal_valido já exige
-- motivo_cancelamento não vazio quando cancelado — a função valida antes,
-- pra dar um erro claro em vez de deixar a constraint estourar sem contexto.
-- =============================================================================

create or replace function public.confirmar_entrega(p_caso_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pessoa_id          uuid;
  v_status_operacional public.status_operacional;
  v_status_entrega     public.status_entrega;
  v_tem_entregavel     boolean;
begin
  select p.id into v_pessoa_id
  from public.pessoas p
  where p.auth_user_id = auth.uid()
    and p.ativo;

  if v_pessoa_id is null then
    raise exception 'Usuário autenticado não corresponde a nenhuma pessoa ativa.';
  end if;

  if not (public.eh_atendimento() or public.eh_adm()) then
    raise exception 'Só atendimento ou adm podem confirmar entrega.';
  end if;

  select c.status_operacional, c.status_entrega
    into v_status_operacional, v_status_entrega
  from public.casos c
  where c.id = p_caso_id
  for update;

  if not found then
    raise exception 'Caso % não encontrado.', p_caso_id;
  end if;

  if v_status_operacional in ('encerrado', 'cancelado') then
    raise exception
      'Caso % já está em status terminal ("%") — não pode confirmar entrega.',
      p_caso_id, v_status_operacional;
  end if;

  if v_status_entrega = 'confirmado' then
    raise exception 'Caso % já tem entrega confirmada.', p_caso_id;
  end if;

  select exists(
    select 1 from public.entregaveis e where e.caso_id = p_caso_id
  ) into v_tem_entregavel;

  if not v_tem_entregavel then
    raise exception
      'Caso % não tem nenhum entregável registrado — registre ao menos um link antes de confirmar.',
      p_caso_id;
  end if;

  update public.entregaveis
     set confirmado_por = v_pessoa_id,
         confirmado_em  = now()
   where caso_id = p_caso_id
     and confirmado_por is null;

  update public.casos
     set status_entrega     = 'confirmado',
         status_operacional = 'encerrado'
   where id = p_caso_id;

  insert into public.eventos (caso_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    p_caso_id,
    v_pessoa_id,
    'entrega_confirmada',
    jsonb_build_object('caso_id', p_caso_id),
    now()
  );
end;
$$;

comment on function public.confirmar_entrega(uuid) is
  'Confirma a entrega E encerra o caso no mesmo gesto (status_entrega=confirmado, status_operacional=encerrado) — invariante 3.5. Carimba confirmado_por/confirmado_em em todo entregavel pendente do caso. Só atendimento ou adm (primeira RPC com restrição de papel_sistema). Exige ao menos um entregavel registrado.';

grant execute on function public.confirmar_entrega(uuid) to authenticated;


create or replace function public.cancelar_caso(p_caso_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pessoa_id uuid;
  v_status    public.status_operacional;
begin
  select p.id into v_pessoa_id
  from public.pessoas p
  where p.auth_user_id = auth.uid()
    and p.ativo;

  if v_pessoa_id is null then
    raise exception 'Usuário autenticado não corresponde a nenhuma pessoa ativa.';
  end if;

  if not (public.eh_atendimento() or public.eh_adm()) then
    raise exception 'Só atendimento ou adm podem cancelar um caso manualmente.';
  end if;

  if p_motivo is null or length(btrim(p_motivo)) = 0 then
    raise exception 'Motivo de cancelamento não pode ser vazio.';
  end if;

  select c.status_operacional into v_status
  from public.casos c
  where c.id = p_caso_id
  for update;

  if not found then
    raise exception 'Caso % não encontrado.', p_caso_id;
  end if;

  if v_status in ('encerrado', 'cancelado') then
    raise exception
      'Caso % já está em status terminal ("%") — não pode ser cancelado.',
      p_caso_id, v_status;
  end if;

  update public.casos
     set status_operacional  = 'cancelado',
         motivo_cancelamento = p_motivo
   where id = p_caso_id;

  insert into public.eventos (caso_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    p_caso_id,
    v_pessoa_id,
    'caso_cancelado',
    jsonb_build_object('caso_id', p_caso_id, 'motivo', p_motivo),
    now()
  );
end;
$$;

comment on function public.cancelar_caso(uuid, text) is
  'Cancelamento manual (equivalente automático: sync_cancelar_caso via card cinza, ainda não implementado). Funciona a partir de qualquer status_operacional não terminal. Só atendimento ou adm — mesma restrição de confirmar_entrega, decisão tomada explicitamente nesta migration.';

grant execute on function public.cancelar_caso(uuid, text) to authenticated;
