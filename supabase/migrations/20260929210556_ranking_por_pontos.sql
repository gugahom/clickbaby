-- =============================================================================
-- O RANKING POR PONTOS (29/09/2026, pedido do gestor e do André).
-- =============================================================================
--
-- A gestão já fazia isto numa planilha com a ajuda de um chat: cada etapa vale
-- um PESO, porque "não posso colocar o mesmo peso para quem editou um Reels, que
-- leva 40 minutos, e quem fotografou um parto". O acompanhamento pesa mais (é
-- onde desgasta), a edição de fotos do parto vem logo atrás, e o resto é meio
-- ponto. E quando a etapa passou por MAIS DE UMA PESSOA — "comecei a editar,
-- fui para casa e não terminei, a outra pessoa continuou" —, os pontos se
-- DIVIDEM entre elas.
--
-- A TABELA QUE ELES MANDARAM, e que nasce aqui como a régua de 01/10/2026:
--   Nascimento 3 · Fotografia de Birth 3 · Foto parto 2 · Foto/Livro 1,5 ·
--   Entrada 1 · Banho 1 · Vídeo MASTER 1 (no áudio) · Fechamento 0,5 ·
--   Reels parto 0,5 · Foto B+F 0,5 · Reels B+F 0,5.
-- TRÊS SUPOSIÇÕES, ditas em voz alta porque a tabela não as cobre:
--   * encontro de irmãos, alta e saída da UTI valem o que vale o FECHAMENTO
--     (0,5): a própria tabela descreve o fechamento como "encontros de irmãos,
--     alta ou fotos finais no quarto";
--   * REVISÃO (rodada 3 em diante de foto e reels) e o NEW BORN começam em ZERO:
--     a tabela não os nomeia, e inventar um peso seria decidir por eles;
--   * a divisão vale para QUALQUER número de pessoas, em partes iguais — a
--     tabela mostra duas porque é o caso comum.
-- Os pesos se mudam NA TELA (`definir_pontos_do_item`), por isso nenhuma
-- suposição acima custa uma migration para desfazer.
--
-- QUEM DIVIDE: o RESPONSÁVEL da etapa (o crédito de sempre, ver 20260929020655)
-- mais todo mundo que aparece num HANDOFF dela, de um lado ou do outro. Handoff
-- só existe depois de o trabalho começar — antes disso trocar de mão é
-- atribuição (seção 13 do CLAUDE.md) —, então quem está nele pôs a mão na etapa.
-- Quem só clicou "concluir" no lugar de alguém NÃO divide: é o registro feito por
-- outra pessoa, e o defeito nº 1 do inventário era justamente creditar quem
-- clicou.
--
-- A RÉGUA É VERSIONADA, como os padrões de tempo: peso novo é linha nova, vale
-- da data em diante, e o mês passado continua contado com o peso que valia nele
-- — um ranking fechado não muda sozinho quando alguém mexe num número. No mesmo
-- dia, substitui (é correção). Cada mudança fica em `eventos`.
-- =============================================================================

create type public.item_de_pontuacao as enum (
  'nascimento',
  'nascimento_birth',
  'entrada',
  'banho',
  'fechamento',
  'encontro_irmaos',
  'saida_uti',
  'alta',
  'foto_parto',
  'foto_bf',
  'foto_revisao',
  'reels_parto',
  'reels_bf',
  'reels_revisao',
  'video_master',
  'fotolivro',
  'new_born'
);

comment on type public.item_de_pontuacao is
  'O que uma etapa concluída vale no ranking por pontos. Não é o tipo da etapa: a mesma edição de fotos é "foto parto" na rodada 1 e "foto B+F" na rodada 2, e o nascimento de um pacote da linha Birth é "fotografia de Birth". Ver item_de_pontuacao().';


-- -----------------------------------------------------------------------------
-- 1. De etapa para item. UMA definição, lida pela métrica.
-- -----------------------------------------------------------------------------

create function public.item_de_pontuacao(
  p_tipo        public.etapa_tipo,
  p_rodada      integer,
  p_pacote_slug text
)
returns public.item_de_pontuacao
language sql
immutable
set search_path = ''
as $$
  select case p_tipo
    -- "Quando o pacote contratado for da linha Birth." O prefixo é o mesmo
    -- critério da tela (`termo.ts`, `DialogoConfirmarEntrega`): birth e
    -- birth-reels.
    when 'nascimento'      then case when coalesce(p_pacote_slug, '') like 'birth%'
                                     then 'nascimento_birth' else 'nascimento' end
    when 'entrada'         then 'entrada'
    when 'banho'           then 'banho'
    when 'fechamento'      then 'fechamento'
    when 'encontro_irmaos' then 'encontro_irmaos'
    when 'saida_uti'       then 'saida_uti'
    when 'alta'            then 'alta'
    -- A rodada é o BLOCO de captura (seção 2 do CLAUDE.md): 1 é o parto, 2 é o
    -- banho + fechamento, e daí em diante é revisão (ou o encontro de irmãos de
    -- antes de 16/09, no reels).
    when 'edicao_foto'     then case p_rodada when 1 then 'foto_parto' when 2 then 'foto_bf' else 'foto_revisao' end
    when 'reels'           then case p_rodada when 1 then 'reels_parto' when 2 then 'reels_bf' else 'reels_revisao' end
    when 'edicao_video'    then 'video_master'
    when 'album'           then 'fotolivro'
    when 'click_home'      then 'new_born'
  end::public.item_de_pontuacao
$$;

revoke all on function public.item_de_pontuacao(public.etapa_tipo, integer, text) from public;


-- -----------------------------------------------------------------------------
-- 2. A régua
-- -----------------------------------------------------------------------------

create table public.pontos_por_item (
  id            uuid primary key default gen_random_uuid(),
  item          public.item_de_pontuacao not null,
  pontos        numeric(5, 2) not null check (pontos >= 0),
  vigente_desde date not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint pontos_por_item_vigencia_unica unique (item, vigente_desde)
);

comment on table public.pontos_por_item is
  'Quanto cada item vale no ranking por pontos, a partir de uma data. Peso novo é linha nova; no mesmo dia, substitui. Sem GRANT para ninguém: a leitura e a escrita passam por pontos_por_item_vigentes() e definir_pontos_do_item(), que conferem a gestão.';

create trigger pontos_por_item_set_updated_at
  before update on public.pontos_por_item
  for each row execute function public.set_updated_at();

alter table public.pontos_por_item enable row level security;
revoke all on table public.pontos_por_item from public, anon, authenticated;

insert into public.pontos_por_item (item, pontos, vigente_desde)
values
  ('nascimento',       3.0, '2026-10-01'),
  ('nascimento_birth', 3.0, '2026-10-01'),
  ('entrada',          1.0, '2026-10-01'),
  ('banho',            1.0, '2026-10-01'),
  ('fechamento',       0.5, '2026-10-01'),
  ('encontro_irmaos',  0.5, '2026-10-01'),
  ('saida_uti',        0.5, '2026-10-01'),
  ('alta',             0.5, '2026-10-01'),
  ('foto_parto',       2.0, '2026-10-01'),
  ('foto_bf',          0.5, '2026-10-01'),
  ('foto_revisao',     0.0, '2026-10-01'),
  ('reels_parto',      0.5, '2026-10-01'),
  ('reels_bf',         0.5, '2026-10-01'),
  ('reels_revisao',    0.0, '2026-10-01'),
  ('video_master',     1.0, '2026-10-01'),
  ('fotolivro',        1.5, '2026-10-01'),
  ('new_born',         0.0, '2026-10-01');


-- -----------------------------------------------------------------------------
-- 3. Ler a régua de hoje e mudá-la
-- -----------------------------------------------------------------------------
--
-- "HOJE" NUNCA É ANTES DE 01/10/2026. A régua de fábrica vale dessa data, e as
-- métricas também. Sem isto, nos dias antes dela a tela não teria peso nenhum
-- para mostrar, e um peso definido em 29/09 ficaria ATRÁS da régua de 01/10 — a
-- linha de fábrica, mais nova, venceria a escolha da gestão.

create function public.dia_da_regua_de_pontos()
returns date
language sql
stable
set search_path = ''
as $$
  select greatest(
    (now() at time zone 'America/Sao_Paulo')::date,
    (public.inicio_das_metricas() at time zone 'America/Sao_Paulo')::date
  )
$$;

revoke all on function public.dia_da_regua_de_pontos() from public;

create function public.pontos_por_item_vigentes()
returns table (
  item          public.item_de_pontuacao,
  pontos        numeric,
  vigente_desde date
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform public.exigir_gestao();

  return query
  select distinct on (p.item) p.item, p.pontos, p.vigente_desde
  from public.pontos_por_item p
  where p.vigente_desde <= public.dia_da_regua_de_pontos()
  order by p.item, p.vigente_desde desc;
end;
$$;

comment on function public.pontos_por_item_vigentes() is
  'O peso de cada item do ranking por pontos em vigor hoje. Só gestão.';

revoke all on function public.pontos_por_item_vigentes() from public, anon;
grant execute on function public.pontos_por_item_vigentes() to authenticated;


create function public.definir_pontos_do_item(
  p_item   public.item_de_pontuacao,
  p_pontos numeric
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pessoa_id uuid;
  v_hoje      date := public.dia_da_regua_de_pontos();
  v_anterior  numeric;
begin
  perform public.exigir_gestao();

  select p.id into v_pessoa_id
  from public.pessoas p
  where p.auth_user_id = auth.uid() and p.ativo;

  if p_item is null then
    raise exception 'Escolha o item da pontuação.';
  end if;

  if p_pontos is null or p_pontos < 0 or p_pontos > 100 then
    raise exception 'Os pontos vão de 0 a 100.';
  end if;

  -- Duas casas: é a precisão da coluna, e o que a tela mostra.
  p_pontos := round(p_pontos, 2);

  select distinct on (p.item) p.pontos into v_anterior
  from public.pontos_por_item p
  where p.item = p_item and p.vigente_desde <= v_hoje
  order by p.item, p.vigente_desde desc;

  if v_anterior is not distinct from p_pontos then
    return;  -- o peso já é este; nada muda, nada a registrar
  end if;

  insert into public.pontos_por_item (item, pontos, vigente_desde)
  values (p_item, p_pontos, v_hoje)
  on conflict on constraint pontos_por_item_vigencia_unica
  do update set pontos = excluded.pontos;

  insert into public.eventos (caso_id, caso_etapa_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    null, null, v_pessoa_id, 'pontos_do_item_definidos',
    jsonb_build_object('item', p_item, 'pontos', p_pontos, 'pontos_anterior', v_anterior,
                       'vigente_desde', v_hoje),
    now()
  );
end;
$$;

comment on function public.definir_pontos_do_item(public.item_de_pontuacao, numeric) is
  'Define quanto um item vale no ranking por pontos, a partir de hoje (Brasília). Peso novo é linha nova; no mesmo dia, substitui. Grava pontos_do_item_definidos em eventos. Só gestão.';

revoke all on function public.definir_pontos_do_item(public.item_de_pontuacao, numeric) from public, anon;
grant execute on function public.definir_pontos_do_item(public.item_de_pontuacao, numeric) to authenticated;


-- -----------------------------------------------------------------------------
-- 4. Os pontos de cada pessoa no período
-- -----------------------------------------------------------------------------
--
-- Uma linha por (pessoa, item): em quantas etapas ela pôs a mão, em quantas
-- delas dividiu, e os pontos — já divididos. As regras de sempre: etapa
-- CONCLUÍDA no período, piso de 01/10/2026, só gestão. O peso é o que valia no
-- DIA da conclusão.

create function public.metricas_pontos_por_pessoa(p_inicio date, p_fim date)
returns table (
  pessoa_id uuid,
  item      public.item_de_pontuacao,
  etapas    integer,
  divididas integer,
  pontos    numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_ini timestamptz;
  v_fim timestamptz;
begin
  perform public.exigir_gestao();
  select p.inicio, p.fim into v_ini, v_fim from public.periodo_das_metricas(p_inicio, p_fim) p;

  return query
  with conc as (
    select ce.id,
           ce.responsavel_id,
           (ce.concluido_em at time zone 'America/Sao_Paulo')::date as dia,
           public.item_de_pontuacao(ce.tipo, ce.rodada, pa.slug) as item
    from public.caso_etapas ce
    join public.casos c on c.id = ce.caso_id
    left join public.pacotes pa on pa.id = c.pacote_id
    where ce.status = 'concluida'
      and ce.responsavel_id is not null
      and ce.concluido_em >= v_ini
      and ce.concluido_em <  v_fim
  ),
  participantes as (
    select c.id as caso_etapa_id, c.responsavel_id as pid from conc c
    union
    select h.caso_etapa_id, h.de_pessoa_id from public.handoffs h
      join conc c on c.id = h.caso_etapa_id where h.de_pessoa_id is not null
    union
    select h.caso_etapa_id, h.para_pessoa_id from public.handoffs h
      join conc c on c.id = h.caso_etapa_id where h.para_pessoa_id is not null
  ),
  quantos as (
    select pa.caso_etapa_id, count(*) as n from participantes pa group by pa.caso_etapa_id
  ),
  valor as (
    select c.id, c.item,
           coalesce((
             select pp.pontos from public.pontos_por_item pp
             where pp.item = c.item and pp.vigente_desde <= c.dia
             order by pp.vigente_desde desc
             limit 1
           ), 0) as pontos
    from conc c
  )
  select pa.pid,
         v.item,
         count(*)::integer,
         count(*) filter (where q.n > 1)::integer,
         round(sum(v.pontos / q.n), 2)
  from participantes pa
  join quantos q on q.caso_etapa_id = pa.caso_etapa_id
  join valor v on v.id = pa.caso_etapa_id
  group by pa.pid, v.item;
end;
$$;

comment on function public.metricas_pontos_por_pessoa(date, date) is
  'O ranking por pontos: por pessoa e item, em quantas etapas concluídas no período ela pôs a mão, em quantas dividiu, e os pontos já divididos em partes iguais entre o responsável e quem aparece nos handoffs da etapa. O peso é o que valia no dia da conclusão. Só gestão.';

revoke all on function public.metricas_pontos_por_pessoa(date, date) from public, anon;
grant execute on function public.metricas_pontos_por_pessoa(date, date) to authenticated;
