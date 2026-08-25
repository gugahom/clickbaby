-- =============================================================================
-- confirmar_entrega deixa de ser exclusiva de atendimento/adm.
--
-- MUDANÇA DE REGRA DE NEGÓCIO, VINDA DO GESTOR
-- O desenho original (migration 20260821064027) espelhava a operação de então:
-- a Morgana recebia os links, conferia e encerrava. Descobriu-se que quem gera
-- os links são as próprias fotógrafas — elas geram fora do sistema, colam aqui
-- e concluem. Manter o encerramento preso ao atendimento transformava a
-- Morgana em gargalo de um passo que ela não executa mais.
--
-- Decisão tomada com o gestor do cliente e confirmada explicitamente.
--
-- O QUE MUDA E O QUE NÃO MUDA — a distinção importa
--
-- CAI: a checagem `eh_atendimento() or eh_adm()`. Qualquer pessoa ativa
-- confirma a entrega.
--
-- FICA, e é o que a invariante 3.5 realmente protege:
--   - `encerrado` continua exigindo `status_entrega = confirmado`. Isso é a
--     constraint casos_status_terminal_valido, no banco, e não foi tocada.
--   - Continua sendo preciso ao menos um entregável registrado. Não existe
--     encerrar um caso sem link nenhum.
--   - Continua não existindo encerramento por prazo ou por omissão: alguém tem
--     que fazer o gesto, e o gesto grava quem foi.
--
-- Ou seja, o portão continua lá — mudou quem tem a chave, não o fato de haver
-- portão. A frase da invariante 3.5 sobre "decisão unilateral de outro papel"
-- foi escrita quando papel e gesto eram a mesma coisa; agora são separados, e
-- o CLAUDE.md acompanha esta migration.
--
-- cancelar_caso NÃO É TOCADA. Continua restrita a atendimento/adm. Cancelar é
-- decisão comercial sobre um contrato, não o fim natural de um trabalho — a
-- fotógrafa que entrega não é quem decide que a família desistiu. Se isso
-- mudar, é outra migration e outra conversa.
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

  -- Sem checagem de papel: quem entrega confirma. Ver a nota no topo.

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

  -- A trava que sobra, e a que importa: não se encerra caso sem link.
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
  'Confirma a entrega E encerra o caso no mesmo gesto (status_entrega=confirmado, status_operacional=encerrado). QUALQUER pessoa ativa pode chamar desde a migration 20260825014102: quem gera os links são as fotógrafas, e prender o encerramento ao atendimento fazia da Morgana gargalo de um passo que ela não executa. O que continua valendo da invariante 3.5: encerrado exige confirmado (constraint casos_status_terminal_valido), exige ao menos um entregável, e exige que alguém faça o gesto — que fica registrado em eventos e em entregaveis.confirmado_por. cancelar_caso segue restrita a atendimento/adm: cancelar é decisão comercial sobre o contrato, não o fim natural do trabalho.';

revoke execute on function public.confirmar_entrega(uuid) from public, anon;
grant  execute on function public.confirmar_entrega(uuid) to authenticated;
