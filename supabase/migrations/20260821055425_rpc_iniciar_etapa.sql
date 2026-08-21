-- =============================================================================
-- Segunda RPC de transição: iniciar_etapa (item 3 da seção 13 do CLAUDE.md).
--
-- Mesmo padrão de concluir_etapa (migration 20260821052601): SECURITY
-- DEFINER, search_path vazio, qualquer pessoa autenticada e ativa pode
-- chamar (escrita operacional compartilhada — mesmo modelo da leitura do
-- Quadro), timestamp sempre de now() do servidor (invariante 3.4), evento
-- append-only em eventos.
--
-- Transição de origem: pendente ou atribuida -> em_andamento. Diferente de
-- concluir_etapa, NÃO aceita em_andamento como origem (não existe "iniciar
-- de novo" uma etapa já em andamento) nem qualquer terminal.
--
-- responsavel_id: mesmo fallback de concluir_etapa — se ninguém foi
-- atribuído ainda (responsavel_id nulo), quem inicia vira o responsável.
-- Não é ownership-check: qualquer pessoa ativa pode iniciar qualquer etapa
-- elegível, mesmo que já tenha responsavel_id de outra pessoa — mesma
-- escrita compartilhada, sem gate de "só quem foi atribuído pode".
-- =============================================================================

create or replace function public.iniciar_etapa(
  p_caso_etapa_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pessoa_id uuid;
  v_status    public.status_etapa;
  v_caso_id   uuid;
  v_tipo      public.etapa_tipo;
begin
  select p.id into v_pessoa_id
  from public.pessoas p
  where p.auth_user_id = auth.uid()
    and p.ativo;

  if v_pessoa_id is null then
    raise exception 'Usuário autenticado não corresponde a nenhuma pessoa ativa.';
  end if;

  select ce.status, ce.caso_id, ce.tipo
    into v_status, v_caso_id, v_tipo
  from public.caso_etapas ce
  where ce.id = p_caso_etapa_id
  for update;

  if not found then
    raise exception 'caso_etapa % não encontrada.', p_caso_etapa_id;
  end if;

  if v_status not in ('pendente', 'atribuida') then
    raise exception
      'Etapa % está em status "%" — só pode ser iniciada a partir de pendente ou atribuida.',
      p_caso_etapa_id, v_status;
  end if;

  update public.caso_etapas
     set status         = 'em_andamento',
         iniciado_em    = now(),
         responsavel_id = coalesce(responsavel_id, v_pessoa_id)
   where id = p_caso_etapa_id;

  insert into public.eventos (caso_id, caso_etapa_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    v_caso_id,
    p_caso_etapa_id,
    v_pessoa_id,
    'etapa_iniciada',
    jsonb_build_object(
      'caso_etapa_id', p_caso_etapa_id,
      'tipo', v_tipo,
      'caso_id', v_caso_id
    ),
    now()
  );
end;
$$;

comment on function public.iniciar_etapa(uuid) is
  'Inicia uma caso_etapa (pendente/atribuida -> em_andamento). SECURITY DEFINER, mesmo padrão de concluir_etapa. Não aceita em_andamento nem terminal como origem — não existe "reiniciar".';

grant execute on function public.iniciar_etapa(uuid) to authenticated;
