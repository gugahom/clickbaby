-- =============================================================================
-- ENTREGAS: o caso pronto é LIBERADO por quem trabalhou e CONFIRMADO por quem
-- entrega.
--
-- O PEDIDO (gestor, 06/09/2026): o card verde deixa de oferecer "Confirmar
-- entrega" a qualquer um. Ele ganha um gesto de envio; o caso enviado aparece
-- numa aba própria, entre Quadro e Rascunhos; e só o ADM e a gestão confirmam
-- a entrega ali. A entrega passa a ser trabalho de outra pessoa, não o último
-- clique de quem editou.
--
-- ISTO RESTAURA A CHECAGEM DE PAPEL QUE A 20260825014102 DERRUBOU, e vale dizer
-- por que não é contradição. Aquela migration abriu `confirmar_entrega` para
-- qualquer pessoa ativa com um motivo concreto: quem gerava os links eram as
-- fotógrafas, e prender o encerramento ao atendimento fazia gargalo de um passo
-- que ele não executava. Esse motivo deixou de existir ONTEM: desde a
-- 20260904190000 o link é pedido na conclusão da edição, então quando o caso
-- chega ao fim os links já estão no caso. Quem confirma não precisa mais ser
-- quem editou.
--
-- DUAS COLUNAS E NÃO UM VALOR NOVO EM `status_entrega`. Um estado intermediário
-- no enum seria mais elegante de ler, e é uma armadilha na prática: `alter type
-- ... add value` não pode ser USADO na mesma transação em que é criado, e toda
-- migration aqui roda em transação. Além disso o enum guardaria só o estado —
-- e o que o gestor quer saber é QUEM liberou e QUANDO, que é coluna.
-- =============================================================================

alter table public.casos
  add column liberado_para_entrega_em timestamptz,
  add column liberado_para_entrega_por uuid references public.pessoas (id) on delete restrict;

comment on column public.casos.liberado_para_entrega_em is
  'Quando o caso foi enviado para a aba Entregas. Nulo = ainda não foi enviado. '
  'Não é o mesmo que "pronto": pronto é derivado das etapas, isto é o gesto de '
  'uma pessoa dizendo que pode entregar.';
comment on column public.casos.liberado_para_entrega_por is
  'Quem fez o envio. É a resposta para "quem disse que estava pronto?" — a '
  'pergunta que aparece quando a família reclama do que recebeu.';

-- FK com índice, como toda FK deste schema.
create index if not exists casos_liberado_para_entrega_por_idx
  on public.casos (liberado_para_entrega_por);

-- O índice que a aba usa: só as linhas liberadas, que são poucas por definição.
create index if not exists casos_liberados_para_entrega_idx
  on public.casos (liberado_para_entrega_em)
  where liberado_para_entrega_em is not null;

-- As colunas novas NÃO entram no grant de UPDATE por coluna de `authenticated`
-- (20260822072158). Quem escreve nelas é a RPC abaixo, e só ela — é a mesma
-- regra que vale para status_operacional e status_entrega.


-- =============================================================================
-- liberar_para_entrega — o gesto de quem terminou o trabalho.
--
-- QUALQUER PESSOA ATIVA pode chamar, e é o ponto: quem acabou de editar é quem
-- sabe que acabou. Restringir aqui recriaria o gargalo que a 20260825014102 foi
-- feita para desfazer — só que uma casa antes.
--
-- As guardas são as MESMAS de `confirmar_entrega`, de propósito. Liberar um caso
-- que a confirmação vai recusar só empurra o erro para a mesa de quem não pode
-- consertá-lo: a fotógrafa vê "falta o link", o ADM veria "falta o link" de um
-- caso que não é dele. O erro tem que chegar a quem tem como agir.
-- =============================================================================

create or replace function public.liberar_para_entrega(p_caso_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pessoa_id          uuid;
  v_status_operacional public.status_operacional;
  v_liberado_em        timestamptz;
  v_pendentes          text;
  v_tem_entregavel     boolean;
begin
  select p.id into v_pessoa_id
  from public.pessoas p
  where p.auth_user_id = auth.uid()
    and p.ativo;

  if v_pessoa_id is null then
    raise exception 'Usuário autenticado não corresponde a nenhuma pessoa ativa.';
  end if;

  select c.status_operacional, c.liberado_para_entrega_em
    into v_status_operacional, v_liberado_em
  from public.casos c
  where c.id = p_caso_id
  for update;

  if not found then
    raise exception 'Caso % não encontrado.', p_caso_id;
  end if;

  if v_status_operacional in ('encerrado', 'cancelado') then
    raise exception
      'Caso % já está em status terminal ("%") — não há o que enviar para Entregas.',
      p_caso_id, v_status_operacional;
  end if;

  -- Idempotente: dois toques no botão, ou duas pessoas ao mesmo tempo, não
  -- reescrevem quem foi o primeiro. O crédito do envio é de quem enviou.
  if v_liberado_em is not null then
    return;
  end if;

  -- Mesma exceção do vídeo horizontal do MASTER (20260903153101): ele leva dez
  -- dias úteis, tem fluxo próprio na seção e é o único trabalho que sobrevive à
  -- entrega. Sem esta linha, nenhum MASTER chegaria à aba.
  select string_agg(ce.tipo::text, ', ' order by ce.rodada, ce.ordem)
    into v_pendentes
  from public.caso_etapas ce
  where ce.caso_id = p_caso_id
    and ce.tipo <> 'edicao_video'
    and ce.status not in ('concluida', 'dispensada');

  if v_pendentes is not null then
    raise exception
      'Caso % tem etapa em aberto (%) — conclua ou dispense antes de enviar para Entregas.',
      p_caso_id, v_pendentes;
  end if;

  select exists(
    select 1 from public.entregaveis e where e.caso_id = p_caso_id
  ) into v_tem_entregavel;

  if not v_tem_entregavel then
    raise exception
      'Caso % não tem nenhum link registrado — registre ao menos um antes de enviar para Entregas.',
      p_caso_id;
  end if;

  update public.casos
     set liberado_para_entrega_em  = now(),
         liberado_para_entrega_por = v_pessoa_id
   where id = p_caso_id;

  insert into public.eventos (caso_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    p_caso_id,
    v_pessoa_id,
    'caso_liberado_para_entrega',
    jsonb_build_object('caso_id', p_caso_id),
    now()
  );
end;
$$;

comment on function public.liberar_para_entrega(uuid) is
  'Envia um caso pronto para a aba Entregas, onde o ADM e a gestão confirmam a '
  'entrega. Chamável por qualquer pessoa ativa — quem terminou o trabalho é quem '
  'sabe que terminou. Exige as mesmas coisas que confirmar_entrega (nenhuma etapa '
  'em aberto além do vídeo horizontal do MASTER, e ao menos um link registrado), '
  'para o erro aparecer a quem pode consertá-lo. Idempotente: o segundo envio não '
  'reescreve quem foi o primeiro.';

revoke all on function public.liberar_para_entrega(uuid) from public, anon;
grant execute on function public.liberar_para_entrega(uuid) to authenticated;


-- =============================================================================
-- confirmar_entrega volta a exigir papel: atendimento ou adm.
--
-- Hoje isso é a Morgana (atendimento), a Amanda (financeiro) e os três da
-- gestão — as cinco pessoas que o gestor chama de "ADM e gestão". Nenhuma
-- fotógrafa.
--
-- ATENÇÃO A UMA ARMADILHA que quase entrou aqui: `eh_adm()` NÃO inclui
-- `atendimento` (ele é comercial, coordenacao, financeiro, gestao). Escrever só
-- `eh_adm()` deixaria de fora justamente a Morgana, que é quem faz a entrega.
-- O par `eh_atendimento() or eh_adm()` é o mesmo que `cancelar_caso` usa desde
-- a 20260821064027, e é o que significa "atendimento ou adm" neste projeto.
--
-- NÃO exige que o caso tenha sido liberado. A tela só oferece o botão dentro da
-- aba Entregas, que por definição lista os liberados; exigir aqui também
-- transformaria um caso não enviado num beco sem saída — invisível na aba e
-- impossível de confirmar. Liberar é fluxo de trabalho; o que a RPC guarda são
-- as travas que protegem a família: trabalho feito e link registrado.
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
  v_pendentes          text;
begin
  select p.id into v_pessoa_id
  from public.pessoas p
  where p.auth_user_id = auth.uid()
    and p.ativo;

  if v_pessoa_id is null then
    raise exception 'Usuário autenticado não corresponde a nenhuma pessoa ativa.';
  end if;

  if not (public.eh_atendimento() or public.eh_adm()) then
    raise exception 'Só atendimento ou adm podem confirmar entrega.';
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

  -- O trabalho tem que estar feito — EXCETO o vídeo horizontal do MASTER, que
  -- segue sendo operado pela seção depois do encerramento (20260903153101).
  select string_agg(ce.tipo::text, ', ' order by ce.rodada, ce.ordem)
    into v_pendentes
  from public.caso_etapas ce
  where ce.caso_id = p_caso_id
    and ce.tipo <> 'edicao_video'
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
    jsonb_build_object(
      'caso_id', p_caso_id,
      'video_master_pendente', exists(
        select 1 from public.caso_etapas ce
        where ce.caso_id = p_caso_id
          and ce.tipo = 'edicao_video'
          and ce.status not in ('concluida', 'dispensada')
      )
    ),
    now()
  );
end;
$$;

comment on function public.confirmar_entrega(uuid) is
  'Encerra o caso: confirma os entregáveis pendentes e leva status_operacional a '
  'encerrado. SÓ ATENDIMENTO OU ADM desde 20260906151515 — a entrega virou trabalho '
  'de outra pessoa, feito na aba Entregas. A checagem tinha caído em 20260825014102 '
  'porque quem gerava os links eram as fotógrafas; desde 20260904190000 o link entra '
  'na conclusão da edição, então quem confirma não precisa mais ser quem editou. '
  'Exige também: nenhuma etapa em aberto ALÉM do vídeo horizontal do MASTER, e ao '
  'menos um entregável registrado.';

-- `drop function` + `create function` reaplicaria os default privileges (a
-- lição da 20260821100857). `create or replace` não mexe nos grants, mas
-- declarar de novo é barato e deixa a intenção no arquivo que muda a função.
revoke all on function public.confirmar_entrega(uuid) from public, anon;
grant execute on function public.confirmar_entrega(uuid) to authenticated;


-- =============================================================================
-- A view do Quadro passa a carregar o envio.
--
-- As colunas vão no FIM: `create or replace view` só aceita acréscimo no fim, e
-- mexer na ordem exigiria derrubar a view — que tem grants e é lida pelo app.
-- =============================================================================

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
    c.reaberto_em,
    c.liberado_para_entrega_em,
    lib.nome as liberado_para_entrega_por_nome
  from public.casos c
    left join public.pacotes p on p.id = c.pacote_id
    left join public.maternidades m on m.id = c.maternidade_id
    left join public.pessoas lib on lib.id = c.liberado_para_entrega_por
    left join public.caso_etapas n on n.caso_id = c.id and n.tipo = 'nascimento'
    left join lateral (
      select count(*) as total,
             count(*) filter (where ce.status = 'concluida') as concluidas
      from public.caso_etapas ce
      where ce.caso_id = c.id
    ) etapas on true;

comment on column public.quadro_casos.liberado_para_entrega_em is
  'Quando o caso foi enviado para a aba Entregas. Nulo = ainda no fluxo do Quadro.';
