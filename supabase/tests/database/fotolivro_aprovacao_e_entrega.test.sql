-- pgTAP: o fotolivro passa por Entregáveis duas vezes (migration 20260921202848).
--
-- O QUE ESTE ARQUIVO PROTEGE: as duas portas que o gestor pediu e a guarda de
-- cada uma.
--   A/B — a APROVAÇÃO: não se entra nela sem capa e link, e "enviado ao
--         cliente" é do atendimento ou adm.
--   C   — uma prova NOVA volta para a fila do ADM.
--   D   — a ENTREGA: "entregue" é confirmação do atendimento ou adm, e só do
--         que está em "Pronto para entrega" — que fica ABERTO esperando.
--   E   — as colunas só existem no fotolivro, e o link não vaza para `eventos`.
--   S   — a capa: o upload só entra na pasta de uma etapa que é fotolivro.

begin;
select plan(23);

insert into auth.users (id, email, aud, role, created_at, updated_at)
values
  (gen_random_uuid(), 'editora.aprova@clickbaby.test', 'authenticated', 'authenticated', now(), now()),
  (gen_random_uuid(), 'atendimento.aprova@clickbaby.test', 'authenticated', 'authenticated', now(), now());

insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'Editora Aprova', u.id, 'operador', true
  from auth.users u where u.email = 'editora.aprova@clickbaby.test';
insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'Atendimento Aprova', u.id, 'atendimento', true
  from auth.users u where u.email = 'atendimento.aprova@clickbaby.test';

insert into public.maternidades (nome, sigla) values ('Maternidade Aprova', 'APRTEST');

insert into public.casos (mae_nome, pacote_id, maternidade_id)
select 'Mae Aprova', (select id from public.pacotes where slug = 'master-album'),
       (select id from public.maternidades where sigla = 'APRTEST');

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
   where c.mae_nome = 'Mae Aprova' and ce.tipo = p_tipo::public.etapa_tipo;
$$;

create function pg_temp.capa() returns text language sql as $$
  select 'fotolivro/' || pg_temp.etapa('album') || '/capa.png';
$$;


-- =============================================================================
-- A. Não se entra em aprovação sem capa e link
-- =============================================================================

select pg_temp.como('editora.aprova@clickbaby.test');

select throws_ok(
  format($$ select public.mover_album(%L::uuid, 'aguardando_aprovacao') $$, pg_temp.etapa('album')),
  'P0001',
  'Para ir para aprovação o Foto/Livro precisa da imagem da capa e do link para o cliente.',
  'A1: arrastar direto para aprovação, sem capa e link, é recusado'
);

select throws_ok(
  format($$ select public.enviar_fotolivro_para_aprovacao(%L::uuid, '  ', %L) $$,
         pg_temp.etapa('album'), pg_temp.capa()),
  'P0001',
  'Falta o link do Foto/Livro para mandar ao cliente.',
  'A2: sem link não vai'
);

select throws_ok(
  format($$ select public.enviar_fotolivro_para_aprovacao(%L::uuid, 'drive.exemplo/prova', %L) $$,
         pg_temp.etapa('album'), pg_temp.capa()),
  'P0001',
  'O link do Foto/Livro precisa começar com http:// ou https://.',
  'A3: link sem http não vai'
);

select throws_ok(
  format($$ select public.enviar_fotolivro_para_aprovacao(%L::uuid, 'https://prova.exemplo/x', %L) $$,
         pg_temp.etapa('album'), 'fotolivro/' || pg_temp.etapa('edicao_foto') || '/capa.png'),
  'P0001',
  'A imagem da capa não é deste Foto/Livro.',
  'A4: capa de outra pasta não vai'
);

select lives_ok(
  format($$ select public.enviar_fotolivro_para_aprovacao(%L::uuid, 'https://prova.exemplo/x', %L) $$,
         pg_temp.etapa('album'), pg_temp.capa()),
  'A5: quem diagramou manda para aprovação com capa e link'
);

reset role;

select is(
  (select fase_album::text || '/' || status::text from public.caso_etapas where id = pg_temp.etapa('album')),
  'aguardando_aprovacao/pausada',
  'A6: fica em Aguardando aprovação, pausado — esperando o cliente, não concluído'
);

select ok(
  (select fotolivro_link = 'https://prova.exemplo/x' and fotolivro_capa = pg_temp.capa()
          and fotolivro_enviado_em is null
     from public.caso_etapas where id = pg_temp.etapa('album')),
  'A7: capa e link gravados, e na fila do ADM (ainda não enviado)'
);


-- =============================================================================
-- B. "Enviado ao cliente" é do atendimento ou adm
-- =============================================================================

select pg_temp.como('editora.aprova@clickbaby.test');
select throws_ok(
  format($$ select public.marcar_fotolivro_enviado(%L::uuid) $$, pg_temp.etapa('album')),
  'P0001',
  'Quem manda o Foto/Livro ao cliente é o atendimento ou a gestão.',
  'B1: a fotógrafa não marca como enviado'
);
reset role;

select pg_temp.como('atendimento.aprova@clickbaby.test');
select lives_ok(
  format($$ select public.marcar_fotolivro_enviado(%L::uuid) $$, pg_temp.etapa('album')),
  'B2: o atendimento marca como enviado'
);
select lives_ok(
  format($$ select public.marcar_fotolivro_enviado(%L::uuid) $$, pg_temp.etapa('album')),
  'B3: marcar de novo não erra — dois toques ao mesmo tempo é o caso real'
);
reset role;

select ok(
  (select fotolivro_enviado_em is not null
          and fotolivro_enviado_por = (select id from public.pessoas where nome = 'Atendimento Aprova')
     from public.caso_etapas where id = pg_temp.etapa('album')),
  'B4: carimbo do servidor e quem mandou'
);

select is(
  (select count(*)::int from public.eventos
    where caso_etapa_id = pg_temp.etapa('album') and tipo = 'fotolivro_enviado_ao_cliente'),
  1,
  'B5: um evento só, mesmo com dois toques'
);


-- =============================================================================
-- C. Uma prova nova volta para a fila do ADM
-- =============================================================================

select pg_temp.como('editora.aprova@clickbaby.test');
select public.mover_album(pg_temp.etapa('album'), 'pedido_de_alteracoes');
select public.enviar_fotolivro_para_aprovacao(pg_temp.etapa('album'), 'https://prova.exemplo/v2', pg_temp.capa());
reset role;

select ok(
  (select fotolivro_enviado_em is null and fotolivro_enviado_por is null
          and fotolivro_link = 'https://prova.exemplo/v2'
     from public.caso_etapas where id = pg_temp.etapa('album')),
  'C1: depois das alterações, a prova nova volta para Entregáveis sem o "enviado" da anterior'
);


-- =============================================================================
-- D. A entrega: pronto para entrega espera; entregue é confirmação do ADM
-- =============================================================================

select pg_temp.como('editora.aprova@clickbaby.test');
select public.mover_album(pg_temp.etapa('album'), 'aprovado');
select public.mover_album(pg_temp.etapa('album'), 'enviado_grafica');
reset role;

select pg_temp.como('atendimento.aprova@clickbaby.test');
select throws_ok(
  format($$ select public.mover_album(%L::uuid, 'entregue') $$, pg_temp.etapa('album')),
  'P0001',
  'Só se confirma a entrega do Foto/Livro que está em "Pronto para entrega".',
  'D1: da gráfica direto para entregue, não — antes passa por Pronto para entrega'
);
reset role;

select pg_temp.como('editora.aprova@clickbaby.test');
select public.mover_album(pg_temp.etapa('album'), 'pronto_para_entrega');
reset role;

select is(
  (select status::text from public.caso_etapas where id = pg_temp.etapa('album')),
  'pausada',
  'D2: Pronto para entrega NÃO conclui — fica aberto esperando a confirmação em Entregáveis'
);

select pg_temp.como('editora.aprova@clickbaby.test');
select throws_ok(
  format($$ select public.mover_album(%L::uuid, 'entregue') $$, pg_temp.etapa('album')),
  'P0001',
  'Quem confirma a entrega do Foto/Livro é o atendimento ou a gestão, na aba Entregáveis.',
  'D3: a fotógrafa não confirma a entrega'
);
reset role;

select pg_temp.como('atendimento.aprova@clickbaby.test');
select lives_ok(
  format($$ select public.mover_album(%L::uuid, 'entregue') $$, pg_temp.etapa('album')),
  'D4: o atendimento confirma'
);
reset role;

select is(
  (select status::text from public.caso_etapas where id = pg_temp.etapa('album')),
  'concluida',
  'D5: confirmado, o fotolivro conclui e sai da seção'
);


-- =============================================================================
-- E. Só no fotolivro, e o link não vai para `eventos`
-- =============================================================================

select throws_ok(
  format($$ update public.caso_etapas set fotolivro_link = 'https://x' where id = %L $$,
         pg_temp.etapa('edicao_foto')),
  '23514',
  null,
  'E1: capa e link só existem na etapa de fotolivro'
);

select is(
  (select count(*)::int from public.eventos
    where caso_etapa_id = pg_temp.etapa('album') and payload::text like '%prova.exemplo%'),
  0,
  'E2: o link da prova não vai para eventos — é credencial de acesso da família'
);


-- =============================================================================
-- S. A capa no bucket: só na pasta de um fotolivro
-- =============================================================================

select pg_temp.como('editora.aprova@clickbaby.test');

select lives_ok(
  format($$ insert into storage.objects (bucket_id, name) values ('midias', %L) $$,
         'fotolivro/' || pg_temp.etapa('album') || '/nova.png'),
  'S1: sobe a capa na pasta do fotolivro'
);

select throws_ok(
  format($$ insert into storage.objects (bucket_id, name) values ('midias', %L) $$,
         'fotolivro/' || pg_temp.etapa('edicao_foto') || '/nova.png'),
  '42501',
  null,
  'S2: a pasta de uma etapa que não é fotolivro é recusada'
);

select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('midias', 'partos/qualquer.png') $$,
  '42501',
  null,
  'S3: o resto do bucket midias continua fechado'
);

reset role;

select * from finish();
rollback;
