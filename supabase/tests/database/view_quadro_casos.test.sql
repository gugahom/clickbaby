-- pgTAP: view public.quadro_casos (migration 20260822025347).
--
-- Cobre o que a view existe para garantir e que, se quebrar, quebra em
-- silêncio numa tela:
--   - eh_rascunho / falta_pacote / falta_maternidade (as duas metades)
--   - eh_terminal (encerrado E cancelado, não só encerrado)
--   - vence_em derivado do nascimento + prazo_entrega do pacote
--   - dia em America/Sao_Paulo (o caso da madrugada, que erra em UTC)
--   - prazo_entrega_horas em número, para os dois formatos de interval
--   - security_invoker: sem pessoa vinculada, zero linha (não é bypass da RLS)
--
-- Padrão de troca de identidade herdado de rls_demais_tabelas.test.sql:
-- set_config('request.jwt.claim.sub', ...) + set local role authenticated,
-- resolvendo o auth_user_id ANTES da troca de papel.
--
-- Tudo numa transação revertida no final.

begin;
select plan(25);


-- =============================================================================
-- Fixtures (papel privilegiado da conexão de teste)
-- =============================================================================

insert into auth.users (id, email, aud, role, created_at, updated_at)
values
  (gen_random_uuid(), 'operador.view.quadro@clickbaby.test', 'authenticated', 'authenticated', now(), now()),
  (gen_random_uuid(), 'orfao.view.quadro@clickbaby.test',    'authenticated', 'authenticated', now(), now());

insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'Operador View Quadro', u.id, 'operador', true
from auth.users u where u.email = 'operador.view.quadro@clickbaby.test';

-- O segundo usuário NÃO ganha linha em pessoas: é o caso negativo de RLS
-- (autenticado, mas sem pessoa vinculada) e prova o security_invoker.

-- Caso completo, pacote de 48h (BABY REELS -> 5 etapas geradas pela trigger).
insert into public.casos (id, mae_nome, bebe_nome, pacote_id, maternidade_id, previsao_em, cor_calendar)
select
  '11111111-1111-1111-1111-111111111111',
  'MAE COMPLETA', 'BEBE COMPLETO',
  (select id from public.pacotes where slug = 'baby-reels'),
  (select id from public.maternidades where sigla = 'HSC'),
  '2026-09-15 14:00:00+00',
  '5';

-- Rascunho: sem pacote (a trigger não gera etapas neste caso).
insert into public.casos (id, mae_nome, pacote_id, maternidade_id, previsao_em)
values (
  '22222222-2222-2222-2222-222222222222',
  'MAE SEM PACOTE', null,
  (select id from public.maternidades where sigla = 'GNDI'),
  '2026-09-15 16:00:00+00'
);

-- Rascunho: sem maternidade (a outra metade da regra).
insert into public.casos (id, mae_nome, pacote_id, maternidade_id, previsao_em)
values (
  '33333333-3333-3333-3333-333333333333',
  'MAE SEM MATERNIDADE',
  (select id from public.pacotes where slug = 'birth'),
  null,
  '2026-09-15 18:00:00+00'
);

-- Caso da MADRUGADA: 2026-09-30 00:00+00 é 29/set às 21h em Curitiba.
-- É este que denuncia agrupamento feito em UTC.
insert into public.casos (id, mae_nome, pacote_id, maternidade_id, previsao_em)
values (
  '44444444-4444-4444-4444-444444444444',
  'MAE MADRUGADA',
  (select id from public.pacotes where slug = 'master'),
  (select id from public.maternidades where sigla = 'CWB'),
  '2026-09-30 00:00:00+00'
);

-- Caso cancelado (terminal por um caminho que não é "concluído").
insert into public.casos (id, mae_nome, pacote_id, maternidade_id, previsao_em,
                          status_operacional, motivo_cancelamento)
values (
  '55555555-5555-5555-5555-555555555555',
  'MAE CANCELADA',
  (select id from public.pacotes where slug = 'basic'),
  (select id from public.maternidades where sigla = 'HSC'),
  '2026-09-16 10:00:00+00',
  'cancelado',
  'Cancelado via Google Calendar (card cinza)'
);

-- Conclui o nascimento do caso completo, para vence_em deixar de ser NULL.
-- iniciado_em é obrigatório por caso_etapas_conclusao_exige_inicio.
update public.caso_etapas
set status = 'concluida',
    iniciado_em  = '2026-09-15 14:30:00+00',
    concluido_em = '2026-09-15 15:00:00+00'
where caso_id = '11111111-1111-1111-1111-111111111111'
  and tipo = 'nascimento';


-- =============================================================================
-- 1. Estrutura
-- =============================================================================

select has_view('public', 'quadro_casos', 'a view quadro_casos existe');

select ok(
  (select reloptions::text[] @> array['security_invoker=true']
   from pg_class where oid = 'public.quadro_casos'::regclass),
  'quadro_casos é security_invoker = true (não faz bypass da RLS das tabelas base)'
);


-- =============================================================================
-- 2. Rascunho pendente — as duas metades da regra
-- =============================================================================

select ok(
  not (select eh_rascunho from public.quadro_casos where id = '11111111-1111-1111-1111-111111111111'),
  'caso com pacote e maternidade não é rascunho'
);

select ok(
  (select eh_rascunho from public.quadro_casos where id = '22222222-2222-2222-2222-222222222222'),
  'caso sem pacote é rascunho'
);

select ok(
  (select eh_rascunho from public.quadro_casos where id = '33333333-3333-3333-3333-333333333333'),
  'caso sem maternidade é rascunho (a metade que é fácil esquecer)'
);

select ok(
  (select falta_pacote and not falta_maternidade
   from public.quadro_casos where id = '22222222-2222-2222-2222-222222222222'),
  'falta_pacote isolado aponta só o pacote'
);

select ok(
  (select falta_maternidade and not falta_pacote
   from public.quadro_casos where id = '33333333-3333-3333-3333-333333333333'),
  'falta_maternidade isolado aponta só a maternidade'
);

select is(
  (select etapas_total from public.quadro_casos where id = '22222222-2222-2222-2222-222222222222'),
  0,
  'rascunho sem pacote tem etapas_total = 0 (a trigger não gera) — a tela não pode dividir por isso'
);


-- =============================================================================
-- 3. Estado terminal
-- =============================================================================

select ok(
  not (select eh_terminal from public.quadro_casos where id = '11111111-1111-1111-1111-111111111111'),
  'caso agendado não é terminal'
);

select ok(
  (select eh_terminal from public.quadro_casos where id = '55555555-5555-5555-5555-555555555555'),
  'caso cancelado é terminal (não é "concluído", mas tira o dia da tela)'
);


-- =============================================================================
-- 4. Dia em America/Sao_Paulo
-- =============================================================================

select is(
  (select dia from public.quadro_casos where id = '44444444-4444-4444-4444-444444444444'),
  '2026-09-29'::date,
  'previsao_em 2026-09-30 00:00+00 cai em 29/set no fuso de Curitiba (em UTC cairia em 30/set)'
);

select is(
  (select dia from public.quadro_casos where id = '11111111-1111-1111-1111-111111111111'),
  '2026-09-15'::date,
  'previsao_em 2026-09-15 14:00+00 cai em 15/set'
);

select is(
  (select count(*)::int from public.quadro_casos
   where dia = '2026-09-15' and id in (
     '11111111-1111-1111-1111-111111111111',
     '22222222-2222-2222-2222-222222222222',
     '33333333-3333-3333-3333-333333333333')),
  3,
  'os três casos do mesmo dia agrupam sob o mesmo valor de dia'
);


-- =============================================================================
-- 5. SLA derivado
-- =============================================================================

select is(
  (select vence_em from public.quadro_casos where id = '11111111-1111-1111-1111-111111111111'),
  '2026-09-17 15:00:00+00'::timestamptz,
  'vence_em = concluido_em do nascimento + 48h do BABY REELS'
);

select is(
  (select nascimento_concluido_em from public.quadro_casos where id = '11111111-1111-1111-1111-111111111111'),
  '2026-09-15 15:00:00+00'::timestamptz,
  'nascimento_concluido_em vem da etapa de nascimento, não de outra etapa'
);

select is(
  (select vence_em from public.quadro_casos where id = '44444444-4444-4444-4444-444444444444'),
  null::timestamptz,
  'vence_em é NULL enquanto o nascimento não foi concluído (estado de 100% dos casos hoje)'
);

select is(
  (select vence_em from public.quadro_casos where id = '22222222-2222-2222-2222-222222222222'),
  null::timestamptz,
  'rascunho sem pacote não tem vence_em'
);


-- =============================================================================
-- 6. prazo_entrega_horas — os dois formatos de interval
-- =============================================================================

select is(
  (select prazo_entrega_horas from public.quadro_casos where id = '11111111-1111-1111-1111-111111111111'),
  48::numeric,
  'BABY REELS (interval 48 hours) vira 48'
);

-- O MASTER deixou de ter intervalo: mede-se em dias úteis (20260827135656).
-- prazo_entrega_horas NULO aqui não é falta de prazo, é prazo de outra
-- natureza — quem responde por ele são prazo_dias_uteis e prazo_total_horas.
select is(
  (select prazo_entrega_horas from public.quadro_casos where id = '44444444-4444-4444-4444-444444444444'),
  null,
  'MASTER não tem prazo em horas — o dele é em dias úteis'
);

select is(
  (select prazo_dias_uteis from public.quadro_casos where id = '44444444-4444-4444-4444-444444444444'),
  10,
  'e a view entrega os 10 dias úteis, para a tela poder rotular'
);

select is(
  (select prazo_entrega_horas from public.quadro_casos where id = '33333333-3333-3333-3333-333333333333'),
  24::numeric,
  'BIRTH (interval 24 hours) vira 24'
);


-- =============================================================================
-- 7. Contagem de etapas e dados achatados
-- =============================================================================

select is(
  (select etapas_total from public.quadro_casos where id = '11111111-1111-1111-1111-111111111111'),
  6,
  'BABY REELS gera 6 etapas e a view conta todas (o left join do nascimento não multiplica linha)'
);

select is(
  (select etapas_concluidas from public.quadro_casos where id = '11111111-1111-1111-1111-111111111111'),
  1,
  'etapas_concluidas conta só a etapa concluída'
);

select is(
  (select maternidade_sigla || '/' || pacote_nome
   from public.quadro_casos where id = '11111111-1111-1111-1111-111111111111'),
  'HSC/BABY REELS',
  'pacote e maternidade chegam achatados, sem segunda query'
);


-- =============================================================================
-- 8. security_invoker — o caso negativo da RLS
-- =============================================================================

select set_config(
  'request.jwt.claim.sub',
  (select id::text from auth.users where email = 'orfao.view.quadro@clickbaby.test'),
  true
);
set local role authenticated;

select is(
  (select count(*)::int from public.quadro_casos),
  0,
  'autenticado SEM pessoa vinculada lê zero linha da view — security_invoker aplica a RLS de casos'
);

reset role;

select * from finish();
rollback;
