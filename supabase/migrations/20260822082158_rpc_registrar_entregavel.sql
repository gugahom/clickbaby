-- =============================================================================
-- registrar_entregavel — completa o par de RPCs que faltava pra
-- confirmar_entrega deixar de ser um botão morto (sem entregável
-- registrado, confirmar_entrega sempre falha — ver seção 13 do CLAUDE.md).
--
-- atribuir_etapa NÃO entra nesta fatia — decisão explícita: a ordem
-- iniciar_etapa -> transferir_etapa já cobre o fluxo real, sem precisar de
-- uma terceira RPC de atribuição sem dor de uso comprovada.
--
-- Papel — decisão tomada com o usuário: qualquer pessoa autenticada e
-- ativa, sem restrição. Mesmo modelo compartilhado de iniciar_etapa/
-- concluir_etapa/transferir_etapa: registrar um link não é gesto de
-- fechamento como confirmar_entrega/cancelar_caso (por isso essas duas
-- têm restrição de papel_sistema e esta não tem).
--
-- Sem p_descricao: a tabela entregaveis não tem essa coluna (só caso_id,
-- tipo, url, criado_por/em, confirmado_por/em) — assinatura reflete
-- exatamente o schema, não inventa campo pra guardar.
--
-- SEGURANÇA: mesma lição da migration 20260821100857 (sync_upsert_caso) —
-- REVOKE ALL FROM PUBLIC sozinho não fecha authenticated/anon neste
-- projeto, que tem ALTER DEFAULT PRIVILEGES concedendo EXECUTE em toda
-- função nova pros três automaticamente. Aqui EXECUTE é pra authenticated
-- de propósito (qualquer pessoa ativa pode chamar), mas anon precisa ser
-- revogado explicitamente mesmo assim.
-- =============================================================================

create or replace function public.registrar_entregavel(
  p_caso_id uuid,
  p_tipo public.tipo_entregavel,
  p_url text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pessoa_id uuid;
  v_caso_existe boolean;
begin
  select p.id into v_pessoa_id
  from public.pessoas p
  where p.auth_user_id = auth.uid()
    and p.ativo;

  if v_pessoa_id is null then
    raise exception 'Usuário autenticado não corresponde a nenhuma pessoa ativa.';
  end if;

  if p_url is null or length(btrim(p_url)) = 0 then
    raise exception 'URL do entregável não pode ser vazia.';
  end if;

  select exists(select 1 from public.casos c where c.id = p_caso_id) into v_caso_existe;

  if not v_caso_existe then
    raise exception 'Caso % não encontrado.', p_caso_id;
  end if;

  insert into public.entregaveis (caso_id, tipo, url, criado_por)
  values (p_caso_id, p_tipo, p_url, v_pessoa_id);

  insert into public.eventos (caso_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    p_caso_id,
    v_pessoa_id,
    'entregavel_registrado',
    jsonb_build_object('caso_id', p_caso_id, 'tipo', p_tipo),
    now()
  );
end;
$$;

comment on function public.registrar_entregavel(uuid, public.tipo_entregavel, text) is
  'Registra um link de entrega (entregaveis). Qualquer pessoa autenticada e ativa pode chamar — não é gesto de fechamento (isso é confirmar_entrega). Valida url não vazia (mesma regra da constraint entregaveis_url_nao_vazia, com erro claro antes). Grava evento append-only entregavel_registrado.';

revoke all on function public.registrar_entregavel(uuid, public.tipo_entregavel, text) from public;
revoke execute on function public.registrar_entregavel(uuid, public.tipo_entregavel, text) from anon;
grant execute on function public.registrar_entregavel(uuid, public.tipo_entregavel, text) to authenticated;
