-- pgTAP: o relatório externo por NASCIMENTOS (migration 20261013153516).
--
--   N1 — sem o modo, o período é o dia do caso e conta todo mundo.
--   N2 — no modo, o período é o dia do NASCIMENTO: o bebê previsto para março
--        que nasceu em abril entra em abril; o previsto que não nasceu, não.
--   N3 — cancelado não entra, mesmo com nascimento registrado.
--   N4 — a busca devolve o dia do nascimento, e o gráfico no tempo também.
--
-- Os dados moram em JUNHO DE 2029, longe dos dados fictícios e dos outros testes.

begin;
select plan(7);

insert into auth.users (id, email, aud, role, created_at, updated_at)
values (gen_random_uuid(), 'gestao.nasc@clickbaby.test', 'authenticated', 'authenticated', now(), now());

insert into public.pessoas (nome, auth_user_id, papel_sistema, ativo)
select 'Gestao NASC', u.id, 'gestao', true from auth.users u where u.email = 'gestao.nasc@clickbaby.test';

insert into public.maternidades (nome, sigla) values ('Maternidade NASC', 'NASCT');

-- Quatro casos:
--   A — previsto e nascido em junho;
--   B — previsto para 31/05, nascido em 01/06 (entra em junho só no modo);
--   C — previsto em junho, ainda não nasceu;
--   D — previsto e "nascido" em junho, mas cancelado (o gêmeo recriado).
insert into public.casos (mae_nome, pacote_id, maternidade_id, previsao_em)
select v.mae, (select id from public.pacotes where slug = 'basic'),
       (select id from public.maternidades where sigla = 'NASCT'), v.prev::timestamptz
from (values
  ('Mae NASC A', '2029-06-10 08:00-03'),
  ('Mae NASC B', '2029-05-31 22:00-03'),
  ('Mae NASC C', '2029-06-12 08:00-03'),
  ('Mae NASC D', '2029-06-14 08:00-03')
) as v(mae, prev);

create function pg_temp.caso(p_mae text) returns uuid language sql as $$
  select id from public.casos where mae_nome = p_mae;
$$;

update public.caso_etapas set status = 'concluida', iniciado_em = v.em::timestamptz, concluido_em = v.em::timestamptz
from (values ('Mae NASC A', '2029-06-10 09:00-03'), ('Mae NASC B', '2029-06-01 01:30-03'), ('Mae NASC D', '2029-06-14 09:00-03'))
  as v(mae, em)
where caso_id = pg_temp.caso(v.mae) and tipo = 'nascimento';

update public.casos set status_operacional = 'cancelado', motivo_cancelamento = 'Cancelado via Google Calendar (card cinza)'
where id = pg_temp.caso('Mae NASC D');

do $$
declare v_id uuid;
begin
  select id into v_id from auth.users where email = 'gestao.nasc@clickbaby.test';
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L', json_build_object('sub', v_id, 'role', 'authenticated')::text);
end;
$$;

create function pg_temp.maes(p_filtros jsonb) returns text language sql as $$
  select string_agg(right(b.mae_nome, 1), ',' order by b.mae_nome)
  from public.operacao_buscar(p_filtros, 'antigos', 50, 0) b
  where b.mae_nome like 'Mae NASC %';
$$;


-- N1
select is(
  pg_temp.maes('{"de":"2029-06-01","ate":"2029-06-30"}'),
  'A,C,D',
  'N1: sem o modo, o período é o dia do caso — e conta o que não nasceu e o cancelado'
);

-- N2 e N3
select is(
  pg_temp.maes('{"de":"2029-06-01","ate":"2029-06-30","nascimentos":true}'),
  'A,B',
  'N2/N3: no modo, só quem nasceu no período — B entra pelo dia do nascimento, C e D não'
);
select is(
  pg_temp.maes('{"de":"2029-05-01","ate":"2029-05-31","nascimentos":true}'),
  null,
  'N2: B não fica em maio, que era só a previsão'
);
select is(
  (select casos from public.operacao_resumo('{"de":"2029-06-01","ate":"2029-06-30","nascimentos":true}'::jsonb)
   ) >= 2,
  true,
  'N2: o resumo segue o mesmo recorte'
);

-- N4
select is(
  (select b.dia::text from public.operacao_buscar('{"de":"2029-06-01","ate":"2029-06-30","nascimentos":true}'::jsonb, 'antigos', 50, 0) b
   where b.mae_nome = 'Mae NASC B'),
  '2029-06-01',
  'N4: a busca devolve o dia do NASCIMENTO na coluna da data'
);
select is(
  (select g.casos from public.operacao_grafico(jsonb_build_object('de', '2029-06-01', 'ate', '2029-06-30', 'nascimentos', true,
     'maternidades', jsonb_build_array((select id::text from public.maternidades where sigla = 'NASCT'))), 'dia') g
   where g.chave = '2029-06-01'),
  1,
  'N4: o gráfico no tempo conta B no dia em que nasceu'
);
select is(
  (select count(*)::int from public.operacao_facetas('{"de":"2029-06-01","ate":"2029-06-30","nascimentos":true}'::jsonb) f
   where f.grupo = 'maternidades' and f.valor = (select id::text from public.maternidades where sigla = 'NASCT') and f.contagem = 2),
  1,
  'N4: a contagem da maternidade no filtro também é de nascimentos'
);

select * from finish();
rollback;
