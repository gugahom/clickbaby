-- pgTAP: quadro_casos.arquivado (migration 20260918091859).
--
-- O Quadro passou a carregar só `arquivado = false`. Um caso marcado arquivado
-- por engano SOME da tela — do contador do dia, da seção MASTER, do sino — sem
-- erro em lugar nenhum. É a classe de defeito que este projeto mais pagou (seção
-- 5 do CLAUDE.md), e por isso cada metade da regra tem um caso aqui.
--
-- Datas em 2031, longe de qualquer dado de desenvolvimento: a regra do DIA olha
-- os outros casos do banco, e um caso aberto de outra fixture no mesmo dia
-- mudaria a resposta.

begin;
select plan(17);

insert into auth.users (id, email, aud, role, created_at, updated_at)
values (gen_random_uuid(), 'operador.arquivo@clickbaby.test', 'authenticated', 'authenticated', now(), now());
insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'Operador Arquivo', u.id, 'operador', true from auth.users u where u.email = 'operador.arquivo@clickbaby.test';

create function pg_temp.novo(p_id uuid, p_slug text, p_previsao timestamptz, p_status text)
returns void language plpgsql as $$
begin
  insert into public.casos (id, mae_nome, pacote_id, maternidade_id, previsao_em,
                            status_operacional, status_entrega, motivo_cancelamento)
  values (
    p_id, 'Mãe Arquivo ' || left(p_id::text, 4),
    (select id from public.pacotes where slug = p_slug),
    (select id from public.maternidades where sigla = 'HSC'),
    p_previsao,
    p_status::public.status_operacional,
    case when p_status = 'encerrado' then 'confirmado'::public.status_entrega
         else 'pendente'::public.status_entrega end,
    case when p_status = 'cancelado' then 'teste' end
  );
end;
$$;

create function pg_temp.arquivado(p_id uuid) returns boolean language sql as $$
  select arquivado from public.quadro_casos where id = p_id;
$$;

create function pg_temp.concluir(p_id uuid, p_tipo text) returns void language sql as $$
  update public.caso_etapas
     set status = 'concluida', iniciado_em = now() - interval '2 hours', concluido_em = now()
   where caso_id = p_id and tipo = p_tipo::public.etapa_tipo;
$$;

select has_column('public', 'quadro_casos', 'arquivado', 'a view expõe arquivado');


-- =============================================================================
-- 1. Terminal, sozinho no dia, sem seção aberta: é arquivo
-- =============================================================================

select pg_temp.novo('a1a1a1a1-0000-0000-0000-000000000001', 'basic', '2031-03-01 15:00+00', 'encerrado');

select ok(pg_temp.arquivado('a1a1a1a1-0000-0000-0000-000000000001'),
  'A1: encerrado sozinho no dia vai para o arquivo');


-- =============================================================================
-- 2. O CONTADOR DO DIA: terminal num dia que ainda tem caso aberto fica
-- =============================================================================

select pg_temp.novo('b1b1b1b1-0000-0000-0000-000000000001', 'basic', '2031-03-02 13:00+00', 'encerrado');
select pg_temp.novo('b1b1b1b1-0000-0000-0000-000000000002', 'basic', '2031-03-02 18:00+00', 'agendado');
select pg_temp.novo('c1c1c1c1-0000-0000-0000-000000000001', 'basic', '2031-03-03 13:00+00', 'cancelado');
select pg_temp.novo('c1c1c1c1-0000-0000-0000-000000000002', 'basic', '2031-03-03 18:00+00', 'agendado');

select ok(not pg_temp.arquivado('b1b1b1b1-0000-0000-0000-000000000001'),
  'B1: encerrado num dia com caso aberto fica — ele conta no "x de y" do bloco');
select ok(not pg_temp.arquivado('c1c1c1c1-0000-0000-0000-000000000001'),
  'C1: cancelado num dia com caso aberto fica — cancelado resolve o dia (invariante 3.5)');


-- =============================================================================
-- 3. AS SEÇÕES: encerrado com vídeo ou fotolivro aberto fica; cancelado, não
-- =============================================================================

select pg_temp.novo('d1d1d1d1-0000-0000-0000-000000000001', 'master', '2031-03-04 15:00+00', 'encerrado');

select pg_temp.novo('d1d1d1d1-0000-0000-0000-000000000002', 'master-album', '2031-03-05 15:00+00', 'encerrado');
select pg_temp.concluir('d1d1d1d1-0000-0000-0000-000000000002', 'edicao_video');

select pg_temp.novo('e1e1e1e1-0000-0000-0000-000000000001', 'master', '2031-03-06 15:00+00', 'encerrado');
select pg_temp.concluir('e1e1e1e1-0000-0000-0000-000000000001', 'edicao_video');

select pg_temp.novo('f1f1f1f1-0000-0000-0000-000000000001', 'master', '2031-03-07 15:00+00', 'cancelado');

select ok(not pg_temp.arquivado('d1d1d1d1-0000-0000-0000-000000000001'),
  'D1: MASTER encerrado com o vídeo aberto fica — o trabalho continua na seção MASTER');
select ok(not pg_temp.arquivado('d1d1d1d1-0000-0000-0000-000000000002'),
  'D2: encerrado com o vídeo feito e o fotolivro aberto fica — seção FOTO/LIVRO');
select ok(pg_temp.arquivado('e1e1e1e1-0000-0000-0000-000000000001'),
  'E1: MASTER encerrado com o vídeo concluído vai para o arquivo');
select ok(pg_temp.arquivado('f1f1f1f1-0000-0000-0000-000000000001'),
  'F1: CANCELADO com vídeo pendente vai para o arquivo — senão carregaria para sempre');


-- =============================================================================
-- 4. O DIA É O DE CURITIBA, o mesmo da coluna `dia`
-- =============================================================================

-- 2031-03-09 02:30+00 é 08/03 às 23h30 em Curitiba: mesmo dia local de G2.
select pg_temp.novo('a9a9a9a9-0000-0000-0000-000000000001', 'basic', '2031-03-09 02:30+00', 'encerrado');
select pg_temp.novo('a9a9a9a9-0000-0000-0000-000000000002', 'basic', '2031-03-08 15:00+00', 'agendado');
-- 2031-03-10 02:30+00 é 09/03 em Curitiba: mesma data UTC de G4, dia local diferente.
select pg_temp.novo('a9a9a9a9-0000-0000-0000-000000000003', 'basic', '2031-03-10 02:30+00', 'encerrado');
select pg_temp.novo('a9a9a9a9-0000-0000-0000-000000000004', 'basic', '2031-03-10 15:00+00', 'agendado');

select ok(not pg_temp.arquivado('a9a9a9a9-0000-0000-0000-000000000001'),
  'G1: 23h30 de Curitiba cai no mesmo dia do caso aberto das 12h — fica');
select ok(pg_temp.arquivado('a9a9a9a9-0000-0000-0000-000000000003'),
  'G3: mesma data UTC de um caso aberto, mas outro dia em Curitiba — vai para o arquivo');


-- =============================================================================
-- 5. O bloco "Sem data prevista" segue a mesma regra
-- =============================================================================

select pg_temp.novo('b0b0b0b0-0000-0000-0000-000000000001', 'basic', null, 'encerrado');

-- Os casos abertos SEM previsão que já existirem no banco de desenvolvimento
-- ganham uma data dentro desta transação (desfeita no fim): sem isso, a resposta
-- dependeria de quem rodou o seed.
update public.casos
   set previsao_em = '2031-12-31 15:00+00'
 where previsao_em is null
   and status_operacional <> all (array['encerrado'::public.status_operacional, 'cancelado'::public.status_operacional]);

select ok(pg_temp.arquivado('b0b0b0b0-0000-0000-0000-000000000001'),
  'H1: terminal sem data, sem nenhum caso aberto sem data — arquivo');

select pg_temp.novo('b0b0b0b0-0000-0000-0000-000000000002', 'basic', null, 'agendado');

select ok(not pg_temp.arquivado('b0b0b0b0-0000-0000-0000-000000000001'),
  'H2: com um caso aberto sem data, o terminal sem data fica — conta no bloco "Sem data prevista"');


-- =============================================================================
-- 6. As três garantias, sobre o banco inteiro (fixtures E dados de dev)
--
-- Escritas do jeito mais direto possível, e não como a view escreve: se a view
-- errar no `in`, no `coalesce` ou no nulo, a forma ingênua discorda dela.
-- =============================================================================

select is(
  (select count(*)::int from public.quadro_casos where not eh_terminal and arquivado),
  0,
  'I: nenhum caso em aberto é arquivado');

select is(
  (select count(*)::int
     from public.quadro_casos t
    where t.arquivado
      and exists (select 1 from public.quadro_casos o
                   where not o.eh_terminal and o.dia is not distinct from t.dia)),
  0,
  'J: nenhum caso arquivado divide o dia com um caso em aberto');

select is(
  (select count(*)::int
     from public.quadro_casos t
    where t.arquivado
      and t.status_operacional = 'encerrado'
      and exists (select 1 from public.caso_etapas s
                   where s.caso_id = t.id
                     and s.tipo in ('edicao_video', 'album')
                     and s.status not in ('concluida', 'dispensada'))),
  0,
  'K: nenhum encerrado arquivado tem vídeo ou fotolivro aberto');


-- =============================================================================
-- 7. Sob a RLS de quem usa a tela, a resposta é a mesma
-- =============================================================================

select set_config('request.jwt.claims',
  json_build_object('sub', (select id from auth.users where email = 'operador.arquivo@clickbaby.test'),
                    'role', 'authenticated')::text,
  true);
set local role authenticated;

select ok(pg_temp.arquivado('a1a1a1a1-0000-0000-0000-000000000001'),
  'L1: como fotógrafa, A1 continua arquivo');
select ok(not pg_temp.arquivado('b1b1b1b1-0000-0000-0000-000000000001'),
  'L2: como fotógrafa, B1 continua no Quadro — as subconsultas enxergam os outros casos');

reset role;

select * from finish();
rollback;
