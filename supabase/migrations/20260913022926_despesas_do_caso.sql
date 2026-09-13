-- =============================================================================
-- DESPESAS DO CASO — o que se gastou para atender aquela família.
--
-- ISTO REABRE UM MÓDULO QUE FOI REMOVIDO DE PROPÓSITO, e a seção 12 do
-- CLAUDE.md pede instrução explícita para isso. Ela veio do gestor em
-- 12/09/2026: as fotógrafas se deslocam de Uber pago no cartão da empresa, e
-- hoje esse gasto vive numa faixa de colunas da planilha ("DESPESAS": IDA 1,
-- VOLTA 1, IDA/VOLTA da substituição, IDA 2/VOLTA 2, REFEIÇÃO EXTRA PARTOS,
-- REFEIÇÃO EXTRA FECHAMENTO), somado por caso no fim do mês.
--
-- O QUE VOLTA E O QUE NÃO VOLTA. Volta o REGISTRO DE GASTO por caso. NÃO volta
-- `status_financeiro` em `casos` (a trilha de conferência financeira do caso,
-- derrubada junto na 20260820043748) nem qualquer noção de receita, margem ou
-- fechamento de mês. O plano já registrava o porquê: "sem receita, só despesa —
-- não há margem por caso". Continua valendo.
--
-- POR QUE UMA LISTA E NÃO COLUNAS. A planilha repete IDA/VOLTA três vezes
-- porque grade não cresce: o terceiro deslocamento não teria onde entrar. Aqui
-- cada gasto é uma LINHA, e o caso soma quantas precisar — inclusive o caso
-- raro de duas substituições na mesma madrugada, que hoje não cabe na planilha.
--
-- O "MOMENTO" É RÓTULO, NÃO ETAPA (decisão do gestor). Ele guarda a leitura que
-- o ADM já faz — parto, substituição, fechamento — sem amarrar a despesa a uma
-- linha de `caso_etapas`. Amarrar seria mais bonito e quebraria na primeira
-- SUBSTITUIÇÃO, que é handoff e não etapa: não existe `caso_etapas` para "a
-- Thalia rendeu a Sarah às 4h". E é NULO por padrão, porque a maioria dos
-- lançamentos é o deslocamento óbvio do parto e obrigar a escolher custaria um
-- toque em cada um (seção 6).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Tipos
-- -----------------------------------------------------------------------------

-- `uber_ida` e `uber_volta` separados, e não um "uber" com sentido: é assim que
-- a planilha soma hoje, e é a diferença que mostra a volta que ninguém lançou.
-- `outro` existe para o gasto que aparecer sem precisar de migration — e paga o
-- preço de exigir descrição (constraint mais abaixo).
create type public.tipo_despesa as enum (
  'uber_ida',
  'uber_volta',
  'refeicao',
  'outro'
);

comment on type public.tipo_despesa is
  'Natureza do gasto. uber_ida/uber_volta espelham as colunas IDA/VOLTA da planilha; refeicao é a "refeição extra"; outro exige descrição.';

create type public.momento_despesa as enum (
  'parto',
  'substituicao',
  'fechamento'
);

comment on type public.momento_despesa is
  'Rótulo opcional, na nomenclatura da planilha. NÃO é etapa: substituicao é handoff, e handoff não tem linha em caso_etapas.';


-- -----------------------------------------------------------------------------
-- 2. Tabela
-- -----------------------------------------------------------------------------

create table public.despesas (
  id             uuid primary key default gen_random_uuid(),
  caso_id        uuid not null references public.casos (id) on delete cascade,

  -- DE QUEM FOI O GASTO — o dropdown de nome que a planilha tem em cada par de
  -- colunas. Separado de `registrado_por` de propósito: o ADM lança a corrida
  -- da fotógrafa, e as duas perguntas ("quem se deslocou" e "quem digitou")
  -- têm respostas diferentes com frequência.
  pessoa_id      uuid not null references public.pessoas (id) on delete restrict,

  tipo           public.tipo_despesa not null,
  momento        public.momento_despesa,

  -- numeric(10,2): dinheiro nunca em float. Dez dígitos sobram para uma corrida
  -- de Uber e não custam nada.
  valor          numeric(10, 2) not null,
  descricao      text,

  registrado_por uuid not null references public.pessoas (id) on delete restrict,
  registrado_em  timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint despesas_valor_positivo check (valor > 0),

  -- Zero e negativo não são gasto, são engano de digitação. Melhor recusar do
  -- que somar errado no fim do mês.
  constraint despesas_descricao_nao_vazia
    check (descricao is null or length(btrim(descricao)) > 0),

  -- "outro" sem descrição é uma linha que ninguém consegue conferir depois.
  constraint despesas_outro_exige_descricao
    check (tipo <> 'outro' or descricao is not null)
);

comment on table public.despesas is
  'Gasto por caso (Uber no cartão da empresa, refeição extra, outros). Substitui a faixa DESPESAS da planilha. Escrita só por registrar_despesa()/remover_despesa().';
comment on column public.despesas.pessoa_id is
  'De quem foi o gasto — quem se deslocou ou comeu. Não confundir com registrado_por, que é quem digitou.';
comment on column public.despesas.momento is
  'Rótulo opcional na nomenclatura da planilha (parto, substituicao, fechamento). Nulo é o caso comum.';

-- Toda FK com índice explícito (seção 5 do CLAUDE.md).
create index idx_despesas_caso on public.despesas (caso_id);
create index idx_despesas_pessoa on public.despesas (pessoa_id);
create index idx_despesas_registrado_por on public.despesas (registrado_por);

create trigger despesas_set_updated_at
  before update on public.despesas
  for each row execute function public.set_updated_at();


-- -----------------------------------------------------------------------------
-- 3. RLS e privilégios
--
-- Mesmo arranjo de `entregaveis`: leitura compartilhada para pessoa ativa,
-- escrita ZERO por policy — ela acontece só dentro das RPCs security definer.
-- O gestor escolheu "todos registram e todos veem": quem pegou o Uber é quem
-- sabe o valor, e esconder a soma de quem gasta transformaria a régua num
-- boletim que só a gestão lê.
-- -----------------------------------------------------------------------------

alter table public.despesas enable row level security;

create policy despesas_select_compartilhada
  on public.despesas
  for select
  to authenticated
  using (public.eh_pessoa_ativa());

comment on policy despesas_select_compartilhada on public.despesas is
  'Leitura compartilhada. Escrita 100% via registrar_despesa()/remover_despesa() — nenhuma policy de INSERT/UPDATE/DELETE aqui, nem para adm.';

-- Só SELECT, como manda a seção de privilégios: o verbo que a policy pressupõe
-- e nada além. Sem TRUNCATE para ninguém — é o único verbo que RLS não filtra.
grant select on public.despesas to authenticated;


-- -----------------------------------------------------------------------------
-- 4. registrar_despesa
--
-- SEM TRAVA DE STATUS DO CASO, e isso é deliberado: a corrida de Uber acontece
-- mesmo quando o parto não acontece. Um caso CANCELADO com deslocamento pago é
-- exatamente a linha que a empresa mais precisa ver — a fotógrafa foi, o cartão
-- pagou, e o caso morreu. Travar em "só caso aberto" apagaria esse gasto do
-- total do mês. Vale o mesmo para caso encerrado: a fatura do cartão chega
-- depois da entrega.
-- -----------------------------------------------------------------------------

create or replace function public.registrar_despesa(
  p_caso_id   uuid,
  p_tipo      public.tipo_despesa,
  p_valor     numeric,
  p_pessoa_id uuid default null,
  p_momento   public.momento_despesa default null,
  p_descricao text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_autor      uuid;
  v_de_quem    uuid;
  v_descricao  text;
  v_caso_existe boolean;
begin
  select p.id into v_autor
  from public.pessoas p
  where p.auth_user_id = auth.uid()
    and p.ativo;

  if v_autor is null then
    raise exception 'Usuário autenticado não corresponde a nenhuma pessoa ativa.';
  end if;

  select exists(select 1 from public.casos c where c.id = p_caso_id) into v_caso_existe;

  if not v_caso_existe then
    raise exception 'Caso % não encontrado.', p_caso_id;
  end if;

  if p_valor is null or p_valor <= 0 then
    raise exception 'O valor da despesa precisa ser maior que zero.';
  end if;

  -- Sem pessoa informada, a despesa é de quem está lançando: é o caso comum —
  -- a fotógrafa acabou de descer do Uber e registra a própria corrida.
  v_de_quem := coalesce(p_pessoa_id, v_autor);

  if not exists (select 1 from public.pessoas p where p.id = v_de_quem) then
    raise exception 'Pessoa % não encontrada.', v_de_quem;
  end if;

  -- Texto em branco é o mesmo que não ter texto. Normalizar aqui evita uma
  -- linha com um espaço passando pela constraint de "outro exige descrição".
  v_descricao := nullif(btrim(coalesce(p_descricao, '')), '');

  if p_tipo = 'outro' and v_descricao is null then
    raise exception 'Despesa do tipo "outro" precisa de descrição.';
  end if;

  insert into public.despesas (
    caso_id, pessoa_id, tipo, momento, valor, descricao, registrado_por
  )
  values (
    p_caso_id, v_de_quem, p_tipo, p_momento, p_valor, v_descricao, v_autor
  );

  insert into public.eventos (caso_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    p_caso_id,
    v_autor,
    'despesa_registrada',
    -- O VALOR VAI NO PAYLOAD, ao contrário da url do entregável. A url é
    -- credencial de acesso à galeria da família (seção 10); um valor em reais
    -- não abre porta nenhuma, e `eventos` é append-only — é o único lugar onde
    -- o gasto sobrevive a uma remoção, que é o que permite auditar o total do
    -- mês depois de alguém corrigir uma linha.
    jsonb_build_object(
      'caso_id', p_caso_id,
      'tipo', p_tipo,
      'valor', p_valor,
      'momento', p_momento,
      'de_pessoa_id', v_de_quem
    ),
    now()
  );
end;
$$;

comment on function public.registrar_despesa(uuid, public.tipo_despesa, numeric, uuid, public.momento_despesa, text) is
  'Lança um gasto do caso. Qualquer pessoa ativa pode chamar — quem gastou é quem sabe o valor. Sem p_pessoa_id, a despesa é de quem está lançando. Aceita caso em qualquer status, inclusive cancelado: a corrida acontece mesmo quando o parto não acontece.';

revoke all on function public.registrar_despesa(uuid, public.tipo_despesa, numeric, uuid, public.momento_despesa, text) from public;
revoke all on function public.registrar_despesa(uuid, public.tipo_despesa, numeric, uuid, public.momento_despesa, text) from anon;
grant execute on function public.registrar_despesa(uuid, public.tipo_despesa, numeric, uuid, public.momento_despesa, text) to authenticated;


-- -----------------------------------------------------------------------------
-- 5. remover_despesa
--
-- NÃO EXISTE "EDITAR". Valor digitado errado se resolve apagando e lançando de
-- novo — o mesmo caminho de `remover_entregavel`, e pelo mesmo motivo: um
-- UPDATE silencioso deixaria `eventos` dizendo que se gastou R$ 140 num dia em
-- que a linha viva diz R$ 14, sem nada que explique a diferença. Com apagar e
-- relançar, os três eventos contam a história inteira.
-- -----------------------------------------------------------------------------

create or replace function public.remover_despesa(
  p_despesa_id uuid,
  p_motivo     text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_autor   uuid;
  v_caso_id uuid;
  v_tipo    public.tipo_despesa;
  v_valor   numeric(10, 2);
begin
  select p.id into v_autor
  from public.pessoas p
  where p.auth_user_id = auth.uid()
    and p.ativo;

  if v_autor is null then
    raise exception 'Usuário autenticado não corresponde a nenhuma pessoa ativa.';
  end if;

  select d.caso_id, d.tipo, d.valor
    into v_caso_id, v_tipo, v_valor
  from public.despesas d
  where d.id = p_despesa_id;

  if v_caso_id is null then
    raise exception 'Despesa % não encontrada.', p_despesa_id;
  end if;

  delete from public.despesas where id = p_despesa_id;

  insert into public.eventos (caso_id, pessoa_id, tipo, payload, ocorrido_em)
  values (
    v_caso_id,
    v_autor,
    'despesa_removida',
    jsonb_build_object(
      'caso_id', v_caso_id,
      'tipo', v_tipo,
      'valor', v_valor,
      'motivo', nullif(btrim(coalesce(p_motivo, '')), '')
    ),
    now()
  );
end;
$$;

comment on function public.remover_despesa(uuid, text) is
  'Apaga um lançamento de despesa e grava despesa_removida com tipo e valor. Qualquer pessoa ativa — quem lançou errado é quem percebe primeiro. Não existe editar: apaga e lança de novo.';

revoke all on function public.remover_despesa(uuid, text) from public;
revoke all on function public.remover_despesa(uuid, text) from anon;
grant execute on function public.remover_despesa(uuid, text) to authenticated;
