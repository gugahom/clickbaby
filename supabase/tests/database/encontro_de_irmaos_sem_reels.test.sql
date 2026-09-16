-- pgTAP: o encontro de irmãos é ACOMPANHAMENTO e não gera edição
-- (migration 20260916233119).
--
-- ESTE ARQUIVO SUBSTITUI `reels_do_encontro_de_irmaos.test.sql`, e a inversão é
-- o conteúdo. Entre 03/09 e 16/09/2026 concluir o encontro abria uma rodada 3
-- de reels por trigger — era o pedido do gestor na época, e duas semanas de
-- operação o mudaram: nem todo encontro vira vertical, e a trigger decidia por
-- quem edita. Em produção eram 10 rodadas para 6 encontros, duas ainda
-- pendentes.
--
-- O que se protege agora é o silêncio: registrar o encontro NÃO pode criar
-- trabalho de edição. E o que não mudou continua trancado aqui — a etapa segue
-- na trilha de acompanhamento, e o MASTER segue sem reels de fábrica (a outra
-- metade da migration de 03/09, que esta não desfaz).

begin;
select plan(6);

-- =============================================================================
-- Fixtures
-- =============================================================================

insert into public.maternidades (nome, sigla)
values ('Maternidade Irmaos', 'IRMTEST');

insert into public.casos (mae_nome, pacote_id, maternidade_id)
select 'Mae Irmaos', (select id from public.pacotes where slug = 'baby-reels'),
       (select id from public.maternidades where sigla = 'IRMTEST');

insert into public.caso_etapas (caso_id, tipo, status, ordem, rodada)
select id, 'encontro_irmaos', 'pendente', public.ordem_padrao_da_etapa('encontro_irmaos'), 1
  from public.casos where mae_nome = 'Mae Irmaos';


-- =============================================================================
-- 1. A trigger não existe mais
-- =============================================================================

select is(
  (select count(*)::int from pg_trigger
    where tgname = 'reels_do_encontro_de_irmaos' and not tgisinternal),
  0,
  'EI1: a trigger reels_do_encontro_de_irmaos foi removida');

select is(
  (select count(*)::int from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'gerar_reels_do_encontro_de_irmaos'),
  0,
  'EI2: a função da trigger foi removida junto — baseline de privilégios inclusive');


-- =============================================================================
-- 2. Concluir o encontro não cria edição nenhuma
-- =============================================================================

update public.caso_etapas ce
   set status = 'concluida',
       iniciado_em = now() - interval '1 hour',
       concluido_em = now()
  from public.casos c
 where c.id = ce.caso_id and c.mae_nome = 'Mae Irmaos' and ce.tipo = 'encontro_irmaos';

select is(
  (select count(*)::int from public.caso_etapas ce
     join public.casos c on c.id = ce.caso_id
    where c.mae_nome = 'Mae Irmaos' and ce.tipo = 'reels' and ce.rodada >= 3),
  0,
  'EI3: concluir o encontro NÃO abre rodada de reels');

select is(
  (select count(*)::int from public.eventos e
     join public.casos c on c.id = e.caso_id
    where c.mae_nome = 'Mae Irmaos' and e.tipo = 'reels_do_encontro_criado'),
  0,
  'EI4: e não grava o evento que a trigger gravava');


-- =============================================================================
-- 3. O que NÃO mudou
-- =============================================================================

select is(
  (select ce.trilha from public.caso_etapas ce
     join public.casos c on c.id = ce.caso_id
    where c.mae_nome = 'Mae Irmaos' and ce.tipo = 'encontro_irmaos'),
  'acompanhamento',
  'EI5: o encontro continua sendo etapa de ACOMPANHAMENTO — é o que ele é');

select is(
  (select count(*)::int from public.pacote_etapas pe
     join public.pacotes p on p.id = pe.pacote_id
    where p.slug in ('master', 'master-album') and pe.etapa_tipo = 'reels'),
  0,
  'EI6: MASTER e MASTER + ÁLBUM seguem sem reels de fábrica');

select * from finish();
rollback;
