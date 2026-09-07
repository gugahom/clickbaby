-- pgTAP: remover_entregavel e devolver_para_o_quadro (migration 20260907091413).
--
-- O QUE ESTE ARQUIVO PROTEGE
-- As duas nasceram de uma cena concreta: a Morgana abre o álbum e é a família
-- errada. Apagar o link tem que ser possível, e tem que ser possível SEM
-- estragar duas coisas que já estavam certas — a entrega já confirmada de outro
-- caso, e o caso que só tinha um link duplicado a mais.
--
-- A GUARDA MAIS IMPORTANTE É A DO LINK CONFIRMADO. Sem ela, um caso encerrado
-- ficaria sem entregável nenhum, e a invariante 3.5 diz que encerrado exige ao
-- menos um — o banco passaria a guardar um estado que a própria regra proíbe.

begin;
select plan(14);

-- =============================================================================
-- Fixtures
-- =============================================================================

insert into auth.users (id, email, aud, role, created_at, updated_at)
values
  (gen_random_uuid(), 'editora.link@clickbaby.test', 'authenticated', 'authenticated', now(), now()),
  (gen_random_uuid(), 'atendimento.link@clickbaby.test', 'authenticated', 'authenticated', now(), now());

insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'Editora Link', u.id, 'operador', true
  from auth.users u where u.email = 'editora.link@clickbaby.test';

insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'Atendimento Link', u.id, 'atendimento', true
  from auth.users u where u.email = 'atendimento.link@clickbaby.test';

insert into public.maternidades (nome, sigla) values ('Maternidade Link', 'LNKTEST');

insert into public.casos (mae_nome, pacote_id, maternidade_id)
select v.mae, (select id from public.pacotes where slug = 'basic'),
       (select id from public.maternidades where sigla = 'LNKTEST')
from (values ('Mae Link Enviada'), ('Mae Link Encerrada')) as v(mae);

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

create function pg_temp.links(p_mae text) returns integer language sql as $$
  select count(*)::int from public.entregaveis e
  join public.casos c on c.id = e.caso_id
  where c.mae_nome = p_mae;
$$;

-- Trabalho resolvido nos dois casos.
update public.caso_etapas ce
   set status = 'concluida',
       iniciado_em = now() - interval '2 hours',
       concluido_em = now() - interval '1 hour'
  from public.casos c
 where c.id = ce.caso_id and c.mae_nome like 'Mae Link %';

-- A enviada leva DOIS links: um bom e um errado. É o cenário do pedido —
-- apagar um sem mexer no outro.
insert into public.entregaveis (caso_id, tipo, url)
values
  (pg_temp.caso('Mae Link Enviada'), 'google_photos', 'https://fixture.example/bom'),
  (pg_temp.caso('Mae Link Enviada'), 'cadeado', 'https://fixture.example/familia-errada'),
  (pg_temp.caso('Mae Link Encerrada'), 'google_photos', 'https://fixture.example/fechada');


-- =============================================================================
-- A. Apagar UM link não mexe no caso nem nos outros links.
-- =============================================================================

select pg_temp.como('editora.link@clickbaby.test');

select public.liberar_para_entrega(pg_temp.caso('Mae Link Enviada'));

select lives_ok(
  format(
    $$ select public.remover_entregavel(
         (select id from public.entregaveis
           where caso_id = %L::uuid and url = 'https://fixture.example/familia-errada'),
         'álbum de outra família') $$,
    pg_temp.caso('Mae Link Enviada')),
  'RL0: a operadora apaga o link errado — remover não pede papel'
);

select is(pg_temp.links('Mae Link Enviada'), 1, 'RL1: o link bom continua lá');

select isnt(
  (select liberado_para_entrega_em from public.casos where mae_nome = 'Mae Link Enviada'),
  null,
  'RL2: e o caso NÃO se mexeu — apagar link duplicado não devolve nada'
);

select is(
  (select count(*)::int from public.eventos e
    where e.caso_id = pg_temp.caso('Mae Link Enviada') and e.tipo = 'entregavel_removido'),
  1,
  'RL3: a remoção vira evento'
);

-- O MOTIVO viaja junto. Sem ele, o evento diz que um link sumiu e não diz por
-- quê — e a pergunta que aparece depois é sempre 'por que este caso voltou?'.
select is(
  (select e.payload->>'motivo' from public.eventos e
    where e.caso_id = pg_temp.caso('Mae Link Enviada') and e.tipo = 'entregavel_removido'),
  'álbum de outra família',
  'RL4: o motivo fica no evento'
);

select is(
  (select count(*)::int from public.eventos e
    where e.caso_id = pg_temp.caso('Mae Link Enviada')
      and e.tipo = 'entregavel_removido'
      and e.payload::text like '%familia-errada%'),
  0,
  'RL5: a URL não entra no evento — ela é credencial da galeria (seção 10)'
);


-- =============================================================================
-- B. Link JÁ CONFIRMADO é intocável.
--
-- Sem esta guarda, um caso encerrado ficaria sem entregável — estado que a
-- invariante 3.5 proíbe.
-- =============================================================================

reset role;
select pg_temp.como('atendimento.link@clickbaby.test');

select public.liberar_para_entrega(pg_temp.caso('Mae Link Encerrada'));
select public.confirmar_entrega(pg_temp.caso('Mae Link Encerrada'));

select throws_ok(
  format(
    $$ select public.remover_entregavel(
         (select id from public.entregaveis where caso_id = %L::uuid)) $$,
    pg_temp.caso('Mae Link Encerrada')),
  'P0001',
  'Este link já foi confirmado na entrega e não pode ser apagado. Para mexer nele, reabra o caso.',
  'RL6: link confirmado é recusado — encerrado sem entregável é estado proibido'
);

select is(pg_temp.links('Mae Link Encerrada'), 1, 'RL7: e ele continua inteiro');


-- =============================================================================
-- C. Devolver ao Quadro: só quem confirma, e com motivo.
-- =============================================================================

reset role;
select pg_temp.como('editora.link@clickbaby.test');

select throws_ok(
  format($$ select public.devolver_para_o_quadro(%L::uuid, 'link errado') $$,
         pg_temp.caso('Mae Link Enviada')),
  'P0001',
  'Só atendimento ou adm podem devolver um caso ao Quadro.',
  'DV0: a operadora NÃO devolve — é o avesso de confirmar, e pede o mesmo papel'
);

reset role;
select pg_temp.como('atendimento.link@clickbaby.test');

select throws_ok(
  format($$ select public.devolver_para_o_quadro(%L::uuid, '   ') $$,
         pg_temp.caso('Mae Link Enviada')),
  'P0001',
  'Diga por que o caso está voltando — quem for refazer precisa saber.',
  'DV1: motivo em branco é recusado — card que volta sem explicação não se conserta'
);

select lives_ok(
  format($$ select public.devolver_para_o_quadro(%L::uuid, 'álbum da família errada') $$,
         pg_temp.caso('Mae Link Enviada')),
  'DV2: o atendimento devolve o caso ao Quadro'
);

select is(
  (select liberado_para_entrega_em from public.casos where mae_nome = 'Mae Link Enviada'),
  null,
  'DV3: o caso saiu de Entregáveis e volta a aparecer no Quadro'
);

-- As etapas continuam concluídas: o trabalho foi feito, o que voltou foi a
-- entrega. Material errado é reabrir_etapa, que é outra decisão.
select is(
  (select count(*)::int from public.caso_etapas ce
    where ce.caso_id = pg_temp.caso('Mae Link Enviada') and ce.status <> 'concluida'),
  0,
  'DV4: e NENHUMA etapa foi reaberta junto'
);

select throws_ok(
  format($$ select public.devolver_para_o_quadro(%L::uuid, 'de novo') $$,
         pg_temp.caso('Mae Link Encerrada')),
  'P0001',
  null,
  'DV5: caso encerrado não se devolve — o caminho ali é reabrir_caso'
);

select * from finish();
rollback;
