-- =============================================================================
-- Prazo de entrega em DIAS ÚTEIS, para o MASTER.
--
-- O QUE MUDOU NA REGRA
-- Conferido com o gestor em 27/08/2026: MASTER e MASTER + ÁLBUM entregam em
-- DEZ DIAS ÚTEIS, não em 7 dias corridos (que era um valor provisório, e o
-- comentário do seed já o marcava como tal). Os demais pacotes seguem como
-- estão — 48h na maioria, 24h no BIRTH e BIRTH + REELS.
--
-- POR QUE ISSO NÃO CABE NUM `interval`
-- `pacotes.prazo_entrega` é um intervalo fixo, e dia útil não é: dez dias úteis
-- a partir de uma sexta-feira terminam em outro ponto do calendário que dez
-- dias úteis a partir de uma segunda. O prazo passa a depender de QUANDO o
-- nascimento foi concluído, o que um intervalo não sabe expressar.
--
-- Daí a coluna nova e a função. A constraint garante que um pacote tem UM
-- prazo, não dois: ter os dois preenchidos criaria duas fontes de verdade para
-- a mesma pergunta, e o dia em que elas divergissem ninguém saberia qual vale.
--
-- FERIADOS: A TABELA NASCE VAZIA, DE PROPÓSITO
-- Vazia, `somar_dias_uteis` pula só sábado e domingo — que é o comportamento
-- correto enquanto ninguém confirmou a lista. Quando o cliente passar os
-- feriados que a operação respeita (nacionais? municipais de Curitiba? recesso
-- próprio?), é INSERT, não migration de schema. Deixar a tabela pronta e vazia
-- é o que separa "ainda não sabemos" de "não pensamos nisso".
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Feriados
-- -----------------------------------------------------------------------------

create table public.feriados (
  data date primary key,
  descricao text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint feriados_descricao_nao_vazia check (length(btrim(descricao)) > 0)
);

comment on table public.feriados is
  'Dias que NÃO contam como úteis no cálculo de prazo de entrega. Nasce vazia: sem linhas, somar_dias_uteis pula apenas fim de semana. Preencher é INSERT, não migration — a lista que a operação respeita ainda não foi confirmada com o cliente.';

create trigger set_updated_at before update on public.feriados
  for each row execute function public.set_updated_at();

alter table public.feriados enable row level security;

-- Cadastro como os outros: a equipe lê, adm escreve. Feriado não é dado
-- sensível — o que importa é ninguém alterar prazo de entrega sem ser adm.
create policy feriados_leitura on public.feriados
  for select to authenticated
  using (public.eh_pessoa_ativa());

create policy feriados_escrita_adm on public.feriados
  for all to authenticated
  using (public.eh_adm())
  with check (public.eh_adm());

grant select, insert, update, delete on public.feriados to authenticated;


-- -----------------------------------------------------------------------------
-- 2. A função
--
-- STABLE e não IMMUTABLE: lê `feriados`, então o resultado pode mudar entre
-- transações. Marcar como IMMUTABLE deixaria o planejador cachear o valor e um
-- feriado novo não teria efeito em índice ou view materializada.
--
-- SECURITY INVOKER (o padrão) de propósito: quem consulta precisa poder ler
-- `feriados`, e a policy acima já garante isso para a equipe. Um DEFINER aqui
-- só serviria para contornar uma RLS que não incomoda ninguém.
-- -----------------------------------------------------------------------------

create or replace function public.somar_dias_uteis(
  p_inicio timestamptz,
  p_dias integer
)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  v_data date;
  v_hora time;
  v_restantes integer;
  v_voltas integer := 0;
begin
  if p_inicio is null or p_dias is null then
    return null;
  end if;

  if p_dias <= 0 then
    return p_inicio;
  end if;

  -- Dia útil é conceito LOCAL: um parto às 22h de sexta em São Paulo já é
  -- sábado em UTC, e contar a partir do sábado daria um dia a mais de prazo.
  v_data := (p_inicio at time zone 'America/Sao_Paulo')::date;
  v_hora := (p_inicio at time zone 'America/Sao_Paulo')::time;
  v_restantes := p_dias;

  while v_restantes > 0 loop
    v_data := v_data + 1;

    if extract(isodow from v_data) < 6
       and not exists (select 1 from public.feriados f where f.data = v_data)
    then
      v_restantes := v_restantes - 1;
    end if;

    -- Guarda contra laço infinito: mesmo com um ano inteiro de feriados
    -- cadastrados por engano, isto sai. Sem ela, um INSERT errado em
    -- `feriados` derrubaria toda consulta ao Quadro.
    v_voltas := v_voltas + 1;
    if v_voltas > 3650 then
      raise exception 'somar_dias_uteis: mais de 3650 dias corridos para somar % dias úteis — a tabela feriados provavelmente está errada', p_dias;
    end if;
  end loop;

  -- Devolve o MESMO horário local no dia útil alvo. Um parto concluído às
  -- 14h vence às 14h, não à meia-noite.
  return (v_data + v_hora) at time zone 'America/Sao_Paulo';
end;
$$;

comment on function public.somar_dias_uteis(timestamptz, integer) is
  'Soma N dias úteis a um instante, preservando o horário local (America/Sao_Paulo). Pula sábado, domingo e as datas em public.feriados. STABLE porque depende do conteúdo de feriados.';

revoke all on function public.somar_dias_uteis(timestamptz, integer) from public;
grant execute on function public.somar_dias_uteis(timestamptz, integer) to authenticated, service_role;


-- -----------------------------------------------------------------------------
-- 3. O prazo do pacote
-- -----------------------------------------------------------------------------

alter table public.pacotes
  add column prazo_dias_uteis integer;

alter table public.pacotes
  add constraint pacotes_prazo_dias_uteis_positivo
    check (prazo_dias_uteis is null or prazo_dias_uteis > 0);

-- Um pacote tem UM prazo. Os dois preenchidos seriam duas respostas para a
-- mesma pergunta; nenhum preenchido é o rascunho sem pacote, que é NULL nos
-- dois e não chega aqui (a constraint só olha o pacote em si).
alter table public.pacotes
  add constraint pacotes_prazo_exclusivo
    check (num_nonnulls(prazo_entrega, prazo_dias_uteis) <= 1);

comment on column public.pacotes.prazo_dias_uteis is
  'Prazo de entrega contado em DIAS ÚTEIS, para pacotes cujo SLA não cabe num intervalo fixo (hoje: MASTER e MASTER + ÁLBUM, 10 dias úteis). Exclusivo com prazo_entrega — ver a constraint pacotes_prazo_exclusivo.';

update public.pacotes
   set prazo_entrega = null,
       prazo_dias_uteis = 10
 where slug in ('master', 'master-album');


-- -----------------------------------------------------------------------------
-- 4. A view
--
-- Duas colunas novas, e as duas existem por um motivo concreto no front:
--
--   prazo_dias_uteis  -> o rótulo. "SLA de 10 dias úteis" não sai de um número
--                        de horas, e arredondar daria "14 dias", que não é como
--                        a equipe fala.
--
--   prazo_total_horas -> o DENOMINADOR da urgência. A tela decide "urgente" por
--                        fração do prazo (restante / total), não por corte fixo
--                        de horas — é o que impede o "BIRTH primeiro" hardcoded
--                        que a seção 12 proíbe. Com dias úteis, o total deixou
--                        de ser derivável de prazo_entrega, então a view passa a
--                        entregá-lo pronto: é a janela REAL daquele caso, da
--                        conclusão do nascimento até o vencimento.
--
-- prazo_total_horas é NULL enquanto o nascimento não concluir, porque aí não há
-- janela — o relógio nem começou.
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
    -- O vencimento continua DERIVADO, nunca armazenado (ver 20260824163932).
    -- A única novidade é de onde sai a base: intervalo fixo ou dias úteis.
    -- A pausa de UTI é somada depois, em horas corridas nos dois casos — o
    -- tempo em que o bebê esteve na UTI não vira dia útil, é tempo de relógio
    -- que a empresa não controla e não deve pagar.
    case
      when p.prazo_dias_uteis is not null
        then public.somar_dias_uteis(n.concluido_em, p.prazo_dias_uteis)
      else n.concluido_em + p.prazo_entrega
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
          then public.somar_dias_uteis(n.concluido_em, p.prazo_dias_uteis)
        else n.concluido_em + p.prazo_entrega
      end - n.concluido_em
    )) / 3600::numeric as prazo_total_horas
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

comment on column public.quadro_casos.prazo_dias_uteis is
  'Prazo do pacote em dias úteis quando é assim que ele se mede (MASTER). NULL nos pacotes de intervalo fixo, que usam prazo_entrega_horas.';
comment on column public.quadro_casos.prazo_total_horas is
  'Janela REAL do caso em horas: do fim do nascimento até o vencimento, já resolvida seja o prazo em intervalo ou em dias úteis. É o denominador da urgência na tela. NULL enquanto o nascimento não concluir.';
