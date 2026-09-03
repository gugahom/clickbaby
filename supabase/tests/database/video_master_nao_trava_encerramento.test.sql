-- pgTAP: o vídeo horizontal do MASTER não segura o encerramento — e nada mais
-- ganhou passe livre junto (migration 20260903153101).
--
-- As duas metades importam igual. Uma prova o pedido do gestor: um MASTER com
-- tudo entregue e o horizontal ainda em edição encerra, e o vídeo continua
-- operável pela seção. A outra prova que a trava de 20260827181322 segue de pé
-- para o resto — foto, reels, banho —, que é o defeito que ela nasceu para
-- impedir.

begin;
select plan(7);

-- =============================================================================
-- Fixtures
-- =============================================================================

insert into auth.users (id, email, aud, role, created_at, updated_at)
values (gen_random_uuid(), 'video.master.encerra@clickbaby.test', 'authenticated', 'authenticated', now(), now());

insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'Editora Video Master', u.id, 'operador', true
  from auth.users u where u.email = 'video.master.encerra@clickbaby.test';

insert into public.maternidades (nome, sigla)
values ('Maternidade Video Master', 'VIDMTEST');

-- Dois MASTER: um vai encerrar com o vídeo aberto, o outro prova que a foto
-- ainda trava.
insert into public.casos (mae_nome, pacote_id, maternidade_id)
select 'Mae Master Video', (select id from public.pacotes where slug = 'master'), (select id from public.maternidades where sigla = 'VIDMTEST');
insert into public.casos (mae_nome, pacote_id, maternidade_id)
select 'Mae Master Foto', (select id from public.pacotes where slug = 'master'), (select id from public.maternidades where sigla = 'VIDMTEST');

-- No primeiro, tudo resolvido menos o vídeo, que fica EM ALTERAÇÕES — a fase
-- em que um vídeo passa mais tempo, e a que motivou o pedido.
update public.caso_etapas ce
   set status = 'concluida',
       iniciado_em = now() - interval '2 hours',
       concluido_em = now() - interval '1 hour'
  from public.casos c
 where c.id = ce.caso_id
   and c.mae_nome = 'Mae Master Video'
   and ce.tipo <> 'edicao_video';

-- SEGUNDO PASSE, e ele não é redundância.
--
-- Concluir o `fechamento` dispara a trigger da migration 20260827172830, que
-- CRIA a rodada 2 de foto e reels (as do banho). Elas nascem pendentes depois
-- do update acima, então um passe só deixa o caso com duas etapas abertas que
-- ninguém pediu — e foi exatamente assim que esta fixture falhou na primeira
-- execução. É comportamento correto do banco: o checklist do MASTER cresce
-- quando o trabalho de campo termina.
update public.caso_etapas ce
   set status = 'concluida',
       iniciado_em = now() - interval '2 hours',
       concluido_em = now() - interval '1 hour'
  from public.casos c
 where c.id = ce.caso_id
   and c.mae_nome = 'Mae Master Video'
   and ce.tipo <> 'edicao_video'
   and ce.status <> 'concluida';

update public.caso_etapas ce
   set status = 'em_alteracao', iniciado_em = now() - interval '3 hours'
  from public.casos c
 where c.id = ce.caso_id
   and c.mae_nome = 'Mae Master Video'
   and ce.tipo = 'edicao_video';

-- No segundo, o vídeo está resolvido e a FOTO é que ficou aberta.
update public.caso_etapas ce
   set status = 'concluida',
       iniciado_em = now() - interval '2 hours',
       concluido_em = now() - interval '1 hour'
  from public.casos c
 where c.id = ce.caso_id
   and c.mae_nome = 'Mae Master Foto'
   and ce.tipo <> 'edicao_foto';

-- Segundo passe, mesma razão do caso anterior: a rodada 2 nasce agora.
update public.caso_etapas ce
   set status = 'concluida',
       iniciado_em = now() - interval '2 hours',
       concluido_em = now() - interval '1 hour'
  from public.casos c
 where c.id = ce.caso_id
   and c.mae_nome = 'Mae Master Foto'
   and ce.tipo <> 'edicao_foto'
   and ce.status <> 'concluida';

select set_config(
  'request.jwt.claim.sub',
  (select auth_user_id::text from public.pessoas where nome = 'Editora Video Master'),
  true
);
set local role authenticated;

select public.registrar_entregavel(
  (select id from public.casos where mae_nome = 'Mae Master Video'),
  'google_photos',
  'https://fixture.example/master-video'
);
select public.registrar_entregavel(
  (select id from public.casos where mae_nome = 'Mae Master Foto'),
  'google_photos',
  'https://fixture.example/master-foto'
);


-- =============================================================================
-- A. O caso encerra com o vídeo aberto.
-- =============================================================================

select lives_ok(
  format('select public.confirmar_entrega(%L::uuid)',
         (select id from public.casos where mae_nome = 'Mae Master Video')),
  'VM1: confirmar_entrega aceita o MASTER com o vídeo horizontal em aberto'
);

reset role;

select is(
  (select status_operacional::text from public.casos where mae_nome = 'Mae Master Video'),
  'encerrado',
  'VM2: o caso ficou encerrado'
);

select is(
  (select ce.status::text from public.caso_etapas ce
     join public.casos c on c.id = ce.caso_id
    where c.mae_nome = 'Mae Master Video' and ce.tipo = 'edicao_video'),
  'em_alteracao',
  'VM3: o vídeo NÃO foi fechado junto — o trabalho continua onde estava'
);

-- O evento guarda a diferença entre "acabou" e "acabou menos o vídeo".
select is(
  (select (payload->>'video_master_pendente')::boolean
     from public.eventos e
     join public.casos c on c.id = e.caso_id
    where c.mae_nome = 'Mae Master Video' and e.tipo = 'entrega_confirmada'),
  true,
  'VM4: o evento de entrega registra que o vídeo ficou pendente'
);


-- =============================================================================
-- B. E o vídeo continua operável DEPOIS do encerramento — a metade que o
-- pgTAP de mover_video_master apontou como faltando.
-- =============================================================================

select set_config(
  'request.jwt.claim.sub',
  (select auth_user_id::text from public.pessoas where nome = 'Editora Video Master'),
  true
);
set local role authenticated;

select lives_ok(
  format('select public.mover_video_master(%L::uuid, %L)',
         (select ce.id from public.caso_etapas ce
            join public.casos c on c.id = ce.caso_id
           where c.mae_nome = 'Mae Master Video' and ce.tipo = 'edicao_video'),
         'pronto_para_entrega'),
  'VM5: dá para mover a fase do vídeo mesmo com o caso encerrado'
);


-- =============================================================================
-- C. O teto: a exceção é do vídeo e de mais nada.
-- =============================================================================

select throws_ok(
  format('select public.confirmar_entrega(%L::uuid)',
         (select id from public.casos where mae_nome = 'Mae Master Foto')),
  null,
  null,
  'VM6: com a EDIÇÃO DE FOTOS aberta, encerrar continua sendo recusado'
);

reset role;

select is(
  (select status_operacional::text from public.casos where mae_nome = 'Mae Master Foto'),
  'agendado',
  'VM7: e o caso da foto seguiu aberto'
);

select * from finish();
rollback;
