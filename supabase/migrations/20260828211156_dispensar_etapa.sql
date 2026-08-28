-- =============================================================================
-- Uma etapa que NÃO VAI ACONTECER pode ser dispensada.
--
-- O CASO REAL, do gestor: "esse BIRTH pode ter um fechamento, mas nem sempre
-- isso acontece, e o card só fecha se todos os status estiverem ok". Estava
-- travado mesmo — e o mais estranho é que o sistema inteiro já sabia lidar com
-- isso: `dispensada` existe no enum desde a migration inicial, a trava de
-- encerramento (20260827181322) conta dispensada como resolvida, a fita do
-- card já a desenha riscada, e `podeIniciar`/`podeConcluir` já a tratam.
--
-- Faltava só quem PRODUZISSE o estado. Nenhuma RPC escrevia 'dispensada', o
-- que o deixava inalcançável: um valor que todo o resto do sistema respeitava
-- e ninguém conseguia atingir.
--
-- NASCIMENTO NÃO SE DISPENSA. É o evento pelo qual o caso existe, e é dele que
-- sai o relógio: `vence_em` deriva de `nascimento.concluido_em` (view
-- quadro_casos). Dispensá-lo deixaria o caso sem prazo para sempre — não
-- "sem prazo apertado", sem prazo NENHUM, invisível para a fila de edição, que
-- ordena por urgência. Todo o resto pode: entrada que não houve, banho que a
-- família dispensou, fechamento que não aconteceu, reels que não foi vendido.
--
-- MOTIVO OPCIONAL, de propósito. Dispensar é o gesto de quem está fechando o
-- caso às pressas e sabe que aquela etapa não vai existir; exigir texto ali
-- transformaria um toque em três (seção 6). Quem dispensou e quando fica em
-- `eventos` de qualquer forma — que é o que responde "por que este caso
-- encerrou com 3 de 4?" depois.
-- =============================================================================


create or replace function public.dispensar_etapa(
  p_caso_etapa_id uuid,
  p_motivo        text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pessoa_id uuid;
  v_caso_id   uuid;
  v_tipo      public.etapa_tipo;
  v_status    public.status_etapa;
  v_terminal  public.status_operacional;
  v_motivo    text;
begin
  select p.id into v_pessoa_id
  from public.pessoas p
  where p.auth_user_id = auth.uid()
    and p.ativo;

  if v_pessoa_id is null then
    raise exception 'Usuário autenticado não corresponde a nenhuma pessoa ativa.';
  end if;

  select ce.caso_id, ce.tipo, ce.status, c.status_operacional
    into v_caso_id, v_tipo, v_status, v_terminal
  from public.caso_etapas ce
  join public.casos c on c.id = ce.caso_id
  where ce.id = p_caso_etapa_id
  for update of ce;

  if not found then
    raise exception 'caso_etapa % não encontrada.', p_caso_etapa_id;
  end if;

  if v_terminal in ('encerrado', 'cancelado') then
    raise exception
      'Caso já está "%" — não se mexe no checklist de um caso fechado.', v_terminal;
  end if;

  if v_tipo = 'nascimento' then
    raise exception
      'Nascimento não se dispensa: é dele que sai o prazo do caso. Se o parto não aconteceu, o caminho é cancelar o caso.';
  end if;

  if v_status = 'dispensada' then
    return;
  end if;

  if v_status = 'concluida' then
    raise exception
      'Etapa já concluída — o trabalho aconteceu. Para desfazer, reabra a etapa.';
  end if;

  v_motivo := nullif(btrim(coalesce(p_motivo, '')), '');

  update public.caso_etapas
     set status = 'dispensada',
         -- O relógio para onde estava. Uma etapa dispensada no meio guarda o
         -- tempo que já tinha sido gasto nela: apagar seria perder trabalho
         -- que de fato foi feito antes de a decisão mudar.
         pausado_em = null,
         pausa_acumulada = pausa_acumulada
           + case when pausado_em is not null then now() - pausado_em
                  else '00:00:00'::interval end,
         observacao = coalesce(v_motivo, observacao)
   where id = p_caso_etapa_id;

  insert into public.eventos (caso_id, caso_etapa_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    v_caso_id,
    p_caso_etapa_id,
    v_pessoa_id,
    'etapa_dispensada',
    jsonb_build_object(
      'caso_etapa_id', p_caso_etapa_id,
      'tipo', v_tipo,
      'status_anterior', v_status,
      'motivo', v_motivo
    ),
    now()
  );
end;
$$;

comment on function public.dispensar_etapa(uuid, text) is
  'Marca uma etapa como DISPENSADA: ela não vai acontecer neste caso (o fechamento de um BIRTH que não teve fechamento, um banho que a família dispensou). Dispensada conta como resolvida na trava de encerramento, então é isto que destrava um caso preso num checklist que a realidade não cumpriu. Recusa nascimento — é dele que deriva o prazo do caso — e recusa etapa já concluída. Motivo é opcional; quem dispensou fica em eventos de qualquer jeito. Reversível por reabrir_etapa.';

revoke all on function public.dispensar_etapa(uuid, text) from public;
grant execute on function public.dispensar_etapa(uuid, text) to authenticated;


-- -----------------------------------------------------------------------------
-- reabrir_etapa passa a desfazer a dispensa também.
--
-- POR QUE ISSO VEM JUNTO E NÃO DEPOIS. A queixa que originou o `reabrir_etapa`
-- foi exatamente esta: "o funcionário dá play e sem querer conclui, e a edição
-- se perde e não tem como voltar atrás". Lançar um botão de dispensar sem o
-- caminho de volta repetiria o mesmo erro no mesmo lugar, com o agravante de
-- que dispensar é um toque só.
--
-- PARA ONDE A ETAPA VOLTA depende de ter havido trabalho. Uma etapa concluída
-- sempre tem `iniciado_em` (concluir_etapa carimba quando falta), e volta para
-- `em_andamento` — preservar esse carimbo é o que mantém o tempo de ciclo
-- honesto, e foi a razão de a versão original não voltar para `pendente`. Uma
-- dispensada que nunca começou não tem o que preservar, e voltar para
-- `em_andamento` inventaria um trabalho em curso que ninguém está fazendo:
-- essa volta para `pendente`.
-- -----------------------------------------------------------------------------

create or replace function public.reabrir_etapa(
  p_caso_etapa_id uuid,
  p_motivo        text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pessoa_id  uuid;
  v_caso_id    uuid;
  v_status     public.status_etapa;
  v_iniciado   timestamptz;
  v_concluido  timestamptz;
  v_caso_termo public.status_operacional;
  v_novo       public.status_etapa;
begin
  select p.id into v_pessoa_id
  from public.pessoas p
  where p.auth_user_id = auth.uid()
    and p.ativo;

  if v_pessoa_id is null then
    raise exception 'Usuário autenticado não corresponde a nenhuma pessoa ativa.';
  end if;

  select ce.caso_id, ce.status, ce.iniciado_em, ce.concluido_em, c.status_operacional
    into v_caso_id, v_status, v_iniciado, v_concluido, v_caso_termo
  from public.caso_etapas ce
  join public.casos c on c.id = ce.caso_id
  where ce.id = p_caso_etapa_id
  for update of ce;

  if not found then
    raise exception 'caso_etapa % não encontrada.', p_caso_etapa_id;
  end if;

  if v_status not in ('concluida', 'dispensada') then
    raise exception
      'Etapa % está "%" — só se reabre etapa concluída ou dispensada.',
      p_caso_etapa_id, v_status;
  end if;

  if v_caso_termo in ('encerrado', 'cancelado') then
    raise exception
      'Caso já está "%" — reabra o caso antes de mexer nas etapas.', v_caso_termo;
  end if;

  v_novo := case when v_iniciado is null then 'pendente' else 'em_andamento' end;

  update public.caso_etapas
     set status = v_novo,
         concluido_em = null
   where id = p_caso_etapa_id;

  insert into public.eventos (caso_id, caso_etapa_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    v_caso_id,
    p_caso_etapa_id,
    v_pessoa_id,
    'etapa_reaberta',
    jsonb_build_object(
      'caso_etapa_id', p_caso_etapa_id,
      'status_anterior', v_status,
      'status_novo', v_novo,
      'concluido_em_anterior', v_concluido,
      'motivo', nullif(btrim(coalesce(p_motivo, '')), '')
    ),
    now()
  );
end;
$$;

comment on function public.reabrir_etapa(uuid, text) is
  'Desfaz a resolução de uma etapa: concluída ou dispensada. Uma concluída volta para em_andamento e mantém iniciado_em — apagá-lo zeraria o tempo de ciclo, que é a métrica de produtividade da seção 9. Uma dispensada que nunca começou volta para pendente, porque em_andamento inventaria um trabalho que ninguém está fazendo. Recusa caso terminal: ali o caminho é reabrir_caso.';

revoke all on function public.reabrir_etapa(uuid, text) from public;
grant execute on function public.reabrir_etapa(uuid, text) to authenticated;
