-- pgTAP: o encontro de irmãos abre a rodada 3 de reels
-- (migration 20260903193219).
--
-- O PROBLEMA QUE ISTO RESOLVE veio do campo: um caso teve o reels concluído e
-- depois a família viveu o encontro de irmãos. O material novo não tinha onde
-- ser registrado — reabrir a rodada do parto misturaria dois trabalhos no mesmo
-- carimbo de tempo, e o tempo de ciclo da seção 9 sairia errado nos dois.
--
-- As asserções cobrem os dois lados: a rodada nasce quando deve, e NÃO nasce
-- quando não deve (adicionar sem concluir, caso encerrado, concluir duas vezes).

begin;
select plan(8);

-- =============================================================================
-- Fixtures
-- =============================================================================

insert into auth.users (id, email, aud, role, created_at, updated_at)
values (gen_random_uuid(), 'irmaos.teste@clickbaby.test', 'authenticated', 'authenticated', now(), now());

insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'Editora Irmaos', u.id, 'operador', true
  from auth.users u where u.email = 'irmaos.teste@clickbaby.test';

insert into public.maternidades (nome, sigla)
values ('Maternidade Irmaos', 'IRMTEST');

insert into public.casos (mae_nome, pacote_id, maternidade_id)
select 'Mae Irmaos', (select id from public.pacotes where slug = 'baby-reels'),
       (select id from public.maternidades where sigla = 'IRMTEST');

insert into public.casos (mae_nome, pacote_id, maternidade_id)
select 'Mae Irmaos Encerrada', (select id from public.pacotes where slug = 'baby-reels'),
       (select id from public.maternidades where sigla = 'IRMTEST');


-- =============================================================================
-- A. Acrescentar o encontro NÃO cria a rodada — só concluir cria.
-- =============================================================================

insert into public.caso_etapas (caso_id, tipo, status, ordem, rodada)
select id, 'encontro_irmaos', 'pendente', public.ordem_padrao_da_etapa('encontro_irmaos'), 1
  from public.casos where mae_nome = 'Mae Irmaos';

select is(
  (select count(*)::int from public.caso_etapas ce
     join public.casos c on c.id = ce.caso_id
    where c.mae_nome = 'Mae Irmaos' and ce.tipo = 'reels' and ce.rodada = 3),
  0,
  'EI1: acrescentar o encontro ainda não abre a rodada — não há material'
);


-- =============================================================================
-- B. Concluir o encontro abre a rodada 3 de reels.
-- =============================================================================

update public.caso_etapas ce
   set status = 'concluida',
       iniciado_em = now() - interval '2 hours',
       concluido_em = now() - interval '1 hour',
       responsavel_id = (select id from public.pessoas where nome = 'Editora Irmaos')
  from public.casos c
 where c.id = ce.caso_id
   and c.mae_nome = 'Mae Irmaos'
   and ce.tipo = 'encontro_irmaos';

select is(
  (select count(*)::int from public.caso_etapas ce
     join public.casos c on c.id = ce.caso_id
    where c.mae_nome = 'Mae Irmaos' and ce.tipo = 'reels' and ce.rodada = 3),
  1,
  'EI2: concluir o encontro abre exatamente uma rodada 3 de reels'
);

select is(
  (select ce.status::text from public.caso_etapas ce
     join public.casos c on c.id = ce.caso_id
    where c.mae_nome = 'Mae Irmaos' and ce.tipo = 'reels' and ce.rodada = 3),
  'pendente',
  'EI3: ela nasce pendente — é trabalho a fazer, não trabalho feito'
);

-- A rodada 1 continua onde estava. O ponto da rodada nova é justamente NÃO
-- mexer no trabalho do parto.
select is(
  (select count(*)::int from public.caso_etapas ce
     join public.casos c on c.id = ce.caso_id
    where c.mae_nome = 'Mae Irmaos' and ce.tipo = 'reels' and ce.rodada = 1),
  1,
  'EI4: a rodada do parto segue intacta, e são duas linhas distintas'
);

select is(
  (select count(*)::int from public.eventos e
     join public.casos c on c.id = e.caso_id
    where c.mae_nome = 'Mae Irmaos' and e.tipo = 'reels_do_encontro_criado'),
  1,
  'EI5: o evento registra a criação — `eventos` é append-only e é a auditoria'
);


-- =============================================================================
-- C. Idempotência: concluir de novo não duplica.
-- =============================================================================

update public.caso_etapas ce
   set status = 'em_andamento', concluido_em = null
  from public.casos c
 where c.id = ce.caso_id and c.mae_nome = 'Mae Irmaos' and ce.tipo = 'encontro_irmaos';

update public.caso_etapas ce
   set status = 'concluida', concluido_em = now()
  from public.casos c
 where c.id = ce.caso_id and c.mae_nome = 'Mae Irmaos' and ce.tipo = 'encontro_irmaos';

select is(
  (select count(*)::int from public.caso_etapas ce
     join public.casos c on c.id = ce.caso_id
    where c.mae_nome = 'Mae Irmaos' and ce.tipo = 'reels' and ce.rodada = 3),
  1,
  'EI6: reconcluir o encontro não duplica a rodada — o on conflict segura'
);


-- =============================================================================
-- D. Caso terminal não ganha trabalho novo.
-- =============================================================================

update public.caso_etapas ce
   set status = 'concluida', iniciado_em = now() - interval '2 hours', concluido_em = now()
  from public.casos c
 where c.id = ce.caso_id and c.mae_nome = 'Mae Irmaos Encerrada';

insert into public.entregaveis (caso_id, tipo, url)
select id, 'google_photos', 'https://fixture.example/irmaos'
  from public.casos where mae_nome = 'Mae Irmaos Encerrada';

update public.casos
   set status_entrega = 'confirmado', status_operacional = 'encerrado'
 where mae_nome = 'Mae Irmaos Encerrada';

insert into public.caso_etapas (caso_id, tipo, status, ordem, rodada)
select id, 'encontro_irmaos', 'pendente', public.ordem_padrao_da_etapa('encontro_irmaos'), 1
  from public.casos where mae_nome = 'Mae Irmaos Encerrada';

update public.caso_etapas ce
   set status = 'concluida', iniciado_em = now() - interval '1 hour', concluido_em = now()
  from public.casos c
 where c.id = ce.caso_id
   and c.mae_nome = 'Mae Irmaos Encerrada'
   and ce.tipo = 'encontro_irmaos';

select is(
  (select count(*)::int from public.caso_etapas ce
     join public.casos c on c.id = ce.caso_id
    where c.mae_nome = 'Mae Irmaos Encerrada' and ce.tipo = 'reels' and ce.rodada = 3),
  0,
  'EI7: caso encerrado não ganha rodada nova — o encontro depois da entrega é outro contrato'
);


-- =============================================================================
-- E. O MASTER não traz reels de fábrica (a outra metade da migration).
-- =============================================================================

select is(
  (select count(*)::int from public.pacote_etapas pe
     join public.pacotes p on p.id = pe.pacote_id
    where p.slug in ('master', 'master-album') and pe.etapa_tipo = 'reels'),
  0,
  'EI8: MASTER e MASTER + ÁLBUM não geram reels — ele entra por adicionar_etapa'
);

select * from finish();
rollback;
