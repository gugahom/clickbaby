-- =============================================================================
-- Terceira RPC de transição: transferir_etapa — o handoff (item 3 da seção
-- 13 do CLAUDE.md). Operacionaliza a invariante 3.2: handoff NUNCA
-- sobrescreve o responsável em silêncio, SEMPRE grava linha em handoffs.
--
-- Mesmo padrão de iniciar_etapa/concluir_etapa: SECURITY DEFINER,
-- search_path vazio, qualquer pessoa autenticada e ativa pode executar
-- (quem executa pode ser diferente de quem passa e de quem recebe — a
-- coordenação transferindo entre duas fotógrafas é o caso central, não
-- exceção).
--
-- de_pessoa_id vem do responsavel_id ATUAL da etapa, nunca de quem chama a
-- função — são conceitos diferentes: "quem executou a transferência"
-- (eventos.pessoa_id) e "de quem saiu a etapa" (handoffs.de_pessoa_id).
--
-- Sem responsável atual não é handoff, é atribuição (RPC atribuir_etapa,
-- ainda não implementada) — por isso vira erro aqui, não um caminho
-- alternativo que atribui e segue.
--
-- Ordem dentro da transação: INSERT em handoffs primeiro, DEPOIS o UPDATE
-- de caso_etapas.responsavel_id. Nunca ao contrário e nunca só um dos dois
-- — é exatamente o padrão que a invariante 3.2 proíbe (update solto sem o
-- registro do handoff).
-- =============================================================================

create or replace function public.transferir_etapa(
  p_caso_etapa_id uuid,
  p_para_pessoa_id uuid,
  p_motivo text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_executor_id  uuid;
  v_status       public.status_etapa;
  v_caso_id      uuid;
  v_de_pessoa_id uuid;
  v_para_existe  boolean;
  v_para_ativo   boolean;
begin
  select p.id into v_executor_id
  from public.pessoas p
  where p.auth_user_id = auth.uid()
    and p.ativo;

  if v_executor_id is null then
    raise exception 'Usuário autenticado não corresponde a nenhuma pessoa ativa.';
  end if;

  select ce.status, ce.caso_id, ce.responsavel_id
    into v_status, v_caso_id, v_de_pessoa_id
  from public.caso_etapas ce
  where ce.id = p_caso_etapa_id
  for update;

  if not found then
    raise exception 'caso_etapa % não encontrada.', p_caso_etapa_id;
  end if;

  if v_status in ('concluida', 'dispensada') then
    raise exception
      'Etapa % está em status "%" — trabalho terminado não pode ser transferido.',
      p_caso_etapa_id, v_status;
  end if;

  if v_de_pessoa_id is null then
    raise exception
      'Etapa % não tem responsável atual — use atribuir_etapa para a primeira atribuição, transferir_etapa pressupõe handoff entre dois responsáveis.',
      p_caso_etapa_id;
  end if;

  if p_para_pessoa_id = v_de_pessoa_id then
    raise exception
      'Pessoa % já é o responsável atual da etapa % — não há transferência a fazer.',
      p_para_pessoa_id, p_caso_etapa_id;
  end if;

  select true, p.ativo into v_para_existe, v_para_ativo
  from public.pessoas p
  where p.id = p_para_pessoa_id;

  if not coalesce(v_para_existe, false) or not v_para_ativo then
    raise exception 'Pessoa % não existe ou está inativa.', p_para_pessoa_id;
  end if;

  insert into public.handoffs (caso_etapa_id, de_pessoa_id, para_pessoa_id, motivo, ocorrido_em)
  values (p_caso_etapa_id, v_de_pessoa_id, p_para_pessoa_id, p_motivo, now());

  update public.caso_etapas
     set responsavel_id = p_para_pessoa_id
   where id = p_caso_etapa_id;

  insert into public.eventos (caso_id, caso_etapa_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    v_caso_id,
    p_caso_etapa_id,
    v_executor_id,
    'etapa_transferida',
    jsonb_build_object(
      'caso_etapa_id', p_caso_etapa_id,
      'caso_id', v_caso_id,
      'de_pessoa_id', v_de_pessoa_id,
      'para_pessoa_id', p_para_pessoa_id
    ),
    now()
  );
end;
$$;

comment on function public.transferir_etapa(uuid, uuid, text) is
  'Handoff de responsável (invariante 3.2): grava handoffs ANTES/JUNTO com a troca de caso_etapas.responsavel_id, nunca um update solto. de_pessoa_id é o responsavel_id atual da etapa, não quem chama a função — quem chama vira eventos.pessoa_id. Exige responsável atual (senão é atribuição, não transferência) e etapa não terminal.';

grant execute on function public.transferir_etapa(uuid, uuid, text) to authenticated;
