-- pgTAP: o sino do Foto/Livro e a coluna "Alterações realizadas"
-- (migrations 20261127120001 e 20261127120002).
--
-- O QUE ESTE ARQUIVO PROTEGE:
--   M — as três marcas do sino nascem desligadas: ninguém passa a ser chamado
--       sem a gestão marcar.
--   P — as duas colunas de "mandar a prova" não aceitam livro sem capa e link,
--       e a RPC da prova só leva a uma delas.
--   E — quem manda a prova (move para "Aguardando aprovação") fica carimbado,
--       e uma prova nova zera o carimbo.

begin;
select plan(11);

insert into auth.users (id, email, aud, role, created_at, updated_at)
values
  (gen_random_uuid(), 'diagrama.sino@clickbaby.test', 'authenticated', 'authenticated', now(), now()),
  (gen_random_uuid(), 'envia.sino@clickbaby.test', 'authenticated', 'authenticated', now(), now());

insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'Diagrama Sino', u.id, 'operador', true
  from auth.users u where u.email = 'diagrama.sino@clickbaby.test';
insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'Envia Sino', u.id, 'operador', true
  from auth.users u where u.email = 'envia.sino@clickbaby.test';

insert into public.maternidades (nome, sigla) values ('Maternidade Sino', 'SINOTEST');

insert into public.casos (mae_nome, pacote_id, maternidade_id)
select 'Mae Sino', (select id from public.pacotes where slug = 'master-album'),
       (select id from public.maternidades where sigla = 'SINOTEST');

create function pg_temp.como(p_email text) returns void language plpgsql as $$
declare v_id uuid;
begin
  select id into v_id from auth.users where email = p_email;
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L',
    json_build_object('sub', v_id, 'role', 'authenticated')::text);
end;
$$;

create function pg_temp.album() returns uuid language sql as $$
  select ce.id from public.caso_etapas ce
    join public.casos c on c.id = ce.caso_id
   where c.mae_nome = 'Mae Sino' and ce.tipo = 'album';
$$;

create function pg_temp.capa() returns text language sql as $$
  select 'fotolivro/' || pg_temp.album() || '/capa.png';
$$;


-- =============================================================================
-- M. As marcas nascem desligadas
-- =============================================================================

select ok(
  (select not avisa_diagramacao_fotolivro and not avisa_envio_fotolivro and not avisa_grafica_fotolivro
     from public.pessoas where nome = 'Diagrama Sino'),
  'M1: pessoa nova não é chamada pelo sino do Foto/Livro'
);


-- =============================================================================
-- P. Sem capa e link não se manda a prova
-- =============================================================================

select pg_temp.como('diagrama.sino@clickbaby.test');

select throws_ok(
  format($$ select public.mover_album(%L::uuid, 'enviar_para_aprovacao') $$, pg_temp.album()),
  'P0001',
  'Para ir para aprovação o Foto/Livro precisa da imagem da capa e do link para o cliente.',
  'P1: arrastar para Enviar para aprovação sem capa e link é recusado'
);

select throws_ok(
  format($$ select public.mover_album(%L::uuid, 'alteracoes_realizadas') $$, pg_temp.album()),
  'P0001',
  'Para ir para aprovação o Foto/Livro precisa da imagem da capa e do link para o cliente.',
  'P2: arrastar para Alterações realizadas sem capa e link é recusado'
);

select throws_ok(
  format($$ select public.enviar_fotolivro_para_aprovacao(%L::uuid, 'https://prova.exemplo/s', %L, 'aprovado') $$,
         pg_temp.album(), pg_temp.capa()),
  'P0001',
  'A prova do Foto/Livro vai para "Enviar para aprovação" ou para "Alterações realizadas".',
  'P3: a RPC da prova não leva o livro a outra coluna'
);

select lives_ok(
  format($$ select public.enviar_fotolivro_para_aprovacao(%L::uuid, 'https://prova.exemplo/s', %L) $$,
         pg_temp.album(), pg_temp.capa()),
  'P4: sem dizer a coluna, a prova vai para Enviar para aprovação (a tela antiga em cache)'
);

reset role;

select is(
  (select fase_album::text from public.caso_etapas where id = pg_temp.album()),
  'enviar_para_aprovacao',
  'P5: o livro espera quem manda a prova'
);

select is(
  (select payload->>'fase' from public.eventos
    where caso_etapa_id = pg_temp.album() and tipo = 'fotolivro_para_aprovacao'),
  'enviar_para_aprovacao',
  'P6: o evento diz para qual coluna a prova foi'
);


-- =============================================================================
-- E. Quem manda a prova fica carimbado
-- =============================================================================

select pg_temp.como('envia.sino@clickbaby.test');
select public.mover_album(pg_temp.album(), 'aguardando_aprovacao');
reset role;

select ok(
  (select fotolivro_enviado_em is not null
          and fotolivro_enviado_por = (select id from public.pessoas where nome = 'Envia Sino')
     from public.caso_etapas where id = pg_temp.album()),
  'E1: mover para Aguardando aprovação carimba quem mandou — uma fotógrafa também pode'
);

select pg_temp.como('diagrama.sino@clickbaby.test');
select public.mover_album(pg_temp.album(), 'pedido_de_alteracoes');
select public.enviar_fotolivro_para_aprovacao(pg_temp.album(), 'https://prova.exemplo/s2', pg_temp.capa(), 'alteracoes_realizadas');
reset role;

select ok(
  (select fase_album = 'alteracoes_realizadas' and status = 'pausada'
          and fotolivro_enviado_em is null and fotolivro_enviado_por is null
     from public.caso_etapas where id = pg_temp.album()),
  'E2: a prova corrigida vai para Alterações realizadas, pausada e ainda não enviada'
);

-- Manter a capa e o link da rodada anterior é possível: a mesma capa passa.
select pg_temp.como('diagrama.sino@clickbaby.test');
select lives_ok(
  format($$ select public.enviar_fotolivro_para_aprovacao(%L::uuid, 'https://prova.exemplo/s2', %L, 'alteracoes_realizadas') $$,
         pg_temp.album(), pg_temp.capa()),
  'E3: mandar de novo na mesma coluna, com a mesma capa, não erra'
);
reset role;

select pg_temp.como('envia.sino@clickbaby.test');
select public.mover_album(pg_temp.album(), 'aguardando_aprovacao');
reset role;

select ok(
  (select fotolivro_enviado_em is not null
     from public.caso_etapas where id = pg_temp.album()),
  'E4: a prova corrigida enviada também é carimbada'
);

select * from finish();
rollback;
