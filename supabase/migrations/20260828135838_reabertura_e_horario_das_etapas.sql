-- =============================================================================
-- 1. Um caso encerrado pode VOLTAR quando a família pede alteração.
-- 2. Uma etapa de acompanhamento pode ter HORÁRIO PREVISTO próprio.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Reabertura
--
-- O PROBLEMA REAL, nas palavras do gestor: "o cliente pede depois de entregue
-- pra fazer alteração no vídeo, alteração de foto, só que o atendimento já foi
-- encerrado. Como é que faz nesse caso?" Hoje não faz — o caso sai do Quadro e
-- não há caminho de volta. O trabalho acontece fora do sistema, e é justamente
-- o trabalho que ninguém mede.
--
-- ISTO NÃO QUEBRA A INVARIANTE 3.5. Ela diz que só existem dois caminhos
-- TERMINAIS e que chegar a `encerrado` exige entrega confirmada e ao menos um
-- entregável. Continua valendo: a reabertura não inventa um terceiro destino,
-- ela desfaz o encerramento de forma explícita, registrada e com motivo — o
-- mesmo padrão do cancelamento. O gesto fica em `eventos`, com quem fez.
--
-- SÓ `encerrado`, NUNCA `cancelado`. São coisas diferentes: um caso encerrado
-- teve o trabalho feito e entregue, e a família voltou pedindo ajuste. Um caso
-- cancelado é uma decisão comercial sobre o contrato, e desfazê-la é vender de
-- novo, não editar de novo. Se isso for preciso um dia, é outra RPC com outro
-- nome.
--
-- O RELÓGIO RECOMEÇA. Decidido com o gestor em 28/08/2026. A revisão é trabalho
-- novo com prazo próprio: reabriu hoje, vence pelo prazo do pacote a partir de
-- hoje. Mantendo o vencimento original, todo caso reaberto nasceria semanas
-- atrasado, pintaria o Quadro de vermelho falso e lideraria para sempre a fila
-- de edição, que ordena por urgência. E a entrega original não se perde: ela
-- está em `eventos` com a data em que aconteceu, então "entregou no prazo?"
-- continua respondível sobre o que de fato aconteceu.
-- -----------------------------------------------------------------------------

alter table public.casos
  add column reaberto_em timestamptz;

comment on column public.casos.reaberto_em is
  'Quando o caso voltou de um encerramento, por pedido de alteração da família. NULL na esmagadora maioria. Passa a ser a BASE do vencimento no lugar do fim do nascimento: a revisão é trabalho novo e ganha o prazo do pacote contado daqui — ver a view quadro_casos. A entrega original continua registrada em eventos, com a data real.';


-- -----------------------------------------------------------------------------
-- 2. Horário previsto por etapa
--
-- `casos.previsao_em` é a hora do atendimento, e vem do Calendar. Banho e
-- fechamento acontecem em outra hora, combinada depois com a família, e o
-- sistema não tinha onde guardar isso — o gestor pediu ("quando ela lançar o
-- horário do fechamento, do banho").
--
-- É data PLANEJADA, não de ocorrência: a invariante 3.4 permite explicitamente
-- que o cliente informe `previsao_em`. O que nunca vem do aparelho é
-- `iniciado_em` / `concluido_em`.
--
-- Vale só para acompanhamento na prática — edição não tem hora marcada, tem
-- prazo. A coluna não proíbe: uma constraint por trilha custaria mais do que
-- resolve, e preencher a previsão de uma edição não quebra nada, só não é
-- usado.
-- -----------------------------------------------------------------------------

alter table public.caso_etapas
  add column previsao_em timestamptz;

comment on column public.caso_etapas.previsao_em is
  'Hora combinada para ESTA etapa, quando ela tem hora própria — tipicamente banho e fechamento, marcados com a família depois do parto. Data planejada, informada por quem atende (permitido pela invariante 3.4); nunca é hora de ocorrência. Alimenta o alerta de aproximação no Quadro: âmbar a 1h, vermelho a 30min, e some quando a etapa inicia.';

create index idx_caso_etapas_previsao on public.caso_etapas (previsao_em)
  where previsao_em is not null;


-- -----------------------------------------------------------------------------
-- 3. agendar_etapa
-- -----------------------------------------------------------------------------

create or replace function public.agendar_etapa(
  p_caso_etapa_id uuid,
  p_previsao_em   timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pessoa_id uuid;
  v_caso_id   uuid;
  v_status    public.status_etapa;
  v_anterior  timestamptz;
begin
  select p.id into v_pessoa_id
  from public.pessoas p
  where p.auth_user_id = auth.uid()
    and p.ativo;

  if v_pessoa_id is null then
    raise exception 'Usuário autenticado não corresponde a nenhuma pessoa ativa.';
  end if;

  select ce.caso_id, ce.status, ce.previsao_em
    into v_caso_id, v_status, v_anterior
  from public.caso_etapas ce
  where ce.id = p_caso_etapa_id
  for update;

  if not found then
    raise exception 'caso_etapa % não encontrada.', p_caso_etapa_id;
  end if;

  -- Marcar hora para algo que já terminou não descreve nada, e o alerta do
  -- Quadro ignoraria de qualquer forma. Recusar é melhor que aceitar em
  -- silêncio um dado que não vai a lugar nenhum.
  if v_status in ('concluida', 'dispensada') then
    raise exception
      'Etapa % já está "%" — não há hora a combinar.', p_caso_etapa_id, v_status;
  end if;

  if p_previsao_em is not distinct from v_anterior then
    return;
  end if;

  update public.caso_etapas
     set previsao_em = p_previsao_em
   where id = p_caso_etapa_id;

  insert into public.eventos (caso_id, caso_etapa_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    v_caso_id,
    p_caso_etapa_id,
    v_pessoa_id,
    'etapa_agendada',
    jsonb_build_object(
      'caso_etapa_id', p_caso_etapa_id,
      'previsao_em', p_previsao_em,
      'previsao_anterior', v_anterior
    ),
    now()
  );
end;
$$;

comment on function public.agendar_etapa(uuid, timestamptz) is
  'Marca a hora combinada de uma etapa (banho, fechamento). NULL limpa. É data planejada — a única que a invariante 3.4 permite vir do cliente. Recusa etapa concluída ou dispensada. Não é transição de estado: não toca status nem relógio de ciclo.';

revoke all on function public.agendar_etapa(uuid, timestamptz) from public;
grant execute on function public.agendar_etapa(uuid, timestamptz) to authenticated;


-- -----------------------------------------------------------------------------
-- 4. reabrir_caso
--
-- QUEM PODE: atendimento e adm, como em `cancelar_caso`. Reabrir nasce de um
-- pedido da família que chega no atendimento, e desfaz um encerramento que
-- alguém assinou. `confirmar_entrega` foi aberta para toda pessoa ativa porque
-- quem gera os links são as fotógrafas; aqui a origem do gesto é outra.
--
-- AS ETAPAS SÃO ESCOLHIDAS por quem reabre. "Alteração no vídeo" e "todas as
-- fotos em preto e branco" pedem trabalhos diferentes, e recriar o checklist
-- inteiro faria a equipe refazer nascimento e banho — que não vão acontecer de
-- novo.
--
-- CADA UMA VIRA UMA RODADA NOVA, e não uma reabertura da linha antiga. A rodada
-- 1 guarda quanto tempo a edição original levou; sobrescrevê-la apagaria a
-- medição do trabalho que já foi feito e entregue. O `rodada` existe desde a
-- 20260827172830 justamente para "a mesma etapa, outra passagem".
-- -----------------------------------------------------------------------------

create or replace function public.reabrir_caso(
  p_caso_id uuid,
  p_motivo  text,
  p_etapas  public.etapa_tipo[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pessoa_id uuid;
  v_status    public.status_operacional;
  v_motivo    text;
  v_tipo      public.etapa_tipo;
  v_rodada    smallint;
  v_etapa_id  uuid;
  v_fora      text;
begin
  select p.id into v_pessoa_id
  from public.pessoas p
  where p.auth_user_id = auth.uid()
    and p.ativo;

  if v_pessoa_id is null then
    raise exception 'Usuário autenticado não corresponde a nenhuma pessoa ativa.';
  end if;

  if not (public.eh_atendimento() or public.eh_adm()) then
    raise exception
      'Reabrir um caso entregue é decisão de atendimento — peça a quem cuida do contrato.';
  end if;

  v_motivo := nullif(btrim(coalesce(p_motivo, '')), '');
  if v_motivo is null then
    raise exception
      'Reabertura exige o motivo: é ele que diz à editora o que a família pediu.';
  end if;

  if p_etapas is null or array_length(p_etapas, 1) is null then
    raise exception
      'Escolha ao menos uma etapa a refazer — reabrir sem trabalho a fazer deixaria o caso aberto para sempre.';
  end if;

  select c.status_operacional into v_status
  from public.casos c
  where c.id = p_caso_id
  for update;

  if not found then
    raise exception 'Caso % não encontrado.', p_caso_id;
  end if;

  if v_status <> 'encerrado' then
    raise exception
      'Só um caso ENCERRADO se reabre — este está "%". Cancelado é decisão comercial e não se desfaz por aqui.',
      v_status;
  end if;

  -- A etapa pedida tem que existir no pacote do caso. Sem isto, um BASIC
  -- ganharia uma edição de vídeo que ele nunca vendeu, e o checklist passaria
  -- a cobrar um trabalho que ninguém contratou.
  select string_agg(distinct t::text, ', ') into v_fora
  from unnest(p_etapas) t
  where not exists (
    select 1
    from public.pacote_etapas pe
    join public.casos c on c.pacote_id = pe.pacote_id
    where c.id = p_caso_id
      and pe.etapa_tipo = t
  );

  if v_fora is not null then
    raise exception 'O pacote deste caso não inclui: %.', v_fora;
  end if;

  update public.casos
     set status_operacional = 'em_edicao',
         status_entrega     = 'pendente',
         reaberto_em        = now()
   where id = p_caso_id;

  foreach v_tipo in array p_etapas loop
    select coalesce(max(ce.rodada), 0)::smallint + 1 into v_rodada
    from public.caso_etapas ce
    where ce.caso_id = p_caso_id
      and ce.tipo = v_tipo;

    insert into public.caso_etapas (caso_id, tipo, status, ordem, rodada, observacao)
    values (
      p_caso_id,
      v_tipo,
      'pendente',
      public.ordem_padrao_da_etapa(v_tipo),
      v_rodada,
      v_motivo
    )
    returning id into v_etapa_id;

    insert into public.eventos (caso_id, caso_etapa_id, pessoa_id, tipo, payload, ocorrido_em)
    values (
      p_caso_id,
      v_etapa_id,
      v_pessoa_id,
      'etapa_de_revisao_criada',
      jsonb_build_object('tipo', v_tipo, 'rodada', v_rodada, 'motivo', v_motivo),
      now()
    );
  end loop;

  insert into public.eventos (caso_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    p_caso_id,
    v_pessoa_id,
    'caso_reaberto',
    jsonb_build_object(
      'motivo', v_motivo,
      'etapas', to_jsonb(p_etapas),
      'status_anterior', v_status
    ),
    now()
  );
end;
$$;

comment on function public.reabrir_caso(uuid, text, public.etapa_tipo[]) is
  'Traz de volta um caso ENCERRADO quando a família pede alteração depois da entrega. Exige motivo e ao menos uma etapa, que precisa existir no pacote do caso. Cada etapa vira uma RODADA NOVA — a anterior guarda o tempo de ciclo do trabalho já entregue e não pode ser sobrescrita. Marca reaberto_em, que passa a ser a base do vencimento: a revisão ganha o prazo do pacote contado da reabertura. Restrita a atendimento/adm, como cancelar_caso. NUNCA reabre caso cancelado: desfazer um cancelamento é vender de novo, não editar de novo.';

revoke all on function public.reabrir_caso(uuid, text, public.etapa_tipo[]) from public;
grant execute on function public.reabrir_caso(uuid, text, public.etapa_tipo[]) to authenticated;


-- -----------------------------------------------------------------------------
-- 5. A view aprende a reabertura e o horário da etapa
--
-- Uma mudança só no vencimento: a base deixa de ser sempre o fim do nascimento
-- e passa a ser `coalesce(reaberto_em, nascimento.concluido_em)`. Tudo o mais
-- — dias úteis, pausa de UTI, prazo_total_horas — continua valendo igual, e é
-- de propósito: a revisão não é um regime diferente de prazo, é o mesmo prazo
-- do pacote a partir de outro instante.
-- -----------------------------------------------------------------------------

create or replace view public.quadro_casos
with (security_invoker = true) as
  select
    c.id,
    c.mae_nome,
    c.bebe_nome,
    c.previsao_em,
    (c.previsao_em at time zone 'America/Sao_Paulo')::date as dia,
    c.cor_calendar,
    c.observacao,
    c.situacao_clinica,
    c.status_operacional,
    c.status_entrega,
    c.termo_status,
    c.pacote_id,
    p.nome as pacote_nome,
    p.slug as pacote_slug,
    extract(epoch from p.prazo_entrega) / 3600::numeric as prazo_entrega_horas,
    c.maternidade_id,
    m.nome as maternidade_nome,
    m.sigla as maternidade_sigla,
    n.concluido_em as nascimento_concluido_em,
    case
      when p.prazo_dias_uteis is not null
        then public.somar_dias_uteis(coalesce(c.reaberto_em, n.concluido_em), p.prazo_dias_uteis)
      else coalesce(c.reaberto_em, n.concluido_em) + p.prazo_entrega
    end
      + c.uti_acumulada
      + case when c.uti_desde is not null then now() - c.uti_desde
             else '00:00:00'::interval end
      as vence_em,
    c.uti_desde,
    c.uti_desde is not null as na_uti,
    c.uti_desde is not null as sla_pausado,
    extract(epoch from c.uti_acumulada +
      case when c.uti_desde is not null then now() - c.uti_desde
           else '00:00:00'::interval end) / 3600::numeric as uti_horas_total,
    c.pacote_id is null as falta_pacote,
    c.maternidade_id is null as falta_maternidade,
    c.pacote_id is null or c.maternidade_id is null as eh_rascunho,
    c.status_operacional = any (array['encerrado'::status_operacional, 'cancelado'::status_operacional]) as eh_terminal,
    etapas.total::integer as etapas_total,
    etapas.concluidas::integer as etapas_concluidas,
    c.created_at,
    c.updated_at,
    p.prazo_dias_uteis,
    extract(epoch from (
      case
        when p.prazo_dias_uteis is not null
          then public.somar_dias_uteis(coalesce(c.reaberto_em, n.concluido_em), p.prazo_dias_uteis)
        else coalesce(c.reaberto_em, n.concluido_em) + p.prazo_entrega
      end - coalesce(c.reaberto_em, n.concluido_em)
    )) / 3600::numeric as prazo_total_horas,
    c.reaberto_em
  from public.casos c
    left join public.pacotes p on p.id = c.pacote_id
    left join public.maternidades m on m.id = c.maternidade_id
    left join public.caso_etapas n on n.caso_id = c.id and n.tipo = 'nascimento'
    left join lateral (
      select count(*) as total,
             count(*) filter (where ce.status = 'concluida') as concluidas
      from public.caso_etapas ce
      where ce.caso_id = c.id
    ) etapas on true;

comment on column public.quadro_casos.vence_em is
  'Vencimento DERIVADO, nunca armazenado. Base: o fim do nascimento, ou reaberto_em quando o caso voltou por pedido de alteração — a revisão ganha o prazo do pacote contado da reabertura. Soma a pausa de UTI em horas corridas.';
comment on column public.quadro_casos.reaberto_em is
  'Quando o caso voltou de um encerramento. NULL na esmagadora maioria; quando presente, é a base do vence_em.';
