-- pgTAP: a seção CLICK HOME (migrations 20260922212852 e 20260922212901).
--
-- O que este arquivo protege:
--   A — a etapa nasce do adicional, e só uma vez; o rascunho espera o pacote.
--   B — a esteira: fase e status juntos, pausa nas esperas.
--   C — "enviar para escolha" exige o link da galeria.
--   D — finalizar é do atendimento/adm, só a partir da escolha, e confirma o link.
--   E — o ensaio NÃO segura o encerramento do caso.

begin;
select plan(23);

insert into auth.users (id, email, aud, role, created_at, updated_at)
values
  (gen_random_uuid(), 'editora.ch@clickbaby.test', 'authenticated', 'authenticated', now(), now()),
  (gen_random_uuid(), 'atendimento.ch@clickbaby.test', 'authenticated', 'authenticated', now(), now());

insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'Editora CH', u.id, 'operador', true from auth.users u where u.email = 'editora.ch@clickbaby.test';
insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'Atendimento CH', u.id, 'atendimento', true from auth.users u where u.email = 'atendimento.ch@clickbaby.test';

insert into public.maternidades (nome, sigla) values ('Maternidade CH', 'CHTEST');

create function pg_temp.como(p_email text) returns void language plpgsql as $$
declare v_id uuid;
begin
  select id into v_id from auth.users where email = p_email;
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L',
    json_build_object('sub', v_id, 'role', 'authenticated')::text);
end;
$$;

create function pg_temp.caso(p_mae text) returns uuid language sql as $$
  select id from public.casos where mae_nome = p_mae;
$$;

create function pg_temp.ensaio(p_mae text) returns uuid language sql as $$
  select ce.id from public.caso_etapas ce
    join public.casos c on c.id = ce.caso_id
   where c.mae_nome = p_mae and ce.tipo = 'click_home';
$$;


-- =============================================================================
-- A. A etapa nasce do adicional
-- =============================================================================

-- Caso com pacote e o adicional: nasce com as etapas do pacote MAIS o ensaio.
insert into public.casos (mae_nome, pacote_id, maternidade_id, click_home)
values ('Mae CH Standard', (select id from public.pacotes where slug = 'standard'),
        (select id from public.maternidades where sigla = 'CHTEST'), true);

select is(
  (select count(*)::int from public.caso_etapas ce
    where ce.caso_id = pg_temp.caso('Mae CH Standard') and ce.tipo = 'click_home'),
  1,
  'A1: o adicional vira UMA etapa click_home'
);

-- A guarda de gerar_caso_etapas é "caso que já tem etapa não gera nada". Se a
-- etapa do ensaio entrasse antes, o STANDARD nasceria sem checklist nenhum.
select is(
  (select count(*)::int from public.caso_etapas ce
    where ce.caso_id = pg_temp.caso('Mae CH Standard') and ce.tipo <> 'click_home'),
  (select count(*)::int from public.pacote_etapas pe
    where pe.pacote_id = (select id from public.pacotes where slug = 'standard')),
  'A2: e as etapas do pacote continuam vindo todas — a ordem das triggers importa'
);

select is(
  (select ordem from public.caso_etapas where id = pg_temp.ensaio('Mae CH Standard')),
  12,
  'A3: entra por último na ordem de leitura'
);

select is(
  (select trilha from public.caso_etapas where id = pg_temp.ensaio('Mae CH Standard')),
  'edicao',
  'A4: é trabalho de ilha, não de maternidade'
);

-- RASCUNHO: chega sem pacote. A etapa só nasce na confirmação, senão o caso
-- ficaria com o ensaio e sem o checklist do pacote para sempre.
insert into public.casos (mae_nome, pacote_id, maternidade_id, click_home)
values ('Mae CH Rascunho', null,
        (select id from public.maternidades where sigla = 'CHTEST'), true);

select is(
  (select count(*)::int from public.caso_etapas ce where ce.caso_id = pg_temp.caso('Mae CH Rascunho')),
  0,
  'A5: rascunho pendente não ganha etapa nenhuma ainda'
);

update public.casos
   set pacote_id = (select id from public.pacotes where slug = 'basic')
 where mae_nome = 'Mae CH Rascunho';

select ok(
  (select count(*) from public.caso_etapas ce
    where ce.caso_id = pg_temp.caso('Mae CH Rascunho') and ce.tipo <> 'click_home') > 0
  and (select count(*) from public.caso_etapas ce
    where ce.caso_id = pg_temp.caso('Mae CH Rascunho') and ce.tipo = 'click_home') = 1,
  'A6: confirmado o pacote, vêm as etapas dele E o ensaio'
);

-- O sync descobre o adicional num caso que já existia.
insert into public.casos (mae_nome, pacote_id, maternidade_id)
values ('Mae CH Depois', (select id from public.pacotes where slug = 'basic'),
        (select id from public.maternidades where sigla = 'CHTEST'));

select is(
  (select public.sync_marcar_click_home(
     (select google_calendar_event_id from public.casos where mae_nome = 'Mae CH Depois'))),
  'sem_caso',
  'A7: sem evento do Calendar casando, a marca não tem onde cair'
);

update public.casos set click_home = true where mae_nome = 'Mae CH Depois';

select is(
  (select count(*)::int from public.caso_etapas ce
    where ce.caso_id = pg_temp.caso('Mae CH Depois') and ce.tipo = 'click_home'),
  1,
  'A8: marcar depois também cria o ensaio'
);


-- =============================================================================
-- B. A esteira
-- =============================================================================

select pg_temp.como('editora.ch@clickbaby.test');

select lives_ok(
  format($$ select public.mover_click_home(%L::uuid, 'editando') $$, pg_temp.ensaio('Mae CH Standard')),
  'B1: quem edita move a fase'
);

select ok(
  (select status = 'em_andamento' and pausado_em is null and iniciado_em is not null
     from public.caso_etapas where id = pg_temp.ensaio('Mae CH Standard')),
  'B2: editando é trabalho acontecendo — relógio correndo'
);

select public.mover_click_home(pg_temp.ensaio('Mae CH Standard'), 'aguardando_edicao');

select ok(
  (select status = 'pausada' and pausado_em is not null
     from public.caso_etapas where id = pg_temp.ensaio('Mae CH Standard')),
  'B3: espera é pausa — o ciclo mede trabalho, não calendário'
);

select throws_ok(
  format($$ select public.mover_click_home(%L::uuid, 'editando') $$,
         (select ce.id from public.caso_etapas ce
           join public.casos c on c.id = ce.caso_id
          where c.mae_nome = 'Mae CH Standard' and ce.tipo = 'edicao_foto')),
  'P0001',
  'A esteira do Click Home é da etapa do ensaio — etapa "edicao_foto" não passa por ela.',
  'B4: nenhuma outra etapa entra na esteira'
);

reset role;


-- =============================================================================
-- C. A galeria de escolha
-- =============================================================================

select pg_temp.como('editora.ch@clickbaby.test');

select throws_ok(
  format($$ select public.mover_click_home(%L::uuid, 'enviar_para_escolha') $$,
         pg_temp.ensaio('Mae CH Standard')),
  'P0001',
  'Para mandar o Click Home para escolha é preciso o link da galeria.',
  'C1: sem link da galeria, não vai para escolha'
);

select throws_ok(
  format($$ select public.enviar_click_home_para_escolha(%L::uuid, 'galeria.exemplo/ch') $$,
         pg_temp.ensaio('Mae CH Standard')),
  'P0001',
  'O link precisa começar com http:// ou https://.',
  'C2: link sem http não passa'
);

select lives_ok(
  format($$ select public.enviar_click_home_para_escolha(%L::uuid, 'https://galeria.exemplo/ch') $$,
         pg_temp.ensaio('Mae CH Standard')),
  'C3: com o link, o ensaio vai para a escolha da família'
);

select ok(
  (select fase_click_home = 'enviar_para_escolha' and status = 'pausada' and concluido_em is null
     from public.caso_etapas where id = pg_temp.ensaio('Mae CH Standard')),
  'C4: fica esperando a família — aberto, e não concluído'
);

reset role;


-- =============================================================================
-- D. Finalizar é da Morgana
-- =============================================================================

select pg_temp.como('editora.ch@clickbaby.test');
select throws_ok(
  format($$ select public.confirmar_entrega_do_click_home(%L::uuid) $$, pg_temp.ensaio('Mae CH Standard')),
  'P0001',
  'Quem finaliza o Click Home é o atendimento ou a gestão, na aba Entregáveis.',
  'D1: a fotógrafa não finaliza'
);
reset role;

select pg_temp.como('atendimento.ch@clickbaby.test');
select throws_ok(
  format($$ select public.confirmar_entrega_do_click_home(%L::uuid) $$, pg_temp.ensaio('Mae CH Depois')),
  'P0001',
  'Só se finaliza o Click Home que já foi mandado para a escolha da família.',
  'D2: e não se finaliza o que nem foi mandado'
);

select public.confirmar_entrega_do_click_home(pg_temp.ensaio('Mae CH Standard'));
reset role;

select ok(
  (select fase_click_home = 'finalizado' and status = 'concluida' and concluido_em is not null
     from public.caso_etapas where id = pg_temp.ensaio('Mae CH Standard')),
  'D3: finalizado conclui a etapa'
);

select is(
  (select count(*)::int from public.entregaveis
    where caso_id = pg_temp.caso('Mae CH Standard') and tipo = 'click_home'
      and confirmado_em is not null),
  1,
  'D4: e o link da galeria vira confirmado'
);


-- =============================================================================
-- E. O ensaio não segura o encerramento
-- =============================================================================

-- O caso "Depois" tem o ensaio ABERTO e todo o resto resolvido: o BASIC sai
-- para Entregáveis do mesmo jeito. O ensaio acontece 10 a 12 dias depois.
update public.caso_etapas set status = 'dispensada'
 where caso_id = pg_temp.caso('Mae CH Depois') and tipo <> 'click_home';

insert into public.entregaveis (caso_id, tipo, url, criado_por)
select pg_temp.caso('Mae CH Depois'), 'google_photos', 'https://photos.exemplo/ch',
       (select id from public.pessoas where nome = 'Editora CH');

select pg_temp.como('editora.ch@clickbaby.test');
select lives_ok(
  format($$ select public.liberar_para_entrega(%L::uuid) $$, pg_temp.caso('Mae CH Depois')),
  'E1: o Click Home aberto não impede o envio para Entregáveis'
);
reset role;

select pg_temp.como('atendimento.ch@clickbaby.test');
select lives_ok(
  format($$ select public.confirmar_entrega(%L::uuid) $$, pg_temp.caso('Mae CH Depois')),
  'E2: nem o encerramento do caso'
);
reset role;

select is(
  (select (payload ->> 'click_home_pendente')::boolean from public.eventos
    where caso_id = pg_temp.caso('Mae CH Depois') and tipo = 'entrega_confirmada'),
  true,
  'E3: e o evento diz que o ensaio ficou aberto — senão ninguém reconstrói isso depois'
);

select * from finish();
rollback;
