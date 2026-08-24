-- =============================================================================
-- Pause de etapa: pausar_etapa() e retomada dentro de iniciar_etapa().
--
-- CASO DE USO: troca de turno. Quem sai pausa, quem entra dá play. O histórico
-- precisa mostrar os dois, e o tempo parado não pode contar como trabalho.
--
-- TEMPO DE CICLO COM PAUSA
-- Duas colunas novas em caso_etapas:
--   pausado_em      início da pausa ATUAL (null = não está pausada)
--   pausa_acumulada soma das pausas já FECHADAS
--
-- Tempo de ciclo passa a ser:
--   concluido_em - iniciado_em - pausa_acumulada
--
-- `iniciado_em` NÃO é reescrito na retomada. Ele é o fato "quando o trabalho
-- começou"; sobrescrever apagaria história e ainda brigaria com a constraint
-- caso_etapas_conclusao_apos_inicio.
--
-- O acumulador não compete com `eventos` como fonte de verdade (invariante
-- 3.3): ele é reconstruível a partir dos eventos etapa_pausada/etapa_retomada
-- a qualquer momento. Existe para a Fila de Edição ordenar por urgência sem
-- varrer o log linha a linha.
--
-- RETOMADA É HANDOFF QUANDO MUDA DE PESSOA
-- iniciar_etapa fazia `responsavel_id = coalesce(responsavel_id, v_pessoa_id)`,
-- ou seja, nunca sobrescrevia. Numa troca de turno isso deixaria no Quadro o
-- nome de quem foi embora.
--
-- Sobrescrever direto quebraria a invariante 3.2 (nunca trocar responsável sem
-- linha em handoffs). Então a retomada por outra pessoa GRAVA O HANDOFF e
-- atualiza o responsável na mesma transação — que é exatamente o que a
-- invariante 3.2 descreve. Passar uma etapa de mão numa troca de turno é um
-- handoff; ele só estava implícito.
--
-- Eventos distintos de propósito: 'etapa_iniciada' (primeira vez) e
-- 'etapa_retomada' (voltou de pausa). No histórico, começar e retomar não são
-- a mesma coisa.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Colunas de pausa
-- -----------------------------------------------------------------------------

alter table public.caso_etapas
  add column pausado_em      timestamptz,
  add column pausa_acumulada interval not null default '0';

alter table public.caso_etapas
  add constraint caso_etapas_pausa_acumulada_nao_negativa
    check (pausa_acumulada >= interval '0');

-- Pausa aberta exige etapa já iniciada: não existe pausar o que nunca começou.
alter table public.caso_etapas
  add constraint caso_etapas_pausa_exige_inicio
    check (pausado_em is null or iniciado_em is not null);

comment on column public.caso_etapas.pausado_em is
  'Início da pausa ATUAL. NULL quando a etapa não está pausada. Carimbado por now() do servidor dentro de pausar_etapa() — nunca vem do cliente (invariante 3.4).';
comment on column public.caso_etapas.pausa_acumulada is
  'Soma das pausas já fechadas. O tempo de ciclo é concluido_em - iniciado_em - pausa_acumulada: o tempo parado não conta como trabalho. Reconstruível a partir dos eventos etapa_pausada/etapa_retomada; existe para a fila ordenar por urgência sem varrer o log.';


-- -----------------------------------------------------------------------------
-- 2. pausar_etapa
-- -----------------------------------------------------------------------------

create or replace function public.pausar_etapa(
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

  -- Só de em_andamento: pausar pendente não significa nada, e pausar concluída
  -- seria reabrir trabalho terminado por uma porta lateral.
  if v_status <> 'em_andamento' then
    raise exception
      'Etapa % está em status "%" — só pode ser pausada a partir de em_andamento.',
      p_caso_etapa_id, v_status;
  end if;

  update public.caso_etapas
     set status     = 'pausada',
         pausado_em = now()
   where id = p_caso_etapa_id;

  insert into public.eventos (caso_id, caso_etapa_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    v_caso_id,
    p_caso_etapa_id,
    v_pessoa_id,
    'etapa_pausada',
    jsonb_build_object(
      'caso_etapa_id', p_caso_etapa_id,
      'tipo', v_tipo,
      'caso_id', v_caso_id
    ),
    now()
  );
end;
$$;

comment on function public.pausar_etapa(uuid) is
  'Pausa uma etapa em andamento (em_andamento -> pausada) e abre a janela de pausa em pausado_em. Só a partir de em_andamento. A retomada é iniciar_etapa(), que fecha a janela somando em pausa_acumulada.';

revoke execute on function public.pausar_etapa(uuid) from public, anon;
grant  execute on function public.pausar_etapa(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- 3. iniciar_etapa passa a retomar
--
-- Substitui a versão da migration 20260821055425.
-- -----------------------------------------------------------------------------

create or replace function public.iniciar_etapa(
  p_caso_etapa_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pessoa_id      uuid;
  v_status         public.status_etapa;
  v_caso_id        uuid;
  v_tipo           public.etapa_tipo;
  v_pausado_em     timestamptz;
  v_responsavel_id uuid;
  v_retomada       boolean;
begin
  select p.id into v_pessoa_id
  from public.pessoas p
  where p.auth_user_id = auth.uid()
    and p.ativo;

  if v_pessoa_id is null then
    raise exception 'Usuário autenticado não corresponde a nenhuma pessoa ativa.';
  end if;

  select ce.status, ce.caso_id, ce.tipo, ce.pausado_em, ce.responsavel_id
    into v_status, v_caso_id, v_tipo, v_pausado_em, v_responsavel_id
  from public.caso_etapas ce
  where ce.id = p_caso_etapa_id
  for update;

  if not found then
    raise exception 'caso_etapa % não encontrada.', p_caso_etapa_id;
  end if;

  if v_status not in ('pendente', 'atribuida', 'pausada') then
    raise exception
      'Etapa % está em status "%" — só pode ser iniciada a partir de pendente, atribuida ou pausada.',
      p_caso_etapa_id, v_status;
  end if;

  v_retomada := v_status = 'pausada';

  -- ---------------------------------------------------------------------
  -- Retomada por outra pessoa é HANDOFF (invariante 3.2). A linha em
  -- handoffs vem ANTES do update do responsável, na mesma transação — a
  -- ordem não importa para o resultado, mas deixa explícito que uma coisa
  -- não acontece sem a outra.
  --
  -- Sem responsável anterior não há handoff a registrar: é primeira
  -- atribuição, e quem retoma simplesmente assume.
  -- ---------------------------------------------------------------------
  if v_retomada
     and v_responsavel_id is not null
     and v_responsavel_id <> v_pessoa_id
  then
    insert into public.handoffs (caso_etapa_id, de_pessoa_id, para_pessoa_id, motivo, ocorrido_em)
    values (
      p_caso_etapa_id,
      v_responsavel_id,
      v_pessoa_id,
      'Retomada após pausa',
      now()
    );

    insert into public.eventos (caso_id, caso_etapa_id, pessoa_id, tipo, payload, ocorrido_em)
    values (
      v_caso_id,
      p_caso_etapa_id,
      v_pessoa_id,
      'etapa_transferida',
      jsonb_build_object(
        'caso_etapa_id', p_caso_etapa_id,
        'de_pessoa_id', v_responsavel_id,
        'para_pessoa_id', v_pessoa_id,
        'motivo', 'Retomada após pausa'
      ),
      now()
    );
  end if;

  update public.caso_etapas
     set status = 'em_andamento',
         -- Primeira vez carimba; retomada preserva o início original.
         iniciado_em = coalesce(iniciado_em, now()),
         -- Fecha a janela de pausa somando ao acumulado.
         pausa_acumulada = pausa_acumulada
           + case when v_pausado_em is not null then now() - v_pausado_em
                  else interval '0' end,
         pausado_em = null,
         -- Na retomada quem dá play assume (o handoff acima registrou a troca);
         -- fora dela, mantém o comportamento antigo de não sobrescrever.
         responsavel_id = case when v_retomada then v_pessoa_id
                               else coalesce(responsavel_id, v_pessoa_id) end
   where id = p_caso_etapa_id;

  insert into public.eventos (caso_id, caso_etapa_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    v_caso_id,
    p_caso_etapa_id,
    v_pessoa_id,
    case when v_retomada then 'etapa_retomada' else 'etapa_iniciada' end,
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
  'Inicia (pendente/atribuida) ou RETOMA (pausada) uma etapa, sempre para em_andamento. Na retomada fecha a janela de pausa somando em pausa_acumulada e, se quem retoma não é o responsável atual, grava o handoff antes de trocar o responsável (invariante 3.2) — é a troca de turno. Emite etapa_iniciada na primeira vez e etapa_retomada na volta: no histórico as duas não são a mesma coisa.';

revoke execute on function public.iniciar_etapa(uuid) from public, anon;
grant  execute on function public.iniciar_etapa(uuid) to authenticated;
