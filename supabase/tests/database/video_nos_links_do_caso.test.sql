-- pgTAP: o vídeo do MASTER pode ir para os links que o caso já tem
-- (migration 20260929183438).
--
--   N1 — caso sem link nenhum: a porta nova recusa, e manda informar o par.
--   N2 — caso com o álbum das fotos: o vídeo vai para "pronto" sem link novo,
--        com o carimbo na etapa.
--   N3 — o ADM confirma a entrega normalmente.
--   N4 — "pronto" continua fechado para quem não passa por uma das duas portas.
--   N5 — voltar a editar apaga o carimbo; o par novo também.

begin;
select plan(9);

insert into auth.users (id, email, aud, role, created_at, updated_at)
values
  (gen_random_uuid(), 'editora.vnl@clickbaby.test', 'authenticated', 'authenticated', now(), now()),
  (gen_random_uuid(), 'atendimento.vnl@clickbaby.test', 'authenticated', 'authenticated', now(), now());

insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'Editora VNL', u.id, 'operador', true from auth.users u where u.email = 'editora.vnl@clickbaby.test';
insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'Atendimento VNL', u.id, 'atendimento', true from auth.users u where u.email = 'atendimento.vnl@clickbaby.test';

insert into public.maternidades (nome, sigla) values ('Maternidade VNL', 'VNLTEST');

insert into public.casos (mae_nome, pacote_id, maternidade_id)
select v.mae, (select id from public.pacotes where slug = 'master'),
       (select id from public.maternidades where sigla = 'VNLTEST')
from (values ('Mae VNL Com Links'), ('Mae VNL Sem Links')) as v(mae);

-- O caso "com links" já tem o álbum do Google das fotos, como o do remoto.
insert into public.entregaveis (caso_id, tipo, url, criado_por)
select c.id, 'google_photos', 'https://photos.exemplo/album', p.id
from public.casos c, public.pessoas p
where c.mae_nome = 'Mae VNL Com Links' and p.nome = 'Editora VNL';

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

select pg_temp.como('editora.vnl@clickbaby.test');
select public.mover_video_master(pg_temp.video('Mae VNL Com Links'), 'em_andamento');
select public.mover_video_master(pg_temp.video('Mae VNL Sem Links'), 'em_andamento');

select throws_ok(
  format($$ select public.enviar_video_nos_links_do_caso(%L::uuid) $$, pg_temp.video('Mae VNL Sem Links')),
  'P0001', 'O caso ainda não tem links — informe o link do vídeo e o WeTransfer.',
  'N1: sem link nenhum no caso, a porta nova recusa'
);

select lives_ok(
  format($$ select public.enviar_video_nos_links_do_caso(%L::uuid) $$, pg_temp.video('Mae VNL Com Links')),
  'N2: com o álbum das fotos, finaliza sem pedir link novo'
);
reset role;

select is(
  (select status::text || '/' || (video_nos_links_do_caso_em is not null)::text
     from public.caso_etapas where id = pg_temp.video('Mae VNL Com Links')),
  'pronto_para_entrega/true',
  'N2: o vídeo está em "pronto", carimbado como entregue nos links do caso'
);

select is(
  (select count(*)::int from public.entregaveis e join public.casos c on c.id = e.caso_id
    where c.mae_nome = 'Mae VNL Com Links' and e.tipo in ('video', 'video_wetransfer')),
  0,
  'N2: nenhum link novo foi inventado'
);

select pg_temp.como('atendimento.vnl@clickbaby.test');
select lives_ok(
  format($$ select public.confirmar_entrega_do_video(%L::uuid) $$, pg_temp.video('Mae VNL Com Links')),
  'N3: o ADM confirma a entrega do vídeo'
);
reset role;

select is(
  (select status::text from public.caso_etapas where id = pg_temp.video('Mae VNL Com Links')),
  'concluida',
  'N3: e o vídeo conclui'
);

select pg_temp.como('editora.vnl@clickbaby.test');
select throws_ok(
  format($$ select public.mover_video_master(%L::uuid, 'pronto_para_entrega') $$, pg_temp.video('Mae VNL Sem Links')),
  'P0001', 'Para ir para “Pronto para entrega” o vídeo precisa do link do vídeo e do WeTransfer.',
  'N4: arrastar para "pronto" sem passar por nenhuma das portas continua recusado'
);

-- A família pede alteração: o vídeo volta a ser editado, e o carimbo sai.
select public.mover_video_master(pg_temp.video('Mae VNL Com Links'), 'em_alteracao');
reset role;

select is(
  (select video_nos_links_do_caso_em from public.caso_etapas where id = pg_temp.video('Mae VNL Com Links')),
  null,
  'N5: voltar a editar apaga o carimbo — a próxima entrega decide de novo'
);

select pg_temp.como('editora.vnl@clickbaby.test');
select public.enviar_video_nos_links_do_caso(pg_temp.video('Mae VNL Com Links'));
select public.mover_video_master(pg_temp.video('Mae VNL Com Links'), 'em_andamento');
select public.enviar_video_para_entrega(pg_temp.video('Mae VNL Com Links'), 'https://video.exemplo/v2', 'https://we.tl/v2');
reset role;

select is(
  (select video_nos_links_do_caso_em from public.caso_etapas where id = pg_temp.video('Mae VNL Com Links')),
  null,
  'N5: e o par novo também — aquela entrega é do par, não dos links do caso'
);

select * from finish();
rollback;
