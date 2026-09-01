-- =============================================================================
-- mover_video_master — a RPC que leva o vídeo do MASTER de uma fase à outra.
--
-- UMA RPC PARA O FLUXO INTEIRO, e não uma por fase. Mudar de fase é UM gesto
-- ("este vídeo agora está em ..."), e ele acontece nos dois sentidos: de
-- PRONTO volta para ALTERAÇÕES quando a família pede mudança, de EDITANDO
-- volta para o backlog quando quem pegou larga. Espalhar isso em cinco RPCs
-- deixaria a validação em cinco lugares e a tela teria que escolher qual
-- chamar a cada mudança — cinco caminhos para o mesmo gesto.
--
-- A RPC NÃO SABE COMO A TELA DESENHA ISSO. Ela recebe a fase de destino e
-- valida; se a interface é uma lista, um seletor ou um quadro de colunas é
-- decisão de front, e já mudou uma vez antes de existir.
--
-- SÓ `edicao_video`. As duas fases novas existem por causa deste fluxo, e é
-- esta guarda que as mantém inalcançáveis para todo o resto (ver a migration
-- anterior). Gatear por TIPO DE ETAPA já gateia o MASTER sem citar o MASTER:
-- `edicao_video` só existe nos dois pacotes MASTER. Se um dia outro pacote
-- vender o horizontal, ele entra aqui sozinho — que é o que a seção 12 do
-- CLAUDE.md manda ("não hardcode pacotes").
--
-- CINCO DESTINOS, e `pausada` NÃO é um deles. O fluxo da equipe não tem fase
-- de pausa, e inventar uma aqui seria desenhar um caminho que eles não usam.
-- Uma etapa que já esteja `pausada` continua podendo ser movida — o destino é
-- uma das cinco, e a janela de pausa fecha no caminho.
--
-- O TEMPO DE CICLO SOBREVIVE A IDA E VOLTA. `iniciado_em` nunca é apagado
-- (mesma razão de reabrir_etapa: apagá-lo zeraria a métrica da seção 9), e
-- `concluido_em` é limpo sempre que o vídeo sai da última fase — senão um
-- vídeo que voltou para ALTERAÇÕES ficaria com data de conclusão de um
-- trabalho que voltou a acontecer.
-- =============================================================================


create or replace function public.mover_video_master(
  p_caso_etapa_id uuid,
  p_fase          public.status_etapa
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
  v_pausado   timestamptz;
begin
  select p.id into v_pessoa_id
  from public.pessoas p
  where p.auth_user_id = auth.uid()
    and p.ativo;

  if v_pessoa_id is null then
    raise exception 'Usuário autenticado não corresponde a nenhuma pessoa ativa.';
  end if;

  -- As cinco fases, na ordem do fluxo. Qualquer outro valor do enum
  -- (atribuida, pausada, dispensada) não é destino aqui: ou é estado que
  -- nasce de outra RPC, ou é fase que o fluxo da equipe não tem.
  if p_fase not in ('pendente', 'em_andamento', 'em_alteracao', 'pronto_para_entrega', 'concluida') then
    raise exception
      'Fase "%" não faz parte do fluxo do vídeo do MASTER.', p_fase;
  end if;

  select ce.caso_id, ce.tipo, ce.status, ce.pausado_em, c.status_operacional
    into v_caso_id, v_tipo, v_status, v_pausado, v_terminal
  from public.caso_etapas ce
  join public.casos c on c.id = ce.caso_id
  where ce.id = p_caso_etapa_id
  for update of ce;

  if not found then
    raise exception 'caso_etapa % não encontrada.', p_caso_etapa_id;
  end if;

  if v_tipo <> 'edicao_video' then
    raise exception
      'O fluxo de fases é do vídeo horizontal do MASTER — etapa "%" não passa por ele.',
      v_tipo;
  end if;

  if v_terminal in ('encerrado', 'cancelado') then
    raise exception
      'Caso já está "%" — não se mexe no vídeo de um caso fechado.', v_terminal;
  end if;

  -- Idempotente: reafirmar a fase em que o vídeo já está não é erro, e não
  -- vira linha no histórico. Numa tela de seleção isso acontece o tempo todo.
  if v_status = p_fase then
    return;
  end if;

  update public.caso_etapas
     set status = p_fase,
         -- CARIMBA NA PRIMEIRA VEZ e nunca mais. Vale para qualquer fase
         -- que não seja o backlog: se o vídeo saiu de "há para editar", o
         -- trabalho começou — inclusive quando alguém pula direto para
         -- PRONTO por ter editado antes de o sistema saber. Sem isto, a
         -- constraint caso_etapas_conclusao_exige_inicio recusaria a
         -- conclusão, e o tempo de ciclo nasceria vazio.
         iniciado_em = case
           when p_fase = 'pendente' then iniciado_em
           else coalesce(iniciado_em, now())
         end,
         -- SÓ a última fase tem data de conclusão. Sair dela limpa —
         -- um vídeo que voltou para ALTERAÇÕES não está concluído.
         concluido_em = case when p_fase = 'concluida' then now() else null end,
         -- A janela de pausa fecha no caminho, soma no acumulado. O fluxo
         -- não tem fase de pausa, então mover é sempre "voltar a ter um
         -- estado definido".
         pausa_acumulada = pausa_acumulada
           + case when v_pausado is not null then now() - v_pausado
                  else interval '0' end,
         pausado_em = null,
         -- Quem move assume, se ainda não havia dono. Não SOBRESCREVE um
         -- responsável existente: trocar de mão é handoff, e handoff tem
         -- RPC própria (invariante 3.2).
         responsavel_id = coalesce(responsavel_id, v_pessoa_id)
   where id = p_caso_etapa_id;

  insert into public.eventos (caso_id, caso_etapa_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    v_caso_id,
    p_caso_etapa_id,
    v_pessoa_id,
    'video_master_movido',
    jsonb_build_object(
      'caso_etapa_id', p_caso_etapa_id,
      'caso_id', v_caso_id,
      'de', v_status,
      'para', p_fase
    ),
    now()
  );
end;
$$;

comment on function public.mover_video_master(uuid, public.status_etapa) is
  'Move o vídeo horizontal do MASTER entre as cinco fases do fluxo que a equipe usa: pendente (VIDEOS - EDIÇÃO), em_andamento (EDITANDO...), em_alteracao (ALTERAÇÕES), pronto_para_entrega (PRONTO PARA ENTREGA) e concluida (ENVIADO / FINALIZADO). Recusa qualquer etapa que não seja edicao_video — é esta guarda que mantém as duas fases novas inalcançáveis para o resto do sistema. Vale nos dois sentidos (um vídeo volta de PRONTO para ALTERAÇÕES quando a família pede mudança). Preserva iniciado_em (tempo de ciclo, seção 9), limpa concluido_em ao sair da última fase e fecha a janela de pausa no caminho. Idempotente: mover para a fase atual não faz nada e não gera evento.';

revoke all on function public.mover_video_master(uuid, public.status_etapa) from public;
grant execute on function public.mover_video_master(uuid, public.status_etapa) to authenticated;


-- -----------------------------------------------------------------------------
-- fila_edicao: o filtro passa a ser por EXCLUSÃO, não por lista.
--
-- Ela listava `status in ('pendente','atribuida','em_andamento','pausada')`.
-- Com as duas fases novas, essa lista passaria a esconder vídeo em alteração
-- e vídeo pronto para entregar — trabalho aberto, sumido da fila. E o
-- problema é maior que os dois valores de hoje: toda fase futura nasceria
-- fora da view em silêncio, sem ninguém notar.
--
-- Invertido, o critério vira o MESMO que a trava de encerramento já usa
-- (20260827181322): resolvida é `concluida` ou `dispensada`; o resto está
-- aberto. Uma definição só de "aberta" no banco inteiro.
-- -----------------------------------------------------------------------------

drop view if exists public.fila_edicao;

create view public.fila_edicao
with (security_invoker = true)
as
select
  q.id                as caso_id,
  q.mae_nome,
  q.bebe_nome,
  q.dia,
  q.cor_calendar,
  q.pacote_nome,
  q.maternidade_sigla,
  q.prazo_entrega_horas,
  q.vence_em,
  q.sla_pausado,
  q.na_uti,

  e.id                as caso_etapa_id,
  e.tipo              as etapa_tipo,
  e.status            as etapa_status,
  e.responsavel_id,
  r.nome              as responsavel_nome,
  e.atribuido_em,
  a.nome              as atribuido_por_nome,
  e.iniciado_em,
  e.pausado_em,
  e.pausa_acumulada,
  e.estacao
from public.quadro_casos q
join public.caso_etapas  e on e.caso_id = q.id and e.trilha = 'edicao'
left join public.pessoas r on r.id = e.responsavel_id
left join public.pessoas a on a.id = e.atribuido_por
where e.status not in ('concluida', 'dispensada')
  and not q.eh_terminal;

comment on view public.fila_edicao is
  'Tudo que há para editar: uma linha por ETAPA da trilha de edição ainda aberta (foto, reels, vídeo, álbum) — não por caso. Um MASTER com três edições pendentes aparece três vezes, porque são três trabalhos que podem estar com três pessoas. SELECIONA DE quadro_casos de propósito: vence_em é a régua da fila e reimplementá-lo aqui criaria uma segunda definição de SLA. Herda a volatilidade da view base (caso na UTI recalcula vence_em a cada consulta). Não ordena: a view diz o que existe, a tela diz o que aparece e em que ordem. Caso na UTI permanece, porque a edição pode seguir — o que está congelado é o prazo, e sla_pausado diz isso. ABERTA é definida por exclusão (nem concluida nem dispensada), a mesma definição da trava de encerramento — assim toda fase nova entra na fila sozinha, em vez de sumir dela em silêncio.';

grant select on public.fila_edicao to authenticated;
