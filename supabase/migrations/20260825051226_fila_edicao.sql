-- =============================================================================
-- Fila de Edição: a view da tela e a trava que faz a métrica valer.
--
-- Duas coisas, e a segunda é a que importa.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. A TRAVA: pós-produção não conclui sem ter iniciado
--
-- A seção 9 do CLAUDE.md registra isto como dívida desde que concluir_etapa foi
-- escrita:
--
--   "na fila de edição especificamente, 'iniciar' antes de 'concluir' precisa
--    ser obrigatório — sem essa trava, o tempo de ciclo de edição vem sempre
--    zero e a métrica de produtividade da seção 9 fura por completo."
--
-- Por que fura: concluir_etapa faz `iniciado_em = coalesce(iniciado_em, now())`.
-- Concluir sem ter iniciado carimba os dois no mesmo instante, e o ciclo
-- (concluido_em - iniciado_em - pausa_acumulada) dá ZERO. Um punhado de zeros
-- na amostra não deixa a média ruim — deixa a média MENTIROSA, e ela existe
-- justamente para o cliente cobrar tempo de edição de vídeo.
--
-- POR QUE A REGRA VIVE AQUI E NÃO NA TELA
-- Uma trava de front é uma sugestão: qualquer chamada direta à RPC a contorna,
-- e é a RPC que grava o dado do qual a métrica sai. Se a regra é "este número
-- tem valor probatório", ela precisa estar onde o número nasce.
--
-- POR QUE POR TIPO DE ETAPA, E NÃO PARA TODAS
-- O registro retroativo em campo é DELIBERADO e continua valendo — a mesma
-- seção 9 diz que "campo admite registro retroativo". A fotógrafa fotografa o
-- banho com as duas mãos ocupadas e registra depois; obrigá-la a tocar em
-- "iniciar" no meio do parto seria a fricção que a seção 6 manda evitar.
--
-- A diferença é onde o trabalho acontece. Pós-produção é feita sentada, diante
-- de uma máquina: quem edita tem a mão livre para apertar "iniciar", e é
-- exatamente desse trabalho que sai a cobrança de horas. Por isso a trava pega
-- edicao_foto, edicao_video, reels e album, e deixa as etapas de campo em paz.
--
-- Note que a trava é sobre `iniciado_em is null`, não sobre o status: concluir
-- vindo de 'pausada' continua valendo, porque ali o trabalho começou de fato.
-- -----------------------------------------------------------------------------

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
  v_pessoa_id   uuid;
  v_status      public.status_etapa;
  v_caso_id     uuid;
  v_tipo        public.etapa_tipo;
  v_pausado_em  timestamptz;
  v_iniciado_em timestamptz;
begin
  select p.id into v_pessoa_id
  from public.pessoas p
  where p.auth_user_id = auth.uid()
    and p.ativo;

  if v_pessoa_id is null then
    raise exception 'Usuário autenticado não corresponde a nenhuma pessoa ativa.';
  end if;

  select ce.status, ce.caso_id, ce.tipo, ce.pausado_em, ce.iniciado_em
    into v_status, v_caso_id, v_tipo, v_pausado_em, v_iniciado_em
  from public.caso_etapas ce
  where ce.id = p_caso_etapa_id
  for update;

  if not found then
    raise exception 'caso_etapa % não encontrada.', p_caso_etapa_id;
  end if;

  if v_status not in ('pendente', 'atribuida', 'em_andamento', 'pausada') then
    raise exception
      'Etapa % está em status "%" — só pode ser concluída a partir de pendente, atribuida, em_andamento ou pausada.',
      p_caso_etapa_id, v_status;
  end if;

  -- A TRAVA. Ver a nota extensa no topo desta migration.
  if v_tipo in ('edicao_foto', 'edicao_video', 'reels', 'album')
     and v_iniciado_em is null
  then
    raise exception
      'Etapa de edição % precisa ser iniciada antes de concluída — sem o início, o tempo de ciclo seria zero e a medição de produtividade perderia o sentido.',
      p_caso_etapa_id;
  end if;

  update public.caso_etapas
     set status       = 'concluida',
         concluido_em = now(),
         -- Registro retroativo das etapas de CAMPO: concluir sem ter iniciado
         -- carimba os dois no mesmo instante em vez de violar a constraint
         -- caso_etapas_conclusao_exige_inicio. Pós-produção não chega aqui —
         -- a trava acima já barrou.
         iniciado_em  = coalesce(iniciado_em, now()),
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
  'Conclui uma caso_etapa a partir de pendente, atribuida, em_andamento ou pausada. Concluir direto de uma pausa fecha a janela somando em pausa_acumulada. ETAPAS DE PÓS-PRODUÇÃO (edicao_foto, edicao_video, reels, album) EXIGEM ter sido iniciadas: sem isso o tempo de ciclo daria zero e a medição de produtividade da seção 9 perderia o sentido. Etapas de campo mantêm o registro retroativo, que é deliberado — quem fotografa um parto nem sempre pode tocar no aparelho na hora. Timestamp sempre de now() do servidor (invariante 3.4).';

revoke execute on function public.concluir_etapa(uuid, text) from public, anon;
grant  execute on function public.concluir_etapa(uuid, text) to authenticated;


-- -----------------------------------------------------------------------------
-- 2. A view da fila
--
-- SELECIONA DE quadro_casos, não das tabelas base. É o ponto: `vence_em` é a
-- régua da fila, e reimplementá-la aqui criaria uma segunda definição de SLA
-- que divergiria da do Quadro na primeira mudança de regra. Selecionando da
-- view, a fila herda de graça o prazo do pacote, o acréscimo de UTI e o
-- sla_pausado.
--
-- Herda também a volatilidade: um caso na UTI devolve vence_em diferente a cada
-- consulta, por construção (ver migration 20260824163932).
--
-- QUEM ENTRA NA FILA
-- Casos com etapa de vídeo ainda aberta. Etapa concluída ou dispensada sai;
-- caso terminal sai. Caso na UTI FICA: a edição pode seguir com o bebê na UTI
-- (mover_para_uti não pausa etapa), e some-lo daqui esconderia trabalho real —
-- o SLA dele é que está congelado, e a coluna sla_pausado diz isso.
--
-- ORDENAÇÃO É DECISÃO DA TELA, não da view. Mesma separação de quadro_casos:
-- a view diz o que EXISTE, a query diz o que aparece e em que ordem. A tela
-- ordena por vence_em com nulls por último — caso cujo nascimento não foi
-- concluído ainda não tem prazo correndo e não disputa urgência com quem tem.
-- -----------------------------------------------------------------------------

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
join public.caso_etapas  e on e.caso_id = q.id and e.tipo = 'edicao_video'
left join public.pessoas r on r.id = e.responsavel_id
left join public.pessoas a on a.id = e.atribuido_por
where e.status in ('pendente', 'atribuida', 'em_andamento', 'pausada')
  and not q.eh_terminal;

comment on view public.fila_edicao is
  'Fila de edição de vídeo (tela C de docs/plano.md): casos com a etapa edicao_video ainda aberta. SELECIONA DE quadro_casos de propósito — vence_em é a régua da fila e reimplementá-lo aqui criaria uma segunda definição de SLA que divergiria na primeira mudança de regra. Herda a volatilidade da view base (caso na UTI recalcula vence_em a cada consulta). Não ordena: a view diz o que existe, a tela diz o que aparece e em que ordem. Caso na UTI permanece na fila, porque a edição pode seguir — o que está congelado é o prazo dele, e sla_pausado diz isso.';

comment on column public.fila_edicao.pausa_acumulada is
  'Soma das pausas fechadas da etapa de edição. O tempo de trabalho real é now() - iniciado_em - pausa_acumulada; é o número que a medição da seção 9 usa, e a trava de "iniciar antes de concluir" existe para ele nunca nascer zero por descuido.';

-- auto_expose_new_tables está desligado e os default privileges foram fechados
-- na 20260822072158: sem GRANT explícito, o app não enxerga a view.
grant select on public.fila_edicao to authenticated;
