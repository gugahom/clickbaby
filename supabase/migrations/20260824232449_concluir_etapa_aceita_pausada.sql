-- =============================================================================
-- CORREÇÃO: concluir_etapa recusava etapa pausada.
--
-- O BUG
-- concluir_etapa foi escrita na 20260821052601, antes de 'pausada' existir, e a
-- guarda dela lista os estados de origem um a um:
--
--   if v_status not in ('pendente', 'atribuida', 'em_andamento')
--
-- Quando a 20260824105622 acrescentou 'pausada', essa lista não foi revisada.
-- Resultado: play -> pause -> concluir falhava, com a mensagem genérica de
-- estado inválido.
--
-- Não há razão para recusar. Pausada é trabalho interrompido que vai voltar; se
-- a operadora decide que já acabou, concluir dali é legítimo — e obrigá-la a
-- retomar antes só para poder concluir seria cerimônia sem propósito.
--
-- FECHAR A JANELA DE PAUSA É PARTE DA CORREÇÃO, NÃO UM EXTRA
-- Concluir direto da pausa deixaria `pausado_em` preenchido e a última pausa
-- fora de `pausa_acumulada`. O tempo de ciclo é
-- concluido_em - iniciado_em - pausa_acumulada, então aquele intervalo parado
-- seria contado como TRABALHO — exatamente o que a coluna existe para evitar.
-- Por isso o update abaixo soma a janela aberta antes de zerá-la, igual à
-- retomada em iniciar_etapa.
--
-- Fora isso, a função é a mesma da 20260821052601.
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
  v_pessoa_id  uuid;
  v_status     public.status_etapa;
  v_caso_id    uuid;
  v_tipo       public.etapa_tipo;
  v_pausado_em timestamptz;
begin
  select p.id into v_pessoa_id
  from public.pessoas p
  where p.auth_user_id = auth.uid()
    and p.ativo;

  if v_pessoa_id is null then
    raise exception 'Usuário autenticado não corresponde a nenhuma pessoa ativa.';
  end if;

  select ce.status, ce.caso_id, ce.tipo, ce.pausado_em
    into v_status, v_caso_id, v_tipo, v_pausado_em
  from public.caso_etapas ce
  where ce.id = p_caso_etapa_id
  for update;

  if not found then
    raise exception 'caso_etapa % não encontrada.', p_caso_etapa_id;
  end if;

  -- 'pausada' entra aqui. Só concluida e dispensada ficam de fora: as duas são
  -- trabalho terminado, e reabrir por esta porta seria apagar história.
  if v_status not in ('pendente', 'atribuida', 'em_andamento', 'pausada') then
    raise exception
      'Etapa % está em status "%" — só pode ser concluída a partir de pendente, atribuida, em_andamento ou pausada.',
      p_caso_etapa_id, v_status;
  end if;

  update public.caso_etapas
     set status       = 'concluida',
         concluido_em = now(),
         -- Registro retroativo continua valendo: concluir sem ter iniciado
         -- carimba os dois no mesmo instante (ciclo zero) em vez de violar a
         -- constraint caso_etapas_conclusao_exige_inicio.
         iniciado_em  = coalesce(iniciado_em, now()),
         -- Fecha a janela de pausa aberta, se houver. Sem isto o último
         -- intervalo parado viraria tempo de trabalho.
         pausa_acumulada = pausa_acumulada
           + case when v_pausado_em is not null then now() - v_pausado_em
                  else interval '0' end,
         pausado_em = null,
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
      'caso_id', v_caso_id,
      'concluida_de', v_status
    ),
    now()
  );
end;
$$;

comment on function public.concluir_etapa(uuid, text) is
  'Conclui uma caso_etapa a partir de pendente, atribuida, em_andamento ou PAUSADA. Concluir direto de uma pausa fecha a janela somando em pausa_acumulada, senão o intervalo parado viraria tempo de trabalho no cálculo do ciclo. Timestamp sempre de now() do servidor (invariante 3.4). O marco do SLA é o próprio concluido_em quando a etapa é do tipo nascimento. O evento registra em concluida_de de qual estado veio.';

revoke execute on function public.concluir_etapa(uuid, text) from public, anon;
grant  execute on function public.concluir_etapa(uuid, text) to authenticated;
