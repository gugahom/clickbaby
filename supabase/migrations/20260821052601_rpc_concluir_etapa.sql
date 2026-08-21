-- =============================================================================
-- Primeira RPC de transição: concluir_etapa (item 3 da seção 13 do CLAUDE.md).
--
-- Decisão sobre o gatilho do SLA (seção 9 do CLAUDE.md): NENHUM dado novo é
-- gravado aqui. O marco que inicia o relógio do SLA é caso_etapas.concluido_em
-- da etapa tipo = 'nascimento' — já é exatamente o que esta função grava para
-- qualquer etapa. O vencimento (concluido_em + pacotes.prazo_entrega) é
-- DERIVADO por quem consumir (fila de edição, painel), nunca armazenado —
-- decisão já registrada no comentário de pacotes.prazo_entrega (migration
-- 20260820041026). Adicionar uma coluna tipo casos.nascimento_concluido_em
-- seria duplicar dado que já existe em caso_etapas.
--
-- Efeito colateral tratado: a constraint caso_etapas_conclusao_exige_inicio
-- (concluido_em is null or iniciado_em is not null) impediria concluir uma
-- etapa 'pendente' (nunca iniciada), que é um dos três status de origem
-- pedidos. Resolvido carimbando iniciado_em = coalesce(iniciado_em, now()) na
-- mesma instrução: se nunca foi iniciada, é iniciada e concluída no mesmo
-- instante do servidor (ciclo zero), em vez de violar a constraint.
--
-- Dívida da seção 13 sobre casos_update_adm/casos_update_atendimento_confirma_entrega
-- CONTINUA PENDENTE — não é revogada aqui. Revogação acontece num passo
-- dedicado quando as 4 RPCs de transição existirem, para não deixar buraco
-- de escrita no meio do caminho.
-- =============================================================================

create or replace function public.concluir_etapa(
  p_caso_etapa_id uuid,
  p_observacao text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pessoa_id     uuid;
  v_status        public.status_etapa;
  v_caso_id       uuid;
  v_tipo          public.etapa_tipo;
begin
  -- Escrita operacional compartilhada: qualquer pessoa autenticada e ativa
  -- pode concluir, independente de papel_sistema — mesmo modelo da leitura
  -- do Quadro.
  select p.id into v_pessoa_id
  from public.pessoas p
  where p.auth_user_id = auth.uid()
    and p.ativo;

  if v_pessoa_id is null then
    raise exception 'Usuário autenticado não corresponde a nenhuma pessoa ativa.';
  end if;

  -- FOR UPDATE: trava a linha contra uma segunda conclusão concorrente da
  -- mesma etapa enquanto esta transação não termina.
  select ce.status, ce.caso_id, ce.tipo
    into v_status, v_caso_id, v_tipo
  from public.caso_etapas ce
  where ce.id = p_caso_etapa_id
  for update;

  if not found then
    raise exception 'caso_etapa % não encontrada.', p_caso_etapa_id;
  end if;

  if v_status not in ('pendente', 'atribuida', 'em_andamento') then
    raise exception
      'Etapa % está em status "%" — só pode ser concluída a partir de pendente, atribuida ou em_andamento.',
      p_caso_etapa_id, v_status;
  end if;

  update public.caso_etapas
     set status         = 'concluida',
         concluido_em   = now(),
         iniciado_em    = coalesce(iniciado_em, now()),
         observacao     = coalesce(p_observacao, observacao),
         responsavel_id = coalesce(responsavel_id, v_pessoa_id)
   where id = p_caso_etapa_id;

  insert into public.eventos (caso_id, caso_etapa_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    v_caso_id,
    p_caso_etapa_id,
    v_pessoa_id,
    'etapa_concluida',
    jsonb_build_object(
      'caso_etapa_id', p_caso_etapa_id,
      'tipo', v_tipo,
      'caso_id', v_caso_id
    ),
    now()
  );
end;
$$;

comment on function public.concluir_etapa(uuid, text) is
  'Conclui uma caso_etapa (pendente/atribuida/em_andamento -> concluida). SECURITY DEFINER: caso_etapas e eventos não têm GRANT de escrita para authenticated (RLS da etapa 2) — só esta função e outras RPCs futuras escrevem ali. Timestamp sempre de now() do servidor (invariante 3.4). O marco do SLA é o próprio concluido_em quando a etapa é do tipo nascimento — não há coluna separada para isso (ver aviso no topo da migration).';

grant execute on function public.concluir_etapa(uuid, text) to authenticated;
