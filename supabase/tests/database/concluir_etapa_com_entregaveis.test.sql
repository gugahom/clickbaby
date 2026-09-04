-- pgTAP: concluir_etapa_com_entregaveis (migration 20260904190000).
--
-- O QUE ESTE ARQUIVO PROTEGE
-- A regra do gestor é "etapa de edição não conclui sem o link". A tela é quem
-- sabe QUAIS links cada pacote exige; o que a função garante — e é o que se
-- testa aqui — é que link e conclusão andam juntos. Se a atomicidade quebrar,
-- os dois estados proibidos voltam: link órfão em etapa aberta, ou etapa de
-- edição concluída sem link nenhum.

begin;
select plan(12);

-- =============================================================================
-- Fixtures
-- =============================================================================

insert into auth.users (id, email, aud, role, created_at, updated_at)
values (gen_random_uuid(), 'editora.link@clickbaby.test', 'authenticated', 'authenticated', now(), now());

insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'Editora Link', u.id, 'operador', true
  from auth.users u where u.email = 'editora.link@clickbaby.test';

insert into public.maternidades (nome, sigla) values ('Maternidade Link', 'LINKTEST');

insert into public.casos (mae_nome, pacote_id, maternidade_id)
select 'Mae Link', (select id from public.pacotes where slug = 'basic'),
       (select id from public.maternidades where sigla = 'LINKTEST');

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
  where c.mae_nome = 'Mae Link' and ce.tipo::text = p_tipo and ce.rodada = 1;
$$;

create function pg_temp.links() returns integer language sql as $$
  select count(*)::int from public.entregaveis e
  join public.casos c on c.id = e.caso_id
  where c.mae_nome = 'Mae Link';
$$;

select pg_temp.como('editora.link@clickbaby.test');


-- =============================================================================
-- A. ATOMICIDADE — a asserção que dá sentido ao resto.
--
-- A edicao_foto nunca foi iniciada, então concluir_etapa recusa (trava da
-- 20260825051226). O link foi informado ANTES da recusa; ele não pode
-- sobreviver a ela.
-- =============================================================================

select throws_ok(
  format(
    $$ select public.concluir_etapa_com_entregaveis(%L::uuid,
         '[{"tipo":"google_photos","url":"https://photos.example/a"}]'::jsonb) $$,
    pg_temp.etapa('edicao_foto')),
  'P0001',
  null,
  'A0: conclusão recusada quando a edição nunca foi iniciada'
);

select is(pg_temp.links(), 0, 'A1: e o link NÃO ficou para trás — a transação voltou inteira');

select is(
  (select ce.status::text from public.caso_etapas ce where ce.id = pg_temp.etapa('edicao_foto')),
  'pendente',
  'A2: a etapa também continua onde estava'
);


-- =============================================================================
-- B. O caminho feliz
-- =============================================================================

select public.iniciar_etapa(pg_temp.etapa('edicao_foto'));

select lives_ok(
  format(
    $$ select public.concluir_etapa_com_entregaveis(%L::uuid,
         '[{"tipo":"google_photos","url":"https://photos.example/a"}]'::jsonb,
         'primeira rodada') $$,
    pg_temp.etapa('edicao_foto')),
  'B0: com a etapa iniciada, link e conclusão passam juntos'
);

select is(
  (select ce.status::text from public.caso_etapas ce where ce.id = pg_temp.etapa('edicao_foto')),
  'concluida',
  'B1: a etapa fica concluída'
);

select is(pg_temp.links(), 1, 'B2: e o link está registrado');

select is(
  (select ce.observacao from public.caso_etapas ce where ce.id = pg_temp.etapa('edicao_foto')),
  'primeira rodada',
  'B3: a observação continua chegando — é o mesmo gesto de concluir'
);

-- A url é credencial da galeria da família (seção 10). O evento diz que um
-- link daquele tipo entrou; nunca qual era.
select is(
  (select count(*)::int from public.eventos e
     join public.casos c on c.id = e.caso_id
    where c.mae_nome = 'Mae Link'
      and e.tipo = 'entregavel_registrado'
      and e.payload::text like '%photos.example%'),
  0,
  'B4: a URL NÃO entra no payload do evento'
);


-- =============================================================================
-- C. O que a função recusa
-- =============================================================================

select public.iniciar_etapa(pg_temp.etapa('reels'));

select throws_ok(
  format(
    $$ select public.concluir_etapa_com_entregaveis(%L::uuid, '[]'::jsonb) $$,
    pg_temp.etapa('reels')),
  'P0001',
  'Nenhum link informado. Para concluir sem link, use concluir_etapa.',
  'C0: lista vazia é recusada — é a porta que a regra do gestor fecha'
);

select throws_ok(
  format(
    $$ select public.concluir_etapa_com_entregaveis(%L::uuid,
         '[{"tipo":"instagram","url":"https://x.example"}]'::jsonb) $$,
    pg_temp.etapa('reels')),
  'P0001',
  'Tipo de entregável "instagram" não existe.',
  'C1: tipo inventado morre com o nome errado no erro'
);

select throws_ok(
  format(
    $$ select public.concluir_etapa_com_entregaveis(%L::uuid,
         '[{"tipo":"cadeado","url":"   "}]'::jsonb) $$,
    pg_temp.etapa('reels')),
  'P0001',
  'URL do entregável não pode ser vazia.',
  'C2: url em branco é recusada'
);


-- =============================================================================
-- D. Link idêntico não duplica
--
-- A rodada 2 da edição de fotos conclui com o mesmo álbum do Google da rodada
-- 1. Sem esta guarda, a família aparece com três cópias do mesmo endereço.
-- =============================================================================

select public.concluir_etapa_com_entregaveis(
  pg_temp.etapa('reels'),
  '[{"tipo":"google_photos","url":"https://photos.example/a"}]'::jsonb
);

select is(pg_temp.links(), 1, 'D0: o mesmo link no mesmo tipo não vira uma segunda linha');

select * from finish();
rollback;
