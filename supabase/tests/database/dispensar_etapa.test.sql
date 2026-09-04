-- pgTAP: dispensar_etapa e o desfazer dela (migration 20260828211156).
--
-- Dispensar é o que destrava um caso preso num checklist que a realidade não
-- cumpriu — o fechamento que não aconteceu. Como conta como resolvida na trava
-- de encerramento, um erro aqui deixa encerrar um caso com trabalho de verdade
-- em aberto, que é justamente o que a 20260827181322 foi feita para impedir.
--
-- A FIXTURE ERA UM BIRTH + REELS até 04/09/2026, quando o fechamento saiu do
-- padrão dos dois BIRTH (20260904143000) e o caso deixou de nascer com a etapa
-- que este teste dispensa. Virou BABY REELS, que tem acompanhamento completo —
-- e o exemplo continua sendo real: o fechamento é marcado e às vezes a família
-- vai embora antes.

begin;
select plan(14);

insert into auth.users (id, email, aud, role, created_at, updated_at)
values (gen_random_uuid(), 'operador.dispensa@clickbaby.test', 'authenticated', 'authenticated', now(), now());

insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'Operador Dispensa', u.id, 'operador', true
from auth.users u where u.email = 'operador.dispensa@clickbaby.test';

insert into public.maternidades (nome, sigla) values ('Maternidade Dispensa', 'DISP');

insert into public.casos (mae_nome, pacote_id, maternidade_id)
select 'Mãe Dispensa', (select id from public.pacotes where slug = 'baby-reels'),
       (select id from public.maternidades where sigla = 'DISP');

create function pg_temp.como(p_email text) returns void language plpgsql as $$
declare v_id uuid;
begin
  select id into v_id from auth.users where email = p_email;
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L',
    json_build_object('sub', v_id, 'role', 'authenticated')::text);
end;
$$;

create function pg_temp.etapa(p_tipo text) returns uuid language sql as $$
  select ce.id from public.caso_etapas ce
  join public.casos c on c.id = ce.caso_id
  where c.mae_nome = 'Mãe Dispensa' and ce.tipo::text = p_tipo and ce.rodada = 1;
$$;

create function pg_temp.status(p_tipo text) returns text language sql as $$
  select ce.status::text from public.caso_etapas ce
  join public.casos c on c.id = ce.caso_id
  where c.mae_nome = 'Mãe Dispensa' and ce.tipo::text = p_tipo and ce.rodada = 1;
$$;


-- =============================================================================
-- A. O que NÃO se dispensa
-- =============================================================================

select pg_temp.como('operador.dispensa@clickbaby.test');

select throws_ok(
  format($$ select public.dispensar_etapa(%L::uuid) $$, pg_temp.etapa('nascimento')),
  'Nascimento não se dispensa: é dele que sai o prazo do caso. Se o parto não aconteceu, o caminho é cancelar o caso.',
  'A0: nascimento recusado — vence_em deriva dele, e sem ele o caso ficaria sem prazo nenhum'
);


-- =============================================================================
-- B. O caso do gestor: BIRTH sem fechamento
-- =============================================================================

select lives_ok(
  format($$ select public.dispensar_etapa(%L::uuid, 'nao houve fechamento') $$, pg_temp.etapa('fechamento')),
  'B0: fechamento de um BABY REELS é dispensado'
);

select is(pg_temp.status('fechamento'), 'dispensada', 'B1: a etapa fica dispensada');

select is(
  (select ce.observacao from public.caso_etapas ce where ce.id = pg_temp.etapa('fechamento')),
  'nao houve fechamento',
  'B2: o motivo, quando vem, vira a observação da etapa'
);

select is(
  (select count(*)::int from public.eventos e where e.caso_etapa_id = pg_temp.etapa('fechamento') and e.tipo = 'etapa_dispensada'),
  1,
  'B3: vira evento — é o que responde depois "por que encerrou com 3 de 4?"'
);

-- Idempotente: o toque repetido no mesmo botão não pode gerar um segundo evento.
select lives_ok(
  format($$ select public.dispensar_etapa(%L::uuid) $$, pg_temp.etapa('fechamento')),
  'B4: dispensar de novo não levanta erro'
);

select is(
  (select count(*)::int from public.eventos e where e.caso_etapa_id = pg_temp.etapa('fechamento') and e.tipo = 'etapa_dispensada'),
  1,
  'B5: e não gera um segundo evento'
);


-- =============================================================================
-- C. A trava de encerramento aceita dispensada
--
-- É a razão de existir da RPC. Se esta asserção falhar, o gestor continua com
-- o caso preso e o botão novo não resolveu nada.
-- =============================================================================

select lives_ok(
  format($$ select public.dispensar_etapa(%L::uuid) $$, pg_temp.etapa('reels')),
  'C0: reels também pode ser dispensado'
);

-- Fecha o resto do checklist na mão e tenta encerrar.
--
-- `reset role` antes: `authenticated` NÃO tem UPDATE em caso_etapas (migration
-- 20260822072158), e é assim que tem que ser — a máquina de estado é
-- inalcançável fora das RPCs por privilégio, não por convenção. Este UPDATE é
-- montagem de cenário, e roda como o dono.
reset role;

update public.caso_etapas ce
   set status = 'concluida', iniciado_em = now() - interval '2 hours', concluido_em = now() - interval '1 hour'
  from public.casos c
 where c.id = ce.caso_id and c.mae_nome = 'Mãe Dispensa' and ce.status = 'pendente';

select pg_temp.como('operador.dispensa@clickbaby.test');

select lives_ok(
  $$ select public.registrar_entregavel(
       (select id from public.casos where mae_nome = 'Mãe Dispensa'),
       'google_photos', 'https://photos.google.com/share/teste') $$,
  'C1: entregável registrado'
);

select lives_ok(
  $$ select public.confirmar_entrega((select id from public.casos where mae_nome = 'Mãe Dispensa')) $$,
  'C2: o caso ENCERRA com duas etapas dispensadas — é para isto que a RPC existe'
);

reset role;

select is(
  (select status_operacional::text from public.casos where mae_nome = 'Mãe Dispensa'),
  'encerrado',
  'C3: o caso chegou a encerrado'
);


-- =============================================================================
-- D. O desfazer
-- =============================================================================

insert into public.casos (mae_nome, pacote_id, maternidade_id)
select 'Mãe Desfaz', (select id from public.pacotes where slug = 'baby-reels'),
       (select id from public.maternidades where sigla = 'DISP');

select pg_temp.como('operador.dispensa@clickbaby.test');

select lives_ok(
  $$ select public.dispensar_etapa(
       (select ce.id from public.caso_etapas ce join public.casos c on c.id = ce.caso_id
         where c.mae_nome = 'Mãe Desfaz' and ce.tipo = 'fechamento')) $$,
  'D0: dispensa uma etapa que nunca começou'
);

select lives_ok(
  $$ select public.reabrir_etapa(
       (select ce.id from public.caso_etapas ce join public.casos c on c.id = ce.caso_id
         where c.mae_nome = 'Mãe Desfaz' and ce.tipo = 'fechamento')) $$,
  'D1: reabrir_etapa desfaz a dispensa'
);

-- PENDENTE e não em_andamento: a etapa nunca foi iniciada, e voltar para
-- em_andamento inventaria um trabalho que ninguém está fazendo.
select is(
  (select ce.status::text from public.caso_etapas ce join public.casos c on c.id = ce.caso_id
    where c.mae_nome = 'Mãe Desfaz' and ce.tipo = 'fechamento'),
  'pendente',
  'D2: volta para PENDENTE, porque nunca houve trabalho a devolver'
);

reset role;


select * from finish();
rollback;
