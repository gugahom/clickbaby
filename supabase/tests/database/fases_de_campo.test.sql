-- pgTAP: as fases do trabalho de campo (migration 20260928183313).
--
-- O que este arquivo protege:
--   A — cada fase é da SUA etapa, e nenhuma outra etapa tem fase.
--   B — quem declara é qualquer pessoa ativa; caso cancelado, ninguém.
--   C — o carimbo e o evento, que é de onde o relatório vai tirar a conta.
--   D — a fase NÃO mexe no status nem no relógio da etapa.

begin;
select plan(11);

insert into auth.users (id, email, aud, role, created_at, updated_at)
values
  (gen_random_uuid(), 'fotografa.fc@clickbaby.test', 'authenticated', 'authenticated', now(), now()),
  (gen_random_uuid(), 'atendimento.fc@clickbaby.test', 'authenticated', 'authenticated', now(), now());

insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'Fotografa FC', u.id, 'operador', true from auth.users u where u.email = 'fotografa.fc@clickbaby.test';
insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'Atendimento FC', u.id, 'atendimento', true from auth.users u where u.email = 'atendimento.fc@clickbaby.test';

insert into public.maternidades (nome, sigla) values ('Maternidade FC', 'FCTEST');

insert into public.casos (mae_nome, pacote_id, maternidade_id)
select v.mae, (select id from public.pacotes where slug = 'standard'),
       (select id from public.maternidades where sigla = 'FCTEST')
from (values ('Mae FC Um'), ('Mae FC Dois')) as v(mae);

create function pg_temp.como(p_email text) returns void language plpgsql as $$
declare v_id uuid;
begin
  select id into v_id from auth.users where email = p_email;
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L',
    json_build_object('sub', v_id, 'role', 'authenticated')::text);
end;
$$;

create function pg_temp.etapa(p_mae text, p_tipo public.etapa_tipo) returns uuid language sql as $$
  select ce.id from public.caso_etapas ce
  join public.casos c on c.id = ce.caso_id
  where c.mae_nome = p_mae and ce.tipo = p_tipo;
$$;


-- =============================================================================
-- A. Cada fase é da sua etapa
-- =============================================================================

select pg_temp.como('fotografa.fc@clickbaby.test');

select throws_ok(
  format($$ select public.mover_fase_de_campo(%L::uuid, 'admissao_cco') $$,
         pg_temp.etapa('Mae FC Um', 'entrada')),
  'P0001',
  'A fase "admissao_cco" não é da etapa "entrada".',
  'A1: fase do nascimento não entra na etapa de entrada'
);

select throws_ok(
  format($$ select public.mover_fase_de_campo(%L::uuid, 'cuidados') $$,
         pg_temp.etapa('Mae FC Um', 'edicao_foto')),
  'P0001',
  'Só a entrada e o nascimento têm fases de campo — a etapa "edicao_foto" não tem.',
  'A2: etapa de edição não tem fase de campo'
);

reset role;

-- A trava de verdade é a constraint: a RPC dá a frase, ela dá o NÃO. Sem esta
-- asserção, afrouxar a RPC passaria despercebido.
select throws_ok(
  format($$ update public.caso_etapas set fase_campo = 'nascimento', fase_campo_em = now() where id = %L $$,
         pg_temp.etapa('Mae FC Um', 'banho')),
  '23514',
  null,
  'A3: e o banco recusa a fase fora da etapa mesmo por escrita direta'
);


-- =============================================================================
-- B. Quem declara
-- =============================================================================

select pg_temp.como('fotografa.fc@clickbaby.test');

-- O PONTO DO DESENHO: quem sabe que o bebê nasceu é quem está na sala. Se um
-- dia alguém exigir papel aqui, é esta asserção que cai.
select lives_ok(
  format($$ select public.mover_fase_de_campo(%L::uuid, 'deslocamento_recebimento') $$,
         pg_temp.etapa('Mae FC Um', 'entrada')),
  'B1: a fotógrafa declara a fase'
);

select ok(
  (select fase_campo = 'deslocamento_recebimento' and fase_campo_em is not null
     from public.caso_etapas where id = pg_temp.etapa('Mae FC Um', 'entrada')),
  'B2: a fase e o carimbo ficam gravados'
);

reset role;

select pg_temp.como('atendimento.fc@clickbaby.test');
select public.cancelar_caso(
  (select id from public.casos where mae_nome = 'Mae FC Dois'),
  'Família desistiu do contrato'
);
reset role;

select pg_temp.como('fotografa.fc@clickbaby.test');
select throws_ok(
  format($$ select public.mover_fase_de_campo(%L::uuid, 'admissao_cco') $$,
         pg_temp.etapa('Mae FC Dois', 'nascimento')),
  'P0001',
  'Caso cancelado — não se registra fase de um atendimento que não aconteceu.',
  'B3: contrato que caiu não tem fase para andar'
);


-- =============================================================================
-- C. O que vira métrica
-- =============================================================================

select is(
  (select payload->>'fase_anterior' from public.eventos
    where caso_etapa_id = pg_temp.etapa('Mae FC Um', 'entrada')
      and tipo = 'fase_de_campo_registrada'),
  null,
  'C1: a primeira fase declarada não tem anterior'
);

select public.mover_fase_de_campo(pg_temp.etapa('Mae FC Um', 'entrada'), 'aguardando_internamento');

-- Pelo PAYLOAD, e não por "o mais recente": dentro de uma transação `now()` é
-- constante, então os dois eventos têm o mesmo `ocorrido_em` e um `order by`
-- aqui escolheria qualquer um dos dois. Na operação isso não acontece — cada
-- toque é sua própria transação —, mas o teste roda tudo junto.
select ok(
  (select payload->>'fase_anterior' = 'deslocamento_recebimento'
      and (payload->>'segundos_na_anterior')::int >= 0
     from public.eventos
    where caso_etapa_id = pg_temp.etapa('Mae FC Um', 'entrada')
      and tipo = 'fase_de_campo_registrada'
      and payload->>'fase' = 'aguardando_internamento'),
  'C2: a fase seguinte grava de onde veio e quanto durou'
);

-- Idempotente: tocar duas vezes na mesma fase não enche o histórico nem
-- reinicia o relógio dela.
select public.mover_fase_de_campo(pg_temp.etapa('Mae FC Um', 'entrada'), 'aguardando_internamento');

select is(
  (select count(*)::int from public.eventos
    where caso_etapa_id = pg_temp.etapa('Mae FC Um', 'entrada')
      and tipo = 'fase_de_campo_registrada'),
  2,
  'C3: declarar a mesma fase de novo não registra nada'
);


-- =============================================================================
-- D. A fase não é o status
-- =============================================================================

-- A etapa do nascimento segue PENDENTE, sem play: declarar a fase não pode
-- inventar trabalho em curso, e é aqui que se vê.
select lives_ok(
  format($$ select public.mover_fase_de_campo(%L::uuid, 'admissao_cco') $$,
         pg_temp.etapa('Mae FC Um', 'nascimento')),
  'D1: a fase se declara em etapa que ainda não começou (campo é retroativo)'
);

select ok(
  (select status = 'pendente' and iniciado_em is null and pausado_em is null
     from public.caso_etapas where id = pg_temp.etapa('Mae FC Um', 'nascimento')),
  'D2: e o status e o relógio da etapa continuam onde estavam'
);

reset role;

select * from finish();
rollback;
