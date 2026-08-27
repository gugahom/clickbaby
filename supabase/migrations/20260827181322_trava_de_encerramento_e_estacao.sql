-- =============================================================================
-- 1. Encerrar um caso passa a exigir o TRABALHO FEITO, não só o link.
-- 2. A operadora registra em que PC está editando.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. A trava que todo mundo achava que existia
--
-- O gestor disse "só pode ser fechado após as edições e link". A segunda
-- metade existia; a primeira, não. `confirmar_entrega` checava caso não
-- terminal, entrega não confirmada, e ao menos um entregável — nada sobre
-- etapas. Dava para encerrar um caso com os dois reels pendentes.
--
-- Isso ficou mais fácil de acontecer agora que os reels saíram da fita de
-- edição do card: quem olha o Quadro não os vê ali, e sem esta trava o
-- encerramento passaria sem que nada na tela dissesse o contrário.
--
-- DISPENSADA CONTA COMO RESOLVIDA. É uma etapa que não vai acontecer — o
-- pacote previa, a operação decidiu que não. Exigir conclusão dela travaria o
-- caso para sempre.
--
-- CASO SEM ETAPA continua podendo encerrar. É o rascunho sem pacote: não há
-- checklist para cobrar, e a regra do link segue valendo. Mudar isso é outra
-- decisão, sobre rascunho, não sobre encerramento.
--
-- A mensagem NOMEIA o que falta. "Conclua as etapas antes" obrigaria a abrir o
-- caso e procurar; num corredor às 3h isso é a diferença entre resolver e
-- desistir.
-- -----------------------------------------------------------------------------

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
  v_pendentes          text;
begin
  select p.id into v_pessoa_id
  from public.pessoas p
  where p.auth_user_id = auth.uid()
    and p.ativo;

  if v_pessoa_id is null then
    raise exception 'Usuário autenticado não corresponde a nenhuma pessoa ativa.';
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

  -- A trava nova: o trabalho tem que estar feito.
  select string_agg(ce.tipo::text, ', ' order by ce.rodada, ce.ordem)
    into v_pendentes
  from public.caso_etapas ce
  where ce.caso_id = p_caso_id
    and ce.status not in ('concluida', 'dispensada');

  if v_pendentes is not null then
    raise exception
      'Caso % tem etapa em aberto (%) — conclua ou dispense antes de encerrar.',
      p_caso_id, v_pendentes;
  end if;

  -- A trava antiga, e a que continua importando: não se encerra caso sem link.
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
  'Encerra o caso: confirma os entregáveis pendentes e leva status_operacional a encerrado. Exige DUAS coisas — nenhuma etapa em aberto (dispensada conta como resolvida) e ao menos um entregável registrado. A primeira entrou em 20260827181322: antes dava para encerrar com edição pendente, e ficou mais fácil de acontecer quando os reels saíram da fita do card. Sem checagem de papel desde 20260825014102 — quem gera os links são as fotógrafas.';

revoke all on function public.confirmar_entrega(uuid) from public;
grant execute on function public.confirmar_entrega(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- 2. registrar_estacao
--
-- A coluna `caso_etapas.estacao` existe desde a migration inicial e NUNCA foi
-- escrita por ninguém — sobrou do módulo de equipamentos, que saiu do escopo.
-- O comentário dela já dizia para que servia: "para a próxima operadora saber
-- onde continuar um trabalho pela metade". Agora ganha quem a preencha.
--
-- Texto livre de propósito. O cadastro de estações foi removido do escopo e a
-- operação escreve "pc-1"; uma lista fechada exigiria manter o cadastro
-- sincronizado com máquinas que ninguém registra.
--
-- NÃO é transição de estado, então não mexe em status nem em relógio. É RPC
-- porque `authenticated` não tem UPDATE por coluna em caso_etapas (migration
-- 20260822072158) e porque a troca precisa virar evento — saber em que PC um
-- trabalho estava é parte do histórico dele.
-- -----------------------------------------------------------------------------

create or replace function public.registrar_estacao(
  p_caso_etapa_id uuid,
  p_estacao text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pessoa_id uuid;
  v_caso_id   uuid;
  v_anterior  text;
  v_nova      text;
begin
  select p.id into v_pessoa_id
  from public.pessoas p
  where p.auth_user_id = auth.uid()
    and p.ativo;

  if v_pessoa_id is null then
    raise exception 'Usuário autenticado não corresponde a nenhuma pessoa ativa.';
  end if;

  select ce.caso_id, ce.estacao
    into v_caso_id, v_anterior
  from public.caso_etapas ce
  where ce.id = p_caso_etapa_id
  for update;

  if not found then
    raise exception 'caso_etapa % não encontrada.', p_caso_etapa_id;
  end if;

  -- Em branco limpa. A operadora saiu do PC e não quer deixar a informação
  -- velha apontando para uma máquina onde não há mais nada.
  v_nova := nullif(btrim(coalesce(p_estacao, '')), '');

  if v_nova is not distinct from v_anterior then
    return;
  end if;

  update public.caso_etapas
     set estacao = v_nova
   where id = p_caso_etapa_id;

  insert into public.eventos (caso_id, caso_etapa_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    v_caso_id,
    p_caso_etapa_id,
    v_pessoa_id,
    'estacao_registrada',
    jsonb_build_object(
      'caso_etapa_id', p_caso_etapa_id,
      'caso_id', v_caso_id,
      'estacao', v_nova,
      'estacao_anterior', v_anterior
    ),
    now()
  );
end;
$$;

comment on function public.registrar_estacao(uuid, text) is
  'Marca em qual PC de edição a etapa está sendo trabalhada ("pc-1"). Texto livre: o cadastro de equipamentos saiu do escopo e uma lista fechada exigiria manter sincronia com máquinas que ninguém registra. Em branco limpa. Não é transição de estado — não toca status nem relógio.';

revoke all on function public.registrar_estacao(uuid, text) from public;
grant execute on function public.registrar_estacao(uuid, text) to authenticated;
