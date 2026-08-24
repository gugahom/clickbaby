-- =============================================================================
-- UTI: o caso sai do dia e o SLA PAUSA enquanto durar.
--
-- Quando o bebê vai para a UTI, o caso para de ser trabalho do dia — ele volta
-- quando o bebê voltar. Cobrar o prazo de entrega desse intervalo seria punir a
-- empresa por um evento clínico que ela não controla.
--
-- A MECÂNICA DO SLA
-- vence_em continua DERIVADO, nunca armazenado:
--
--   vence_em = nascimento.concluido_em
--            + pacote.prazo_entrega
--            + uti_acumulada                                  -- idas anteriores
--            + (now() - uti_desde)  quando está na UTI agora  -- ida atual
--
-- Enquanto o caso está na UTI, vence_em anda para frente na MESMA velocidade
-- que o relógio, então "quanto falta" fica congelado. É isso que significa
-- pausar o SLA.
--
-- Alternativa rejeitada: recalcular e GRAVAR vence_em na volta. É a mesma
-- armadilha que o comentário de pacotes.prazo_entrega já documenta — guardar o
-- vencimento calculado congela o SLA antigo, e mudar o prazo do pacote deixa de
-- recalcular os casos existentes.
--
-- CONSEQUÊNCIA: a view fica VOLÁTIL. Um caso na UTI devolve vence_em diferente
-- a cada consulta. É o preço de pausar sem armazenar, e é o comportamento
-- correto — só não dá para cachear a coluna. A tela não deve mostrar contagem
-- regressiva nesse estado (ficaria congelada e pareceria bug); para isso a view
-- expõe sla_pausado.
--
-- SITUAÇÃO CLÍNICA
-- situacao_clinica já tem o valor 'uti'. Manter os dois em sincronia é
-- responsabilidade das RPCs: mover_para_uti grava 'uti', retornar_da_uti
-- restaura o estado anterior.
--
-- Restaurar exigia saber o que era antes. Em vez de uma coluna
-- situacao_anterior, a volta DEDUZ do que já está no banco: se a etapa de
-- nascimento está concluída, o bebê nasceu e a situação volta para 'nasceu';
-- senão, 'internada'. Sem coluna nova e sem regredir um caso que já tinha
-- avançado.
--
-- O QUE ESTA MIGRATION NÃO FAZ
-- Não pausa a etapa em andamento. A fotógrafa pode continuar trabalhando com o
-- bebê na UTI; quem decide parar é ela, com pausar_etapa.
--
-- Não filtra a view. quadro_casos segue trazendo todos os casos, inclusive os
-- de UTI — a seção UTI da tela precisa ler o `dia` para dizer de que dia o caso
-- era. Quem tira do bloco do dia é a tela, mesma separação já usada para status
-- terminal.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Colunas
-- -----------------------------------------------------------------------------

alter table public.casos
  add column uti_desde     timestamptz,
  add column uti_acumulada interval not null default '0';

alter table public.casos
  add constraint casos_uti_acumulada_nao_negativa
    check (uti_acumulada >= interval '0');

comment on column public.casos.uti_desde is
  'Início da estadia ATUAL na UTI. NULL quando o caso não está na UTI. Carimbado por now() do servidor dentro de mover_para_uti() — nunca vem do cliente (invariante 3.4). Enquanto preenchido, o SLA está pausado e o caso sai do bloco do dia.';
comment on column public.casos.uti_acumulada is
  'Soma das estadias de UTI já encerradas. Entra no cálculo de vence_em para o prazo não correr durante a UTI. Reconstruível a partir dos eventos caso_movido_para_uti/caso_retornou_da_uti.';

create index idx_casos_uti on public.casos (uti_desde) where uti_desde is not null;


-- -----------------------------------------------------------------------------
-- 2. mover_para_uti
-- -----------------------------------------------------------------------------

create or replace function public.mover_para_uti(
  p_caso_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pessoa_id uuid;
  v_status    public.status_operacional;
  v_uti_desde timestamptz;
begin
  select p.id into v_pessoa_id
  from public.pessoas p
  where p.auth_user_id = auth.uid()
    and p.ativo;

  if v_pessoa_id is null then
    raise exception 'Usuário autenticado não corresponde a nenhuma pessoa ativa.';
  end if;

  select c.status_operacional, c.uti_desde
    into v_status, v_uti_desde
  from public.casos c
  where c.id = p_caso_id
  for update;

  if not found then
    raise exception 'Caso % não encontrado.', p_caso_id;
  end if;

  if v_status in ('encerrado', 'cancelado') then
    raise exception
      'Caso % já está em status terminal ("%") — não pode ir para a UTI.',
      p_caso_id, v_status;
  end if;

  if v_uti_desde is not null then
    raise exception 'Caso % já está na UTI desde %.', p_caso_id, v_uti_desde;
  end if;

  update public.casos
     set uti_desde        = now(),
         situacao_clinica = 'uti'
   where id = p_caso_id;

  insert into public.eventos (caso_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    p_caso_id,
    v_pessoa_id,
    'caso_movido_para_uti',
    jsonb_build_object('caso_id', p_caso_id),
    now()
  );
end;
$$;

comment on function public.mover_para_uti(uuid) is
  'Move o caso para a UTI: abre a janela em uti_desde (o que PAUSA o SLA, já que vence_em soma esse intervalo) e grava situacao_clinica = uti. Não pausa a etapa em andamento — quem decide parar de trabalhar é a operadora, com pausar_etapa. Qualquer pessoa ativa pode chamar: quem está na maternidade é quem vê o bebê ir para a UTI.';

revoke execute on function public.mover_para_uti(uuid) from public, anon;
grant  execute on function public.mover_para_uti(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- 3. retornar_da_uti
-- -----------------------------------------------------------------------------

create or replace function public.retornar_da_uti(
  p_caso_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pessoa_id       uuid;
  v_uti_desde       timestamptz;
  v_nasceu          boolean;
  v_situacao_volta  public.situacao_clinica;
begin
  select p.id into v_pessoa_id
  from public.pessoas p
  where p.auth_user_id = auth.uid()
    and p.ativo;

  if v_pessoa_id is null then
    raise exception 'Usuário autenticado não corresponde a nenhuma pessoa ativa.';
  end if;

  select c.uti_desde into v_uti_desde
  from public.casos c
  where c.id = p_caso_id
  for update;

  if not found then
    raise exception 'Caso % não encontrado.', p_caso_id;
  end if;

  if v_uti_desde is null then
    raise exception 'Caso % não está na UTI.', p_caso_id;
  end if;

  -- Deduz a situação de volta em vez de guardar a anterior numa coluna: se o
  -- nascimento já foi concluído, o bebê nasceu e voltar para 'internada'
  -- regrediria o caso.
  select exists (
    select 1 from public.caso_etapas ce
    where ce.caso_id = p_caso_id
      and ce.tipo = 'nascimento'
      and ce.status = 'concluida'
  ) into v_nasceu;

  v_situacao_volta := case when v_nasceu then 'nasceu' else 'internada' end;

  update public.casos
     set uti_acumulada    = uti_acumulada + (now() - v_uti_desde),
         uti_desde        = null,
         situacao_clinica = v_situacao_volta
   where id = p_caso_id;

  insert into public.eventos (caso_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    p_caso_id,
    v_pessoa_id,
    'caso_retornou_da_uti',
    jsonb_build_object(
      'caso_id', p_caso_id,
      'duracao_uti', (now() - v_uti_desde)::text,
      'situacao_clinica', v_situacao_volta
    ),
    now()
  );
end;
$$;

comment on function public.retornar_da_uti(uuid) is
  'Tira o caso da UTI: fecha a janela somando a duração em uti_acumulada (o SLA volta a correr, agora com o prazo esticado pelo tempo parado) e restaura situacao_clinica. A situação de volta é DEDUZIDA — nasceu se a etapa de nascimento já está concluída, internada caso contrário — para não regredir um caso que já tinha avançado. O evento registra a duração da estadia.';

revoke execute on function public.retornar_da_uti(uuid) from public, anon;
grant  execute on function public.retornar_da_uti(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- 4. quadro_casos recriada com o SLA que pausa
--
-- CREATE OR REPLACE não serve: a view ganha colunas novas no meio da lista, e o
-- REPLACE só aceita acrescentar no fim. DROP + CREATE recria — e, com os
-- default privileges já corrigidos pela 20260822072158, o objeto novo NÃO
-- nasce aberto: o GRANT no fim é obrigatório, não decorativo.
-- -----------------------------------------------------------------------------

drop view if exists public.quadro_casos;

create view public.quadro_casos
with (security_invoker = true)
as
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
  (extract(epoch from p.prazo_entrega) / 3600)::numeric as prazo_entrega_horas,

  c.maternidade_id,
  m.nome  as maternidade_nome,
  m.sigla as maternidade_sigla,

  n.concluido_em as nascimento_concluido_em,

  -- SLA derivado, agora esticado pelo tempo de UTI. Ver a nota no topo.
  n.concluido_em
    + p.prazo_entrega
    + c.uti_acumulada
    + case when c.uti_desde is not null then now() - c.uti_desde
           else interval '0' end                            as vence_em,

  c.uti_desde,
  (c.uti_desde is not null)                                 as na_uti,
  -- Enquanto true, a tela mostra "SLA pausado" em vez de contagem regressiva:
  -- vence_em anda junto com o relógio e um contador ficaria congelado.
  (c.uti_desde is not null)                                 as sla_pausado,
  (extract(epoch from (
    c.uti_acumulada
    + case when c.uti_desde is not null then now() - c.uti_desde
           else interval '0' end
  )) / 3600)::numeric                                       as uti_horas_total,

  (c.pacote_id is null)                             as falta_pacote,
  (c.maternidade_id is null)                        as falta_maternidade,
  (c.pacote_id is null or c.maternidade_id is null) as eh_rascunho,

  (c.status_operacional in ('encerrado', 'cancelado')) as eh_terminal,

  etapas.total::int      as etapas_total,
  etapas.concluidas::int as etapas_concluidas,

  c.created_at,
  c.updated_at
from public.casos c
left join public.pacotes      p on p.id = c.pacote_id
left join public.maternidades m on m.id = c.maternidade_id
left join public.caso_etapas  n on n.caso_id = c.id and n.tipo = 'nascimento'
left join lateral (
  select
    count(*)                                          as total,
    count(*) filter (where ce.status = 'concluida')   as concluidas
  from public.caso_etapas ce
  where ce.caso_id = c.id
) etapas on true;

comment on view public.quadro_casos is
  'Leitura do Quadro: casos achatados com pacote/maternidade resolvidos e as derivações canônicas — dia (America/Sao_Paulo), vence_em (SLA, pausado durante a UTI) e eh_rascunho. security_invoker = true: respeita a RLS de casos/caso_etapas do usuário logado, não é bypass. Traz TODOS os casos, inclusive os de UTI e os terminais: quem decide o que aparece em cada seção é a tela. VOLÁTIL — casos na UTI devolvem vence_em diferente a cada consulta, por construção.';

comment on column public.quadro_casos.dia is
  'previsao_em convertido para America/Sao_Paulo. É o eixo de agrupamento do Quadro. Agrupar em UTC erra o dia de casos previstos para a madrugada. Casos na UTI mantêm o dia para a seção de UTI poder dizer de que dia eram.';
comment on column public.quadro_casos.vence_em is
  'Vencimento do SLA, DERIVADO: concluido_em do nascimento + prazo_entrega + tempo total de UTI. NULL enquanto o nascimento não foi concluído. Nunca armazenar este valor — guardá-lo congelaria o prazo do pacote.';
comment on column public.quadro_casos.sla_pausado is
  'True enquanto o caso está na UTI. A tela deve mostrar "SLA pausado" em vez de contagem regressiva: vence_em avança junto com o relógio nesse estado, então um contador ficaria parado e pareceria defeito.';
comment on column public.quadro_casos.uti_horas_total is
  'Tempo total de UTI em horas, incluindo a estadia atual. É o quanto o prazo de entrega foi esticado.';
comment on column public.quadro_casos.eh_rascunho is
  'Rascunho pendente (seção 7 do CLAUDE.md): o sync não mapeou pacote ou maternidade com certeza. Definição canônica — nenhuma tela deve reescrever a expressão.';
comment on column public.quadro_casos.eh_terminal is
  'encerrado OU cancelado. Base da regra de visibilidade do Quadro: um dia só sai da tela quando todos os seus casos são terminais, nunca por passagem de data (invariante 3.5).';

grant select on public.quadro_casos to authenticated;
