-- pgTAP: a esteira do fotolivro (migration 20260910150425).
--
-- O QUE ESTE ARQUIVO PROTEGE
-- `mover_album` é a única função do sistema que escreve DUAS colunas que
-- precisam concordar — `fase_album` e `status`. O dia em que alguém acrescentar
-- uma fase e esquecer do `case` do status, o fotolivro vai parecer parado
-- enquanto está sendo diagramado, ou concluído enquanto está na gráfica. As
-- asserções B* existem para esse dia.
--
-- E a exceção de encerramento (D*) é a segunda metade: o fotolivro NÃO segura
-- o encerramento, e essa é uma decisão de operação — não uma consequência de
-- implementação que alguém possa desfazer sem perceber.

begin;
select plan(17);


-- =============================================================================
-- Fixtures
-- =============================================================================

insert into auth.users (id, email, aud, role, created_at, updated_at)
values
  (gen_random_uuid(), 'editora.album@clickbaby.test', 'authenticated', 'authenticated', now(), now()),
  (gen_random_uuid(), 'atendimento.album@clickbaby.test', 'authenticated', 'authenticated', now(), now());

insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'Editora Album', u.id, 'operador', true
  from auth.users u where u.email = 'editora.album@clickbaby.test';
insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'Atendimento Album', u.id, 'atendimento', true
  from auth.users u where u.email = 'atendimento.album@clickbaby.test';

insert into public.maternidades (nome, sigla) values ('Maternidade Album', 'ALBTEST');

insert into public.casos (mae_nome, pacote_id, maternidade_id)
select v.mae, (select id from public.pacotes where slug = v.slug),
       (select id from public.maternidades where sigla = 'ALBTEST')
from (values
  ('Mae Fotolivro', 'master-album'),
  ('Mae Sem Album', 'basic')
) as v(mae, slug);

create function pg_temp.como(p_email text) returns void language plpgsql as $$
declare v_id uuid;
begin
  select id into v_id from auth.users where email = p_email;
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L',
    json_build_object('sub', v_id, 'role', 'authenticated')::text);
end;
$$;

create function pg_temp.caso(p_nome text) returns uuid language sql as $$
  select id from public.casos where mae_nome = p_nome;
$$;

create function pg_temp.album(p_nome text) returns uuid language sql as $$
  select ce.id from public.caso_etapas ce
  where ce.caso_id = pg_temp.caso(p_nome) and ce.tipo = 'album';
$$;


-- =============================================================================
-- A. O que a RPC recusa
-- =============================================================================

select pg_temp.como('editora.album@clickbaby.test');

-- O MASTER + ÁLBUM traz a etapa de fábrica; o BASIC não. Gatear por TIPO DE
-- ETAPA é o que faz a seção não precisar conhecer pacote nenhum.
reset role;
select is(
  (select count(*)::int from public.caso_etapas
    where caso_id = pg_temp.caso('Mae Fotolivro') and tipo = 'album'),
  1,
  'A0: MASTER + ÁLBUM nasce com a etapa de álbum'
);

select is(
  (select count(*)::int from public.caso_etapas
    where caso_id = pg_temp.caso('Mae Sem Album') and tipo = 'album'),
  0,
  'A1: BASIC não tem álbum de fábrica'
);

select pg_temp.como('editora.album@clickbaby.test');

select throws_like(
  format($$ select public.mover_album(
      (select id from public.caso_etapas where caso_id = %L::uuid and tipo = 'edicao_foto' and rodada = 1),
      'diagramando') $$,
    pg_temp.caso('Mae Fotolivro')),
  '%não passa por ela.',
  'A2: recusa etapa que não é álbum'
);


-- =============================================================================
-- B. Fase e status andam JUNTOS — o coração desta migration
-- =============================================================================

select lives_ok(
  format($$ select public.mover_album(%L::uuid, 'aguardando_pagamento') $$,
         pg_temp.album('Mae Fotolivro')),
  'B0: move para a primeira fase'
);

reset role;

select is(
  (select fase_album::text from public.caso_etapas where id = pg_temp.album('Mae Fotolivro')),
  'aguardando_pagamento',
  'B1: a fase ficou gravada'
);

-- Espera vira PAUSADA, e não pendente: o relógio de ciclo já desconta pausa, e
-- é isso que faz o tempo medir diagramação em vez de calendário.
select is(
  (select status::text from public.caso_etapas where id = pg_temp.album('Mae Fotolivro')),
  'pausada',
  'B2: fase de espera deixa a etapa PAUSADA'
);

select ok(
  (select iniciado_em is not null from public.caso_etapas where id = pg_temp.album('Mae Fotolivro')),
  'B3: o relógio começa na primeira fase declarada, não só na diagramação'
);

select ok(
  (select pausado_em is not null from public.caso_etapas where id = pg_temp.album('Mae Fotolivro')),
  'B4: a janela de pausa abre junto'
);

select pg_temp.como('editora.album@clickbaby.test');
select lives_ok(
  format($$ select public.mover_album(%L::uuid, 'diagramando') $$,
         pg_temp.album('Mae Fotolivro')),
  'B5: move para a diagramação'
);
reset role;

select is(
  (select status::text from public.caso_etapas where id = pg_temp.album('Mae Fotolivro')),
  'em_andamento',
  'B6: diagramando é a ÚNICA fase que é trabalho acontecendo'
);

select ok(
  (select pausado_em is null from public.caso_etapas where id = pg_temp.album('Mae Fotolivro')),
  'B7: sair da espera fecha a pausa'
);


-- =============================================================================
-- C. A fase terminal conclui a etapa
-- =============================================================================

select pg_temp.como('editora.album@clickbaby.test');
select lives_ok(
  format($$ select public.mover_album(%L::uuid, 'entregue') $$,
         pg_temp.album('Mae Fotolivro')),
  'C0: move para entregue'
);
reset role;

select is(
  (select status::text from public.caso_etapas where id = pg_temp.album('Mae Fotolivro')),
  'concluida',
  'C1: entregue conclui a etapa — é o que tira o cartão da seção'
);

select ok(
  (select concluido_em is not null from public.caso_etapas where id = pg_temp.album('Mae Fotolivro')),
  'C2: com carimbo de conclusão do servidor'
);


-- =============================================================================
-- D. O fotolivro NÃO segura o encerramento
--
-- Decisão do gestor em 10/09/2026, mesma exceção do vídeo horizontal. É regra
-- de operação: sem esta asserção, alguém "arruma" a lista de exceções um dia e
-- o card volta a ficar um mês preso na lista do dia por causa de trabalho que
-- a equipe não pode acelerar.
-- =============================================================================

-- Volta o álbum para o meio da esteira e resolve todo o resto do caso.
update public.caso_etapas
   set status = 'pausada', fase_album = 'enviado_grafica', concluido_em = null
 where id = pg_temp.album('Mae Fotolivro');

-- DUAS PASSADAS, e a segunda não é redundância: concluir o `fechamento` dispara
-- a trigger que CRIA a rodada 2 de edicao_foto e reels (20260827172830). A
-- primeira passada resolve o que existia; a segunda resolve o que a primeira
-- fez nascer. Sem ela o teste falha dizendo "edicao_foto em aberto" e a culpa
-- parece ser da exceção do álbum, que é justamente o que ele quer medir.
update public.caso_etapas
   set status = 'concluida',
       iniciado_em = coalesce(iniciado_em, now()),
       concluido_em = now()
 where caso_id = pg_temp.caso('Mae Fotolivro')
   and tipo not in ('album', 'edicao_video');

update public.caso_etapas
   set status = 'concluida',
       iniciado_em = coalesce(iniciado_em, now()),
       concluido_em = now()
 where caso_id = pg_temp.caso('Mae Fotolivro')
   and tipo not in ('album', 'edicao_video')
   and status not in ('concluida', 'dispensada');

update public.caso_etapas
   set status = 'dispensada'
 where caso_id = pg_temp.caso('Mae Fotolivro') and tipo = 'edicao_video';

insert into public.entregaveis (caso_id, tipo, url)
select pg_temp.caso('Mae Fotolivro'), 'google_photos', 'https://photos.google.com/album/teste';

select pg_temp.como('atendimento.album@clickbaby.test');

select lives_ok(
  format($$ select public.liberar_para_entrega(%L::uuid) $$, pg_temp.caso('Mae Fotolivro')),
  'D0: envia para Entregáveis com o fotolivro ainda na gráfica'
);

select lives_ok(
  format($$ select public.confirmar_entrega(%L::uuid) $$, pg_temp.caso('Mae Fotolivro')),
  'D1: e encerra o caso — o fotolivro sobrevive à entrega'
);

reset role;

select is(
  (select status_operacional::text from public.casos where mae_nome = 'Mae Fotolivro'),
  'encerrado',
  'D2: o caso encerrou mesmo com a etapa de álbum em aberto'
);


select * from finish();
rollback;
