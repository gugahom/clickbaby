-- pgTAP: liberar_para_entrega e a volta da checagem de papel em
-- confirmar_entrega (migration 20260906151515).
--
-- O QUE ESTE ARQUIVO PROTEGE
-- A entrega virou trabalho de duas pessoas: quem terminou LIBERA, e o ADM
-- CONFIRMA na aba Entregas. As duas metades têm travas opostas e é fácil
-- inverter uma delas sem ninguém notar — liberar é de qualquer pessoa ativa
-- (senão volta o gargalo que a 20260825014102 desfez), confirmar é só de
-- atendimento ou adm (senão a aba não significa nada).
--
-- A ARMADILHA QUE MOTIVOU O TESTE E1: `eh_adm()` não inclui `atendimento`. Uma
-- checagem escrita só com ele deixaria de fora a Morgana, que é justamente
-- quem faz a entrega. Aqui isso vira asserção.

begin;
select plan(13);

-- =============================================================================
-- Fixtures
-- =============================================================================

insert into auth.users (id, email, aud, role, created_at, updated_at)
values
  (gen_random_uuid(), 'editora.entrega@clickbaby.test', 'authenticated', 'authenticated', now(), now()),
  (gen_random_uuid(), 'atendimento.entrega@clickbaby.test', 'authenticated', 'authenticated', now(), now()),
  (gen_random_uuid(), 'financeiro.entrega@clickbaby.test', 'authenticated', 'authenticated', now(), now());

insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'Editora Entrega', u.id, 'operador', true
  from auth.users u where u.email = 'editora.entrega@clickbaby.test';

-- O papel da Morgana. É o que `eh_adm()` NÃO cobre.
insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'Atendimento Entrega', u.id, 'atendimento', true
  from auth.users u where u.email = 'atendimento.entrega@clickbaby.test';

-- O papel da Amanda. Esse `eh_adm()` cobre.
insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'Financeiro Entrega', u.id, 'financeiro', true
  from auth.users u where u.email = 'financeiro.entrega@clickbaby.test';

insert into public.maternidades (nome, sigla) values ('Maternidade Entrega', 'ENTTEST');

insert into public.casos (mae_nome, pacote_id, maternidade_id)
select v.mae, (select id from public.pacotes where slug = v.slug),
       (select id from public.maternidades where sigla = 'ENTTEST')
from (values
  ('Mae Entrega Pronta', 'basic'),
  ('Mae Entrega Aberta', 'basic'),
  ('Mae Entrega Master', 'master')
) as v(mae, slug);

create function pg_temp.como(p_email text) returns void language plpgsql as $$
declare v_id uuid;
begin
  select id into v_id from auth.users where email = p_email;
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L',
    json_build_object('sub', v_id, 'role', 'authenticated')::text);
end;
$$;

create function pg_temp.caso(p_mae text) returns uuid language sql as $$
  select id from public.casos where mae_nome = p_mae;
$$;

-- Resolve o trabalho dos dois casos que precisam estar prontos. O MASTER fica
-- com o vídeo horizontal EM ABERTO de propósito — é a exceção da
-- 20260903153101, e ela precisa valer aqui também.
update public.caso_etapas ce
   set status = 'concluida',
       iniciado_em = now() - interval '2 hours',
       concluido_em = now() - interval '1 hour'
  from public.casos c
 where c.id = ce.caso_id
   and c.mae_nome in ('Mae Entrega Pronta', 'Mae Entrega Master')
   and ce.tipo <> 'edicao_video';

-- SEGUNDA PASSADA, e ela é obrigatória: concluir o fechamento dispara a
-- trigger da rodada 2 (20260827172830), que CRIA uma edicao_foto pendente. Sem
-- isto o MASTER continua com etapa em aberto e o teste mede a fixture, não a
-- regra.
update public.caso_etapas ce
   set status = 'concluida',
       iniciado_em = now() - interval '2 hours',
       concluido_em = now() - interval '1 hour'
  from public.casos c
 where c.id = ce.caso_id
   and c.mae_nome in ('Mae Entrega Pronta', 'Mae Entrega Master')
   and ce.tipo <> 'edicao_video'
   and ce.status <> 'concluida';

insert into public.entregaveis (caso_id, tipo, url)
values
  (pg_temp.caso('Mae Entrega Pronta'), 'google_photos', 'https://fixture.example/pronta'),
  (pg_temp.caso('Mae Entrega Master'), 'google_photos', 'https://fixture.example/master');


-- =============================================================================
-- A. Quem pode liberar: qualquer pessoa ativa.
--
-- É o ponto do desenho. Quem acabou de editar é quem sabe que acabou; se
-- liberar exigisse papel, o gargalo que a 20260825014102 desfez voltaria uma
-- casa antes.
-- =============================================================================

select pg_temp.como('editora.entrega@clickbaby.test');

select lives_ok(
  format($$ select public.liberar_para_entrega(%L::uuid) $$, pg_temp.caso('Mae Entrega Pronta')),
  'LE0: a operadora que editou LIBERA o caso — liberar não pede papel'
);

select isnt(
  (select liberado_para_entrega_em from public.casos where mae_nome = 'Mae Entrega Pronta'),
  null,
  'LE1: o carimbo do envio ficou gravado'
);

select is(
  (select p.nome from public.casos c
     join public.pessoas p on p.id = c.liberado_para_entrega_por
    where c.mae_nome = 'Mae Entrega Pronta'),
  'Editora Entrega',
  'LE2: e QUEM enviou — a resposta para "quem disse que estava pronto?"'
);

select is(
  (select count(*)::int from public.eventos e
    where e.caso_id = pg_temp.caso('Mae Entrega Pronta')
      and e.tipo = 'caso_liberado_para_entrega'),
  1,
  'LE3: o envio vira evento — eventos é a auditoria'
);


-- =============================================================================
-- B. Idempotência: o segundo envio não rouba o crédito do primeiro.
-- =============================================================================

reset role;
select pg_temp.como('atendimento.entrega@clickbaby.test');

select lives_ok(
  format($$ select public.liberar_para_entrega(%L::uuid) $$, pg_temp.caso('Mae Entrega Pronta')),
  'LE4: enviar de novo não levanta erro'
);

select is(
  (select p.nome from public.casos c
     join public.pessoas p on p.id = c.liberado_para_entrega_por
    where c.mae_nome = 'Mae Entrega Pronta'),
  'Editora Entrega',
  'LE5: e quem enviou continua sendo a primeira pessoa'
);


-- =============================================================================
-- C. O que NÃO se envia.
-- =============================================================================

reset role;
select pg_temp.como('editora.entrega@clickbaby.test');

select throws_ok(
  format($$ select public.liberar_para_entrega(%L::uuid) $$, pg_temp.caso('Mae Entrega Aberta')),
  'P0001',
  null,
  'LE6: caso com etapa em aberto não vai para Entregas'
);

-- O MASTER com o vídeo horizontal aberto VAI, e essa é a exceção que faz o
-- cartão sair da lista do dia (20260903153101). Sem ela, nenhum MASTER chegaria
-- à aba — levaria dez dias úteis para chegar.
select lives_ok(
  format($$ select public.liberar_para_entrega(%L::uuid) $$, pg_temp.caso('Mae Entrega Master')),
  'LE7: o MASTER com o vídeo horizontal em aberto VAI para Entregas'
);


-- =============================================================================
-- D. Quem confirma: atendimento OU adm, e ninguém mais.
-- =============================================================================

reset role;
select pg_temp.como('editora.entrega@clickbaby.test');

select throws_ok(
  format($$ select public.confirmar_entrega(%L::uuid) $$, pg_temp.caso('Mae Entrega Pronta')),
  'P0001',
  'Só atendimento ou adm podem confirmar entrega.',
  'E0: a operadora NÃO confirma, mesmo tendo sido ela a liberar'
);

-- A ARMADILHA, virada asserção: `eh_adm()` sozinho não cobre `atendimento`, e
-- é o papel da pessoa que de fato faz a entrega.
reset role;
select pg_temp.como('atendimento.entrega@clickbaby.test');

select lives_ok(
  format($$ select public.confirmar_entrega(%L::uuid) $$, pg_temp.caso('Mae Entrega Pronta')),
  'E1: ATENDIMENTO confirma — eh_adm() sozinho deixaria a Morgana de fora'
);

select is(
  (select status_operacional::text from public.casos where mae_nome = 'Mae Entrega Pronta'),
  'encerrado',
  'E2: e o caso encerra'
);

reset role;
select pg_temp.como('financeiro.entrega@clickbaby.test');

select lives_ok(
  format($$ select public.confirmar_entrega(%L::uuid) $$, pg_temp.caso('Mae Entrega Master')),
  'E3: FINANCEIRO também confirma — é o papel do ADM que eh_adm() cobre'
);


-- =============================================================================
-- E. Caso terminal não volta para a fila de envio.
-- =============================================================================

select throws_ok(
  format($$ select public.liberar_para_entrega(%L::uuid) $$, pg_temp.caso('Mae Entrega Pronta')),
  'P0001',
  null,
  'LE8: caso já encerrado não se envia de novo'
);

select * from finish();
rollback;
