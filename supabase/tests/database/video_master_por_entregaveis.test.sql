-- pgTAP: o vídeo do MASTER passa por Entregáveis (migration 20260921211604).
--
-- Substitui finalizar_video_master.test.sql: aquela função concluía o vídeo na
-- hora, com um link só, e saiu. O que este arquivo protege:
--   A — terminar a edição exige os DOIS links e NÃO conclui: leva a "pronto",
--       com a pausa aberta (esperar o ADM não é tempo de edição).
--   B — "pronto" não se alcança por fora do envio.
--   C — a confirmação é do atendimento ou adm, conclui e confirma os links.
--   D — uma versão nova: o que já foi entregue fica; o que não foi conferido é
--       trocado, com rastro.
--   E — a confirmação só vale a partir de pronto, e as URLs não vão a eventos.

begin;
select plan(18);

insert into auth.users (id, email, aud, role, created_at, updated_at)
values
  (gen_random_uuid(), 'editora.vpe@clickbaby.test', 'authenticated', 'authenticated', now(), now()),
  (gen_random_uuid(), 'atendimento.vpe@clickbaby.test', 'authenticated', 'authenticated', now(), now());

insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'Editora VPE', u.id, 'operador', true from auth.users u where u.email = 'editora.vpe@clickbaby.test';
insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'Atendimento VPE', u.id, 'atendimento', true from auth.users u where u.email = 'atendimento.vpe@clickbaby.test';

insert into public.maternidades (nome, sigla) values ('Maternidade VPE', 'VPETEST');

insert into public.casos (mae_nome, pacote_id, maternidade_id)
select v.mae, (select id from public.pacotes where slug = 'master'),
       (select id from public.maternidades where sigla = 'VPETEST')
from (values ('Mae Video A'), ('Mae Video B')) as v(mae);

create function pg_temp.como(p_email text) returns void language plpgsql as $$
declare v_id uuid;
begin
  select id into v_id from auth.users where email = p_email;
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L',
    json_build_object('sub', v_id, 'role', 'authenticated')::text);
end;
$$;

create function pg_temp.video(p_mae text) returns uuid language sql as $$
  select ce.id from public.caso_etapas ce
    join public.casos c on c.id = ce.caso_id
   where c.mae_nome = p_mae and ce.tipo = 'edicao_video';
$$;

create function pg_temp.caso(p_mae text) returns uuid language sql as $$
  select id from public.casos where mae_nome = p_mae;
$$;


-- =============================================================================
-- A. Terminar a edição: dois links, e o vídeo vai para pronto — não conclui
-- =============================================================================

select pg_temp.como('editora.vpe@clickbaby.test');
select public.mover_video_master(pg_temp.video('Mae Video A'), 'em_andamento');

select throws_ok(
  format($$ select public.enviar_video_para_entrega(%L::uuid, 'https://video.exemplo/a', '') $$,
         pg_temp.video('Mae Video A')),
  'P0001',
  'Para finalizar o vídeo são obrigatórios o link do vídeo e o WeTransfer.',
  'A1: sem o WeTransfer não finaliza'
);

select throws_ok(
  format($$ select public.enviar_video_para_entrega(%L::uuid, 'video.exemplo/a', 'https://we.tl/a') $$,
         pg_temp.video('Mae Video A')),
  'P0001',
  'Os links precisam começar com http:// ou https://.',
  'A2: link sem http não passa'
);

select lives_ok(
  format($$ select public.enviar_video_para_entrega(%L::uuid, 'https://video.exemplo/a', 'https://we.tl/a') $$,
         pg_temp.video('Mae Video A')),
  'A3: quem editou finaliza com os dois links'
);

reset role;

select ok(
  (select status = 'pronto_para_entrega' and concluido_em is null and pausado_em is not null
     from public.caso_etapas where id = pg_temp.video('Mae Video A')),
  'A4: fica em Pronto para entrega, NÃO concluído, com a pausa aberta — esperar o ADM não conta como edição'
);

select is(
  (select array_agg(tipo::text order by tipo::text) from public.entregaveis
    where caso_id = pg_temp.caso('Mae Video A') and confirmado_em is null),
  array['video', 'video_wetransfer'],
  'A5: os dois links entram, ainda sem confirmação'
);

select pg_temp.como('editora.vpe@clickbaby.test');
select throws_ok(
  format($$ select public.enviar_video_para_entrega(%L::uuid, 'https://video.exemplo/a2', 'https://we.tl/a2') $$,
         pg_temp.video('Mae Video A')),
  'P0001',
  'Este vídeo já está em Entregáveis, esperando a confirmação da entrega.',
  'A6: não se finaliza de novo o que já está esperando o ADM'
);
reset role;


-- =============================================================================
-- B. "Pronto" não se alcança por fora
-- =============================================================================

select pg_temp.como('editora.vpe@clickbaby.test');
select throws_ok(
  format($$ select public.mover_video_master(%L::uuid, 'pronto_para_entrega') $$,
         pg_temp.video('Mae Video B')),
  'P0001',
  'Para ir para “Pronto para entrega” o vídeo precisa do link do vídeo e do WeTransfer.',
  'B1: arrastar direto para pronto, sem os links, é recusado'
);
reset role;


-- =============================================================================
-- C. A confirmação é do atendimento ou adm
-- =============================================================================

select pg_temp.como('editora.vpe@clickbaby.test');
select throws_ok(
  format($$ select public.confirmar_entrega_do_video(%L::uuid) $$, pg_temp.video('Mae Video A')),
  'P0001',
  'Quem confirma a entrega do vídeo é o atendimento ou a gestão, na aba Entregáveis.',
  'C1: a fotógrafa não confirma a entrega'
);
reset role;

select pg_temp.como('atendimento.vpe@clickbaby.test');
select lives_ok(
  format($$ select public.confirmar_entrega_do_video(%L::uuid) $$, pg_temp.video('Mae Video A')),
  'C2: o atendimento confirma'
);
reset role;

select ok(
  (select status = 'concluida' and concluido_em is not null
     from public.caso_etapas where id = pg_temp.video('Mae Video A')),
  'C3: confirmado, o vídeo conclui — e sai da seção'
);

select is(
  (select count(*)::int from public.entregaveis
    where caso_id = pg_temp.caso('Mae Video A') and confirmado_em is not null
      and confirmado_por = (select id from public.pessoas where nome = 'Atendimento VPE')),
  2,
  'C4: os dois links viram confirmados, por quem confirmou'
);

select is(
  (select count(*)::int from public.eventos
    where caso_etapa_id = pg_temp.video('Mae Video A') and tipo = 'video_entregue'),
  1,
  'C5: a entrega do vídeo fica em eventos'
);


-- =============================================================================
-- D. Versão nova
-- =============================================================================

-- Depois da entrega a família pede alteração: nova versão, novos links.
select pg_temp.como('editora.vpe@clickbaby.test');
select public.mover_video_master(pg_temp.video('Mae Video A'), 'em_alteracao');
select public.enviar_video_para_entrega(pg_temp.video('Mae Video A'), 'https://video.exemplo/v2', 'https://we.tl/v2');
reset role;

select is(
  (select count(*)::int from public.entregaveis
    where caso_id = pg_temp.caso('Mae Video A') and confirmado_em is not null),
  2,
  'D1: os links já entregues ficam — são histórico da entrega que aconteceu'
);

-- Volta de pronto para editando SEM ninguém confirmar, e finaliza de novo: o
-- par não conferido é trocado.
select pg_temp.como('editora.vpe@clickbaby.test');
select public.mover_video_master(pg_temp.video('Mae Video A'), 'em_andamento');
select public.enviar_video_para_entrega(pg_temp.video('Mae Video A'), 'https://video.exemplo/v3', 'https://we.tl/v3');
reset role;

select is(
  (select array_agg(url order by url) from public.entregaveis
    where caso_id = pg_temp.caso('Mae Video A') and confirmado_em is null),
  array['https://video.exemplo/v3', 'https://we.tl/v3'],
  'D2: só o par novo espera conferência — o que não foi conferido saiu'
);

-- Contado, e não "o evento mais recente": dentro da transação do teste o now()
-- é o mesmo para todos os eventos, e o desempate por id é aleatório.
select is(
  (select array_agg((payload ->> 'links_substituidos')::int order by (payload ->> 'links_substituidos')::int)
     from public.eventos
    where caso_etapa_id = pg_temp.video('Mae Video A') and tipo = 'video_enviado_para_entrega'),
  array[0, 0, 2],
  'D3: e a troca deixa rastro no evento — só o terceiro envio substituiu links'
);


-- =============================================================================
-- E. Só a partir de pronto, e sem URL em eventos
-- =============================================================================

select pg_temp.como('editora.vpe@clickbaby.test');
select public.mover_video_master(pg_temp.video('Mae Video B'), 'em_andamento');
reset role;

select pg_temp.como('atendimento.vpe@clickbaby.test');
select throws_ok(
  format($$ select public.confirmar_entrega_do_video(%L::uuid) $$, pg_temp.video('Mae Video B')),
  'P0001',
  'Só se confirma a entrega do vídeo que está em “Pronto para entrega”.',
  'E1: vídeo ainda em edição não se confirma'
);
reset role;

select is(
  (select count(*)::int from public.eventos
    where caso_id in (pg_temp.caso('Mae Video A'), pg_temp.caso('Mae Video B'))
      and (payload::text like '%video.exemplo%' or payload::text like '%we.tl%')),
  0,
  'E2: nenhum link vai para eventos — são credenciais de acesso da família'
);

select hasnt_function(
  'public', 'finalizar_video_master', array['uuid', 'text'],
  'F1: finalizar_video_master saiu — era o caminho que concluía sem passar por Entregáveis'
);

select * from finish();
rollback;
