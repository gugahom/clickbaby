-- pgTAP: adicionar_etapa (migration 20260830063452).
--
-- Substitui rpc_adicionar_video.test.sql. A função deixou de ser sobre VÍDEO:
-- `adicionar_video` era esta mesma implementação com o tipo cravado, e o pedido
-- real do gestor era outro — acrescentar o BANHO que a fotógrafa vendeu na
-- hora, o FECHAMENTO que passou a existir, qualquer etapa que o pacote não
-- previa. O vídeo era só o primeiro exemplo disso, e o único que na prática
-- nunca acontece.
--
-- O que precisa ser provado:
--   - acrescenta a um pacote que não tem a etapa (o BASIC que vende o banho);
--   - a etapa nasce pendente, na ordem PADRÃO do tipo e na trilha certa;
--   - não mexe nas etapas que já existiam nem no pacote do caso;
--   - é idempotente de verdade: segunda chamada devolve false, não erra;
--   - recusa caso terminal e recusa RASCUNHO SEM PACOTE — esta última é a
--     guarda que impede um caso de nascer com uma etapa só (ver a migration);
--   - acrescentar banho e fechamento faz a SEGUNDA RODADA de edição aparecer
--     sozinha quando o fechamento conclui. É o efeito que justifica a função:
--     o caso passa a se comportar como se o pacote sempre tivesse tido a etapa.

begin;
select plan(18);


-- =============================================================================
-- Fixtures
-- =============================================================================

insert into auth.users (id, email, aud, role, created_at, updated_at)
values (gen_random_uuid(), 'etapa.teste@clickbaby.test', 'authenticated', 'authenticated', now(), now());

insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'Operador Etapa', u.id, 'operador', true
from auth.users u where u.email = 'etapa.teste@clickbaby.test';

-- BASIC: entrada, nascimento, edicao_foto, reels. Sem banho, sem fechamento,
-- sem o horizontal — é exatamente o caso do gestor.
insert into public.casos (id, mae_nome, pacote_id, maternidade_id, previsao_em)
values (
  'cccccccc-0000-0000-0000-000000000001',
  'MAE SEM BANHO',
  (select id from public.pacotes where slug = 'basic'),
  (select id from public.maternidades where sigla = 'HSC'),
  '2026-09-14 12:00:00+00'
);

-- MASTER: já traz edicao_video pelo pacote. Aqui a RPC tem que ser no-op.
insert into public.casos (id, mae_nome, pacote_id, maternidade_id, previsao_em)
values (
  'cccccccc-0000-0000-0000-000000000002',
  'MAE COM VIDEO',
  (select id from public.pacotes where slug = 'master'),
  (select id from public.maternidades where sigla = 'HSC'),
  '2026-09-14 14:00:00+00'
);

-- Rascunho pendente: sem pacote, e por isso sem etapa nenhuma.
insert into public.casos (id, mae_nome, pacote_id, maternidade_id, previsao_em)
values (
  'cccccccc-0000-0000-0000-000000000003',
  'MAE RASCUNHO',
  null,
  null,
  '2026-09-15 09:00:00+00'
);

create function pg_temp.vira(p_email text) returns void
language sql as $$
  select set_config('request.jwt.claim.sub',
    (select id::text from auth.users where email = p_email), true);
$$;

create function pg_temp.levanta(p_sql text) returns boolean
language plpgsql as $$
begin
  execute p_sql;
  return false;
exception when others then
  return true;
end;
$$;

create function pg_temp.etapa(p_caso uuid, p_tipo public.etapa_tipo)
returns uuid
language sql as $$
  select id from public.caso_etapas
  where caso_id = p_caso and tipo = p_tipo and rodada = 1;
$$;


-- =============================================================================
-- 1. Estado inicial
-- =============================================================================

select is(
  (select array_agg(tipo order by ordem) from public.caso_etapas
    where caso_id = 'cccccccc-0000-0000-0000-000000000001'),
  array['entrada', 'nascimento', 'edicao_foto', 'reels']::public.etapa_tipo[],
  'BASIC nasce com campo (entrada, nascimento) e edição (foto, reels) — sem banho e sem fechamento'
);


-- =============================================================================
-- 2. Acrescenta o banho vendido na hora
-- =============================================================================

select pg_temp.vira('etapa.teste@clickbaby.test');
set local role authenticated;

select is(
  public.adicionar_etapa('cccccccc-0000-0000-0000-000000000001', 'banho'),
  true,
  'adicionar_etapa devolve true quando cria a etapa'
);

reset role;

select is(
  (select count(*)::int from public.caso_etapas
    where caso_id = 'cccccccc-0000-0000-0000-000000000001'),
  5,
  'o caso passou a ter 5 etapas — as 4 originais seguem lá'
);

select is(
  (select status from public.caso_etapas
    where caso_id = 'cccccccc-0000-0000-0000-000000000001' and tipo = 'banho'),
  'pendente'::public.status_etapa,
  'a etapa nova nasce pendente, como qualquer outra'
);

-- A ordem é propriedade do TIPO, não da posição na lista: o banho é 3 em
-- qualquer caso, e entra ENTRE nascimento e edição, não no fim.
select is(
  (select ordem from public.caso_etapas
    where caso_id = 'cccccccc-0000-0000-0000-000000000001' and tipo = 'banho'),
  public.ordem_padrao_da_etapa('banho'),
  'a etapa entra com a ordem PADRÃO do tipo, igual em todo caso'
);

select is(
  (select trilha from public.caso_etapas
    where caso_id = 'cccccccc-0000-0000-0000-000000000001' and tipo = 'banho'),
  'acompanhamento',
  'e cai na trilha certa sem ninguém preencher — a coluna é gerada'
);

select is(
  (select rodada from public.caso_etapas
    where caso_id = 'cccccccc-0000-0000-0000-000000000001' and tipo = 'banho'),
  1::smallint,
  'entra sempre na rodada 1 — a segunda é da trigger do fechamento'
);

-- O pacote é o que foi vendido: acrescentar etapa não é trocar produto.
select is(
  (select p.slug from public.casos c join public.pacotes p on p.id = c.pacote_id
    where c.id = 'cccccccc-0000-0000-0000-000000000001'),
  'basic',
  'o pacote do caso NÃO muda — acrescentar etapa não é trocar de produto'
);

select is(
  (select count(*)::int from public.eventos
    where caso_id = 'cccccccc-0000-0000-0000-000000000001'
      and tipo = 'etapa_adicionada'),
  1,
  'gravou um evento etapa_adicionada'
);


-- =============================================================================
-- 3. Idempotência — o ponto que faz a opção ser segura de tocar duas vezes
-- =============================================================================

select pg_temp.vira('etapa.teste@clickbaby.test');
set local role authenticated;

select is(
  public.adicionar_etapa('cccccccc-0000-0000-0000-000000000001', 'banho'),
  false,
  'a segunda chamada devolve false em vez de erro'
);

-- O caso do vídeo, que era a função anterior inteira, continua coberto.
select is(
  public.adicionar_etapa('cccccccc-0000-0000-0000-000000000002', 'edicao_video'),
  false,
  'caso cujo pacote já traz a etapa também é no-op'
);

select is(
  public.adicionar_etapa('cccccccc-0000-0000-0000-000000000001', 'edicao_video'),
  true,
  'o horizontal vendido avulso continua funcionando — era a função antiga inteira'
);


-- =============================================================================
-- 4. Rascunho sem pacote: recusa
--
-- Sem esta guarda, gerar_caso_etapas veria uma etapa já existente ao confirmar
-- o pacote, desistiria de gerar ("nunca regenerar") e o caso ficaria com uma
-- etapa só — sem erro nenhum aparecendo.
-- =============================================================================

select ok(
  pg_temp.levanta(
    'select public.adicionar_etapa(''cccccccc-0000-0000-0000-000000000003'', ''banho'')'),
  'rascunho sem pacote recusa etapa avulsa'
);

reset role;

select is(
  (select count(*)::int from public.caso_etapas
    where caso_id = 'cccccccc-0000-0000-0000-000000000003'),
  0,
  'e o rascunho continua sem etapa nenhuma, livre para a geração do pacote'
);


-- =============================================================================
-- 5. A segunda rodada nasce sozinha
--
-- Este é o efeito que justifica a função existir: um BASIC que ganhou banho e
-- fechamento passa a se comportar como um pacote que sempre os teve.
-- =============================================================================

select pg_temp.vira('etapa.teste@clickbaby.test');
set local role authenticated;

select is(
  public.adicionar_etapa('cccccccc-0000-0000-0000-000000000001', 'fechamento'),
  true,
  'o fechamento também entra'
);

select public.concluir_etapa(
  pg_temp.etapa('cccccccc-0000-0000-0000-000000000001', 'nascimento'), null);
select public.concluir_etapa(
  pg_temp.etapa('cccccccc-0000-0000-0000-000000000001', 'banho'), null);
select public.concluir_etapa(
  pg_temp.etapa('cccccccc-0000-0000-0000-000000000001', 'fechamento'), null);

reset role;

select is(
  (select array_agg(tipo order by ordem) from public.caso_etapas
    where caso_id = 'cccccccc-0000-0000-0000-000000000001' and rodada = 2),
  array['edicao_foto', 'reels']::public.etapa_tipo[],
  'concluir o fechamento acrescentado cria a rodada 2 de foto e reels — sem ninguém pedir'
);


-- =============================================================================
-- 6. Caso terminal
-- =============================================================================

update public.casos
   set status_operacional = 'cancelado',
       motivo_cancelamento = 'teste'
 where id = 'cccccccc-0000-0000-0000-000000000002';

select pg_temp.vira('etapa.teste@clickbaby.test');
set local role authenticated;

select ok(
  pg_temp.levanta(
    'select public.adicionar_etapa(''cccccccc-0000-0000-0000-000000000002'', ''album'')'),
  'caso cancelado recusa etapa nova'
);

reset role;


-- =============================================================================
-- 7. A função antiga foi embora
-- =============================================================================

select ok(
  not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'adicionar_video'
  ),
  'adicionar_video não existe mais — uma implementação só da mesma regra'
);


select * from finish();
rollback;
