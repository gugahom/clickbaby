-- pgTAP: pausar_etapa() e a retomada em iniciar_etapa()
-- (migrations 20260824105507 e 20260824105622).
--
-- O que precisa ser provado, e por quê:
--   - pausar só sai de em_andamento (pausar pendente ou concluída seria reabrir
--     trabalho por porta lateral);
--   - o tempo parado NÃO conta como trabalho — é a razão de a coluna existir;
--   - iniciado_em não é reescrito na retomada (apagaria história);
--   - retomada por OUTRA pessoa grava handoff antes de trocar o responsável
--     (invariante 3.2) e retomada pela MESMA pessoa não inventa handoff;
--   - etapa_iniciada e etapa_retomada são eventos distintos.
--
-- As pausas são simuladas com UPDATE direto em pausado_em (a conexão de teste
-- é privilegiada): now() dentro da mesma transação não anda, então sem isso o
-- acumulado seria sempre zero e o teste não provaria nada.

begin;
select plan(17);


-- =============================================================================
-- Fixtures
-- =============================================================================

insert into auth.users (id, email, aud, role, created_at, updated_at)
values
  (gen_random_uuid(), 'sai.pausa@clickbaby.test',  'authenticated', 'authenticated', now(), now()),
  (gen_random_uuid(), 'entra.pausa@clickbaby.test', 'authenticated', 'authenticated', now(), now());

insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'Quem Sai', u.id, 'operador', true
from auth.users u where u.email = 'sai.pausa@clickbaby.test';

insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'Quem Entra', u.id, 'operador', true
from auth.users u where u.email = 'entra.pausa@clickbaby.test';

insert into public.casos (id, mae_nome, pacote_id, maternidade_id, previsao_em)
values (
  'aaaaaaaa-0000-0000-0000-000000000001',
  'MAE PAUSE',
  (select id from public.pacotes where slug = 'basic'),
  (select id from public.maternidades where sigla = 'HSC'),
  '2026-09-10 12:00:00+00'
);

create function pg_temp.etapa(p_tipo public.etapa_tipo) returns uuid
language sql stable as $$
  select id from public.caso_etapas
  where caso_id = 'aaaaaaaa-0000-0000-0000-000000000001' and tipo = p_tipo;
$$;

create function pg_temp.vira(p_email text) returns void
language sql as $$
  select set_config(
    'request.jwt.claim.sub',
    (select id::text from auth.users where email = p_email),
    true
  );
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


-- =============================================================================
-- 1. Estrutura
-- =============================================================================

select ok(
  'pausada' = any (enum_range(null::public.status_etapa)::text[]),
  'status_etapa tem o valor pausada'
);

select has_column('public', 'caso_etapas', 'pausado_em', 'caso_etapas tem pausado_em');
select has_column('public', 'caso_etapas', 'pausa_acumulada', 'caso_etapas tem pausa_acumulada');


-- =============================================================================
-- 2. Guardas de pausar_etapa
-- =============================================================================

select pg_temp.vira('sai.pausa@clickbaby.test');
set local role authenticated;

select ok(
  pg_temp.levanta(
    format('select public.pausar_etapa(%L)', pg_temp.etapa('nascimento'))),
  'não dá para pausar etapa pendente — só em_andamento'
);

select public.iniciar_etapa(pg_temp.etapa('nascimento'));

select is(
  (select status from public.caso_etapas where id = pg_temp.etapa('nascimento')),
  'em_andamento'::public.status_etapa,
  'iniciar_etapa a partir de pendente segue funcionando'
);

select public.pausar_etapa(pg_temp.etapa('nascimento'));

select is(
  (select status from public.caso_etapas where id = pg_temp.etapa('nascimento')),
  'pausada'::public.status_etapa,
  'pausar_etapa leva em_andamento -> pausada'
);

select ok(
  (select pausado_em is not null from public.caso_etapas where id = pg_temp.etapa('nascimento')),
  'pausado_em abre a janela da pausa'
);

select ok(
  pg_temp.levanta(
    format('select public.pausar_etapa(%L)', pg_temp.etapa('nascimento'))),
  'pausar duas vezes seguidas é recusado (já não está em_andamento)'
);

reset role;


-- =============================================================================
-- 3. O tempo parado não conta como trabalho
--
-- Recua pausado_em em 2h: now() não anda dentro da transação, então sem isso
-- a pausa teria duração zero e o teste passaria por acidente.
-- =============================================================================

update public.caso_etapas
   set iniciado_em = now() - interval '3 hours',
       pausado_em  = now() - interval '2 hours'
 where id = pg_temp.etapa('nascimento');

select pg_temp.vira('entra.pausa@clickbaby.test');
set local role authenticated;

-- Quem entra retoma: é a troca de turno.
select public.iniciar_etapa(pg_temp.etapa('nascimento'));

reset role;

select ok(
  (select pausa_acumulada >= interval '1 hour 59 minutes'
     from public.caso_etapas where id = pg_temp.etapa('nascimento')),
  'a retomada soma as ~2h paradas em pausa_acumulada'
);

select ok(
  (select pausado_em is null
     from public.caso_etapas where id = pg_temp.etapa('nascimento')),
  'pausado_em é zerado na retomada (janela fechada)'
);

select ok(
  (select iniciado_em <= now() - interval '2 hours 59 minutes'
     from public.caso_etapas where id = pg_temp.etapa('nascimento')),
  'iniciado_em NÃO é reescrito na retomada — preserva quando o trabalho começou'
);

-- O ponto todo: 3h de relógio, 2h paradas, 1h de trabalho.
select ok(
  (select (now() - iniciado_em) - pausa_acumulada < interval '1 hour 2 minutes'
     from public.caso_etapas where id = pg_temp.etapa('nascimento')),
  'tempo de ciclo desconta a pausa: 3h de relógio viram ~1h de trabalho'
);


-- =============================================================================
-- 4. Retomada por outra pessoa é handoff (invariante 3.2)
-- =============================================================================

select is(
  (select p.nome from public.caso_etapas ce
     join public.pessoas p on p.id = ce.responsavel_id
    where ce.id = pg_temp.etapa('nascimento')),
  'Quem Entra',
  'quem retomou virou responsável'
);

select is(
  (select count(*)::int from public.handoffs h
    where h.caso_etapa_id = pg_temp.etapa('nascimento')),
  1,
  'a troca de responsável gravou linha em handoffs — nunca update silencioso'
);

select is(
  (select de.nome || ' -> ' || para.nome
     from public.handoffs h
     join public.pessoas de   on de.id = h.de_pessoa_id
     join public.pessoas para on para.id = h.para_pessoa_id
    where h.caso_etapa_id = pg_temp.etapa('nascimento')),
  'Quem Sai -> Quem Entra',
  'o handoff registra quem saiu e quem entrou'
);


-- =============================================================================
-- 5. Retomada pela MESMA pessoa não inventa handoff
-- =============================================================================

select pg_temp.vira('entra.pausa@clickbaby.test');
set local role authenticated;
select public.pausar_etapa(pg_temp.etapa('nascimento'));
select public.iniciar_etapa(pg_temp.etapa('nascimento'));
reset role;

select is(
  (select count(*)::int from public.handoffs h
    where h.caso_etapa_id = pg_temp.etapa('nascimento')),
  1,
  'retomar sozinho não cria handoff — segue sendo 1, o da troca de turno'
);


-- =============================================================================
-- 6. Eventos: começar e retomar são coisas diferentes
-- =============================================================================

-- Contagem por tipo, não sequência: todos os eventos desta transação de teste
-- compartilham o mesmo now(), então ordenar por ocorrido_em não define ordem
-- nenhuma. O que importa aqui é que os tipos existem e são distintos — a ordem
-- real é garantida pelo fluxo das RPCs, não por este assert.
select is(
  (select string_agg(tipo || '=' || n, ' ' order by tipo)
     from (
       select tipo, count(*)::int as n
       from public.eventos
       where caso_etapa_id = pg_temp.etapa('nascimento')
       group by tipo
     ) t),
  'etapa_iniciada=1 etapa_pausada=2 etapa_retomada=2 etapa_transferida=1',
  'o log distingue iniciada (1x) de retomada (2x) e registra a transferência da troca de turno'
);


select * from finish();
rollback;
