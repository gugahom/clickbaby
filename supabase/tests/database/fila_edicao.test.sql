-- pgTAP: Fila de Edição — a view e a trava (migration 20260825051226).
--
-- A TRAVA é o que este arquivo existe para proteger. Sem ela, concluir sem
-- iniciar carimba iniciado_em e concluido_em no mesmo instante e o tempo de
-- ciclo dá zero — a métrica que o cliente usa para cobrar horas de edição
-- passa a mentir, sem erro em lugar nenhum.
--
-- Por isso o teste prova os dois lados da linha: pós-produção BARRA, campo
-- CONTINUA aceitando registro retroativo. Se alguém apertar demais e a trava
-- vazar para as etapas de campo, a fotógrafa deixa de conseguir registrar o
-- banho depois do parto — e isso quebra em produção, não aqui.

begin;
select plan(19);


-- =============================================================================
-- Fixtures
-- =============================================================================

insert into auth.users (id, email, aud, role, created_at, updated_at)
values (gen_random_uuid(), 'editora.fila@clickbaby.test', 'authenticated', 'authenticated', now(), now());

insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'Editora Fila', u.id, 'operador', true
from auth.users u where u.email = 'editora.fila@clickbaby.test';

-- BABY REELS: entrada, nascimento, banho, fechamento, edicao_video.
insert into public.casos (id, mae_nome, pacote_id, maternidade_id, previsao_em)
values (
  'ffffffff-0000-0000-0000-000000000001',
  'MAE FILA URGENTE',
  (select id from public.pacotes where slug = 'baby-reels'),
  (select id from public.maternidades where sigla = 'HSC'),
  '2026-09-24 08:00:00+00'
);

-- MASTER: prazo de 7 dias, então vence bem depois do BABY REELS de 48h.
insert into public.casos (id, mae_nome, pacote_id, maternidade_id, previsao_em)
values (
  'ffffffff-0000-0000-0000-000000000002',
  'MAE FILA FOLGADA',
  (select id from public.pacotes where slug = 'master'),
  (select id from public.maternidades where sigla = 'HSC'),
  '2026-09-24 09:00:00+00'
);

create function pg_temp.etapa(p_caso uuid, p_tipo public.etapa_tipo) returns uuid
language sql stable as $$
  select id from public.caso_etapas where caso_id = p_caso and tipo = p_tipo;
$$;

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

-- Os dois nascimentos concluídos há 10h: o SLA está correndo nos dois, e é a
-- diferença de prazo do PACOTE que separa urgente de folgado.
update public.caso_etapas
   set status = 'concluida',
       iniciado_em  = now() - interval '11 hours',
       concluido_em = now() - interval '10 hours'
 where tipo = 'nascimento'
   and caso_id in (
     'ffffffff-0000-0000-0000-000000000001',
     'ffffffff-0000-0000-0000-000000000002'
   );


-- =============================================================================
-- 1. A view
-- =============================================================================

select has_view('public', 'fila_edicao', 'a view fila_edicao existe');

select ok(
  (select reloptions::text[] @> array['security_invoker=true']
   from pg_class where oid = 'public.fila_edicao'::regclass),
  'é security_invoker — respeita a RLS de quem consulta, não é bypass'
);

select ok(
  has_table_privilege('authenticated', 'public.fila_edicao', 'SELECT')
  and not has_table_privilege('anon', 'public.fila_edicao', 'SELECT'),
  'authenticated lê, anon não — o GRANT explícito da 20260822072158 em ação'
);

-- Uma linha por TAREFA, não por caso (migration 20260827140400): o BABY REELS
-- tem foto e reels; o MASTER tem foto e o horizontal — perdeu o reels de
-- fábrica em 20260903193219. Quatro trabalhos.
select is(
  (select count(*)::int from public.fila_edicao
    where caso_id in ('ffffffff-0000-0000-0000-000000000001',
                      'ffffffff-0000-0000-0000-000000000002')),
  4,
  'a fila lista TAREFAS de edição abertas, não casos'
);

select is(
  (select array_agg(distinct etapa_tipo::text order by etapa_tipo::text) from public.fila_edicao
    where caso_id in ('ffffffff-0000-0000-0000-000000000001',
                      'ffffffff-0000-0000-0000-000000000002')),
  array['edicao_foto', 'edicao_video', 'reels'],
  'e cobre a trilha inteira — foto e reels deixariam de existir com o filtro antigo'
);

-- O ponto de reusar quadro_casos: o vence_em vem de lá, com o prazo do pacote.
select ok(
  (select vence_em from public.fila_edicao
    where caso_id = 'ffffffff-0000-0000-0000-000000000001' and etapa_tipo = 'reels')
  <
  (select vence_em from public.fila_edicao
    where caso_id = 'ffffffff-0000-0000-0000-000000000002' and etapa_tipo = 'edicao_video'),
  'o BABY REELS (48h) vence antes do MASTER (10 dias úteis) — a urgência sai do pacote, não de ordem de chegada'
);

select is(
  (select vence_em from public.fila_edicao
    where caso_id = 'ffffffff-0000-0000-0000-000000000001' and etapa_tipo = 'reels'),
  (select vence_em from public.quadro_casos where id = 'ffffffff-0000-0000-0000-000000000001'),
  'o vence_em da fila é IDÊNTICO ao do Quadro — uma definição de SLA, não duas'
);


-- =============================================================================
-- 2. A TRAVA — pós-produção não conclui sem iniciar
-- =============================================================================

select pg_temp.vira('editora.fila@clickbaby.test');
set local role authenticated;

select ok(
  pg_temp.levanta(format(
    'select public.concluir_etapa(%L)',
    pg_temp.etapa('ffffffff-0000-0000-0000-000000000001', 'reels'))),
  'concluir edicao_video SEM ter iniciado é RECUSADO — é a trava da seção 9'
);

select is(
  (select status from public.caso_etapas
    where id = pg_temp.etapa('ffffffff-0000-0000-0000-000000000001', 'reels')),
  'pendente'::public.status_etapa,
  'e a etapa continua pendente — a recusa não deixou estado pela metade'
);

-- Com início, conclui normalmente.
select public.iniciar_etapa(
  pg_temp.etapa('ffffffff-0000-0000-0000-000000000001', 'reels'));

reset role;

-- Recua o início em 2h: é o que faz o ciclo ter um valor de verdade para medir.
update public.caso_etapas
   set iniciado_em = now() - interval '2 hours'
 where id = pg_temp.etapa('ffffffff-0000-0000-0000-000000000001', 'reels');

select pg_temp.vira('editora.fila@clickbaby.test');
set local role authenticated;

select lives_ok(
  format('select public.concluir_etapa(%L)',
    pg_temp.etapa('ffffffff-0000-0000-0000-000000000001', 'reels')),
  'com início registrado, concluir funciona'
);

-- O motivo de tudo isto: o ciclo tem valor, não zero.
select ok(
  (select (concluido_em - iniciado_em - pausa_acumulada) >= interval '1 hour 58 minutes'
     from public.caso_etapas
    where id = pg_temp.etapa('ffffffff-0000-0000-0000-000000000001', 'reels')),
  'o tempo de ciclo mede ~2h de trabalho real — sem a trava seria zero'
);

reset role;


-- =============================================================================
-- 3. A trava NÃO vaza para as etapas de campo
--
-- O registro retroativo em campo é deliberado (seção 9). Se a trava pegasse
-- aqui, a fotógrafa não conseguiria registrar o banho depois do parto.
-- =============================================================================

select pg_temp.vira('editora.fila@clickbaby.test');
set local role authenticated;

select lives_ok(
  format('select public.concluir_etapa(%L)',
    pg_temp.etapa('ffffffff-0000-0000-0000-000000000002', 'banho')),
  'etapa de CAMPO ainda conclui sem ter iniciado — registro retroativo preservado'
);

select ok(
  (select iniciado_em is not null and concluido_em is not null
     from public.caso_etapas
    where id = pg_temp.etapa('ffffffff-0000-0000-0000-000000000002', 'banho')),
  'e carimba os dois no mesmo instante, sem violar a constraint de conclusão'
);

select lives_ok(
  format('select public.concluir_etapa(%L)',
    pg_temp.etapa('ffffffff-0000-0000-0000-000000000002', 'entrada')),
  'entrada também — a trava é por tipo, não geral'
);


-- =============================================================================
-- 4. A fila reflete o trabalho, e a etapa concluída sai dela
-- =============================================================================

reset role;

-- O reels foi concluído; a edição de fotos do mesmo caso continua aberta. É
-- disso que a separação trata: uma tarefa terminar não tira o caso da fila.
select ok(
  not exists (select 1 from public.fila_edicao
    where caso_id = 'ffffffff-0000-0000-0000-000000000001' and etapa_tipo = 'reels'),
  'a TAREFA concluída sai da fila'
);

select is(
  (select array_agg(etapa_tipo::text order by etapa_tipo::text) from public.fila_edicao
    where caso_id = 'ffffffff-0000-0000-0000-000000000001'),
  array['edicao_foto'],
  'e o caso permanece pela edição de fotos, que ninguém tocou'
);

-- Atribuir preenche a coluna que a tela usa para mostrar quem está com o quê.
select pg_temp.vira('editora.fila@clickbaby.test');
set local role authenticated;

select public.atribuir_etapa(
  pg_temp.etapa('ffffffff-0000-0000-0000-000000000002', 'edicao_video'),
  (select id from public.pessoas where nome = 'Editora Fila')
);

reset role;

select is(
  (select responsavel_nome from public.fila_edicao
    where caso_id = 'ffffffff-0000-0000-0000-000000000002' and etapa_tipo = 'edicao_video'),
  'Editora Fila',
  'a fila mostra quem está com a edição, sem segunda query'
);

select is(
  (select etapa_status from public.fila_edicao
    where caso_id = 'ffffffff-0000-0000-0000-000000000002' and etapa_tipo = 'edicao_video'),
  'atribuida'::public.status_etapa,
  'e o status da etapa acompanha'
);

-- A prova de que a atribuição é POR TAREFA: no mesmo caso a foto continua sem
-- responsável, e só o horizontal ficou com a Editora Fila. Eram duas tarefas
-- soltas até o MASTER perder o reels de fábrica (20260903193219); a prova não
-- depende do número, depende de sobrar alguma.
select is(
  (select count(*)::int from public.fila_edicao
    where caso_id = 'ffffffff-0000-0000-0000-000000000002' and responsavel_id is null),
  1,
  'atribuir o vídeo não atribuiu a foto — cada tarefa tem seu dono'
);


select * from finish();
rollback;
