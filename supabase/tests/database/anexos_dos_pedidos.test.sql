-- pgTAP: os anexos dos pedidos do cliente (migration 20261013215014).
--
--   B — o bucket `pedidos`: privado, 50 MB, com áudio.
--   U — a policy de upload: só na pasta de uma etapa com "Pedidos".
--   R — registrar: lê tamanho e formato do Storage, confere a pasta, grava evento.
--   X — remover: quem enviou, atendimento ou gestão; e o arquivo só sai do
--       bucket depois de sair da lista.

begin;
select plan(18);

insert into auth.users (id, email, aud, role, created_at, updated_at)
values
  (gen_random_uuid(), 'editora.anx@clickbaby.test', 'authenticated', 'authenticated', now(), now()),
  (gen_random_uuid(), 'colega.anx@clickbaby.test', 'authenticated', 'authenticated', now(), now()),
  (gen_random_uuid(), 'atendimento.anx@clickbaby.test', 'authenticated', 'authenticated', now(), now());

insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select v.nome, u.id, v.papel::public.papel_sistema, true
from (values ('Editora ANX', 'editora.anx@clickbaby.test', 'operador'),
             ('Colega ANX', 'colega.anx@clickbaby.test', 'operador'),
             ('Atendimento ANX', 'atendimento.anx@clickbaby.test', 'atendimento')) as v(nome, email, papel)
join auth.users u on u.email = v.email;

insert into public.maternidades (nome, sigla) values ('Maternidade ANX', 'ANXTEST');

-- MASTER + ÁLBUM: tem o vídeo horizontal e o fotolivro, duas das três etapas
-- com "Pedidos" — e a edição de fotos, que não tem.
insert into public.casos (mae_nome, pacote_id, maternidade_id)
values ('Mae ANX', (select id from public.pacotes where slug = 'master-album'),
        (select id from public.maternidades where sigla = 'ANXTEST'));

create function pg_temp.etapa(p_tipo text) returns uuid language sql as $$
  select ce.id from public.caso_etapas ce join public.casos c on c.id = ce.caso_id
   where c.mae_nome = 'Mae ANX' and ce.tipo::text = p_tipo order by ce.rodada limit 1;
$$;
grant execute on function pg_temp.etapa(text) to authenticated;

create function pg_temp.uid(p_email text) returns uuid language sql as $$
  select id from auth.users where email = p_email;
$$;
grant execute on function pg_temp.uid(text) to authenticated;

create function pg_temp.como(p_email text) returns void language plpgsql as $$
declare v_id uuid;
begin
  select id into v_id from auth.users where email = p_email;
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L', json_build_object('sub', v_id, 'role', 'authenticated')::text);
end;
$$;
create function pg_temp.sair() returns void language plpgsql as $$
begin
  execute 'reset role';
  execute 'set local request.jwt.claims = ''{}''';
end;
$$;

-- O "upload" de verdade é a API do Storage; aqui a linha entra como ela a
-- deixaria, com o dono e os metadados.
create function pg_temp.subir(p_caminho text, p_dono text, p_tamanho bigint, p_mime text)
returns void language sql as $$
  insert into storage.objects (bucket_id, name, owner_id, metadata)
  values ('pedidos', p_caminho, pg_temp.uid(p_dono)::text,
          jsonb_build_object('size', p_tamanho, 'mimetype', p_mime));
$$;


-- =============================================================================
-- B. O bucket
-- =============================================================================

select ok(
  not (select public from storage.buckets where id = 'pedidos'),
  'B1: o bucket pedidos é PRIVADO'
);

select is(
  (select file_size_limit from storage.buckets where id = 'pedidos'),
  52428800::bigint,
  'B2: teto de 50 MB por arquivo, decisão do gestor'
);

select ok(
  (select allowed_mime_types from storage.buckets where id = 'pedidos')
    @> array['audio/mpeg', 'image/png', 'video/mp4', 'application/pdf'],
  'B3: aceita música, print, vídeo e PDF'
);


-- =============================================================================
-- U. A policy de upload
-- =============================================================================

select pg_temp.como('editora.anx@clickbaby.test');

select lives_ok(
  format($$ insert into storage.objects (bucket_id, name, owner_id)
            values ('pedidos', %L, %L) $$,
         pg_temp.etapa('album')::text || '/1-referencia.png',
         auth.uid()::text),
  'U1: a editora sobe na pasta do Foto/Livro'
);

select throws_ok(
  format($$ insert into storage.objects (bucket_id, name, owner_id)
            values ('pedidos', %L, %L) $$,
         pg_temp.etapa('edicao_foto')::text || '/1-x.png',
         auth.uid()::text),
  '42501', null,
  'U2: a edição de FOTOS não tem pedidos — o upload na pasta dela é recusado'
);

select pg_temp.sair();


-- =============================================================================
-- R. Registrar
-- =============================================================================

select pg_temp.subir(pg_temp.etapa('album')::text || '/2-musica.mp3', 'editora.anx@clickbaby.test', 3145728, 'audio/mpeg');
select pg_temp.subir(pg_temp.etapa('edicao_video')::text || '/3-video.mp4', 'editora.anx@clickbaby.test', 1000, 'video/mp4');

select pg_temp.como('editora.anx@clickbaby.test');

select throws_ok(
  format($$ select public.registrar_anexo_da_etapa(%L, %L, 'musica.mp3') $$,
         pg_temp.etapa('album'), pg_temp.etapa('edicao_video')::text || '/3-video.mp4'),
  'P0001', 'O arquivo não é deste pedido.',
  'R1: o arquivo de outra etapa não entra na lista desta'
);

select throws_ok(
  format($$ select public.registrar_anexo_da_etapa(%L, %L, 'sumiu.mp3') $$,
         pg_temp.etapa('album'), pg_temp.etapa('album')::text || '/9-sumiu.mp3'),
  'P0001', 'O arquivo não chegou ao servidor. Tente anexar de novo.',
  'R2: caminho sem arquivo no bucket é recusado'
);

select lives_ok(
  format($$ select public.registrar_anexo_da_etapa(%L, %L, 'musica.mp3') $$,
         pg_temp.etapa('album'), pg_temp.etapa('album')::text || '/2-musica.mp3'),
  'R3: a editora registra a música no Foto/Livro'
);

select pg_temp.sair();

select results_eq(
  $$ select nome, tipo_mime, tamanho from public.anexos_da_etapa where caminho like '%/2-musica.mp3' $$,
  $$ values ('musica.mp3'::text, 'audio/mpeg'::text, 3145728::bigint) $$,
  'R4: tamanho e formato vieram do Storage'
);

select is(
  (select count(*)::int from public.eventos
    where tipo = 'anexo_adicionado' and caso_etapa_id = pg_temp.etapa('album')
      and payload ->> 'nome' = 'musica.mp3'),
  1,
  'R5: o histórico ganhou "anexo_adicionado"'
);

select pg_temp.como('colega.anx@clickbaby.test');
select is(
  (select count(*)::int from public.anexos_da_etapa where caso_etapa_id = pg_temp.etapa('album')),
  1,
  'R6: a colega vê o anexo na lista'
);
select pg_temp.sair();


-- =============================================================================
-- X. Remover
-- =============================================================================

create function pg_temp.anexo() returns uuid language sql as $$
  select id from public.anexos_da_etapa where caminho like '%/2-musica.mp3';
$$;
grant execute on function pg_temp.anexo() to authenticated;

set local storage.allow_delete_query = 'true';

select pg_temp.como('colega.anx@clickbaby.test');

select throws_ok(
  $$ select public.remover_anexo_da_etapa(pg_temp.anexo()) $$,
  'P0001', 'Quem apaga um anexo é quem o enviou, o atendimento ou a gestão.',
  'X1: a colega não apaga o anexo da editora'
);

-- Pela porta do Storage, enquanto o arquivo está na lista: a policy não o
-- alcança, e o DELETE não apaga nada.
delete from storage.objects where bucket_id = 'pedidos' and name like '%/2-musica.mp3';
select pg_temp.sair();

select is(
  (select count(*)::int from storage.objects where bucket_id = 'pedidos' and name like '%/2-musica.mp3'),
  1,
  'X2: arquivo que está na lista não sai do bucket pela API do Storage'
);

select pg_temp.como('atendimento.anx@clickbaby.test');

select is(
  public.remover_anexo_da_etapa(pg_temp.anexo()),
  pg_temp.etapa('album')::text || '/2-musica.mp3',
  'X3: o atendimento apaga, e a RPC devolve o caminho do arquivo'
);

delete from storage.objects where bucket_id = 'pedidos' and name like '%/2-musica.mp3';
select pg_temp.sair();

select is(
  (select count(*)::int from storage.objects where bucket_id = 'pedidos' and name like '%/2-musica.mp3'),
  0,
  'X4: fora da lista, o atendimento apaga o arquivo do bucket'
);

select is(
  (select count(*)::int from public.eventos
    where tipo = 'anexo_removido' and payload ->> 'nome' = 'musica.mp3'),
  1,
  'X5: o histórico ganhou "anexo_removido"'
);

-- O arquivo que subiu e não foi registrado (o registro falhou): quem subiu
-- limpa; a colega, não.
select pg_temp.como('colega.anx@clickbaby.test');
delete from storage.objects where bucket_id = 'pedidos' and name like '%/1-referencia.png';
select pg_temp.sair();

select is(
  (select count(*)::int from storage.objects where bucket_id = 'pedidos' and name like '%/1-referencia.png'),
  1,
  'X6: a colega não apaga o arquivo solto de outra pessoa'
);

select pg_temp.como('editora.anx@clickbaby.test');
delete from storage.objects where bucket_id = 'pedidos' and name like '%/1-referencia.png';
select pg_temp.sair();

select is(
  (select count(*)::int from storage.objects where bucket_id = 'pedidos' and name like '%/1-referencia.png'),
  0,
  'X7: quem subiu apaga o próprio arquivo que não entrou na lista'
);


select * from finish();
rollback;
