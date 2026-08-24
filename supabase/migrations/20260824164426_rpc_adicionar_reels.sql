-- =============================================================================
-- adicionar_reels: acrescenta a etapa de vídeo a um caso que não a tem.
--
-- O PROBLEMA REAL
-- Mesmo um BASIC às vezes ganha reels: a fotógrafa está na maternidade, a
-- família se anima, e vale gravar para tentar a venda. Hoje o escopo de etapas
-- vem do pacote e é fechado na criação do caso pela trigger gerar_caso_etapas —
-- não havia como acrescentar uma etapa depois sem UPDATE direto, que a RLS e o
-- GRANT proíbem (e com razão).
--
-- POR QUE NÃO É "TROCAR O PACOTE"
-- Trocar de BASIC para BASIC + REELS regeneraria o checklist inteiro e mexeria
-- no que já foi feito. Aqui a intenção é menor e cirúrgica: falta uma etapa,
-- acrescenta-se uma etapa. O pacote continua sendo o que foi vendido — se a
-- venda do reels se concretizar, aí sim é caso de revisar o pacote, e isso é
-- decisão comercial, não um efeito colateral deste botão.
--
-- IDEMPOTÊNCIA
-- A constraint caso_etapas_unica_por_caso (caso_id, tipo) já garante que não
-- existem duas etapas do mesmo tipo no mesmo caso. O `on conflict do nothing`
-- transforma a segunda chamada em no-op silencioso em vez de erro — o botão
-- pode ser clicado duas vezes sem susto.
--
-- E o EVENTO só é gravado quando a etapa nasce de verdade. Sem mudança real,
-- sem evento: mesma regra que sync_upsert_caso já segue.
--
-- QUEM PODE
-- Qualquer pessoa ativa. Quem está na maternidade é quem percebe a chance de
-- venda, e não seria a coordenação a tempo de registrar. Se isso virar decisão
-- comercial restrita, a guarda entra aqui — não na tela.
-- =============================================================================

create or replace function public.adicionar_reels(
  p_caso_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pessoa_id     uuid;
  v_status        public.status_operacional;
  v_caso_etapa_id uuid;
  v_ordem         integer;
begin
  select p.id into v_pessoa_id
  from public.pessoas p
  where p.auth_user_id = auth.uid()
    and p.ativo;

  if v_pessoa_id is null then
    raise exception 'Usuário autenticado não corresponde a nenhuma pessoa ativa.';
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
      'Caso % já está em status terminal ("%") — não dá para acrescentar etapa.',
      p_caso_id, v_status;
  end if;

  -- A etapa entra no fim do checklist: o vídeo é pós-produção, vem depois do
  -- que já estava previsto.
  select coalesce(max(ce.ordem), 0) + 1 into v_ordem
  from public.caso_etapas ce
  where ce.caso_id = p_caso_id;

  insert into public.caso_etapas (caso_id, tipo, ordem)
  values (p_caso_id, 'edicao_video', v_ordem)
  on conflict (caso_id, tipo) do nothing
  returning id into v_caso_etapa_id;

  -- Já tinha: nada mudou, nada a registrar.
  if v_caso_etapa_id is null then
    return false;
  end if;

  insert into public.eventos (caso_id, caso_etapa_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    p_caso_id,
    v_caso_etapa_id,
    v_pessoa_id,
    'reels_adicionado',
    jsonb_build_object(
      'caso_id', p_caso_id,
      'caso_etapa_id', v_caso_etapa_id,
      'ordem', v_ordem
    ),
    now()
  );

  return true;
end;
$$;

comment on function public.adicionar_reels(uuid) is
  'Acrescenta a etapa edicao_video a um caso que ainda não a tem, para o caso de um pacote sem reels ganhar reels na hora (tentativa de venda). Idempotente pela constraint caso_etapas_unica_por_caso: a segunda chamada é no-op e devolve false, sem erro e sem evento. NÃO troca o pacote — regenerar o checklist mexeria no que já foi feito, e o pacote continua sendo o que foi vendido. Devolve true quando a etapa foi criada.';

revoke execute on function public.adicionar_reels(uuid) from public, anon;
grant  execute on function public.adicionar_reels(uuid) to authenticated;
