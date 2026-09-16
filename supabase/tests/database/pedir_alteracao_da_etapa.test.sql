-- pgTAP: o pedido de alteração do vídeo e do Foto/Livro (migration 20260916215022).
--
-- O QUE ESTE ARQUIVO PROTEGE
--   1. FASE E PEDIDO NA MESMA TRANSAÇÃO. Um vídeo em ALTERAÇÕES sem dizer o
--      que alterar é o estado que esta RPC existe para evitar.
--   2. O PEDIDO SE SOMA ao que já estava escrito — a observação da etapa é onde
--      moram os pedidos do cliente, e escrever por cima apagaria metade do que
--      a família pediu.
--   3. O CASO CONTINUA ENCERRADO. É a diferença inteira para `reabrir_caso`.
--   4. Só as duas etapas com seção própria; toda outra volta pela reabertura.

begin;
select plan(13);

-- =============================================================================
-- Fixtures
-- =============================================================================

insert into auth.users (id, email, aud, role, created_at, updated_at)
values (gen_random_uuid(), 'editora.alteracao@clickbaby.test', 'authenticated', 'authenticated', now(), now());

insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'Editora Alteracao', u.id, 'operador', true
  from auth.users u where u.email = 'editora.alteracao@clickbaby.test';

insert into public.maternidades (nome, sigla) values ('Maternidade Alteracao', 'ALTTEST');

-- MASTER + ÁLBUM: o único pacote que traz o horizontal E o fotolivro.
insert into public.casos (mae_nome, pacote_id, maternidade_id)
select v.mae,
       (select id from public.pacotes where slug like 'master%album%' limit 1),
       (select id from public.maternidades where sigla = 'ALTTEST')
from (values ('Mae Alteracao Entregue'), ('Mae Alteracao Cancelada')) as v(mae);

update public.casos
   set status_operacional = 'cancelado',
       motivo_cancelamento = 'família desistiu'
 where mae_nome = 'Mae Alteracao Cancelada';

select set_config('alt.video',
  (select ce.id::text from public.caso_etapas ce join public.casos c on c.id = ce.caso_id
    where c.mae_nome = 'Mae Alteracao Entregue' and ce.tipo = 'edicao_video'), true);
select set_config('alt.album',
  (select ce.id::text from public.caso_etapas ce join public.casos c on c.id = ce.caso_id
    where c.mae_nome = 'Mae Alteracao Entregue' and ce.tipo = 'album'), true);
select set_config('alt.foto',
  (select ce.id::text from public.caso_etapas ce join public.casos c on c.id = ce.caso_id
    where c.mae_nome = 'Mae Alteracao Entregue' and ce.tipo = 'edicao_foto' limit 1), true);
select set_config('alt.cancelado',
  (select ce.id::text from public.caso_etapas ce join public.casos c on c.id = ce.caso_id
    where c.mae_nome = 'Mae Alteracao Cancelada' and ce.tipo = 'edicao_video'), true);
select set_config('alt.caso',
  (select id::text from public.casos where mae_nome = 'Mae Alteracao Entregue'), true);

-- O estado de onde o pedido nasce: trabalho ENTREGUE e caso ENCERRADO. O vídeo
-- já tem um pedido antigo escrito, que é o que não pode sumir.
update public.caso_etapas
   set status = 'concluida',
       iniciado_em = now() - interval '3 days',
       concluido_em = now() - interval '1 day',
       observacao = 'Música: https://exemplo.test/musica'
 where id = current_setting('alt.video')::uuid;

update public.caso_etapas
   set status = 'concluida',
       fase_album = 'entregue',
       iniciado_em = now() - interval '3 days',
       concluido_em = now() - interval '1 day'
 where id = current_setting('alt.album')::uuid;

update public.casos
   set status_operacional = 'encerrado',
       status_entrega = 'confirmado'
 where id = current_setting('alt.caso')::uuid;

create function pg_temp.como(p_email text) returns void language plpgsql as $$
declare v_id uuid;
begin
  select id into v_id from auth.users where email = p_email;
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L', json_build_object('sub', v_id, 'role', 'authenticated')::text);
end;
$$;

create function pg_temp.pedir(p_etapa text, p_motivo text) returns text language sql as $$
  select format(
    $f$ select public.pedir_alteracao_da_etapa(%L::uuid, %L) $f$,
    current_setting(p_etapa), p_motivo);
$$;


-- =============================================================================
-- 1. Privilégios
-- =============================================================================

select ok(
  has_function_privilege('authenticated', 'public.pedir_alteracao_da_etapa(uuid, text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.pedir_alteracao_da_etapa(uuid, text)', 'EXECUTE'),
  'E1: authenticated executa; anon não');


-- =============================================================================
-- 2. O vídeo volta, e o pedido se soma
-- =============================================================================

select pg_temp.como('editora.alteracao@clickbaby.test');
select lives_ok(pg_temp.pedir('alt.video', 'Tirar a música do final'),
  'W1: a editora pede alteração de um vídeo já entregue');
reset role;

select is(
  (select status from public.caso_etapas where id = current_setting('alt.video')::uuid),
  'em_alteracao'::public.status_etapa,
  'W2: o vídeo está na fase de ALTERAÇÃO');

select is(
  (select concluido_em from public.caso_etapas where id = current_setting('alt.video')::uuid),
  null,
  'W3: a conclusão foi desfeita — o vídeo não está mais entregue');

select is(
  (select observacao from public.caso_etapas where id = current_setting('alt.video')::uuid),
  E'Música: https://exemplo.test/musica\nTirar a música do final',
  'W4: o pedido novo se SOMA ao que já estava escrito, numa linha abaixo');

select is(
  (select status_operacional from public.casos where id = current_setting('alt.caso')::uuid),
  'encerrado'::public.status_operacional,
  'W5: o CASO continua encerrado — é a diferença inteira para reabrir_caso');

select ok(
  exists (select 1 from public.eventos
           where caso_etapa_id = current_setting('alt.video')::uuid
             and tipo = 'video_master_movido'),
  'W6: a mudança de fase virou evento (pela mover_video_master)');

select ok(
  exists (select 1 from public.eventos
           where caso_etapa_id = current_setting('alt.video')::uuid
             and tipo = 'etapa_anotada'),
  'W7: o pedido virou evento');


-- =============================================================================
-- 3. O Foto/Livro segue o mesmo caminho, na fase dele
-- =============================================================================

select pg_temp.como('editora.alteracao@clickbaby.test');
select lives_ok(pg_temp.pedir('alt.album', 'Trocar a capa'),
  'W8: o Foto/Livro também aceita o pedido');
reset role;

select is(
  (select fase_album from public.caso_etapas where id = current_setting('alt.album')::uuid),
  'pedido_de_alteracoes'::public.fase_album,
  'W9: o fotolivro está em PEDIDO DE ALTERAÇÕES');


-- =============================================================================
-- 4. O que ela recusa
-- =============================================================================

select pg_temp.como('editora.alteracao@clickbaby.test');

select throws_ok(pg_temp.pedir('alt.video', '   '),
  null, null,
  'R1: sem dizer o que a família pediu, não passa');

select throws_ok(pg_temp.pedir('alt.foto', 'Refazer as fotos'),
  null, null,
  'R2: edição de FOTOS não passa por aqui — o caminho dela é reabrir o caso');

select throws_ok(pg_temp.pedir('alt.cancelado', 'Mudar o final'),
  null, null,
  'R3: caso cancelado recusa — não há trabalho a terminar');

reset role;

select * from finish();
rollback;
