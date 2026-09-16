-- pgTAP: o vídeo do MASTER termina com o link (migration 20260916180834).
--
-- O QUE ESTE ARQUIVO PROTEGE
--   1. LINK E CONCLUSÃO NA MESMA TRANSAÇÃO. Meio caminho produz link órfão num
--      vídeo aberto, ou um vídeo "entregue" sem endereço para a família.
--   2. Sem link não finaliza — é trava, não lembrete.
--   3. Caso ENCERRADO finaliza (é o caso normal: o caso fecha antes do vídeo);
--      cancelado não.
--   4. Só `edicao_video`, e só uma vez.

begin;
select plan(13);

-- =============================================================================
-- Fixtures
-- =============================================================================

insert into auth.users (id, email, aud, role, created_at, updated_at)
values (gen_random_uuid(), 'editora.video@clickbaby.test', 'authenticated', 'authenticated', now(), now());

insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'Editora Video', u.id, 'operador', true
  from auth.users u where u.email = 'editora.video@clickbaby.test';

insert into public.maternidades (nome, sigla) values ('Maternidade Video', 'VIDTEST');

-- MASTER: o pacote que traz o horizontal de fábrica.
insert into public.casos (mae_nome, pacote_id, maternidade_id)
select v.mae,
       (select id from public.pacotes where slug like 'master%' order by length(slug) limit 1),
       (select id from public.maternidades where sigla = 'VIDTEST')
from (values ('Mae Video Aberta'), ('Mae Video Cancelada')) as v(mae);

update public.casos
   set status_operacional = 'cancelado',
       motivo_cancelamento = 'família desistiu'
 where mae_nome = 'Mae Video Cancelada';

select set_config('vid.aberto',
  (select ce.id::text from public.caso_etapas ce join public.casos c on c.id = ce.caso_id
    where c.mae_nome = 'Mae Video Aberta' and ce.tipo = 'edicao_video'), true);
select set_config('vid.cancelado',
  (select ce.id::text from public.caso_etapas ce join public.casos c on c.id = ce.caso_id
    where c.mae_nome = 'Mae Video Cancelada' and ce.tipo = 'edicao_video'), true);
select set_config('vid.foto',
  (select ce.id::text from public.caso_etapas ce join public.casos c on c.id = ce.caso_id
    where c.mae_nome = 'Mae Video Aberta' and ce.tipo = 'edicao_foto' limit 1), true);
select set_config('vid.caso',
  (select id::text from public.casos where mae_nome = 'Mae Video Aberta'), true);

create function pg_temp.como(p_email text) returns void language plpgsql as $$
declare v_id uuid;
begin
  select id into v_id from auth.users where email = p_email;
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L', json_build_object('sub', v_id, 'role', 'authenticated')::text);
end;
$$;

create function pg_temp.finalizar(p_etapa text, p_url text) returns text language sql as $$
  select format(
    $f$ select public.finalizar_video_master(%L::uuid, %L) $f$,
    current_setting(p_etapa), p_url);
$$;


-- =============================================================================
-- 1. Estrutura e privilégios
-- =============================================================================

select ok(
  'video' = any (enum_range(null::public.tipo_entregavel)::text[]),
  'E1: tipo_entregavel ganhou o valor "video"');

select ok(
  has_function_privilege('authenticated', 'public.finalizar_video_master(uuid, text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.finalizar_video_master(uuid, text)', 'EXECUTE'),
  'E2: authenticated executa; anon não');


-- =============================================================================
-- 2. Finalizar
-- =============================================================================

select pg_temp.como('editora.video@clickbaby.test');
select lives_ok(pg_temp.finalizar('vid.aberto', '  https://exemplo.test/video  '),
  'W1: a editora finaliza o vídeo com o link');
reset role;

select is(
  (select status::text from public.caso_etapas where id = current_setting('vid.aberto')::uuid),
  'concluida',
  'W2: o vídeo fica concluído — some a fase "enviado / finalizado"');

select ok(
  (select concluido_em is not null and iniciado_em is not null and pausado_em is null
     from public.caso_etapas where id = current_setting('vid.aberto')::uuid),
  'W3: carimba fim e início — sem play antes, o início vira agora e o ciclo diz zero');

select is(
  (select tipo::text || '|' || url from public.entregaveis
    where caso_id = current_setting('vid.caso')::uuid),
  'video|https://exemplo.test/video',
  'W4: o link entra como entregável do tipo video, com o espaço das pontas aparado');

select is(
  (select count(*)::int from public.eventos
    where caso_id = current_setting('vid.caso')::uuid
      and tipo in ('entregavel_registrado', 'video_master_finalizado')),
  2,
  'W5: dois fatos, dois eventos — o link entrou e o vídeo terminou');

select ok(
  (select not (payload::text ilike '%exemplo.test%') from public.eventos
    where caso_id = current_setting('vid.caso')::uuid and tipo = 'video_master_finalizado'),
  'W6: a URL não vai para o payload — ela é credencial da família (seção 10)');


-- =============================================================================
-- 3. Recusas
-- =============================================================================

select pg_temp.como('editora.video@clickbaby.test');
select throws_ok(pg_temp.finalizar('vid.aberto', 'https://exemplo.test/outro'), 'P0001', null,
  'R1: vídeo já finalizado não finaliza de novo');
select throws_ok(pg_temp.finalizar('vid.cancelado', 'https://exemplo.test/video'), 'P0001', null,
  'R2: caso cancelado recusa');
select throws_ok(pg_temp.finalizar('vid.foto', 'https://exemplo.test/video'), 'P0001', null,
  'R3: etapa que não é o horizontal do MASTER recusa');
select throws_ok(pg_temp.finalizar('vid.cancelado', '   '), 'P0001', null,
  'R4: sem link não finaliza — é trava, não lembrete');
reset role;

select is(
  (select count(*)::int from public.entregaveis where caso_id = current_setting('vid.caso')::uuid),
  1,
  'R5: nenhuma recusa deixou link a mais gravado');

select * from finish();
rollback;
