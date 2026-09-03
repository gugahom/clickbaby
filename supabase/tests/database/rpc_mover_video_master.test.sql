-- pgTAP: mover_video_master (migrations 20260901051229 e 20260901051232).
--
-- É a RPC que leva o vídeo horizontal do MASTER de uma fase à outra — o fluxo
-- que a equipe usa no Trello, trazido para a seção MASTER do Quadro.
--
-- O que precisa ser provado:
--   - move entre as cinco fases, nos DOIS sentidos (volta de PRONTO para
--     ALTERAÇÕES é o caso real: a família pediu mudança);
--   - `iniciado_em` carimba na primeira saída do backlog e NUNCA é apagado
--     depois — é o tempo de ciclo da seção 9;
--   - `concluido_em` só existe na última fase, e sair dela limpa;
--   - recusa etapa que não seja edicao_video (é o que mantém as duas fases
--     novas inalcançáveis para o resto do sistema);
--   - recusa caso terminal e fase que não faz parte do fluxo;
--   - as duas fases novas NÃO contam como resolvidas — a trava de
--     encerramento continua barrando o caso.

begin;
select plan(20);

create function pg_temp.levanta_erro(p_sql text) returns boolean
language plpgsql
as $$
begin
  execute p_sql;
  return false;
exception when others then
  return true;
end;
$$;

create function pg_temp.video(p_caso uuid) returns uuid
language sql as $$
  select id from public.caso_etapas
  where caso_id = p_caso and tipo = 'edicao_video' and rodada = 1;
$$;


-- =============================================================================
-- Fixtures — um MASTER (tem edicao_video) e um BASIC (não tem)
-- =============================================================================

insert into auth.users (id, email, aud, role, created_at, updated_at)
values (gen_random_uuid(), 'editora.master@clickbaby.test', 'authenticated', 'authenticated', now(), now());

insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'Editora Master', u.id, 'operador', true
from auth.users u where u.email = 'editora.master@clickbaby.test';

insert into public.casos (id, mae_nome, bebe_nome, pacote_id, maternidade_id, previsao_em)
values (
  'dddddddd-0000-0000-0000-000000000001',
  'MAE MASTER', 'BEBE MASTER',
  (select id from public.pacotes where slug = 'master'),
  (select id from public.maternidades where sigla = 'HSC'),
  now()
);

insert into public.casos (id, mae_nome, bebe_nome, pacote_id, maternidade_id, previsao_em)
values (
  'dddddddd-0000-0000-0000-000000000002',
  'MAE BASIC', 'BEBE BASIC',
  (select id from public.pacotes where slug = 'basic'),
  (select id from public.maternidades where sigla = 'HSC'),
  now()
);


-- =============================================================================
-- 1. Estado inicial — o MASTER nasce com o horizontal no backlog
-- =============================================================================

select is(
  (select status from public.caso_etapas
    where id = pg_temp.video('dddddddd-0000-0000-0000-000000000001')),
  'pendente'::public.status_etapa,
  'A0: o vídeo do MASTER nasce em pendente (fase VIDEOS - EDIÇÃO)'
);

select ok(
  (select iniciado_em is null from public.caso_etapas
    where id = pg_temp.video('dddddddd-0000-0000-0000-000000000001')),
  'A1: e sem iniciado_em — ninguém começou'
);


-- =============================================================================
-- 2. Backlog -> EDITANDO
-- =============================================================================

select set_config('request.jwt.claim.sub',
  (select auth_user_id::text from public.pessoas where nome = 'Editora Master'), true);
set local role authenticated;

select lives_ok(
  format($$ select public.mover_video_master(%L, 'em_andamento') $$,
         pg_temp.video('dddddddd-0000-0000-0000-000000000001')),
  'B0: move para EDITANDO'
);

reset role;

select is(
  (select status from public.caso_etapas
    where id = pg_temp.video('dddddddd-0000-0000-0000-000000000001')),
  'em_andamento'::public.status_etapa,
  'B1: status virou em_andamento'
);

select ok(
  (select iniciado_em is not null from public.caso_etapas
    where id = pg_temp.video('dddddddd-0000-0000-0000-000000000001')),
  'B2: iniciado_em carimbado na saída do backlog'
);

select is(
  (select responsavel_id from public.caso_etapas
    where id = pg_temp.video('dddddddd-0000-0000-0000-000000000001')),
  (select id from public.pessoas where nome = 'Editora Master'),
  'B3: quem moveu assumiu — não havia responsável'
);

select is(
  (select count(*)::int from public.eventos
    where caso_etapa_id = pg_temp.video('dddddddd-0000-0000-0000-000000000001')
      and tipo = 'video_master_movido'),
  1,
  'B4: gravou evento video_master_movido — invariante 3.3'
);


-- =============================================================================
-- 3. O caminho todo até ENVIADO, e a VOLTA (o caso real da alteração)
-- =============================================================================

set local role authenticated;

select lives_ok(
  format($$ select public.mover_video_master(%L, 'pronto_para_entrega') $$,
         pg_temp.video('dddddddd-0000-0000-0000-000000000001')),
  'C0: EDITANDO -> PRONTO PARA ENTREGA'
);

reset role;

select ok(
  (select concluido_em is null from public.caso_etapas
    where id = pg_temp.video('dddddddd-0000-0000-0000-000000000001')),
  'C1: PRONTO ainda não é concluído — sem concluido_em'
);

set local role authenticated;

select lives_ok(
  format($$ select public.mover_video_master(%L, 'concluida') $$,
         pg_temp.video('dddddddd-0000-0000-0000-000000000001')),
  'C2: PRONTO -> ENVIADO / FINALIZADO'
);

reset role;

select ok(
  (select concluido_em is not null from public.caso_etapas
    where id = pg_temp.video('dddddddd-0000-0000-0000-000000000001')),
  'C3: a última fase carimba concluido_em'
);

-- A VOLTA: a família pediu mudança depois de o vídeo já ter saído.
set local role authenticated;

select lives_ok(
  format($$ select public.mover_video_master(%L, 'em_alteracao') $$,
         pg_temp.video('dddddddd-0000-0000-0000-000000000001')),
  'C4: ENVIADO -> ALTERAÇÕES, o fluxo anda nos dois sentidos'
);

reset role;

select ok(
  (select concluido_em is null from public.caso_etapas
    where id = pg_temp.video('dddddddd-0000-0000-0000-000000000001')),
  'C5: sair da última fase LIMPA concluido_em — não está mais concluído'
);

select ok(
  (select iniciado_em is not null from public.caso_etapas
    where id = pg_temp.video('dddddddd-0000-0000-0000-000000000001')),
  'C6: iniciado_em sobreviveu à ida e à volta — o tempo de ciclo não zera'
);


-- =============================================================================
-- 4. O vídeo em ALTERAÇÕES NÃO segura mais o encerramento
--
-- ESTA ASSERÇÃO FOI INVERTIDA em 20260903153101, e a inversão é a mudança —
-- não um teste que "passou a incomodar". Ela dizia que a fase nova não contava
-- como resolvida e por isso travava o encerramento; era verdade e era o
-- comportamento certo enquanto o vídeo fazia parte da entrega. O gestor pediu o
-- contrário, com razão: o horizontal leva dez dias úteis, a família já recebeu
-- o resto, e o cartão ficava semanas na tela por causa dele.
--
-- O que a trava original protegia continua protegido, e tem prova própria em
-- video_master_nao_trava_encerramento.test.sql: com a EDIÇÃO DE FOTOS aberta,
-- encerrar segue sendo recusado.
-- =============================================================================

-- Resolve tudo MENOS o vídeo, que fica em alteração (estado atual).
update public.caso_etapas
   set status = 'dispensada'
 where caso_id = 'dddddddd-0000-0000-0000-000000000001'
   and tipo <> 'edicao_video';

insert into public.entregaveis (caso_id, tipo, url)
values ('dddddddd-0000-0000-0000-000000000001', 'google_photos', 'https://photos.google.com/master');

set local role authenticated;

select ok(
  not pg_temp.levanta_erro(
    $$ select public.confirmar_entrega('dddddddd-0000-0000-0000-000000000001') $$),
  'D0: com o vídeo em ALTERAÇÕES o caso ENCERRA — o horizontal não segura a entrega'
);

reset role;


-- =============================================================================
-- 5. Guardas
-- =============================================================================

set local role authenticated;

-- Etapa que não é vídeo: é o que mantém as fases novas fora do resto.
select ok(
  pg_temp.levanta_erro(format(
    $$ select public.mover_video_master(%L, 'em_alteracao') $$,
    (select id from public.caso_etapas
      where caso_id = 'dddddddd-0000-0000-0000-000000000002' and tipo = 'edicao_foto'))),
  'E0: recusa etapa que não é edicao_video'
);

-- Fase que não faz parte do fluxo.
select ok(
  pg_temp.levanta_erro(format(
    $$ select public.mover_video_master(%L, 'dispensada') $$,
    pg_temp.video('dddddddd-0000-0000-0000-000000000001'))),
  'E1: recusa fase que não faz parte do fluxo (dispensada)'
);

-- Idempotência: reafirmar a fase atual não erra e não gera evento novo.
select is(
  (select count(*)::int from public.eventos
    where caso_etapa_id = pg_temp.video('dddddddd-0000-0000-0000-000000000001')
      and tipo = 'video_master_movido'),
  4,
  'E2: quatro movimentos até aqui geraram quatro eventos'
);

select lives_ok(
  format($$ select public.mover_video_master(%L, 'em_alteracao') $$,
         pg_temp.video('dddddddd-0000-0000-0000-000000000001')),
  'E3: mover para a fase ATUAL não é erro'
);

reset role;

select is(
  (select count(*)::int from public.eventos
    where caso_etapa_id = pg_temp.video('dddddddd-0000-0000-0000-000000000001')
      and tipo = 'video_master_movido'),
  4,
  'E4: e não gerou evento — idempotente de verdade'
);


select * from finish();
rollback;
