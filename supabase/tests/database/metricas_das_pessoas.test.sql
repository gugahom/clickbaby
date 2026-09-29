-- pgTAP: as métricas das pessoas (migration 20260929020655).
--
-- O que este arquivo protege — cada bloco é um defeito medido no remoto em
-- 28/09/2026, que o desenho existe para não repetir:
--   A — só a GESTÃO lê (nem atendimento, que é adm para outras coisas).
--   B — o PISO: nada antes de 01/10/2026 entra, peça o período que pedir.
--   C — crédito do RESPONSÁVEL; ciclo < 5 min é "sem medição", não "rápido";
--       prazo de foto e reels contra o vencimento do caso.
--   D — etapa de campo EM PARALELO (a mesma pessoa em dois partos ao mesmo tempo).
--   E — quem clicou concluir foi outra pessoa.
--   F — o que voltou para ajuste: reabertura de caso conta, clique errado
--       desfeito em minutos não conta.
--   G — os padrões de tempo: só gestão define, mesmo dia substitui, fica evento.
--   H — período invertido é recusado; período sem nada devolve zero, não erro.

-- OS DADOS DO TESTE MORAM EM FEVEREIRO DE 2027, um mês que nada mais usa. O
-- seed fictício (`npm run seed:metricas`) enche OUTUBRO de 2026 no banco local,
-- e as asserções que leem a equipe inteira (mediana, séries, resumo) passariam
-- a medir aquilo em vez disto — a suíte não pode depender de alguém ter rodado,
-- ou não, um seed antes.

begin;
select plan(25);

insert into auth.users (id, email, aud, role, created_at, updated_at)
values
  (gen_random_uuid(), 'gestao.me@clickbaby.test',      'authenticated', 'authenticated', now(), now()),
  (gen_random_uuid(), 'atendimento.me@clickbaby.test', 'authenticated', 'authenticated', now(), now()),
  (gen_random_uuid(), 'fotografa.a@clickbaby.test',    'authenticated', 'authenticated', now(), now()),
  (gen_random_uuid(), 'editora.b@clickbaby.test',      'authenticated', 'authenticated', now(), now());

insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select v.nome, u.id, v.papel::public.papel_sistema, true
from (values
  ('Gestao ME',      'gestao.me@clickbaby.test',      'gestao'),
  ('Atendimento ME', 'atendimento.me@clickbaby.test', 'atendimento'),
  ('Fotografa A',    'fotografa.a@clickbaby.test',    'operador'),
  ('Editora B',      'editora.b@clickbaby.test',      'operador')
) as v(nome, email, papel)
join auth.users u on u.email = v.email;

insert into public.maternidades (nome, sigla) values ('Maternidade ME', 'METEST');

insert into public.casos (mae_nome, pacote_id, maternidade_id)
select v.mae, (select id from public.pacotes where slug = 'basic'),
       (select id from public.maternidades where sigla = 'METEST')
from (values ('Mae ME Um'), ('Mae ME Dois'), ('Mae ME Tres')) as v(mae);

create function pg_temp.como(p_email text) returns void language plpgsql as $$
declare v_id uuid;
begin
  select id into v_id from auth.users where email = p_email;
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L',
    json_build_object('sub', v_id, 'role', 'authenticated')::text);
end;
$$;

create function pg_temp.pessoa(p_nome text) returns uuid language sql as $$
  select id from public.pessoas where nome = p_nome;
$$;

create function pg_temp.etapa(p_mae text, p_tipo public.etapa_tipo) returns uuid language sql as $$
  select ce.id from public.caso_etapas ce join public.casos c on c.id = ce.caso_id
  where c.mae_nome = p_mae and ce.tipo = p_tipo and ce.rodada = 1;
$$;

-- Conclui uma etapa com horários escolhidos. Escrita direta, como superusuário:
-- os carimbos precisam ser de outubro, e a tela nunca os escreveria assim.
create function pg_temp.concluir(
  p_etapa uuid, p_pessoa uuid, p_ini timestamptz, p_fim timestamptz, p_pausa interval default '0'
) returns void language sql as $$
  update public.caso_etapas
     set status = 'concluida', responsavel_id = p_pessoa,
         iniciado_em = p_ini, concluido_em = p_fim, pausa_acumulada = p_pausa
   where id = p_etapa;
$$;

-- A fotógrafa A: DOIS partos que se cruzam no tempo (10/10, 10h-12h e 11h-13h),
-- e um terceiro em SETEMBRO, antes do piso.
select pg_temp.concluir(pg_temp.etapa('Mae ME Um',   'nascimento'), pg_temp.pessoa('Fotografa A'),
                        '2027-02-10 10:00-03', '2027-02-10 12:00-03');
select pg_temp.concluir(pg_temp.etapa('Mae ME Dois', 'nascimento'), pg_temp.pessoa('Fotografa A'),
                        '2027-02-10 11:00-03', '2027-02-10 13:00-03');
select pg_temp.concluir(pg_temp.etapa('Mae ME Tres', 'nascimento'), pg_temp.pessoa('Fotografa A'),
                        '2026-09-20 10:00-03', '2026-09-20 12:00-03');

-- A editora B: uma edição MEDIDA (2h com 30min de pausa = 90min, dentro do
-- prazo) e uma de 2 minutos (sem medição), concluída depois de o caso vencer.
select pg_temp.concluir(pg_temp.etapa('Mae ME Um',   'edicao_foto'), pg_temp.pessoa('Editora B'),
                        '2027-02-10 14:00-03', '2027-02-10 16:00-03', interval '30 minutes');
select pg_temp.concluir(pg_temp.etapa('Mae ME Dois', 'edicao_foto'), pg_temp.pessoa('Editora B'),
                        '2027-02-13 09:00-03', '2027-02-13 09:02-03');

-- Quem clicou: o parto do caso Um foi concluído pela GESTÃO no lugar da A; o do
-- caso Dois, pela própria A.
insert into public.eventos (caso_id, caso_etapa_id, pessoa_id, tipo, ocorrido_em)
values
  ((select id from public.casos where mae_nome = 'Mae ME Um'),   pg_temp.etapa('Mae ME Um', 'nascimento'),
   pg_temp.pessoa('Gestao ME'),   'etapa_concluida', '2027-02-10 12:00-03'),
  ((select id from public.casos where mae_nome = 'Mae ME Dois'), pg_temp.etapa('Mae ME Dois', 'nascimento'),
   pg_temp.pessoa('Fotografa A'), 'etapa_concluida', '2027-02-10 13:00-03');

-- O que voltou: o caso Um foi REABERTO na foto (conta, e o crédito é da B, que
-- fez a última foto concluída antes); a foto do caso Dois foi reaberta 8
-- minutos depois de concluída (clique errado desfeito — não conta).
insert into public.eventos (caso_id, caso_etapa_id, pessoa_id, tipo, payload, ocorrido_em)
values
  ((select id from public.casos where mae_nome = 'Mae ME Um'), null, pg_temp.pessoa('Gestao ME'),
   'caso_reaberto', '{"etapas": ["edicao_foto"], "motivo": "Família pediu ajuste"}', '2027-02-20 10:00-03'),
  ((select id from public.casos where mae_nome = 'Mae ME Dois'), pg_temp.etapa('Mae ME Dois', 'edicao_foto'),
   pg_temp.pessoa('Editora B'), 'etapa_reaberta',
   '{"status_anterior": "concluida", "concluido_em_anterior": "2027-02-13T09:02:00-03:00"}', '2027-02-13 09:10-03');


-- =============================================================================
-- A. Só a gestão lê
-- =============================================================================

select pg_temp.como('fotografa.a@clickbaby.test');
select throws_ok(
  $$ select * from public.metricas_por_etapa('2027-02-01', '2027-02-28') $$,
  'P0001', 'Os relatórios de pessoas são só da gestão.',
  'A1: a fotógrafa não lê as métricas'
);
reset role;

select pg_temp.como('atendimento.me@clickbaby.test');
select throws_ok(
  $$ select * from public.metricas_por_pessoa('2027-02-01', '2027-02-28') $$,
  'P0001', 'Os relatórios de pessoas são só da gestão.',
  'A2: nem o atendimento — é gestão, não "atendimento ou adm"'
);
reset role;

select pg_temp.como('gestao.me@clickbaby.test');
select lives_ok(
  $$ select * from public.metricas_por_etapa('2027-02-01', '2027-02-28') $$,
  'A3: a gestão lê'
);


-- =============================================================================
-- B. O piso de 01/10
-- =============================================================================

-- Pede desde 01/09: o parto de 20/09 continua de fora.
select is(
  (select concluidas from public.metricas_por_etapa('2026-09-01', '2027-02-28')
    where pessoa_id = pg_temp.pessoa('Fotografa A') and tipo = 'nascimento'),
  2,
  'B1: o parto de setembro não entra, mesmo pedindo setembro'
);

select is(
  (select count(*)::int from public.metricas_por_etapa('2026-09-01', '2026-09-30')),
  0,
  'B2: um período inteiro antes do piso vem vazio'
);


-- =============================================================================
-- C. Crédito, medição e prazo
-- =============================================================================

select is(
  (select concluidas from public.metricas_por_etapa('2027-02-01', '2027-02-28')
    where pessoa_id = pg_temp.pessoa('Editora B') and tipo = 'edicao_foto'),
  2,
  'C1: as duas edições contam no volume'
);

select is(
  (select medidas from public.metricas_por_etapa('2027-02-01', '2027-02-28')
    where pessoa_id = pg_temp.pessoa('Editora B') and tipo = 'edicao_foto'),
  1,
  'C2: a de 2 minutos é "sem medição" — fica fora do tempo'
);

select is(
  (select mediana_min from public.metricas_por_etapa('2027-02-01', '2027-02-28')
    where pessoa_id = pg_temp.pessoa('Editora B') and tipo = 'edicao_foto'),
  90.0,
  'C3: o tempo é líquido — 2h de relógio menos 30min de pausa'
);

select is(
  (select com_prazo || '/' || no_prazo from public.metricas_por_etapa('2027-02-01', '2027-02-28')
    where pessoa_id = pg_temp.pessoa('Editora B') and tipo = 'edicao_foto'),
  '2/1',
  'C4: das duas edições com prazo, uma saiu antes de o caso vencer'
);

select is(
  (select com_prazo from public.metricas_por_etapa('2027-02-01', '2027-02-28')
    where pessoa_id = pg_temp.pessoa('Fotografa A') and tipo = 'nascimento'),
  0,
  'C5: prazo é só de foto e reels — o parto não tem'
);

select is(
  (select mediana_min from public.metricas_da_equipe_por_etapa('2027-02-01', '2027-02-28')
    where tipo = 'edicao_foto'),
  90.0,
  'C6: a mediana da equipe também ignora o que não foi medido'
);


-- =============================================================================
-- D. Em paralelo
-- =============================================================================

select is(
  (select em_paralelo from public.metricas_por_etapa('2027-02-01', '2027-02-28')
    where pessoa_id = pg_temp.pessoa('Fotografa A') and tipo = 'nascimento'),
  2,
  'D1: os dois partos que se cruzam no tempo ficam marcados'
);

select is(
  (select em_paralelo from public.metricas_por_etapa('2027-02-01', '2027-02-28')
    where pessoa_id = pg_temp.pessoa('Editora B') and tipo = 'edicao_foto'),
  0,
  'D2: edição não tem marca de paralelo — editar duas coisas no dia é normal'
);


-- =============================================================================
-- E. Quem clicou
-- =============================================================================

select is(
  (select concluidas_por_outra from public.metricas_por_etapa('2027-02-01', '2027-02-28')
    where pessoa_id = pg_temp.pessoa('Fotografa A') and tipo = 'nascimento'),
  1,
  'E1: o parto concluído pela gestão continua da fotógrafa, e fica contado como registrado por outra pessoa'
);


-- =============================================================================
-- F. O que voltou para ajuste
-- =============================================================================

select is(
  (select voltou_para_ajuste from public.metricas_por_pessoa('2027-02-01', '2027-02-28')
    where pessoa_id = pg_temp.pessoa('Editora B')),
  1,
  'F1: a reabertura do caso volta para quem fez a foto; o clique desfeito em 8 min não conta'
);

select is(
  (select dias_com_trabalho from public.metricas_por_pessoa('2027-02-01', '2027-02-28')
    where pessoa_id = pg_temp.pessoa('Editora B')),
  2,
  'F2: dias com trabalho, em Brasília'
);

select ok(
  exists (select 1 from public.metricas_por_pessoa('2027-02-01', '2027-02-28')
           where pessoa_id = pg_temp.pessoa('Atendimento ME') and dias_com_trabalho = 0),
  'F3: pessoa ativa sem nada no período aparece com zero, em vez de sumir'
);


-- =============================================================================
-- G. Padrões de tempo
-- =============================================================================

select lives_ok(
  $$ select public.definir_padrao_de_tempo('edicao_foto', 60) $$,
  'G1: a gestão define um padrão'
);

select is(
  (select minutos_esperados from public.padroes_de_tempo() where etapa_tipo = 'edicao_foto'),
  60,
  'G2: e ele entra em vigor hoje'
);

select public.definir_padrao_de_tempo('edicao_foto', 75);

-- A tabela não tem GRANT para ninguém (a leitura é pela função), então a
-- conferência direta é como superusuário.
reset role;

select is(
  (select count(*)::int from public.padroes_tempo where etapa_tipo = 'edicao_foto'),
  1,
  'G3: no mesmo dia, definir de novo SUBSTITUI — ainda é a mesma régua'
);

select is(
  (select count(*)::int from public.eventos
    where tipo = 'padrao_de_tempo_definido' and pessoa_id = pg_temp.pessoa('Gestao ME')),
  2,
  'G4: cada definição fica no histórico, com o valor anterior'
);

select pg_temp.como('fotografa.a@clickbaby.test');
select throws_ok(
  $$ select public.definir_padrao_de_tempo('reels', 10) $$,
  'P0001', 'Os relatórios de pessoas são só da gestão.',
  'G5: a fotógrafa não define a régua'
);
reset role;


-- =============================================================================
-- H. Período
-- =============================================================================

select pg_temp.como('gestao.me@clickbaby.test');
select throws_ok(
  $$ select * from public.metricas_por_etapa('2027-02-28', '2027-02-01') $$,
  'P0001', 'O fim do período (2027-02-01) vem antes do começo (2027-02-28).',
  'H1: período invertido é recusado com a frase de quem lê'
);

select is(
  (select count(*)::int from public.metricas_prazo_por_semana('2027-02-01', '2027-02-28')),
  0,
  'H2: sem caso enviado no período, a série de prazo vem vazia — e não quebra'
);

select is(
  (select enviados from public.metricas_prazo_do_periodo('2027-02-01', '2027-02-28')),
  0,
  'H3: e o resumo do período devolve UMA linha com zero, não nenhuma — o painel lê um número'
);
reset role;

select * from finish();
rollback;
